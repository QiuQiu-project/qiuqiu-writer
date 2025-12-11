"""
Prompt模板模型
用于存储拆书功能和其他AI功能的提示词模板
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


class PromptTemplate(Base):
    """Prompt模板表"""

    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)  # 模板名称
    description = Column(Text)  # 模板描述
    template_type = Column(String(50), nullable=False, index=True)  # book_analysis/chapter_analysis/character_extraction等
    prompt_content = Column(Text, nullable=False)  # 提示词内容
    version = Column(String(20), default="1.0")  # 版本号
    is_default = Column(Boolean, default=False, index=True)  # 是否为默认模板
    is_active = Column(Boolean, default=True, index=True)  # 是否启用
    variables = Column(JSON, default=dict)  # 模板变量定义，如{"content": "章节内容", "settings": "分析设置"}
    template_metadata = Column("metadata", JSON, default=dict)  # 扩展元数据
    usage_count = Column(Integer, default=0)  # 使用次数
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")

    def __repr__(self):
        return f"<PromptTemplate(id={self.id}, name='{self.name}', type='{self.template_type}')>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "template_type": self.template_type,
            "prompt_content": self.prompt_content,
            "version": self.version,
            "is_default": self.is_default,
            "is_active": self.is_active,
            "variables": self.variables or {},
            "metadata": self.template_metadata or {},
            "usage_count": self.usage_count,
            "creator_id": self.creator_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def format_prompt(self, **kwargs) -> str:
        """格式化提示词，替换变量"""
        content = self.prompt_content
        # 简单的变量替换，支持 {variable_name} 格式
        for key, value in kwargs.items():
            content = content.replace(f"{{{key}}}", str(value))
        return content


# 索引
Index("idx_prompt_templates_type", PromptTemplate.template_type)
Index("idx_prompt_templates_default", PromptTemplate.is_default)
Index("idx_prompt_templates_active", PromptTemplate.is_active)

