"""
用户反馈模型
"""

from typing import Dict, Any

from sqlalchemy import Column, Integer, String, DateTime, Text, Index
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.sql import func

from memos.api.core.database import Base


class Feedback(Base):
    """用户反馈表"""

    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(40), nullable=True, index=True)          # 提交者ID（可匿名）
    type = Column(String(20), nullable=False, index=True)             # bug / suggestion / other
    title = Column(String(200), nullable=False)                       # 反馈标题
    description = Column(Text, nullable=False)                        # 详细描述
    status = Column(String(20), default="pending", index=True)        # pending/reviewing/resolved/closed
    context = Column(JSONB, default=dict)                             # 上下文：work_id, chapter_id, page_url
    ip_address = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)                          # 管理员备注
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Feedback(id={self.id}, type='{self.type}', status='{self.status}')>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "context": self.context or {},
            "ip_address": str(self.ip_address) if self.ip_address else None,
            "user_agent": self.user_agent,
            "admin_note": self.admin_note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


Index("idx_feedbacks_user", Feedback.user_id)
Index("idx_feedbacks_type", Feedback.type)
Index("idx_feedbacks_status", Feedback.status)
Index("idx_feedbacks_created", Feedback.created_at)
