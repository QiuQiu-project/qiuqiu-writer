"""
世界观模型
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from memos.api.core.database import Base


class Faction(Base):
    """阵营/组织表"""

    __tablename__ = "factions"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(100))
    description = Column(Text)
    logo_url = Column(String(255))
    type = Column(String(50))  # organization/political/religious/magical/etc.
    scale = Column(String(30))  # global/regional/local/family
    power_level = Column(Integer, default=0)  # 实力等级
    headquarters = Column(String(200))
    ideology = Column(Text)  # 理念/宗旨
    structure = Column(JSON, default=dict)  # 组织结构
    relationships = Column(JSON, default=dict)  # 派系关系
    tags = Column(JSON, default=list)
    character_metadata = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    work = relationship("Work", back_populates="factions")

    def __repr__(self):
        return f"<Faction(id={self.id}, name='{self.name}', work_id={self.work_id})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "work_id": self.work_id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "logo_url": self.logo_url,
            "type": self.type,
            "scale": self.scale,
            "power_level": self.power_level,
            "headquarters": self.headquarters,
            "ideology": self.ideology,
            "structure": self.structure or {},
            "relationships": self.relationships or {},
            "tags": self.tags or [],
            "metadata": self.character_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# 索引
Index("idx_factions_work", Faction.work_id)