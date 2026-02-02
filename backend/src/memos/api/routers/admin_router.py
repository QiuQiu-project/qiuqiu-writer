from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.core.database import get_async_db
from memos.api.core.security import verify_token
from memos.api.schemas.admin import (
    AdminLoginRequest, TokenResponse, AdminCreateRequest, AdminUserResponse,
    UserListResponse, WorkListResponse, StatusUpdateRequest,
    PromptTemplateListResponse, PromptTemplateResponse, PromptTemplateCreate, PromptTemplateUpdate
)
from memos.api.services.admin_service import AdminService

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
    return await service.create_prompt_template(data)

@router.put("/prompt-templates/{template_id}", response_model=PromptTemplateResponse)
async def update_prompt_template(
    template_id: int,
    data: PromptTemplateUpdate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin)
):
    service = AdminService(db)
    result = await service.update_prompt_template(template_id, data)
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
    success = await service.delete_prompt_template(template_id)
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
    success = await service.update_user_status(user_id, data.status)
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
    success = await service.update_work_status(work_id, data.status)
    if not success:
        raise HTTPException(status_code=404, detail="Work not found")
    return {"success": True}

