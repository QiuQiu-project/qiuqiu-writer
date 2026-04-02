"""
Prompt 生成结果评分模型
"""

from typing import Dict, Any

from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from memos.api.core.database import Base


class PromptRating(Base):
    """用户对 AI 生成结果的评分记录"""

    __tablename__ = "prompt_ratings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(40), nullable=True, index=True)                  # 登录用户 ID（可空）
    session_id = Column(String(100), nullable=True)                          # 匿名用户 session（前端 localStorage）
    prompt_template_id = Column(Integer, ForeignKey("prompt_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    experiment_id = Column(Integer, ForeignKey("prompt_experiments.id", ondelete="SET NULL"), nullable=True, index=True)
    variant_id = Column(Integer, ForeignKey("prompt_experiment_variants.id", ondelete="SET NULL"), nullable=True)
    rating = Column(Integer, nullable=False)                                  # 1-5 分
    comment = Column(Text, nullable=True)                                     # 可选文字评论
    context = Column(JSONB, default=dict)                                     # {work_id, chapter_id, generation_type, content_preview}
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "prompt_template_id": self.prompt_template_id,
            "experiment_id": self.experiment_id,
            "variant_id": self.variant_id,
            "rating": self.rating,
            "comment": self.comment,
            "context": self.context or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


Index("idx_ratings_template", PromptRating.prompt_template_id)
Index("idx_ratings_experiment", PromptRating.experiment_id)
Index("idx_ratings_user", PromptRating.user_id)
Index("idx_ratings_created", PromptRating.created_at)
