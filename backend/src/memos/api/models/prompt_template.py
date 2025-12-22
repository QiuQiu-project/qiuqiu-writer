"""
Prompt模板模型
用于存储拆书功能和其他AI功能的提示词模板
"""

import json
import re
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
    
    # 组件相关字段（用于组件级别的prompt）
    component_id = Column(String(100), nullable=True, index=True)  # 组件ID（如：char-cards, cp-relations等）
    component_type = Column(String(50), nullable=True, index=True)  # 组件类型（如：character-card, relation-graph等）
    prompt_category = Column(String(20), nullable=True, index=True)  # prompt类别：generate（生成）或validate（验证）
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的作品ID（如果prompt是作品级别的）
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")
    work = relationship("Work", foreign_keys=[work_id])

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
            "component_id": self.component_id,
            "component_type": self.component_type,
            "prompt_category": self.prompt_category,
            "work_id": self.work_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def format_prompt(self, **kwargs) -> str:
        """格式化提示词，替换变量
        支持 @ 符号格式：@chapter.content、@work.title 等
        支持嵌套访问：@chapter.meta.outline、@work.meta.characters 等
        支持旧格式兼容：{variable_name}、{作品.xxx} 等（向后兼容）
        """
        content = self.prompt_content
        
        # 首先处理新的 @ 符号格式
        # 匹配 @对象.键.子键... 格式（如 @chapter.content、@work.meta.characters）
        at_pattern = r'@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)'
        
        def replace_at_var(match):
            var_path = match.group(1)  # 如 "chapter.content" 或 "work.meta.characters"
            parts = var_path.split('.')
            
            # 从 kwargs 中获取数据
            # 支持特殊对象：chapter, work
            current_value = None
            
            # 处理特殊对象映射
            if parts[0] == 'chapter':
                # @chapter.xxx 格式
                chapter_data = kwargs.get('chapter') or kwargs.get('章节')
                if chapter_data is None:
                    # 尝试从 context 中获取
                    if 'current_chapter' in kwargs:
                        chapter_data = kwargs['current_chapter']
                    elif 'context' in kwargs and hasattr(kwargs['context'], 'current_chapter'):
                        chapter_data = kwargs['context'].current_chapter
                
                if chapter_data:
                    if len(parts) == 1:
                        # @chapter 本身，返回整个对象（JSON格式）
                        return json.dumps(chapter_data.to_dict() if hasattr(chapter_data, 'to_dict') else chapter_data, ensure_ascii=False, indent=2)
                    elif len(parts) == 2:
                        # @chapter.content 或 @chapter.title
                        key = parts[1]
                        if key == 'content':
                            # 从 ShareDB 获取内容（如果提供了 sharedb_service）
                            # 注意：这里不能直接调用异步方法，需要从 kwargs 中获取已准备好的内容
                            # 优先使用 kwargs 中提供的 content
                            if 'content' in kwargs:
                                return str(kwargs['content']) if kwargs['content'] else ''
                            if '章节内容' in kwargs:
                                return str(kwargs['章节内容']) if kwargs['章节内容'] else ''
                            # 如果都没有，尝试从 chapter_data 获取
                            return getattr(chapter_data, 'content', '') or ''
                        elif key == 'title':
                            return getattr(chapter_data, 'title', '') or ''
                        elif key == 'meta':
                            # @chapter.meta 返回整个元信息对象
                            metadata = getattr(chapter_data, 'chapter_metadata', None) or {}
                            return json.dumps(metadata, ensure_ascii=False, indent=2)
                        else:
                            # 其他属性
                            return str(getattr(chapter_data, key, ''))
                    elif len(parts) >= 3 and parts[1] == 'meta':
                        # @chapter.meta.outline 格式
                        metadata = getattr(chapter_data, 'chapter_metadata', None) or {}
                        # 从 metadata 中获取嵌套的键
                        current_value = metadata
                        for key in parts[2:]:
                            if isinstance(current_value, dict):
                                current_value = current_value.get(key)
                            else:
                                return ''
                    else:
                        return ''
            
            elif parts[0] == 'work':
                # @work.xxx 格式
                work_data = kwargs.get('work') or kwargs.get('作品')
                if work_data is None:
                    if 'work' in kwargs:
                        work_data = kwargs['work']
                    elif 'context' in kwargs and hasattr(kwargs['context'], 'work'):
                        work_data = kwargs['context'].work
                
                if work_data:
                    if len(parts) == 1:
                        # @work 本身
                        return json.dumps(work_data.to_dict() if hasattr(work_data, 'to_dict') else work_data, ensure_ascii=False, indent=2)
                    elif len(parts) == 2:
                        # @work.title 等
                        key = parts[1]
                        if key == 'title':
                            return getattr(work_data, 'title', '') or ''
                        elif key == 'meta':
                            # @work.meta 返回整个元信息对象
                            metadata = getattr(work_data, 'work_metadata', None) or {}
                            return json.dumps(metadata, ensure_ascii=False, indent=2)
                        else:
                            return str(getattr(work_data, key, ''))
                    elif len(parts) >= 3 and parts[1] == 'meta':
                        # @work.meta.characters 格式
                        metadata = getattr(work_data, 'work_metadata', None) or {}
                        # 从 metadata 中获取嵌套的键
                        current_value = metadata
                        for key in parts[2:]:
                            if isinstance(current_value, dict):
                                current_value = current_value.get(key)
                            else:
                                return ''
                    else:
                        return ''
            
            else:
                # 其他对象，从 kwargs 中直接获取
                current_value = kwargs.get(parts[0])
                for key in parts[1:]:
                    if isinstance(current_value, dict):
                        current_value = current_value.get(key)
                    elif hasattr(current_value, key):
                        current_value = getattr(current_value, key)
                    else:
                        return ''
            
            # 处理获取到的值
            if current_value is None:
                return ''
            if isinstance(current_value, (dict, list)):
                return json.dumps(current_value, ensure_ascii=False, indent=2)
            return str(current_value)
        
        # 替换所有 @ 格式的变量
        content = re.sub(at_pattern, replace_at_var, content)
        
        # 向后兼容：处理旧的 {变量名} 格式
        old_pattern = r'\{([^}]+)\}'
        
        def replace_old_var(match):
            var_expr = match.group(1)
            
            # 处理 {对象.键} 格式（如 {作品.xxx}、{章节.xxx}）
            if '.' in var_expr:
                parts = var_expr.split('.', 1)
                obj_name = parts[0]
                key = parts[1]
                
                # 从kwargs中获取对象数据
                obj_data = kwargs.get(obj_name)
                if isinstance(obj_data, dict):
                    value = obj_data.get(key, '')
                    if value is None:
                        return ''
                    # 如果是复杂对象（字典或列表），格式化为JSON字符串
                    if isinstance(value, (dict, list)):
                        return json.dumps(value, ensure_ascii=False, indent=2)
                    return str(value)
                return ''
            
            # 处理普通变量（包括中文）
            if var_expr in kwargs:
                value = kwargs[var_expr]
                return str(value) if value is not None else ''
            
            # 如果变量不存在，返回空字符串（而不是保留原变量）
            return ''
        
        # 替换所有旧的 {变量} 格式（向后兼容）
        content = re.sub(old_pattern, replace_old_var, content)
        
        return content


# 索引
Index("idx_prompt_templates_type", PromptTemplate.template_type)
Index("idx_prompt_templates_default", PromptTemplate.is_default)
Index("idx_prompt_templates_active", PromptTemplate.is_active)
Index("idx_prompt_templates_component", PromptTemplate.component_id, PromptTemplate.component_type)
Index("idx_prompt_templates_work_component", PromptTemplate.work_id, PromptTemplate.component_id, PromptTemplate.prompt_category)

