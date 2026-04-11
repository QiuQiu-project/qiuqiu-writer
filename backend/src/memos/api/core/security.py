"""
安全认证和权限管理模块
"""

from datetime import datetime, timedelta
from typing import Any, Union, Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from memos.api.core.config import get_settings
from memos.api.core.redis import get_redis

settings = get_settings()
security = HTTPBearer()


def create_access_token(
    subject: Union[str, Any], expires_delta: Optional[timedelta] = None, additional_claims: Optional[dict] = None
) -> str:
    """
    创建访问令牌

    Args:
        subject: 令牌主题（通常是用户ID）
        expires_delta: 过期时间差
        additional_claims: 额外的声明信息

    Returns:
        JWT令牌字符串
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {"exp": expire, "sub": str(subject)}

    if additional_claims:
        to_encode.update(additional_claims)

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    subject: Union[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    """
    创建刷新令牌

    Args:
        subject: 令牌主题（通常是用户ID）
        expires_delta: 过期时间差

    Returns:
        JWT刷新令牌字符串
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh"  # 标识这是刷新令牌
    }

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
    """
    验证令牌

    Args:
        token: JWT令牌字符串
        token_type: 令牌类型（access/refresh）

    Returns:
        令牌载荷，验证失败返回None
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

        # 验证令牌类型（如果是刷新令牌）
        if token_type == "refresh" and payload.get("type") != "refresh":
            return None

        # 检查过期时间
        exp = payload.get("exp")
        if exp and datetime.utcnow().timestamp() > exp:
            return None

        return payload

    except JWTError:
        return None


def get_password_hash(password: str) -> str:
    """
    生成密码哈希

    Args:
        password: 明文密码

    Returns:
        密码哈希字符串（bcrypt 格式）
    """
    # bcrypt 会自动处理超过 72 字节的密码（自动截断）
    password_bytes = password.encode('utf-8')
    
    # 生成盐并哈希密码
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    
    # 返回解码后的字符串（bcrypt 哈希是 ASCII 字符串）
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码

    Args:
        plain_password: 明文密码
        hashed_password: 密码哈希（bcrypt 格式）

    Returns:
        密码是否正确
    """
    try:
        # bcrypt 会自动处理超过 72 字节的密码（自动截断）
        password_bytes = plain_password.encode('utf-8')
        
        # 将哈希字符串编码为字节
        hashed_bytes = hashed_password.encode('utf-8')
        
        # 使用 bcrypt 验证密码
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        # 任何异常都返回 False
        return False


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    """
    从请求头中获取当前用户ID（40位字符串）

    解析JWT令牌并返回用户ID，用于依赖注入

    Args:
        credentials: HTTP认证凭据

    Returns:
        用户ID（40位字符串）

    Raises:
        HTTPException: 认证失败时抛出401异常
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials

        # 验证访问令牌
        payload = verify_token(token, "access")
        if payload is None:
            raise credentials_exception

        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise credentials_exception
        user_id_raw = str(user_id_raw)

        redis = await get_redis()

        # 检查 token 是否已登出（黑名单）
        if await redis.exists(f"blacklist:{token}"):
            raise credentials_exception

        # 检查用户是否在线（用原始 sub，兼容迁移前存的 session:1）
        session_exists = await redis.exists(f"session:{user_id_raw}")
        if not session_exists:
            raise credentials_exception

        # 返回 40 位规范 id，与 DB 中 users.id 一致，避免 FK 违反
        from memos.api.core.id_utils import normalize_legacy_id
        return normalize_legacy_id(user_id_raw) or user_id_raw

    except (JWTError, ValueError):
        raise credentials_exception


async def get_current_active_user(
    current_user_id: str = Depends(get_current_user_id)
) -> dict:
    """
    获取当前活跃用户信息

    Args:
        current_user_id: 当前用户ID

    Returns:
        用户信息字典
    """
    from memos.api.services.user_service import UserService

    user_service = UserService()
    user = await user_service.get_user_by_id(current_user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    if user.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户账户已被禁用"
        )

    return user


class PermissionChecker:
    """权限检查器类"""

    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    async def __call__(self, current_user: dict = Depends(get_current_active_user)) -> dict:
        """
        检查用户权限

        Args:
            current_user: 当前用户信息

        Returns:
            用户信息字典

        Raises:
            HTTPException: 权限不足时抛出403异常
        """
        # 这里可以实现更复杂的权限检查逻辑
        # 目前简单检查用户状态

        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未认证的用户"
            )

        # TODO: 实现实际的权限系统
        # if not self._has_permission(current_user, self.required_permission):
        #     raise HTTPException(
        #         status_code=status.HTTP_403_FORBIDDEN,
        #         detail=f"权限不足，需要 {self.required_permission} 权限"
        #     )

        return current_user


def require_permissions(*permissions):
    """
    权限装饰器工厂

    Args:
        permissions: 需要的权限列表

    Returns:
        依赖装饰器
    """
    return [PermissionChecker(permission) for permission in permissions]


async def blacklist_token(token: str) -> bool:
    """
    将令牌加入黑名单

    Args:
        token: 要加入黑名单的令牌

    Returns:
        操作是否成功
    """
    try:
        payload = verify_token(token)
        if not payload:
            return False

        exp = payload.get("exp")
        if exp:
            ttl = int(exp - datetime.utcnow().timestamp())
            if ttl > 0:
                redis = await get_redis()
                await redis.set(f"blacklist:{token}", "1", ttl)
                return True

        return False

    except Exception:
        return False


async def is_token_blacklisted(token: str) -> bool:
    """
    检查令牌是否在黑名单中

    Args:
        token: 要检查的令牌

    Returns:
        令牌是否在黑名单中
    """
    redis = await get_redis()
    return await redis.exists(f"blacklist:{token}")


class PasswordValidator:
    """密码验证器"""

    @staticmethod
    def validate_password(password: str) -> tuple[bool, str]:
        """
        验证密码强度

        Args:
            password: 密码字符串

        Returns:
            (是否有效, 错误信息)
        """
        if len(password) < 8:
            return False, "密码长度至少为8位"

        if len(password) > 128:
            return False, "密码长度不能超过128位"

        has_lower = any(c.islower() for c in password)
        has_upper = any(c.isupper() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?`~" for c in password)

        complexity_score = sum([has_upper, has_lower, has_digit, has_special])

        if complexity_score < 3:
            return False, "密码必须包含大写字母、小写字母、数字中的至少3种字符"

        # 检查常见密码模式
        common_patterns = [
            password.lower() == "password",
            password.lower() == "12345678",
            password.lower() == "qwertyui",
            password.lower().startswith("123"),
            password.lower().endswith("123"),
        ]

        if any(common_patterns):
            return False, "密码过于简单，请使用更复杂的密码"

        return True, ""


class SecurityHeaders:
    """安全头配置"""

    HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Content-Security-Policy": "default-src 'self'",
        "Referrer-Policy": "strict-origin-when-cross-origin",
    }