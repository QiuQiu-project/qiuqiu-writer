"""
卷模型
"""

from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import (
    Column, Integer, String, DateTime, Text, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from memos.api.core.database import Base


class Volume(Base):
    """卷表"""

    __tablename__ = "volumes"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    volume_number = Column(Integer, nullable=False)
    outline = Column(Text)  # 卷大纲
    detail_outline = Column(Text)  # 卷细纲
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    work = relationship("Work", back_populates="volumes")
    chapters = relationship("Chapter", back_populates="volume", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('work_id', 'volume_number', name='uix_work_volume_number'),
    )

    def __repr__(self):
        return f"<Volume(id={self.id}, work_id={self.work_id}, title='{self.title}', number={self.volume_number})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "work_id": self.work_id,
            "title": self.title,
            "volume_number": self.volume_number,
            "outline": self.outline,
            "detail_outline": self.detail_outline,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
