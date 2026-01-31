"""
章节模型
"""

from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from memos.api.core.database import Base


class Chapter(Base):
    """章节表"""

    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    volume_id = Column(Integer, ForeignKey("volumes.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    chapter_number = Column(Integer, nullable=False)
    volume_number = Column(Integer, default=1, index=True)
    status = Column(String(20), default="draft", index=True)  # draft/published/archived
    word_count = Column(Integer, default=0)
    estimated_reading_time = Column(Integer, default=0)  # 预估阅读时间（分钟）
    content_hash = Column(String(32), index=True)  # 内容哈希，用于对比
    tags = Column(JSON, default=list)
    summary = Column(Text)  # 章节简介
    notes = Column(JSON, default=dict)  # 作者备注
    chapter_metadata = Column("metadata", JSON, default=dict)  # 扩展元数据
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    published_at = Column(DateTime(timezone=True))

    # 关系
    work = relationship("Work", back_populates="chapters")
    volume = relationship("Volume", back_populates="chapters")
    versions = relationship("ChapterVersion", back_populates="chapter", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Chapter(id={self.id}, work_id={self.work_id}, title='{self.title}', number={self.chapter_number})>"

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
        return self.estimated_reading_time / 60 if self.estimated_reading_time else 0

    @property
    def content_preview(self) -> str:
        """内容预览（前100字符）"""
        if not self.summary:
            return ""
        return self.summary[:100] + "..." if len(self.summary) > 100 else self.summary

    def to_dict(self, include_content: bool = False, include_versions: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "work_id": self.work_id,
            "title": self.title,
            "chapter_number": self.chapter_number,
            "volume_number": self.volume_number,
            "volume_id": self.volume_id,
            "status": self.status,
            "word_count": self.word_count,
            "estimated_reading_time": self.estimated_reading_time,
            "content_hash": self.content_hash,
            "tags": self.tags or [],
            "summary": self.summary,
            "notes": self.notes or {},
            "metadata": self.chapter_metadata or {},
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "content_preview": self.content_preview,
        }

        if include_versions:
            data["versions"] = [
                {
                    "id": version.id,
                    "version_number": version.version_number,
                    "title": version.title,
                    "word_count": version.word_count,
                    "change_description": version.change_description,
                    "created_by": version.created_by,
                    "created_at": version.created_at.isoformat() if version.created_at else None,
                }
                for version in self.versions
            ]

        return data


class ChapterVersion(Base):
    """章节版本表"""

    __tablename__ = "chapter_versions"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(Text)
    content_hash = Column(String(32), index=True)
    word_count = Column(Integer, default=0)
    change_description = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # 关系
    chapter = relationship("Chapter", back_populates="versions")
    created_by_user = relationship("User", back_populates="chapter_versions")

    def __repr__(self):
        return f"<ChapterVersion(id={self.id}, chapter_id={self.chapter_id}, version={self.version_number})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "chapter_id": self.chapter_id,
            "version_number": self.version_number,
            "title": self.title,
            "content": self.content,
            "content_hash": self.content_hash,
            "word_count": self.word_count,
            "change_description": self.change_description,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }




# 索引
Index("idx_chapters_work", Chapter.work_id)
Index("idx_chapters_volume", Chapter.volume_number)
Index("idx_chapters_status", Chapter.status)
Index("idx_chapters_number", Chapter.chapter_number)
Index("idx_chapters_content_hash", Chapter.content_hash)

Index("idx_chapter_versions_chapter", ChapterVersion.chapter_id)
Index("idx_chapter_versions_version", ChapterVersion.version_number)
Index("idx_chapter_versions_created_by", ChapterVersion.created_by)
Index("idx_chapter_versions_chapter_version", ChapterVersion.chapter_id, ChapterVersion.version_number)


# 复合索引
Index("idx_chapters_work_volume_number", Chapter.work_id, Chapter.volume_number, Chapter.chapter_number)
Index("idx_chapters_work_status", Chapter.work_id, Chapter.status)