"""
地点/地图模型
用于存储作品中的地点和地图信息
"""

from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from memos.api.core.database import Base


class Location(Base):
    """地点表"""

    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(100))
    description = Column(Text)
    location_type = Column(String(50))  # city/forest/mountain/castle/village等
    coordinates = Column(JSON, default=dict)  # 坐标信息，如{"x": 100, "y": 200}
    image_url = Column(String(255))
    parent_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)  # 父地点（用于层级结构）
    tags = Column(JSON, default=list)
    location_metadata = Column("metadata", JSON, default=dict)  # 扩展元数据，如气候、人口、历史等
    is_important = Column(Boolean, default=False, index=True)  # 是否为重要地点
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    work = relationship("Work", back_populates="locations")
    parent_location = relationship("Location", remote_side=[id], backref="child_locations")

    def __repr__(self):
        return f"<Location(id={self.id}, name='{self.name}', work_id={self.work_id})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "work_id": self.work_id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "location_type": self.location_type,
            "coordinates": self.coordinates or {},
            "image_url": self.image_url,
            "parent_location_id": self.parent_location_id,
            "tags": self.tags or [],
            "metadata": self.location_metadata or {},
            "is_important": self.is_important,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# 索引
Index("idx_locations_work", Location.work_id)
Index("idx_locations_important", Location.is_important)
Index("idx_locations_type", Location.location_type)

