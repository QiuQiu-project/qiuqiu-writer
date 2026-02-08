"""
认证相关的数据模式
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, EmailStr, validator


class LoginRequest(BaseModel):
    """登录请求模式"""
    username_or_email: str
    password: str
    device_info: Optional[Dict[str, Any]] = None

    @validator("username_or_email")
    def validate_username_or_email(cls, v):
        if not v or v.strip() == "":
            raise ValueError("用户名或邮箱不能为空")
        if len(v) < 3 or len(v) > 100:
            raise ValueError("用户名或邮箱长度必须在3-100个字符之间")
        return v.strip()

    @validator("password")
    def validate_password(cls, v):
        if not v:
            raise ValueError("密码不能为空")
        if len(v) < 6 or len(v) > 128:
            raise ValueError("密码长度必须在6-128个字符之间")
        return v


class RegisterRequest(BaseModel):
    """注册请求模式"""
    invitation_code: str
    username: str
    email: EmailStr
    password: str
    confirm_password: str
    display_name: Optional[str] = None
    real_name: Optional[str] = None
    gender: Optional[str] = None
    birthday: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None
    bio: Optional[str] = None

    @validator("invitation_code")
    def validate_invitation_code(cls, v):
        if not v or not v.strip():
            raise ValueError("邀请码不能为空")
        if len(v.strip()) > 32:
            raise ValueError("邀请码格式不正确")
        return v.strip().upper()

    @validator("username")
    def validate_username(cls, v):
        if not v or v.strip() == "":
            raise ValueError("用户名不能为空")
        if len(v) < 3 or len(v) > 50:
            raise ValueError("用户名长度必须在3-50个字符之间")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("用户名只能包含字母、数字、下划线和连字符")
        return v.strip()

    @validator("password")
    def validate_password(cls, v):
        if not v:
            raise ValueError("密码不能为空")

        # 密码长度检查
        if len(v) < 8:
            raise ValueError("密码长度至少为8位")
        if len(v) > 128:
            raise ValueError("密码长度不能超过128位")

        # 密码复杂度检查
        has_lower = any(c.islower() for c in v)
        has_upper = any(c.isupper() for c in v)
        has_digit = any(c.isdigit() for c in v)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?`~" for c in v)

        complexity_score = sum([has_upper, has_lower, has_digit, has_special])

        if complexity_score < 3:
            raise ValueError("密码必须包含大写字母、小写字母、数字中的至少3种字符")

        return v

    @validator("confirm_password")
    def validate_confirm_password(cls, v, values):
        if "password" in values and v != values["password"]:
            raise ValueError("确认密码不匹配")
        return v

    @validator("display_name")
    def validate_display_name(cls, v):
        if v is not None:
            if len(v) < 1 or len(v) > 100:
                raise ValueError("昵称长度必须在1-100个字符之间")
        return v

    @validator("bio")
    def validate_bio(cls, v):
        if v is not None:
            if len(v) > 500:
                raise ValueError("个人简介不能超过500个字符")
        return v


class ChangePasswordRequest(BaseModel):
    """修改密码请求模式"""
    current_password: str
    new_password: str
    confirm_password: str

    @validator("current_password")
    def validate_current_password(cls, v):
        if not v:
            raise ValueError("当前密码不能为空")
        return v

    @validator("new_password")
    def validate_new_password(cls, v):
        if not v:
            raise ValueError("新密码不能为空")

        # 密码长度检查
        if len(v) < 8:
            raise ValueError("新密码长度至少为8位")
        if len(v) > 128:
            raise ValueError("新密码长度不能超过128位")

        # 密码复杂度检查
        has_lower = any(c.islower() for c in v)
        has_upper = any(c.isupper() for c in v)
        has_digit = any(c.isdigit() for c in v)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?`~" for c in v)

        complexity_score = sum([has_upper, has_lower, has_digit, has_special])

        if complexity_score < 3:
            raise ValueError("新密码必须包含大写字母、小写字母、数字中的至少3种字符")

        return v

    @validator("confirm_password")
    def validate_confirm_password(cls, v, values):
        if "new_password" in values and v != values["new_password"]:
            raise ValueError("确认密码不匹配")
        return v


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求模式"""
    refresh_token: str

    @validator("refresh_token")
    def validate_refresh_token(cls, v):
        if not v or v.strip() == "":
            raise ValueError("刷新令牌不能为空")
        return v.strip()


class LogoutRequest(BaseModel):
    """登出请求模式"""
    refresh_token: Optional[str] = None


class TokenResponse(BaseModel):
    """令牌响应模式"""
    access_token: str
    refresh_token: str
    token_type: str
    user: Dict[str, Any]
    expires_in: float


class RefreshTokenResponse(BaseModel):
    """刷新令牌响应模式"""
    access_token: str
    refresh_token: str
    token_type: str
    user: Dict[str, Any]
    expires_in: float


class AuthResponse(BaseModel):
    """认证响应模式"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class PasswordValidationError(BaseModel):
    """密码验证错误响应"""
    field: str
    error: str


class UserAvailabilityResponse(BaseModel):
    """用户可用性检查响应"""
    available: bool
    message: str


class SessionInfo(BaseModel):
    """会话信息模式"""
    user_id: str
    access_token: str
    device_info: Optional[Dict[str, Any]] = None
    last_activity: str
    created_at: str
    status: str


class DeviceInfo(BaseModel):
    """设备信息模式"""
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None
    device_type: Optional[str] = None  # mobile/desktop/tablet
    browser: Optional[str] = None
    os: Optional[str] = None
    platform: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    """更新用户资料请求模式"""
    display_name: Optional[str] = None
    bio: Optional[str] = None

    @validator("display_name")
    def validate_display_name(cls, v):
        if v is not None:
            if len(v) < 1 or len(v) > 100:
                raise ValueError("昵称长度必须在1-100个字符之间")
        return v

    @validator("bio")
    def validate_bio(cls, v):
        if v is not None:
            if len(v) > 500:
                raise ValueError("个人简介不能超过500个字符")
        return v