"""
Prompt 灰度实验模型
"""

from datetime import datetime
from typing import Dict, Any

from sqlalchemy import Column, Integer, String, DateTime, Text, Float, Boolean, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from memos.api.core.database import Base


class PromptExperiment(Base):
    """Prompt A/B 实验表"""

    __tablename__ = "prompt_experiments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)                           # 实验名称
    description = Column(Text, nullable=True)                           # 实验描述
    template_type = Column(String(100), nullable=False, index=True)     # 关联的 template_type
    status = Column(String(20), default="draft", index=True)            # draft/running/paused/completed
    traffic_percent = Column(Integer, default=100)                      # 参与实验的用户比例(0-100)
    created_by = Column(String(40), nullable=True)                      # admin id
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关联变体
    variants = relationship("PromptExperimentVariant", back_populates="experiment", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "template_type": self.template_type,
            "status": self.status,
            "traffic_percent": self.traffic_percent,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PromptExperimentVariant(Base):
    """实验变体表（每个实验可有多个变体，各占不同流量比例）"""

    __tablename__ = "prompt_experiment_variants"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("prompt_experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt_template_id = Column(Integer, ForeignKey("prompt_templates.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(50), nullable=False, default="实验组")        # 对照组 / 实验组A / 实验组B
    traffic_ratio = Column(Float, nullable=False, default=0.5)          # 0.0-1.0，组内所有变体之和=1.0
    is_control = Column(Boolean, default=False)                         # 是否为对照组
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关联
    experiment = relationship("PromptExperiment", back_populates="variants")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "experiment_id": self.experiment_id,
            "prompt_template_id": self.prompt_template_id,
            "label": self.label,
            "traffic_ratio": self.traffic_ratio,
            "is_control": self.is_control,
        }


Index("idx_exp_variants_experiment", PromptExperimentVariant.experiment_id)
Index("idx_exp_status_type", PromptExperiment.status, PromptExperiment.template_type)
