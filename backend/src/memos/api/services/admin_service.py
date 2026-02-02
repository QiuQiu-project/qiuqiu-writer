import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func

from memos.api.core.id_utils import generate_id
from memos.api.core.security import get_password_hash, verify_password, create_access_token
from memos.api.models.admin import AdminUser
from memos.api.models.user import User
from memos.api.models.work import Work
from memos.api.models.prompt_template import PromptTemplate
from memos.api.schemas.admin import (
    AdminCreateRequest, AdminLoginRequest, TokenResponse, AdminUserResponse,
    UserListResponse, UserResponse, WorkListResponse, WorkResponse,
    PromptTemplateListResponse, PromptTemplateResponse, PromptTemplateCreate, PromptTemplateUpdate
)

logger = logging.getLogger(__name__)

class AdminService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_prompt_templates(self, page: int = 1, size: int = 20, keyword: Optional[str] = None, template_type: Optional[str] = None) -> PromptTemplateListResponse:
        query = select(PromptTemplate)
        if keyword:
            query = query.where(
                (PromptTemplate.name.ilike(f"%{keyword}%")) |
                (PromptTemplate.description.ilike(f"%{keyword}%"))
            )
        if template_type:
            query = query.where(PromptTemplate.template_type == template_type)
        
        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.db.scalar(count_query) or 0
        
        # Pagination
        query = query.offset((page - 1) * size).limit(size).order_by(PromptTemplate.created_at.desc())
        result = await self.db.execute(query)
        templates = result.scalars().all()
        
        items = []
        for t in templates:
            items.append(PromptTemplateResponse.model_validate(t))
            
        return PromptTemplateListResponse(total=total, items=items, page=page, size=size)

    async def create_prompt_template(self, data: PromptTemplateCreate) -> PromptTemplateResponse:
        template = PromptTemplate(
            name=data.name,
            description=data.description,
            template_type=data.template_type,
            prompt_content=data.prompt_content,
            version=data.version,
            is_default=data.is_default,
            is_active=data.is_active,
            variables=data.variables,
            template_metadata=data.metadata,
            component_id=data.component_id,
            component_type=data.component_type,
            prompt_category=data.prompt_category,
            data_key=data.data_key
        )
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        return PromptTemplateResponse.model_validate(template)

    async def update_prompt_template(self, template_id: int, data: PromptTemplateUpdate) -> Optional[PromptTemplateResponse]:
        template = await self.db.get(PromptTemplate, template_id)
        if not template:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if key == 'metadata':
                setattr(template, 'template_metadata', value)
            else:
                setattr(template, key, value)
        
        await self.db.commit()
        await self.db.refresh(template)
        return PromptTemplateResponse.model_validate(template)

    async def delete_prompt_template(self, template_id: int) -> bool:
        template = await self.db.get(PromptTemplate, template_id)
        if not template:
            return False
        await self.db.delete(template)
        await self.db.commit()
        return True

    async def get_users(self, page: int = 1, size: int = 20, keyword: Optional[str] = None) -> UserListResponse:
        query = select(User)
        if keyword:
            query = query.where(
                (User.username.ilike(f"%{keyword}%")) | 
                (User.email.ilike(f"%{keyword}%")) |
                (User.display_name.ilike(f"%{keyword}%"))
            )
        
        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.db.scalar(count_query) or 0
        
        # Pagination
        query = query.offset((page - 1) * size).limit(size).order_by(User.created_at.desc())
        result = await self.db.execute(query)
        users = result.scalars().all()
        
        items = []
        for u in users:
            items.append(UserResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                status=u.status,
                created_at=str(u.created_at) if u.created_at else None,
                last_login_at=str(u.last_login_at) if u.last_login_at else None,
                role="user"
            ))
            
        return UserListResponse(total=total, items=items, page=page, size=size)

    async def update_user_status(self, user_id: str, status: str) -> bool:
        user = await self.db.get(User, user_id)
        if not user:
            return False
        user.status = status
        await self.db.commit()
        return True

    async def get_works(self, page: int = 1, size: int = 20, keyword: Optional[str] = None) -> WorkListResponse:
        query = select(Work)
        if keyword:
            query = query.where(
                (Work.title.ilike(f"%{keyword}%")) |
                (Work.description.ilike(f"%{keyword}%"))
            )
        
        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total = await self.db.scalar(count_query) or 0
        
        # Pagination
        query = query.offset((page - 1) * size).limit(size).order_by(Work.created_at.desc())
        result = await self.db.execute(query)
        works = result.scalars().all()
        
        items = []
        for w in works:
            items.append(WorkResponse(
                id=w.id,
                title=w.title,
                work_type=w.work_type,
                status=w.status,
                owner_id=w.owner_id,
                created_at=str(w.created_at) if w.created_at else None,
                updated_at=str(w.updated_at) if w.updated_at else None,
                is_public=w.is_public,
                description=w.description
            ))
            
        return WorkListResponse(total=total, items=items, page=page, size=size)

    async def update_work_status(self, work_id: str, status: str) -> bool:
        work = await self.db.get(Work, work_id)
        if not work:
            return False
        work.status = status
        await self.db.commit()
        return True

    async def get_admin_by_username(self, username: str) -> Optional[AdminUser]:
        result = await self.db.execute(select(AdminUser).where(AdminUser.username == username))
        return result.scalars().first()

    async def create_admin(self, data: AdminCreateRequest) -> AdminUser:
        existing = await self.get_admin_by_username(data.username)
        if existing:
            raise ValueError(f"Admin user '{data.username}' already exists")

        new_admin = AdminUser(
            id=generate_id(),
            username=data.username,
            email=data.email,
            password_hash=get_password_hash(data.password),
            display_name=data.display_name or data.username,
            status="active"
        )
        self.db.add(new_admin)
        await self.db.commit()
        await self.db.refresh(new_admin)
        return new_admin

    async def authenticate(self, data: AdminLoginRequest) -> Optional[TokenResponse]:
        admin = await self.get_admin_by_username(data.username)
        if not admin or not verify_password(data.password, admin.password_hash):
            return None
        
        # Update last login
        admin.last_login_at = datetime.now(timezone.utc)
        await self.db.commit()

        # Create token
        # Note: We might want a separate secret or scope for admins, but using standard one for now
        access_token = create_access_token(subject=admin.id, additional_claims={"role": "admin"})
        
        # Safe response
        admin_resp = AdminUserResponse(
            id=admin.id,
            username=admin.username,
            email=admin.email,
            display_name=admin.display_name,
            status=admin.status,
            created_at=str(admin.created_at) if admin.created_at else None,
            last_login_at=str(admin.last_login_at) if admin.last_login_at else None
        )

        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=admin_resp
        )
