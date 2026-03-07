"""
作品服务
"""

from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, desc, asc, func, outerjoin, cast, String
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select

from memos.api.models.work import Work, WorkCollaborator
from memos.api.models.user import User
from memos.api.models.system import AuditLog
from memos.api.core.id_utils import generate_id


class WorkService:
    """作品业务逻辑服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_work(self, **kwargs) -> Work:
        """创建作品（id 为 40 位字符串）"""
        # 如果指定了 id，使用指定的 id（用于恢复作品时保持原有 ID）
        work_id = kwargs.pop("id", None)
        if work_id is None:
            work_id = generate_id()
        kwargs["id"] = work_id
        work = Work(**kwargs)

        self.db.add(work)
        await self.db.commit()
        
        # 重新加载以确保关系被加载（特别是 collaborators 和 chapters）
        return await self.get_work_by_id(work_id)

    async def get_work_by_id(self, work_id: str) -> Optional[Work]:
        """根据ID获取作品"""
        stmt = select(Work).options(
            selectinload(Work.collaborators).selectinload(WorkCollaborator.user),
            selectinload(Work.chapters)
        ).where(Work.id == work_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_work_by_filename(self, file_name: str, user_id: str) -> Optional[Work]:
        """根据文件名查找作品（从work_metadata中查找source_file）"""
        # 使用 cast 将 JSONB 字段转换为字符串进行比较
        # PostgreSQL JSONB 使用 ->> 操作符提取文本值，在 SQLAlchemy 中使用 cast
        stmt = select(Work).where(
            and_(
                Work.owner_id == user_id,
                cast(Work.work_metadata['source_file'], String) == file_name
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_works(
        self,
        user_id: str,
        filters: Dict[str, Any] = None,
        page: int = 1,
        size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[Work], int]:
        """获取用户作品列表"""
        filters = filters or {}

        # 构建查询条件
        conditions = [
            or_(
                Work.owner_id == user_id,  # 用户自己的作品
                WorkCollaborator.user_id == user_id  # 协作作品
            )
        ]

        if "work_type" in filters:
            conditions.append(Work.work_type == filters["work_type"])
        if "status" in filters:
            conditions.append(Work.status == filters["status"])
        if "category" in filters:
            conditions.append(Work.category == filters["category"])
        if "genre" in filters:
            conditions.append(Work.genre == filters["genre"])
        if "search" in filters:
            search_term = f"%{filters['search']}%"
            conditions.append(
                or_(
                    Work.title.ilike(search_term),
                    Work.description.ilike(search_term)
                )
            )

        # 获取总数
        count_stmt = select(func.count(func.distinct(Work.id))).select_from(
            outerjoin(Work, WorkCollaborator, Work.id == WorkCollaborator.work_id)
        ).where(and_(*conditions))

        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar()

        # 获取作品列表
        stmt = select(Work).options(
            selectinload(Work.collaborators).selectinload(WorkCollaborator.user),
            selectinload(Work.chapters)
        ).select_from(
            outerjoin(Work, WorkCollaborator, Work.id == WorkCollaborator.work_id)
        ).where(and_(*conditions))

        # 排序
        sort_column = getattr(Work, sort_by, Work.created_at)
        if sort_order == "desc":
            stmt = stmt.order_by(desc(sort_column))
        else:
            stmt = stmt.order_by(asc(sort_column))

        # 分页并去除重复
        stmt = stmt.distinct().offset((page - 1) * size).limit(size)

        result = await self.db.execute(stmt)
        works = result.scalars().all()

        return list(works), total

    async def get_public_works(
        self,
        filters: Dict[str, Any] = None,
        page: int = 1,
        size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc"
    ) -> Tuple[List[Work], int]:
        """获取公开作品列表"""
        filters = filters or {}

        conditions = [Work.is_public == True]

        if "work_type" in filters:
            conditions.append(Work.work_type == filters["work_type"])
        if "category" in filters:
            conditions.append(Work.category == filters["category"])
        if "genre" in filters:
            conditions.append(Work.genre == filters["genre"])
        if "search" in filters:
            search_term = f"%{filters['search']}%"
            conditions.append(
                or_(
                    Work.title.ilike(search_term),
                    Work.description.ilike(search_term)
                )
            )

        # 获取总数
        count_stmt = select(func.count(Work.id)).where(and_(*conditions))
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar()

        # 获取作品列表
        stmt = select(Work).where(and_(*conditions))

        # 排序
        sort_column = getattr(Work, sort_by, Work.created_at)
        if sort_order == "desc":
            stmt = stmt.order_by(desc(sort_column))
        else:
            stmt = stmt.order_by(asc(sort_column))

        # 分页
        stmt = stmt.offset((page - 1) * size).limit(size)

        result = await self.db.execute(stmt)
        works = result.scalars().all()

        return list(works), total

    async def update_work(self, work_id: str, **kwargs) -> Work:
        """更新作品"""
        work = await self.get_work_by_id(work_id)
        if not work:
            raise ValueError("作品不存在")

        # 更新字段
        for key, value in kwargs.items():
            if hasattr(work, key):
                # 对于 metadata 字段，进行深度合并而不是完全替换
                if key == "metadata" and isinstance(value, dict):
                    current_metadata = work.work_metadata or {}
                    # 深度合并 metadata
                    def deep_merge(target: dict, source: dict):
                        """深度合并两个字典"""
                        for k, v in source.items():
                            # 特殊处理：如果源值是空数组，且目标值已有数据，则保留目标值
                            if k == "characters" and isinstance(v, list) and len(v) == 0:
                                if k in target and isinstance(target[k], list) and len(target[k]) > 0:
                                    # 保留现有的角色数据，不覆盖为空数组
                                    continue
                            # 特殊处理：template_config 应该完全替换，而不是深度合并（因为前端已经发送了完整的配置）
                            if k == "template_config" and isinstance(v, dict):
                                # template_config 包含完整的模板配置，包括 modules 中的 dataKey 和 dataDependencies
                                # 应该完全替换，确保保存完整的配置
                                target[k] = v
                                continue
                            if k in target and isinstance(target[k], dict) and isinstance(v, dict):
                                deep_merge(target[k], v)
                            else:
                                target[k] = v
                        return target
                    
                    merged_metadata = deep_merge(current_metadata.copy(), value)
                    setattr(work, "work_metadata", merged_metadata)
                else:
                    setattr(work, key, value)

        await self.db.commit()
        
        # 重新加载以确保关系被加载
        return await self.get_work_by_id(work_id)

    async def delete_work(self, work_id: str) -> bool:
        """删除作品"""
        work = await self.get_work_by_id(work_id)
        if not work:
            return False

        await self.db.delete(work)
        await self.db.commit()

        return True

    async def publish_work(self, work_id: str) -> Work:
        """发布作品"""
        work = await self.get_work_by_id(work_id)
        if not work:
            raise ValueError("作品不存在")

        work.status = "published"
        work.published_at = func.now()

        await self.db.commit()
        # 重新加载以确保关系被加载
        return await self.get_work_by_id(work_id)

    async def archive_work(self, work_id: str) -> Work:
        """归档作品"""
        work = await self.get_work_by_id(work_id)
        if not work:
            raise ValueError("作品不存在")

        work.status = "archived"

        await self.db.commit()
        # 重新加载以确保关系被加载
        return await self.get_work_by_id(work_id)

    # 协作者管理
    async def get_work_collaborators(self, work_id: str) -> List[WorkCollaborator]:
        """获取作品协作者列表"""
        stmt = select(WorkCollaborator).options(
            selectinload(WorkCollaborator.user)
        ).where(WorkCollaborator.work_id == work_id)

        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def add_collaborator(
        self,
        work_id: str,
        user_id: str,
        permission: str = "reader",
        role: str = None,
        invited_by: str = None
    ) -> WorkCollaborator:
        """添加协作者（已存在则更新权限）"""
        stmt = select(WorkCollaborator).options(
            selectinload(WorkCollaborator.user)
        ).where(
            and_(
                WorkCollaborator.work_id == work_id,
                WorkCollaborator.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalars().first()

        if existing:
            # 已存在则更新权限和角色
            existing.permission = permission
            if role is not None:
                existing.role = role
            await self.db.commit()
            
            # 重新加载以获取 user 信息
            stmt = select(WorkCollaborator).options(
                selectinload(WorkCollaborator.user)
            ).where(WorkCollaborator.id == existing.id)
            result = await self.db.execute(stmt)
            return result.scalars().first()

        collaborator = WorkCollaborator(
            work_id=work_id,
            user_id=user_id,
            permission=permission,
            role=role,
            invited_by=invited_by
        )

        self.db.add(collaborator)
        await self.db.commit()
        await self.db.refresh(collaborator)
        
        # 重新加载以获取 user 信息
        stmt = select(WorkCollaborator).options(
            selectinload(WorkCollaborator.user)
        ).where(WorkCollaborator.id == collaborator.id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def update_collaborator(self, work_id: str, user_id: str, **kwargs) -> Optional[WorkCollaborator]:
        """更新协作者"""
        stmt = select(WorkCollaborator).options(
            selectinload(WorkCollaborator.user)
        ).where(
            and_(
                WorkCollaborator.work_id == work_id,
                WorkCollaborator.user_id == user_id
            )
        )

        result = await self.db.execute(stmt)
        collaborator = result.scalars().first()

        if not collaborator:
            return None

        # 更新字段
        for key, value in kwargs.items():
            if hasattr(collaborator, key):
                setattr(collaborator, key, value)

        await self.db.commit()
        
        # 重新加载以获取 user 信息
        stmt = select(WorkCollaborator).options(
            selectinload(WorkCollaborator.user)
        ).where(WorkCollaborator.id == collaborator.id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def remove_collaborator(self, work_id: str, user_id: str) -> bool:
        """移除协作者（处理可能存在的重复记录）"""
        stmt = select(WorkCollaborator).where(
            and_(
                WorkCollaborator.work_id == work_id,
                WorkCollaborator.user_id == user_id
            )
        )

        result = await self.db.execute(stmt)
        collaborators = result.scalars().all()

        if not collaborators:
            return False

        for c in collaborators:
            await self.db.delete(c)
        await self.db.commit()

        return True

    # 权限检查
    async def can_access_work(self, user_id: str, work_id: str) -> bool:
        """检查用户是否可以访问作品"""
        work = await self.get_work_by_id(work_id)
        if not work:
            return False

        # 检查是否为所有者
        if work.owner_id == user_id:
            return True

        # 检查是否为协作者（使用已加载的 collaborators 关系）
        # get_work_by_id 已经使用 selectinload 加载了 collaborators
        for collaborator in work.collaborators:
            if collaborator.user_id == user_id:
                # pending 状态的用户没有直接访问权限（除非作品是公开的）
                if collaborator.permission == 'pending':
                    continue
                return True

        return work.is_public

    async def can_edit_work(self, user_id: str, work_id: str) -> bool:
        """检查用户是否可以编辑作品"""
        work = await self.get_work_by_id(work_id)
        if not work:
            return False

        # 检查是否为所有者
        if work.owner_id == user_id:
            return True

        # 检查协作者权限（使用已加载的 collaborators 关系）
        for collaborator in work.collaborators:
            if collaborator.user_id == user_id:
                if collaborator.permission in ["owner", "admin", "editor"]:
                    return True

        return False

    # 用户查询
    async def get_user_by_username_or_email(self, username_or_email: str) -> Optional[User]:
        """根据用户名或邮箱获取用户"""
        stmt = select(User).where(
            or_(
                User.username == username_or_email,
                User.email == username_or_email
            )
        )

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_audit_log(
        self,
        user_id: str,
        action: str,
        target_type: str,
        target_id: Any,
        details: Dict[str, Any],
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """创建审计日志（target_id 存 VARCHAR，统一转 str）"""
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )

        self.db.add(audit_log)
        await self.db.commit()