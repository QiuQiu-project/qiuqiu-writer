"""
作品模板服务
"""

from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, desc, asc, func
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select

from memos.api.models.template import WorkTemplate, TemplateField, WorkInfoExtended
from memos.api.models.work import Work
from memos.api.models.system import AuditLog


class TemplateService:
    """作品模板业务逻辑服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_template(self, creator_id: int, **kwargs) -> WorkTemplate:
        """创建作品模板"""
        # 确保 template_config 有默认值
        if "template_config" not in kwargs or kwargs["template_config"] is None:
            kwargs["template_config"] = {}
        
        # 确保 settings 有默认值
        if "settings" not in kwargs or kwargs["settings"] is None:
            kwargs["settings"] = {}
        
        template = WorkTemplate(
            creator_id=creator_id,
            **kwargs
        )

        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        
        # 重新查询以预加载关系（避免懒加载问题）
        stmt = select(WorkTemplate).options(
            selectinload(WorkTemplate.fields)
        ).where(WorkTemplate.id == template.id)
        result = await self.db.execute(stmt)
        template = result.scalar_one()

        return template

    async def get_template_by_id(self, template_id: int) -> Optional[WorkTemplate]:
        """根据ID获取模板"""
        stmt = select(WorkTemplate).options(
            selectinload(WorkTemplate.fields)
        ).where(WorkTemplate.id == template_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_templates(
        self,
        user_id: int,
        filters: Dict[str, Any] = None,
        page: int = 1,
        size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[WorkTemplate], int]:
        """获取模板列表"""
        filters = filters or {}

        # 构建查询条件
        conditions = [
            or_(
                WorkTemplate.creator_id == user_id,  # 用户自己的模板
                WorkTemplate.is_public == True,      # 公开模板
                WorkTemplate.is_system == True       # 系统模板
            )
        ]

        if "work_type" in filters:
            conditions.append(WorkTemplate.work_type == filters["work_type"])
        if "category" in filters:
            conditions.append(WorkTemplate.category == filters["category"])
        if "is_public" in filters:
            conditions.append(WorkTemplate.is_public == filters["is_public"])
        if "is_system" in filters:
            conditions.append(WorkTemplate.is_system == filters["is_system"])
        if "search" in filters:
            search_term = f"%{filters['search']}%"
            conditions.append(
                or_(
                    WorkTemplate.name.ilike(search_term),
                    WorkTemplate.description.ilike(search_term)
                )
            )

        # 获取总数
        count_stmt = select(func.count(WorkTemplate.id)).where(and_(*conditions))
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar()

        # 获取模板列表
        stmt = select(WorkTemplate).options(
            selectinload(WorkTemplate.fields)
        ).where(and_(*conditions))

        # 排序
        sort_column = getattr(WorkTemplate, sort_by, WorkTemplate.created_at)
        if sort_order == "desc":
            stmt = stmt.order_by(desc(sort_column))
        else:
            stmt = stmt.order_by(asc(sort_column))

        # 分页
        stmt = stmt.offset((page - 1) * size).limit(size)

        result = await self.db.execute(stmt)
        templates = result.scalars().all()

        return list(templates), total

    async def get_public_templates(
        self,
        filters: Dict[str, Any] = None,
        page: int = 1,
        size: int = 20,
        sort_by: str = "usage_count",
        sort_order: str = "desc"
    ) -> List[WorkTemplate]:
        """获取公开模板列表"""
        filters = filters or {}

        conditions = [WorkTemplate.is_public == True]

        if "work_type" in filters:
            conditions.append(WorkTemplate.work_type == filters["work_type"])
        if "category" in filters:
            conditions.append(WorkTemplate.category == filters["category"])
        if "search" in filters:
            search_term = f"%{filters['search']}%"
            conditions.append(
                or_(
                    WorkTemplate.name.ilike(search_term),
                    WorkTemplate.description.ilike(search_term)
                )
            )

        stmt = select(WorkTemplate).options(
            selectinload(WorkTemplate.fields)
        ).where(and_(*conditions))

        # 排序
        sort_column = getattr(WorkTemplate, sort_by, WorkTemplate.usage_count)
        if sort_order == "desc":
            stmt = stmt.order_by(desc(sort_column))
        else:
            stmt = stmt.order_by(asc(sort_column))

        # 分页
        stmt = stmt.offset((page - 1) * size).limit(size)

        result = await self.db.execute(stmt)
        templates = result.scalars().all()

        return list(templates)

    async def update_template(self, template_id: int, **kwargs) -> WorkTemplate:
        """更新模板"""
        stmt = select(WorkTemplate).where(WorkTemplate.id == template_id)
        result = await self.db.execute(stmt)
        template = result.scalar_one_or_none()

        if not template:
            raise ValueError("模板不存在")

        # 更新字段
        for key, value in kwargs.items():
            if hasattr(template, key):
                setattr(template, key, value)

        await self.db.commit()
        await self.db.refresh(template)

        return template

    async def delete_template(self, template_id: int) -> bool:
        """删除模板"""
        stmt = select(WorkTemplate).where(WorkTemplate.id == template_id)
        result = await self.db.execute(stmt)
        template = result.scalar_one_or_none()

        if not template:
            return False

        await self.db.delete(template)
        await self.db.commit()

        return True

    async def add_template_field(self, template_id: int, **kwargs) -> TemplateField:
        """添加模板字段"""
        field = TemplateField(
            template_id=template_id,
            **kwargs
        )

        self.db.add(field)
        await self.db.commit()
        await self.db.refresh(field)

        return field

    async def update_template_field(self, field_id: int, **kwargs) -> Optional[TemplateField]:
        """更新模板字段"""
        stmt = select(TemplateField).where(TemplateField.id == field_id)
        result = await self.db.execute(stmt)
        field = result.scalar_one_or_none()

        if not field:
            return None

        # 更新字段
        for key, value in kwargs.items():
            if hasattr(field, key):
                setattr(field, key, value)

        await self.db.commit()
        await self.db.refresh(field)

        return field

    async def delete_template_field(self, field_id: int) -> bool:
        """删除模板字段"""
        stmt = select(TemplateField).where(TemplateField.id == field_id)
        result = await self.db.execute(stmt)
        field = result.scalar_one_or_none()

        if not field:
            return False

        await self.db.delete(field)
        await self.db.commit()

        return True

    async def create_work_extended_info(self, work_id: int, **kwargs) -> WorkInfoExtended:
        """创建作品扩展信息"""
        extended_info = WorkInfoExtended(
            work_id=work_id,
            **kwargs
        )

        self.db.add(extended_info)
        await self.db.commit()
        await self.db.refresh(extended_info)

        return extended_info

    async def get_work_extended_info(self, work_id: int) -> Optional[WorkInfoExtended]:
        """获取作品扩展信息"""
        stmt = select(WorkInfoExtended).options(
            selectinload(WorkInfoExtended.template)
        ).where(WorkInfoExtended.work_id == work_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_work_extended_info(self, work_id: int, **kwargs) -> Optional[WorkInfoExtended]:
        """更新作品扩展信息"""
        stmt = select(WorkInfoExtended).options(
            selectinload(WorkInfoExtended.template)
        ).where(WorkInfoExtended.work_id == work_id)

        result = await self.db.execute(stmt)
        extended_info = result.scalar_one_or_none()

        if not extended_info:
            return None

        # 更新字段
        for key, value in kwargs.items():
            if hasattr(extended_info, key):
                setattr(extended_info, key, value)

        await self.db.commit()
        await self.db.refresh(extended_info)

        return extended_info

    async def apply_template_to_work(self, work_id: int, template_id: int) -> WorkInfoExtended:
        """将模板应用到作品"""
        # 检查模板是否存在
        template_stmt = select(WorkTemplate).options(
            selectinload(WorkTemplate.fields)
        ).where(WorkTemplate.id == template_id)

        template_result = await self.db.execute(template_stmt)
        template = template_result.scalar_one_or_none()

        if not template:
            raise ValueError("模板不存在")

        # 检查是否已有扩展信息
        extended_info = await self.get_work_extended_info(work_id)

        if extended_info:
            # 更新现有扩展信息
            extended_info.template_id = template_id
            # 重置字段值或保留现有值
            if not extended_info.field_values:
                extended_info.field_values = {}
        else:
            # 创建新的扩展信息
            extended_info = WorkInfoExtended(
                work_id=work_id,
                template_id=template_id,
                field_values={}
            )
            self.db.add(extended_info)

        # 设置默认值
        for field in template.fields:
            if field.field_name not in extended_info.field_values and field.default_value:
                extended_info.field_values[field.field_name] = field.default_value

        await self.db.commit()
        await self.db.refresh(extended_info)

        # 增加模板使用次数
        template.usage_count += 1
        await self.db.commit()

        return extended_info

    # 权限检查方法
    async def can_access_template(self, user_id: int, template_id: int) -> bool:
        """检查用户是否可以访问模板"""
        template = await self.get_template_by_id(template_id)
        if not template:
            return False

        return (
            template.creator_id == user_id or
            template.is_public or
            template.is_system
        )

    async def can_edit_template(self, user_id: int, template_id: int) -> bool:
        """检查用户是否可以编辑模板"""
        template = await self.get_template_by_id(template_id)
        if not template:
            return False

        # 只有模板创建者可以编辑用户模板，系统模板不能编辑
        return template.creator_id == user_id and not template.is_system

    async def can_access_work(self, user_id: int, work_id: int) -> bool:
        """检查用户是否可以访问作品"""
        stmt = select(Work).where(Work.id == work_id)
        result = await self.db.execute(stmt)
        work = result.scalar_one_or_none()

        if not work:
            return False

        # 检查是否为所有者或协作者或公开作品
        if work.owner_id == user_id:
            return True

        # 检查协作者权限
        from sqlalchemy import or_
        collaborator_stmt = select(WorkCollaborator).where(
            and_(
                WorkCollaborator.work_id == work_id,
                WorkCollaborator.user_id == user_id
            )
        )
        collaborator_result = await self.db.execute(collaborator_stmt)
        collaborator = collaborator_result.scalar_one_or_none()

        return collaborator is not None or work.is_public

    async def can_edit_work(self, user_id: int, work_id: int) -> bool:
        """检查用户是否可以编辑作品"""
        stmt = select(Work).where(Work.id == work_id)
        result = await self.db.execute(stmt)
        work = result.scalar_one_or_none()

        if not work:
            return False

        # 检查是否为所有者
        if work.owner_id == user_id:
            return True

        # 检查协作者编辑权限
        from memos.api.models.work import WorkCollaborator
        collaborator_stmt = select(WorkCollaborator).where(
            and_(
                WorkCollaborator.work_id == work_id,
                WorkCollaborator.user_id == user_id,
                WorkCollaborator.permission.in_(["owner", "editor"])
            )
        )
        collaborator_result = await self.db.execute(collaborator_stmt)
        collaborator = collaborator_result.scalar_one_or_none()

        return collaborator is not None

    async def create_audit_log(
        self,
        user_id: int,
        action: str,
        target_type: str,
        target_id: int,
        details: Dict[str, Any],
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """创建审计日志"""
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )

        self.db.add(audit_log)
        await self.db.commit()