"""
作品模板模型
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


class WorkTemplate(Base):
    """作品信息模板表"""

    __tablename__ = "work_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    work_type = Column(String(20), nullable=False, index=True)
    is_system = Column(Boolean, default=False, index=True)  # 系统模板 vs 用户模板
    is_public = Column(Boolean, default=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), index=True)
    category = Column(String(50), index=True)
    tags = Column(JSON, default=list)
    template_config = Column(JSON, nullable=False)  # 模板配置信息
    settings = Column(JSON, default=dict)  # 模板设置（如默认值、验证规则等）
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")
    fields = relationship("TemplateField", back_populates="template", cascade="all, delete-orphan")
    work_info_extended = relationship("WorkInfoExtended", back_populates="template")

    def __repr__(self):
        return f"<WorkTemplate(id={self.id}, name='{self.name}', type='{self.work_type}')>"

    @property
    def is_user_template(self) -> bool:
        """是否为用户模板"""
        return not self.is_system

    @property
    def field_count(self) -> int:
        """字段数量"""
        return len(self.fields) if self.fields else 0

    def to_dict(self, include_fields: bool = False, include_stats: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "work_type": self.work_type,
            "is_system": self.is_system,
            "is_public": self.is_public,
            "creator_id": self.creator_id,
            "category": self.category,
            "tags": self.tags or [],
            "template_config": self.template_config or {},
            "settings": self.settings or {},
            "usage_count": self.usage_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_fields:
            # 安全地访问 fields，避免在异步上下文中触发懒加载
            try:
                # 检查 fields 是否已加载
                if hasattr(self, '_sa_instance_state'):
                    state = self._sa_instance_state
                    fields_attr = state.attrs.get('fields')
                    if fields_attr and fields_attr.loaded_value is not None:
                        fields = fields_attr.loaded_value
                    else:
                        # 如果未加载，返回空列表（避免触发懒加载）
                        fields = []
                else:
                    fields = getattr(self, 'fields', []) or []
            except Exception:
                # 如果访问失败，返回空列表
                fields = []
            
            data["fields"] = [
                {
                    "id": field.id,
                    "field_name": field.field_name,
                    "field_type": field.field_type,
                    "field_label": field.field_label,
                    "field_description": field.field_description,
                    "field_options": field.field_options or {},
                    "is_required": field.is_required,
                    "default_value": field.default_value,
                    "sort_order": field.sort_order,
                }
                for field in fields
            ]

        if include_stats:
            data["field_count"] = self.field_count

        return data


class TemplateField(Base):
    """模板字段表"""

    __tablename__ = "template_fields"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("work_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)
    field_type = Column(String(50), nullable=False)  # text/textarea/select/checkbox/date/number
    field_label = Column(String(100), nullable=False)
    field_description = Column(Text)
    field_options = Column(JSON)  # 选择题选项、验证规则等
    is_required = Column(Boolean, default=False)
    default_value = Column(Text)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    template = relationship("WorkTemplate", back_populates="fields")

    def __repr__(self):
        return f"<TemplateField(id={self.id}, template_id={self.template_id}, name='{self.field_name}', type='{self.field_type}')>"

    @property
    def is_select_field(self) -> bool:
        """是否为选择字段"""
        return self.field_type in ["select", "checkbox", "radio"]

    @property
    def is_text_field(self) -> bool:
        """是否为文本字段"""
        return self.field_type in ["text", "textarea"]

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "template_id": self.template_id,
            "field_name": self.field_name,
            "field_type": self.field_type,
            "field_label": self.field_label,
            "field_description": self.field_description,
            "field_options": self.field_options or {},
            "is_required": self.is_required,
            "default_value": self.default_value,
            "sort_order": self.sort_order,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class WorkInfoExtended(Base):
    """作品信息扩展表"""

    __tablename__ = "work_info_extended"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    template_id = Column(Integer, ForeignKey("work_templates.id"), index=True)
    field_values = Column(JSON, default=dict)  # 存储模板字段的具体值
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    work = relationship("Work", back_populates="extended_info")
    template = relationship("WorkTemplate", back_populates="work_info_extended")

    def __repr__(self):
        return f"<WorkInfoExtended(id={self.id}, work_id={self.work_id}, template_id={self.template_id})>"

    @property
    def filled_fields_count(self) -> int:
        """已填写字段数量"""
        if not self.field_values:
            return 0
        return len([k for k, v in self.field_values.items() if v is not None and str(v).strip()])

    def to_dict(self, include_template_info: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "work_id": self.work_id,
            "template_id": self.template_id,
            "field_values": self.field_values or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "filled_fields_count": self.filled_fields_count,
        }

        if include_template_info and self.template:
            data["template"] = self.template.to_dict(include_fields=True)

        return data




# 索引
Index("idx_work_templates_type", WorkTemplate.work_type)
Index("idx_work_templates_creator", WorkTemplate.creator_id)
Index("idx_work_templates_public", WorkTemplate.is_public)
Index("idx_work_templates_system", WorkTemplate.is_system)

Index("idx_template_fields_template", TemplateField.template_id)
Index("idx_template_fields_name", TemplateField.field_name)
Index("idx_template_fields_type", TemplateField.field_type)

Index("idx_work_info_extended_work", WorkInfoExtended.work_id)
Index("idx_work_info_extended_template", WorkInfoExtended.template_id)

Index("idx_work_templates_type_public", WorkTemplate.work_type, WorkTemplate.is_public)