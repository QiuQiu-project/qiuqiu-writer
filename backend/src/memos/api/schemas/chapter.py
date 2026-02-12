"""
章节相关的数据模式
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, validator

class ChapterBase(BaseModel):
    """章节基础模式"""
    title: str
    chapter_number: Optional[int] = None
    volume_number: Optional[int] = 1
    volume_id: Optional[int] = None
    status: Optional[str] = "draft"
    word_count: Optional[int] = 0
    estimated_reading_time: Optional[int] = 0
    summary: Optional[str] = None
    tags: Optional[List[str]] = []
    notes: Optional[Dict[str, Any]] = {}
    chapter_metadata: Optional[Dict[str, Any]] = {}  # Alias for metadata field in DB
    sort_order: Optional[int] = 0

    @validator("title")
    def validate_title(cls, v):
        if not v or v.strip() == "":
            raise ValueError("章节标题不能为空")
        if len(v) > 200:
            raise ValueError("章节标题长度不能超过200个字符")
        return v.strip()

class ChapterCreate(ChapterBase):
    """创建章节模式"""
    work_id: str
    content: Optional[str] = None

class ChapterUpdate(BaseModel):
    """更新章节模式"""
    title: Optional[str] = None
    chapter_number: Optional[int] = None
    volume_number: Optional[int] = None
    volume_id: Optional[int] = None
    status: Optional[str] = None
    word_count: Optional[int] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[Dict[str, Any]] = None
    chapter_metadata: Optional[Dict[str, Any]] = None
    sort_order: Optional[int] = None

class ChapterResponse(ChapterBase):
    """章节响应模式"""
    id: int
    work_id: str
    content: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    content_preview: Optional[str] = None

    class Config:
        from_attributes = True

class ChapterListResponse(BaseModel):
    """章节列表响应模式"""
    chapters: List[ChapterResponse]
    total: int
    page: int
    size: int
    pages: int

class ChapterVersionCreate(BaseModel):
    """创建章节版本模式"""
    content: Optional[str] = None
    change_description: Optional[str] = None

class ChapterVersionResponse(BaseModel):
    """章节版本响应模式"""
    id: int
    chapter_id: int
    version_number: int
    title: str
    created_at: datetime
    change_description: Optional[str] = None

    class Config:
        from_attributes = True
