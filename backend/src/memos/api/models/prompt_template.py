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
    prompt_category = Column(String(20), nullable=True, index=True)  # prompt类别：generate（生成）或validate（验证）或analysis（分析）
    data_key = Column(String(100), nullable=True, index=True)  # 数据存储键（用于在 component_data 中存储数据）
    work_id = Column(Integer, ForeignKey("works.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的作品ID（如果prompt是作品级别的，向后兼容）
    work_template_id = Column(Integer, ForeignKey("work_templates.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的模板ID（如果prompt是模板级别的）
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=True, index=True)  # 关联的章节ID（如果prompt是章节级别的）
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    creator = relationship("User")
    work = relationship("Work", foreign_keys=[work_id])
    chapter = relationship("Chapter", foreign_keys=[chapter_id])

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
            "data_key": self.data_key,
            "work_id": self.work_id,
            "work_template_id": self.work_template_id,
            "chapter_id": self.chapter_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def format_prompt(self, **kwargs) -> str:
        """格式化提示词，替换变量
        统一支持 @ 符号格式：
        - @chapter.content: 当前章节的内容
        - @chapter.metadata: 当前章节的metadata（JSON对象）
        - @chapter.metadata.xxx: 访问metadata中的键（如 @chapter.metadata.character）
        - @work.metadata: 当前作品的metadata（JSON对象）
        - @work.metadata.xxx: 访问metadata中的键
        """
        content = self.prompt_content
        
        # 匹配 @对象.键.子键... 格式（如 @chapter.content、@chapter.metadata.character）
        at_pattern = r'@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*)'
        
        def replace_at_var(match):
            var_path = match.group(1)  # 如 "chapter.content" 或 "chapter.metadata.character"
            parts = var_path.split('.')
            
            if len(parts) < 2:
                return ''
            
            # 处理 @chapter.xxx 格式
            if parts[0] == 'chapter':
                chapter_data = kwargs.get('chapter') or kwargs.get('章节')
                if chapter_data is None:
                    # 尝试从 context 中获取
                    if 'context' in kwargs and hasattr(kwargs['context'], 'current_chapter'):
                        chapter_data = kwargs['context'].current_chapter
                
                if not chapter_data:
                    return ''
                
                # @chapter.content
                if len(parts) == 2 and parts[1] == 'content':
                    # 优先使用 kwargs 中提供的 content
                    if 'content' in kwargs:
                        return str(kwargs['content']) if kwargs['content'] else ''
                    if '章节内容' in kwargs:
                        return str(kwargs['章节内容']) if kwargs['章节内容'] else ''
                    if 'chapter_content' in kwargs:
                        return str(kwargs['chapter_content']) if kwargs['chapter_content'] else ''
                    # 如果都没有，尝试从 chapter_data 获取（支持字典和对象）
                    if isinstance(chapter_data, dict):
                        return str(chapter_data.get('content', '')) or ''
                    return getattr(chapter_data, 'content', '') or ''
                
                # @chapter.metadata 或 @chapter.metadata.xxx
                elif parts[1] == 'metadata':
                    # 获取 metadata
                    if isinstance(chapter_data, dict):
                        metadata = chapter_data.get('chapter_metadata') or chapter_data.get('metadata') or {}
                    else:
                        metadata = getattr(chapter_data, 'chapter_metadata', None) or {}
                    
                    if not isinstance(metadata, dict):
                        metadata = {}
                    
                    # @chapter.metadata（返回整个metadata）
                    if len(parts) == 2:
                        return json.dumps(metadata, ensure_ascii=False, indent=2)
                    
                    # @chapter.metadata.xxx（访问metadata中的键）
                    current_value = metadata
                    for key in parts[2:]:
                        if isinstance(current_value, dict):
                            current_value = current_value.get(key)
                        else:
                            return ''
                    
                    # 处理获取到的值
                    if current_value is None:
                        return ''
                    if isinstance(current_value, (dict, list)):
                        return json.dumps(current_value, ensure_ascii=False, indent=2)
                    return str(current_value)
                
                # @chapter.其他属性（如 @chapter.title）
                elif len(parts) == 2:
                    key = parts[1]
                    if isinstance(chapter_data, dict):
                        value = chapter_data.get(key, '')
                    else:
                        value = getattr(chapter_data, key, '') or ''
                    return str(value) if value else ''
                
                return ''
            
            # 处理 @work.xxx 格式
            elif parts[0] == 'work':
                work_data = kwargs.get('work') or kwargs.get('作品')
                if work_data is None:
                    if 'context' in kwargs and hasattr(kwargs['context'], 'work'):
                        work_data = kwargs['context'].work
                
                if not work_data:
                    return ''
                
                # @work.metadata 或 @work.metadata.xxx
                if len(parts) >= 2 and parts[1] == 'metadata':
                    # 获取 metadata
                    if isinstance(work_data, dict):
                        metadata = work_data.get('work_metadata') or work_data.get('metadata') or {}
                    else:
                        metadata = getattr(work_data, 'work_metadata', None) or {}
                    
                    if not isinstance(metadata, dict):
                        metadata = {}
                    
                    # @work.metadata（返回整个metadata）
                    if len(parts) == 2:
                        return json.dumps(metadata, ensure_ascii=False, indent=2)
                    
                    # @work.metadata.xxx（访问metadata中的键）
                    current_value = metadata
                    for key in parts[2:]:
                        if isinstance(current_value, dict):
                            current_value = current_value.get(key)
                        else:
                            return ''
                    
                    # 处理获取到的值
                    if current_value is None:
                        return ''
                    if isinstance(current_value, (dict, list)):
                        return json.dumps(current_value, ensure_ascii=False, indent=2)
                    return str(current_value)
                
                # @work.其他属性（如 @work.title）
                elif len(parts) == 2:
                    key = parts[1]
                    if isinstance(work_data, dict):
                        value = work_data.get(key, '')
                    else:
                        value = getattr(work_data, key, '') or ''
                    return str(value) if value else ''
                
                return ''
            
            return ''
        
        # 替换所有 @ 格式的变量
        content = re.sub(at_pattern, replace_at_var, content)
        
        return content


# 索引
Index("idx_prompt_templates_type", PromptTemplate.template_type)
Index("idx_prompt_templates_default", PromptTemplate.is_default)
Index("idx_prompt_templates_active", PromptTemplate.is_active)
Index("idx_prompt_templates_component", PromptTemplate.component_id, PromptTemplate.component_type)
Index("idx_prompt_templates_work_component", PromptTemplate.work_id, PromptTemplate.component_id, PromptTemplate.prompt_category)
Index("idx_prompt_templates_template_component", PromptTemplate.work_template_id, PromptTemplate.component_id, PromptTemplate.prompt_category)
Index("idx_prompt_templates_chapter_component", PromptTemplate.chapter_id, PromptTemplate.component_id, PromptTemplate.prompt_category)
Index("idx_prompt_templates_data_key", PromptTemplate.data_key)

