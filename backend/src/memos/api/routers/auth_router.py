"""
认证API路由
"""

from datetime import timedelta
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.core.database import get_async_db
from memos.api.core.security import (
    create_access_token, create_refresh_token, verify_token,
    get_password_hash, verify_password, blacklist_token,
    get_current_user_id,
    get_current_active_user,
    PasswordValidator
)
from memos.api.core.config import get_settings
from memos.api.services.user_service import UserService
from memos.api.services.invitation_code_service import InvitationCodeService
from memos.api.schemas.auth import (
    LoginRequest, RegisterRequest, RefreshTokenRequest,
    LogoutRequest, TokenResponse, RefreshTokenResponse,
    AuthResponse, SessionInfo, UpdateProfileRequest
)

router = APIRouter(prefix="/api/v1/auth", tags=["认证"])
security = HTTPBearer()
settings = get_settings()


@router.post("/register", response_model=TokenResponse)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_async_db)
) -> Dict[str, Any]:
    """
    用户注册（需有效邀请码）
    """
    inv_service = InvitationCodeService(db)
    inv = await inv_service.get_by_code(request.invitation_code)
    if not inv or inv.used != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邀请码无效或已被使用"
        )

    user_service = UserService()

    # 检查用户名是否已存在
    existing_user = await user_service.get_user_by_username(request.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )

    # 检查邮箱是否已存在
    existing_email = await user_service.get_user_by_email(request.email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已被注册"
        )

    # 创建用户
    user = await user_service.create_user(
        username=request.username,
        email=request.email,
        password=request.password,
        display_name=request.display_name,
        real_name=request.real_name,
        gender=request.gender,
        birthday=request.birthday,
        location=request.location,
        website=request.website,
        bio=request.bio
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="创建用户失败"
        )

    user_id = user.get("id")

    # 消耗邀请码
    ok = await inv_service.consume(request.invitation_code, user_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邀请码已被使用，请刷新后重试"
        )

    # 生成令牌
    access_token = create_access_token(
        subject=user_id,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(
        subject=user_id,
        expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    )

    # 存储会话到Redis
    from memos.api.core.redis import get_redis
    redis = await get_redis()
    session_data = {
        "user_id": user_id,
        "username": user.get("username"),
        "email": user.get("email"),
        "status": user.get("status"),
        "last_activity": str(user.get("last_login_at", "")),
    }
    await redis.setex(
        f"session:{user_id}",
        settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        str(session_data)
    )

    # 与登录接口返回格式一致，便于前端直接使用 response.access_token / response.user
    user_info = {
        "id": user.get("id"),
        "username": user.get("username"),
        "email": user.get("email"),
        "display_name": user.get("display_name"),
        "status": user.get("status"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
    }
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=user_info,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_async_db)
) -> Dict[str, Any]:
    """
    用户登录
    """
    user_service = UserService()

    # 获取用户（支持用户名或邮箱登录）
    # 登录时需要包含敏感信息（密码哈希）用于验证
    if "@" in request.username_or_email:
        user = await user_service.get_user_by_email(
            request.username_or_email, 
            include_sensitive=True
        )
    else:
        user = await user_service.get_user_by_username(
            request.username_or_email,
            include_sensitive=True
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )

    # 验证密码
    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )

    # 检查用户状态
    if user["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户账户已被禁用"
        )

    # 更新最后登录时间
    await user_service.update_last_login(user["id"])

    # 生成令牌
    access_token = create_access_token(
        subject=user["id"],
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(
        subject=user["id"],
        expires_delta=timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
    )

    # 存储会话到Redis
    try:
        from memos.api.core.redis import get_redis
        redis = await get_redis()

        # 获取设备信息
        device_info = request.device_info or {}
        device_info.update({
            "user_agent": http_request.headers.get("user-agent"),
            "ip_address": http_request.client.host if http_request.client else None,
        })

        session_data = {
            "user_id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "status": user["status"],
            "device_info": device_info,
            "last_activity": str(user.get("last_login_at")),
        }

        await redis.setex(
            f"session:{user['id']}",
            settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            str(session_data)
        )
    except Exception as e:
        # Redis 不可用时不影响登录流程
        logger.warning(f"Redis session storage failed: {e}")

    # 记录审计日志
    device_info = request.device_info or {}
    device_info.update({
        "user_agent": http_request.headers.get("user-agent"),
        "ip_address": http_request.client.host if http_request.client else None,
    })
    
    await user_service.create_audit_log(
        user_id=user["id"],
        action="login",
        target_type="user",
        target_id=user["id"],
        details=device_info,
        ip_address=http_request.client.host if http_request.client else None,
        user_agent=http_request.headers.get("user-agent")
    )

    # 构建用户信息响应（排除敏感信息）
    user_info = {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "display_name": user.get("display_name"),
        "status": user["status"],
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
    }

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=user_info,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/refresh", response_model=RefreshTokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_async_db)
) -> Dict[str, Any]:
    """
    刷新访问令牌
    """
    # 验证刷新令牌
    payload = verify_token(request.refresh_token, "refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌"
        )

    user_id = int(payload.get("sub"))
    user_service = UserService()
    user = await user_service.get_user_by_id(user_id)

    if not user or user.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用"
        )

    # 检查会话是否存在
    try:
        from memos.api.core.redis import get_redis
        redis = await get_redis()
        session_exists = await redis.exists(f"session:{user_id}")

        if not session_exists:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="会话已过期，请重新登录"
            )

        # 生成新的访问令牌
        access_token = create_access_token(
            subject=user["id"],
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        # 更新会话
        session_data = await redis.get(f"session:{user_id}")
        if session_data:
            await redis.setex(
                f"session:{user_id}",
                settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                session_data
            )
    except Exception as e:
        # Redis 不可用时仍允许刷新 token
        logger.warning(f"Redis session check failed: {e}")
        access_token = create_access_token(
            subject=user["id"],
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )

    # 构建用户信息响应
    user_info = {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "display_name": user.get("display_name"),
        "status": user["status"],
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
    }

    return RefreshTokenResponse(
        access_token=access_token,
        refresh_token=request.refresh_token,
        token_type="bearer",
        user=user_info,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/logout")
async def logout(
    request: LogoutRequest,
    http_request: Request,
    current_user_id: str = Depends(get_current_user_id)
) -> AuthResponse:
    """
    用户登出
    """
    from memos.api.core.redis import get_redis
    redis = await get_redis()

    # 删除会话
    if current_user_id:
        await redis.delete(f"session:{current_user_id}")

    # 将令牌加入黑名单
    if request.refresh_token:
        await blacklist_token(request.refresh_token)

    # 记录审计日志
    user_service = UserService(http_request.state.db)
    await user_service.create_audit_log(
        user_id=current_user_id,
        action="logout",
        target_type="user",
        target_id=current_user_id,
        ip_address=http_request.client.host if http_request.client else None,
        user_agent=http_request.headers.get("user-agent")
    )

    return AuthResponse(
        success=True,
        message="登出成功"
    )


@router.get("/me")
async def get_current_user_info(
    current_user_id: int = Depends(get_current_user_id),
    current_user: Dict[str, Any] = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    获取当前用户信息
    """
    return current_user


@router.put("/me")
async def update_current_user_profile(
    request: UpdateProfileRequest,
    current_user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_async_db)
) -> Dict[str, Any]:
    """
    更新当前用户资料
    """
    import logging
    logger = logging.getLogger(__name__)
    
    user_service = UserService()
    
    # 准备更新数据
    update_data = {}
    if request.display_name is not None:
        update_data["display_name"] = request.display_name
    if request.bio is not None:
        update_data["bio"] = request.bio
    
    logger.info(f"更新用户资料: user_id={current_user_id}, update_data={update_data}")
    
    # 更新用户资料
    updated_user = await user_service.update_user(
        user_id=current_user_id,
        update_data=update_data,
        update_profile=True
    )
    
    if not updated_user:
        logger.error(f"更新用户资料失败: user_id={current_user_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="更新用户资料失败"
        )
    
    logger.info(f"更新用户资料成功: user_id={current_user_id}, updated_user={updated_user}")
    
    # 返回更新后的用户信息（与GET /me格式一致）
    return updated_user


@router.post("/check-username")
async def check_username_availability(
    username: str,
    db: AsyncSession = Depends(get_async_db)
) -> Dict[str, Any]:
    """
    检查用户名可用性
    """
    user_service = UserService()
    existing_user = await user_service.get_user_by_username(username)

    return {
        "available": existing_user is None,
        "message": "用户名可用" if not existing_user else "用户名已被占用"
    }


@router.post("/check-email")
async def check_email_availability(
    email: str,
    db: AsyncSession = Depends(get_async_db)
) -> Dict[str, Any]:
    """
    检查邮箱可用性
    """
    user_service = UserService()
    existing_user = await user_service.get_user_by_email(email)

    return {
        "available": existing_user is None,
        "message": "邮箱可用" if not existing_user else "邮箱已被注册"
    }


@router.get("/sessions")
async def get_user_sessions(
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取用户会话列表
    """
    from memos.api.core.redis import get_redis
    redis = await get_redis()

    session_data = await redis.get(f"session:{current_user_id}")

    return {
        "sessions": [session_data] if session_data else [],
        "total": 1 if session_data else 0
    }


# 依赖函数已在文件顶部导入，直接使用