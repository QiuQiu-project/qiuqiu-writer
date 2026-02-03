from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.core.database import get_async_db
from memos.api.core.security import verify_token
from memos.api.schemas.admin import (
    AdminLoginRequest, TokenResponse, AdminCreateRequest, AdminUserResponse,
    UserListResponse, WorkListResponse, StatusUpdateRequest,
    PromptTemplateListResponse, PromptTemplateResponse, PromptTemplateCreate, PromptTemplateUpdate,
    SystemSettingResponse, SystemSettingUpdate, AuditLogResponse, AuditLogListResponse,
    SystemMonitorResponse, CubeListResponse, CubeResponse
)
from memos.api.services.admin_service import AdminService
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

@router.get("/prompt-templates", response_model=PromptTemplateListResponse)
async def get_prompt_templates(
    page: int = 1,
    size: int = 20,
    keyword: str = None,
    template_type: str = None,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    return await service.get_prompt_templates(page, size, keyword, template_type)

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
async def register(data: AdminCreateRequest, db: AsyncSession = Depends(get_async_db)):
    """
    Create a new admin user.
    Note: In production, this endpoint should probably be protected or disabled.
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

