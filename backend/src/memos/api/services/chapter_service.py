"""
章节服务
"""

from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, desc, asc, func
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.future import select

from memos.api.models.chapter import Chapter, ChapterVersion, ChapterYjsSnapshot
from memos.api.models.work import Work, WorkCollaborator
from memos.api.models.system import AuditLog


class ChapterService:
    """章节业务逻辑服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_max_chapter_number(
        self,
        work_id: str,
        volume_number: Optional[int] = None,
        include_deleted: bool = False
    ) -> int:
        """获取指定作品（或卷）的最大章节号"""
        conditions = [Chapter.work_id == work_id]
        if volume_number is not None:
            conditions.append(Chapter.volume_number == volume_number)
        if not include_deleted:
            conditions.append(Chapter.status != "deleted")
        stmt = select(func.max(Chapter.chapter_number)).where(and_(*conditions))
        result = await self.db.execute(stmt)
        max_number = result.scalar()
        return max_number if max_number is not None else 0

    async def create_chapter(self, **kwargs) -> Chapter:
        """创建章节"""
        # 过滤掉 Chapter 模型不支持的字段（如 content，内容存储在 ShareDB 中）
        chapter_fields = {
            'work_id', 'title', 'chapter_number', 'volume_number', 'volume_id', 'status',
            'word_count', 'estimated_reading_time', 'content_hash', 'tags',
            'summary', 'notes', 'chapter_metadata', 'sort_order'
        }
        filtered_kwargs = {k: v for k, v in kwargs.items() if k in chapter_fields}
        
        chapter = Chapter(**filtered_kwargs)

        self.db.add(chapter)
        await self.db.commit()
        await self.db.refresh(chapter)

        return chapter

    async def get_chapter_by_id(self, chapter_id: int) -> Optional[Chapter]:
        """根据ID获取章节"""
        stmt = select(Chapter).options(
            selectinload(Chapter.versions)
        ).where(Chapter.id == chapter_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_chapters(
        self,
        filters: Dict[str, Any] = None,
        page: int = 1,
        size: int = 20,
        sort_by: str = "chapter_number",
        sort_order: str = "asc"
    ) -> Tuple[List[Chapter], int]:
        """获取章节列表"""
        filters = filters or {}

        # 构建查询条件
        conditions = []

        if "work_id" in filters:
            conditions.append(Chapter.work_id == filters["work_id"])
        if "status" in filters:
            conditions.append(Chapter.status == filters["status"])
        elif not filters.get("include_deleted", False):
            conditions.append(Chapter.status != "deleted")
        if "chapter_number_lt" in filters:
            conditions.append(Chapter.chapter_number < filters["chapter_number_lt"])
        if "chapter_number_lte" in filters:
            conditions.append(Chapter.chapter_number <= filters["chapter_number_lte"])

        # 获取总数
        count_stmt = select(func.count(Chapter.id)).where(and_(*conditions))
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar()

        # 获取章节列表
        stmt = select(Chapter).where(and_(*conditions))

        # 排序
        sort_column = getattr(Chapter, sort_by, Chapter.chapter_number)
        if sort_order == "desc":
            stmt = stmt.order_by(desc(sort_column))
        else:
            stmt = stmt.order_by(asc(sort_column))

        # 分页
        stmt = stmt.offset((page - 1) * size).limit(size)

        result = await self.db.execute(stmt)
        chapters = result.scalars().all()

        return list(chapters), total

    async def update_chapter(self, chapter_id: int, **kwargs) -> Chapter:
        """更新章节"""
        stmt = select(Chapter).where(Chapter.id == chapter_id)
        result = await self.db.execute(stmt)
        chapter = result.scalar_one_or_none()

        if not chapter:
            raise ValueError("章节不存在")

        # 更新字段（含 chapter_metadata 时显式标记以持久化空大纲/细纲）
        for key, value in kwargs.items():
            if hasattr(chapter, key):
                setattr(chapter, key, value)
                if key == "chapter_metadata":
                    flag_modified(chapter, "chapter_metadata")

        await self.db.commit()
        await self.db.refresh(chapter)

        return chapter

    async def delete_chapter(self, chapter_id: int) -> bool:
        """硬删除章节（物理删除，慎用）"""
        stmt = select(Chapter).where(Chapter.id == chapter_id)
        result = await self.db.execute(stmt)
        chapter = result.scalar_one_or_none()
        if not chapter:
            return False
        await self.db.delete(chapter)
        await self.db.commit()
        return True

    async def soft_delete_chapter(self, chapter_id: int) -> bool:
        """软删除章节：仅标记 status=deleted，不删 ShareDB 内容，可恢复"""
        stmt = select(Chapter).where(Chapter.id == chapter_id)
        result = await self.db.execute(stmt)
        chapter = result.scalar_one_or_none()
        if not chapter:
            return False
        chapter.status = "deleted"
        await self.db.commit()
        await self.db.refresh(chapter)
        return True

    async def restore_chapter(self, chapter_id: int) -> bool:
        """恢复已软删除的章节"""
        stmt = select(Chapter).where(Chapter.id == chapter_id)
        result = await self.db.execute(stmt)
        chapter = result.scalar_one_or_none()
        if not chapter:
            return False
        if chapter.status != "deleted":
            return True
        chapter.status = "draft"
        await self.db.commit()
        await self.db.refresh(chapter)
        return True

    async def create_chapter_version(self, **kwargs) -> ChapterVersion:
        """创建章节版本"""
        # 自动计算版本号
        chapter_id = kwargs.get('chapter_id')
        if chapter_id and 'version_number' not in kwargs:
            stmt = select(func.max(ChapterVersion.version_number)).where(
                ChapterVersion.chapter_id == chapter_id
            )
            result = await self.db.execute(stmt)
            max_version = result.scalar()
            kwargs['version_number'] = (max_version or 0) + 1

        version = ChapterVersion(**kwargs)

        self.db.add(version)
        await self.db.commit()
        await self.db.refresh(version)

        return version

    async def get_chapter_versions(
        self,
        chapter_id: int,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[ChapterVersion], int]:
        """获取章节版本列表"""
        # 获取总数
        count_stmt = select(func.count(ChapterVersion.id)).where(
            ChapterVersion.chapter_id == chapter_id
        )
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar()

        # 获取版本列表
        stmt = select(ChapterVersion).where(
            ChapterVersion.chapter_id == chapter_id
        ).order_by(desc(ChapterVersion.version_number))

        # 分页
        stmt = stmt.offset((page - 1) * size).limit(size)

        result = await self.db.execute(stmt)
        versions = result.scalars().all()

        return list(versions), total

    async def get_chapter_version(self, chapter_id: int, version_id: int) -> Optional[ChapterVersion]:
        """获取单个章节版本详情"""
        stmt = select(ChapterVersion).where(
            ChapterVersion.id == version_id,
            ChapterVersion.chapter_id == chapter_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    # 权限检查方法
    async def can_access_work(self, user_id: str, work_id: str) -> bool:
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
        collaborator_stmt = select(WorkCollaborator).where(
            and_(
                WorkCollaborator.work_id == work_id,
                WorkCollaborator.user_id == user_id
            )
        )
        collaborator_result = await self.db.execute(collaborator_stmt)
        collaborator = collaborator_result.scalar_one_or_none()

        return collaborator is not None or work.is_public

    async def can_edit_work(self, user_id: str, work_id: str) -> bool:
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

    async def create_yjs_snapshot(self, chapter_id: int, snapshot: bytes, label: Optional[str] = None) -> ChapterYjsSnapshot:
        """创建章节 Yjs 快照（存 Y.encodeStateAsUpdate 的二进制）"""
        row = ChapterYjsSnapshot(chapter_id=chapter_id, snapshot=snapshot, label=label)
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def list_yjs_snapshots(
        self, chapter_id: int, page: int = 1, size: int = 50
    ) -> Tuple[List[ChapterYjsSnapshot], int]:
        """列出章节的 Yjs 快照（仅元数据，不含二进制）"""
        conditions = [ChapterYjsSnapshot.chapter_id == chapter_id]
        count_stmt = select(func.count(ChapterYjsSnapshot.id)).where(and_(*conditions))
        total = (await self.db.execute(count_stmt)).scalar() or 0
        stmt = (
            select(ChapterYjsSnapshot)
            .where(and_(*conditions))
            .order_by(ChapterYjsSnapshot.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        rows = result.scalars().all()
        return list(rows), total

    async def get_yjs_snapshot(self, chapter_id: int, snapshot_id: int) -> Optional[ChapterYjsSnapshot]:
        """获取单个 Yjs 快照（含二进制，用于恢复）"""
        stmt = select(ChapterYjsSnapshot).where(
            ChapterYjsSnapshot.id == snapshot_id,
            ChapterYjsSnapshot.chapter_id == chapter_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()