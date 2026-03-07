"""
作品模型
"""

from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text,
    Index, ForeignKey, and_, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, foreign
from sqlalchemy.sql import func

from memos.api.core.database import Base


class Work(Base):
    """作品表"""

    __tablename__ = "works"

    id = Column(String(40), primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    subtitle = Column(String(300))
    description = Column(Text)
    work_type = Column(String(20), nullable=False, index=True)  # novel/script/short_story/film_script
    status = Column(String(20), default="draft", index=True)  # draft/published/archived
    cover_image_url = Column(String(255))
    tags = Column(JSONB, default=list)
    category = Column(String(50), index=True)
    genre = Column(String(50), index=True)
    target_audience = Column(String(50))
    language = Column(String(10), default="zh-CN")
    word_count = Column(Integer, default=0)
    chapter_count = Column(Integer, default=0)
    reading_time = Column(Integer, default=0)  # 预估阅读时间（分钟）
    owner_id = Column(String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    collaborator_count = Column(Integer, default=0)
    is_public = Column(Boolean, default=False, index=True)
    is_collaborative = Column(Boolean, default=False)
    settings = Column(JSONB, default=dict)  # 作品设置
    work_metadata = Column("metadata", JSONB, default=dict)  # 扩展元数据
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True))

    # 关系
    owner = relationship("User", back_populates="works")
    collaborators = relationship("WorkCollaborator", back_populates="work", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="work", cascade="all, delete-orphan")
    # 使用字符串引用避免初始化顺序问题
    volumes = relationship("Volume", back_populates="work", cascade="all, delete-orphan")
    # 注意：characters和locations现在保存在work_metadata中，不再使用单独的Character表
    # characters = relationship("Character", back_populates="work", cascade="all, delete-orphan")
    factions = relationship("Faction", back_populates="work", cascade="all, delete-orphan")
    extended_info = relationship("WorkInfoExtended", back_populates="work", cascade="all, delete-orphan")
    # AIAnalysis使用多态关联（target_type + target_id），使用延迟导入避免循环依赖
    ai_analyses = relationship(
        "AIAnalysis",
        primaryjoin=lambda: _get_work_ai_analyses_join(),
        viewonly=True,
        lazy="dynamic"
    )

    def __repr__(self):
        return f"<Work(id={self.id}, title='{self.title}', type='{self.work_type}')>"

    @property
    def is_draft(self) -> bool:
        """是否为草稿"""
        return self.status == "draft"

    @property
    def is_published(self) -> bool:
        """是否已发布"""
        return self.status == "published"

    @property
    def is_archived(self) -> bool:
        """是否已归档"""
        return self.status == "archived"

    @property
    def estimated_reading_hours(self) -> float:
        """预估阅读小时数"""
        return self.reading_time / 60 if self.reading_time else 0

    @property
    def works_list_tags(self) -> list:
        """作品列表标签"""
        tags = self.tags or []
        if self.genre:
            tags.append(self.genre)
        if self.category:
            tags.append(self.category)
        return tags

    def to_dict(self, include_content: bool = False, include_collaborators: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "title": self.title,
            "subtitle": self.subtitle,
            "description": self.description,
            "work_type": self.work_type,
            "status": self.status,
            "cover_image_url": self.cover_image_url,
            "tags": self.tags or [],
            "category": self.category,
            "genre": self.genre,
            "target_audience": self.target_audience,
            "language": self.language,
            "word_count": self.word_count,
            "chapter_count": self.chapter_count,
            "reading_time": self.reading_time,
            "collaborator_count": self.collaborator_count,
            "is_public": self.is_public,
            "is_collaborative": self.is_collaborative,
            "settings": self.settings or {},
            "metadata": self.work_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "owner_id": self.owner_id,
        }

        if include_collaborators:
            data["collaborators"] = [
                {
                    "user_id": collab.user_id,
                    "permission": collab.permission,
                    "role": collab.role,
                    "joined_at": collab.joined_at.isoformat() if collab.joined_at else None,
                }
                for collab in self.collaborators
            ]

        return data


class WorkCollaborator(Base):
    """作品协作者表"""

    __tablename__ = "work_collaborators"
    __table_args__ = (
        UniqueConstraint("work_id", "user_id", name="uq_work_collaborator"),
    )

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(String(40), ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(40), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission = Column(String(20), nullable=False)  # owner/editor/reader
    role = Column(String(50))  # writer/editor/beta_reader/etc.
    invited_by = Column(String(40), ForeignKey("users.id"))
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    work = relationship("Work", back_populates="collaborators")
    user = relationship("User", back_populates="work_collaborations", foreign_keys=[user_id])
    inviter = relationship("User", foreign_keys=[invited_by])

    def __repr__(self):
        return f"<WorkCollaborator(id={self.id}, work_id={self.work_id}, user_id={self.user_id}, permission='{self.permission}')>"

    @property
    def is_owner(self) -> bool:
        """是否为所有者"""
        return self.permission == "owner"

    @property
    def can_edit(self) -> bool:
        """是否可以编辑"""
        return self.permission in ["owner", "admin", "editor"]

    @property
    def can_read(self) -> bool:
        """是否可以阅读"""
        return self.permission in ["owner", "admin", "editor", "reader"]

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "work_id": self.work_id,
            "user_id": self.user_id,
            "permission": self.permission,
            "role": self.role,
            "invited_by": self.invited_by,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if self.user:
            data["username"] = self.user.username
            data["display_name"] = self.user.display_name
            data["avatar_url"] = self.user.avatar_url
        return data


# 索引
Index("idx_works_owner", Work.owner_id)
Index("idx_works_type", Work.work_type)
Index("idx_works_status", Work.status)
Index("idx_works_category", Work.category)
Index("idx_works_genre", Work.genre)
Index("idx_works_public", Work.is_public)
Index("idx_works_tags", Work.tags, postgresql_using="gin")

Index("idx_work_collaborators_work", WorkCollaborator.work_id)
Index("idx_work_collaborators_user", WorkCollaborator.user_id)
Index("idx_work_collaborators_permission", WorkCollaborator.permission)

# 复合索引
Index("idx_works_owner_status", Work.owner_id, Work.status)
Index("idx_works_type_status", Work.work_type, Work.status)
Index("idx_work_collaborators_work_permission", WorkCollaborator.work_id, WorkCollaborator.permission)


# 延迟导入 AIAnalysis 以避免循环导入
def _get_work_ai_analyses_join():
    """获取 Work 和 AIAnalysis 之间的连接条件"""
    from memos.api.models.writing import AIAnalysis
    return and_(
        foreign(AIAnalysis.target_id) == Work.id,
        AIAnalysis.target_type == 'work'
    )