from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.core.database import get_async_db
from memos.api.core.security import verify_token
from memos.api.schemas.admin import (
    AdminLoginRequest, TokenResponse, AdminCreateRequest, AdminUserResponse,
    UserListResponse, WorkListResponse, StatusUpdateRequest, UserUpdateRequest,
    PromptTemplateListResponse, PromptTemplateResponse, PromptTemplateCreate, PromptTemplateUpdate,
    SystemSettingResponse, SystemSettingUpdate, SystemSettingCreate, AuditLogResponse, AuditLogListResponse,
    SystemMonitorResponse, CubeListResponse, CubeResponse,
    InvitationCodeListResponse, InvitationCodeResponse, GenerateInvitationCodesResponse,
    WorkTemplateAdminCreate, WorkTemplateAdminUpdate,
    PlanConfig, PlanConfigUpdateRequest,
    MediaModelConfig, MediaModelConfigUpdateRequest,
    MediaCreditPack, MediaCreditPackUpdateRequest,
)
from memos.api.services.admin_service import AdminService
from memos.api.services.invitation_code_service import InvitationCodeService
from memos.api.core.token_plans import get_plan_configs, save_plan_configs
from memos.api.core.media_credit_plans import (
    get_image_model_configs, save_image_model_configs,
    get_video_model_configs, save_video_model_configs,
    get_media_credit_packs, save_media_credit_packs,
)
from memos.mem_user.mysql_user_manager import MySQLUserManager
from memos.mem_user.persistent_factory import PersistentUserManagerFactory
from memos.configs.mem_user import UserManagerConfigFactory
from memos.api.config import APIConfig
import psutil
import platform as platform_info
import sys
import os
import time

_user_manager = None

def get_user_manager():
    global _user_manager
    if _user_manager is None:
        backend = os.getenv("MOS_USER_MANAGER_BACKEND", "sqlite").lower()
        if backend == "mysql":
            mysql_config = APIConfig.get_mysql_config()
            config_factory = UserManagerConfigFactory(
                backend="mysql",
                config=mysql_config
            )
        elif backend == "postgres":
            # Use APIConfig to get postgres config
            postgres_config = APIConfig.get_postgres_config()
            config_factory = UserManagerConfigFactory(
                backend="postgres",
                config=postgres_config
            )
        else:
            # Default to sqlite
            config_factory = UserManagerConfigFactory(
                backend="sqlite",
                config={"user_id": "root"}
            )
        
        _user_manager = PersistentUserManagerFactory.from_config(config_factory)
    return _user_manager

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])
security = HTTPBearer()

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_token(token, "access")
    if not payload or payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload.get("sub")

@router.get("/system-monitor", response_model=SystemMonitorResponse)
async def get_system_monitor(
    admin_id: str = Depends(get_current_admin)
):
    # CPU
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_cores = psutil.cpu_count()
    
    # Memory
    mem = psutil.virtual_memory()
    memory_info = {
        "total": mem.total,
        "available": mem.available,
        "percent": mem.percent,
        "used": mem.used
    }
    
    # Disk
    disk = psutil.disk_usage('/')
    disk_info = {
        "total": disk.total,
        "used": disk.used,
        "free": disk.free,
        "percent": disk.percent
    }
    
    # Uptime
    uptime = time.time() - psutil.boot_time()
    
    # Platform
    platform_str = f"{platform_info.system()} {platform_info.release()}"
    python_ver = sys.version.split()[0]
    
    return SystemMonitorResponse(
        cpu_percent=cpu_percent,
        cpu_cores=cpu_cores,
        memory=memory_info,
        disk=disk_info,
        uptime=uptime,
        platform=platform_str,
        python_version=python_ver
    )

@router.get("/system-settings", response_model=list[SystemSettingResponse])
async def get_system_settings(
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.get_system_settings()

@router.put("/system-settings/{setting_id}", response_model=SystemSettingResponse)
async def update_system_setting(
    setting_id: int,
    data: SystemSettingUpdate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    result = await service.update_system_setting(setting_id, data, admin_id=admin_id)
    if not result:
        raise HTTPException(status_code=404, detail="System setting not found")
    return result

@router.post("/system-settings", response_model=SystemSettingResponse)
async def create_system_setting(
    data: SystemSettingCreate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.create_system_setting(data, admin_id=admin_id)

@router.delete("/system-settings/{setting_id}")
async def delete_system_setting(
    setting_id: int,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    ok = await service.delete_system_setting(setting_id, admin_id=admin_id)
    if not ok:
        raise HTTPException(status_code=404, detail="System setting not found")
    return {"ok": True}

@router.get("/audit-logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    page: int = 1,
    size: int = 20,
    user_id: str = None,
    action: str = None,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.get_audit_logs(page, size, user_id, action)

@router.get("/work-templates")
async def get_work_templates(
    search: str = None,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.get_work_templates(search=search)

@router.get("/work-templates/{template_id}")
async def get_work_template(
    template_id: int,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    result = await service.get_work_template(template_id)
    if not result:
        raise HTTPException(status_code=404, detail="Work template not found")
    return result

@router.post("/work-templates", status_code=status.HTTP_201_CREATED)
async def create_work_template(
    data: WorkTemplateAdminCreate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.create_work_template(data, admin_id=admin_id)

@router.put("/work-templates/{template_id}")
async def update_work_template(
    template_id: int,
    data: WorkTemplateAdminUpdate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    result = await service.update_work_template(template_id, data, admin_id=admin_id)
    if not result:
        raise HTTPException(status_code=404, detail="Work template not found")
    return result

@router.delete("/work-templates/{template_id}")
async def delete_work_template(
    template_id: int,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    success = await service.delete_work_template(template_id, admin_id=admin_id)
    if not success:
        raise HTTPException(status_code=404, detail="Work template not found")
    return {"success": True}

@router.get("/prompt-templates", response_model=PromptTemplateListResponse)
async def get_prompt_templates(
    page: int = 1,
    size: int = 20,
    keyword: str = None,
    template_type: str = None,
    global_only: bool = False,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.get_prompt_templates(page, size, keyword, template_type, global_only=global_only)

@router.post("/prompt-templates", response_model=PromptTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_prompt_template(
    data: PromptTemplateCreate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.create_prompt_template(data, admin_id=admin_id)

@router.put("/prompt-templates/{template_id}", response_model=PromptTemplateResponse)
async def update_prompt_template(
    template_id: int,
    data: PromptTemplateUpdate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    result = await service.update_prompt_template(template_id, data, admin_id=admin_id)
    if not result:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return result

@router.delete("/prompt-templates/{template_id}")
async def delete_prompt_template(
    template_id: int,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    success = await service.delete_prompt_template(template_id, admin_id=admin_id)
    if not success:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return {"success": True}

@router.post("/auth/login", response_model=TokenResponse, tags=["Admin Auth"])
async def login(data: AdminLoginRequest, db: AsyncSession = Depends(get_async_db)):
    service = AdminService(db)
    token = await service.authenticate(data)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token

@router.post("/auth/register", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED, tags=["Admin Auth"])
async def register(
    data: AdminCreateRequest,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin),
):
    """
    Create a new admin user. Requires an existing admin token to prevent
    unauthorized self-registration in production.
    """
    service = AdminService(db)
    try:
        return await service.create_admin(data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/users", response_model=UserListResponse)
async def get_users(
    page: int = 1, 
    size: int = 20, 
    keyword: str = None,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.get_users(page, size, keyword)

@router.put("/users/{user_id}")
async def update_user_info(
    user_id: str,
    data: UserUpdateRequest,
    admin_id: str = Depends(get_current_admin)
):
    user_manager = get_user_manager()
    success = user_manager.update_user_info(
        user_id=user_id,
        email=data.email,
        display_name=data.display_name,
        phone=data.phone,
        avatar_url=data.avatar_url
    )
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}

@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    data: StatusUpdateRequest,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    success = await service.update_user_status(user_id, data.status, admin_id=admin_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}

@router.get("/works", response_model=WorkListResponse)
async def get_works(
    page: int = 1,
    size: int = 20,
    keyword: str = None,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.get_works(page, size, keyword)

@router.put("/works/{work_id}/status")
async def update_work_status(
    work_id: str,
    data: StatusUpdateRequest,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    success = await service.update_work_status(work_id, data.status, admin_id=admin_id)
    if not success:
        raise HTTPException(status_code=404, detail="Work not found")
    return {"success": True}

@router.get("/cubes", response_model=CubeListResponse)
async def list_cubes(
    page: int = 1,
    size: int = 20,
    admin_id: str = Depends(get_current_admin)
):
    user_manager = get_user_manager()
    total, cubes = user_manager.list_all_cubes(page, size)
    
    items = []
    for cube in cubes:
        items.append(CubeResponse.model_validate(cube))
        
    return CubeListResponse(total=total, items=items, page=page, size=size)

@router.delete("/cubes/{cube_id}")
async def delete_cube(
    cube_id: str,
    admin_id: str = Depends(get_current_admin)
):
    user_manager = get_user_manager()
    success = user_manager.delete_cube(cube_id)
    if not success:
        raise HTTPException(status_code=404, detail="Cube not found")
    return {"success": True}

@router.post("/invitation-codes/generate", response_model=GenerateInvitationCodesResponse)
async def generate_invitation_codes(
    count: int = 100,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin),
):
    """一键生成指定数量的邀请码（默认100个）"""
    if count < 1 or count > 500:
        raise HTTPException(status_code=400, detail="count must be between 1 and 500")
    service = InvitationCodeService(db)
    codes = await service.generate_batch(count=count)
    return GenerateInvitationCodesResponse(
        success=True,
        message=f"已生成 {len(codes)} 个邀请码",
        count=len(codes),
        codes=codes,
    )


@router.get("/invitation-codes", response_model=InvitationCodeListResponse)
async def list_invitation_codes(
    page: int = 1,
    size: int = 50,
    used: bool | None = None,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin),
):
    """分页获取邀请码列表。used=true 仅已使用，used=false 仅未使用，不传为全部"""
    service = InvitationCodeService(db)
    total, items = await service.list_codes(page=page, size=size, used_only=used)
    return InvitationCodeListResponse(
        total=total,
        items=[InvitationCodeResponse.model_validate(x) for x in items],
        page=page,
        size=size,
    )


@router.post("/maintenance/clear-cache")
async def clear_cache(
    admin_id: str = Depends(get_current_admin)
):
    from memos.api.core.redis import get_redis
    try:
        redis = await get_redis()
        await redis.flushdb()
        return {"success": True, "message": "Cache cleared successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

@router.post("/maintenance/reload-config")
async def reload_config(
    admin_id: str = Depends(get_current_admin)
):
    try:
        from memos.api.config import NacosConfigManager
        from dotenv import load_dotenv
        
        # Reload from .env
        load_dotenv(override=True)
        
        # Reload from Nacos if enabled
        NacosConfigManager.init()
        
        return {"success": True, "message": "Configuration reloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload config: {str(e)}")


# ─── Token / 套餐管理 ────────────────────────────────────────────────────────

from pydantic import BaseModel, Field
from typing import Optional

class UserPlanUpdateRequest(BaseModel):
    plan: str
    plan_expires_at: Optional[str] = None  # ISO 格式日期字符串，可选
    override_remaining: Optional[int] = None




@router.put("/users/{user_id}/plan")
async def update_user_plan(
    user_id: str,
    data: UserPlanUpdateRequest,
    admin_id: str = Depends(get_current_admin),
):
    """管理员设置用户套餐及 Token 余额"""
    from memos.api.services.token_service import TokenService
    from datetime import datetime, timezone

    expires_at = None
    if data.plan_expires_at:
        try:
            expires_at = datetime.fromisoformat(data.plan_expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="plan_expires_at 格式无效，请使用 ISO 格式")

    token_service = TokenService()
    success = await token_service.set_user_plan(
        user_id=user_id,
        plan=data.plan,
        expires_at=expires_at,
        override_remaining=data.override_remaining,
    )
    if not success:
        raise HTTPException(status_code=404, detail=f"用户 {user_id} 不存在")
    return {"success": True, "user_id": user_id, "plan": data.plan}


@router.get("/plans/config", response_model=list[PlanConfig])
async def get_plans_config(
    admin_id: str = Depends(get_current_admin)
):
    return await get_plan_configs()

@router.put("/plans/config", response_model=list[PlanConfig])
async def update_plans_config(
    request: PlanConfigUpdateRequest,
    admin_id: str = Depends(get_current_admin)
):
    configs = [p.model_dump() for p in request.plans]
    await save_plan_configs(configs)
    return await get_plan_configs()


# ── 媒体模型定价 ────────────────────────────────────────────────────────────────

@router.get("/media/image-models", response_model=list[MediaModelConfig])
async def get_admin_image_models(admin_id: str = Depends(get_current_admin)):
    return await get_image_model_configs()

@router.put("/media/image-models", response_model=list[MediaModelConfig])
async def update_admin_image_models(
    request: MediaModelConfigUpdateRequest,
    admin_id: str = Depends(get_current_admin),
):
    configs = [m.model_dump() for m in request.models]
    await save_image_model_configs(configs)
    return await get_image_model_configs()

@router.get("/media/video-models", response_model=list[MediaModelConfig])
async def get_admin_video_models(admin_id: str = Depends(get_current_admin)):
    return await get_video_model_configs()

@router.put("/media/video-models", response_model=list[MediaModelConfig])
async def update_admin_video_models(
    request: MediaModelConfigUpdateRequest,
    admin_id: str = Depends(get_current_admin),
):
    configs = [m.model_dump() for m in request.models]
    await save_video_model_configs(configs)
    return await get_video_model_configs()


# ── 统一媒体充值包定价 ─────────────────────────────────────────────────────────

@router.get("/media/packs", response_model=list[MediaCreditPack])
async def get_admin_media_packs(admin_id: str = Depends(get_current_admin)):
    return await get_media_credit_packs()

@router.put("/media/packs", response_model=list[MediaCreditPack])
async def update_admin_media_packs(
    request: MediaCreditPackUpdateRequest,
    admin_id: str = Depends(get_current_admin),
):
    packs = [p.model_dump() for p in request.packs]
    await save_media_credit_packs(packs)
    return await get_media_credit_packs()
