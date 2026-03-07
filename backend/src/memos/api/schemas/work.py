"""
作品相关的数据模式
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, validator


class WorkBase(BaseModel):
    """作品基础模式"""
    title: str
    subtitle: Optional[str] = None
    description: Optional[str] = None
    work_type: str  # novel/script/short_story/film_script
    cover_image_url: Optional[str] = None
    tags: Optional[List[str]] = []
    category: Optional[str] = None
    genre: Optional[str] = None
    target_audience: Optional[str] = None
    language: Optional[str] = "zh-CN"
    is_public: Optional[bool] = False
    is_collaborative: Optional[bool] = False
    settings: Optional[Dict[str, Any]] = {}
    metadata: Optional[Dict[str, Any]] = {}

    @validator("title")
    def validate_title(cls, v):
        if not v or v.strip() == "":
            raise ValueError("作品标题不能为空")
        if len(v) < 1 or len(v) > 200:
            raise ValueError("作品标题长度必须在1-200个字符之间")
        return v.strip()

    @validator("subtitle")
    def validate_subtitle(cls, v):
        if v is not None:
            if len(v) > 300:
                raise ValueError("作品副标题长度不能超过300个字符")
        return v

    @validator("description")
    def validate_description(cls, v):
        if v is not None:
            if len(v) > 1000:
                raise ValueError("作品描述长度不能超过1000个字符")
        return v

    @validator("work_type")
    def validate_work_type(cls, v):
        allowed_types = ["novel", "script", "short_story", "film_script"]
        if v not in allowed_types:
            raise ValueError(f"作品类型必须是: {', '.join(allowed_types)}")
        return v

    @validator("target_audience")
    def validate_target_audience(cls, v):
        if v is not None:
            allowed_audiences = ["children", "teenagers", "young_adult", "adult", "general"]
            if v not in allowed_audiences:
                raise ValueError(f"目标读者必须是: {', '.join(allowed_audiences)}")
        return v

    @validator("language")
    def validate_language(cls, v):
        if v is not None:
            # 简单的语言代码验证
            if len(v) != 2 and len(v) != 5 and "-" not in v:
                raise ValueError("语言代码格式不正确，应为 'zh-CN' 格式")
        return v

    @validator("tags")
    def validate_tags(cls, v):
        if v is not None:
            if len(v) > 20:
                raise ValueError("标签数量不能超过20个")
            for tag in v:
                if len(tag) > 50:
                    raise ValueError("单个标签长度不能超过50个字符")
        return v


class WorkCreate(WorkBase):
    """创建作品模式"""
    pass


class WorkUpdate(BaseModel):
    """更新作品模式"""
    title: Optional[str] = None
    subtitle: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    cover_image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    genre: Optional[str] = None
    target_audience: Optional[str] = None
    language: Optional[str] = None
    is_public: Optional[bool] = None
    is_collaborative: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

    @validator("title")
    def validate_title(cls, v):
        if v is not None:
            if not v or v.strip() == "":
                raise ValueError("作品标题不能为空")
            if len(v) < 1 or len(v) > 200:
                raise ValueError("作品标题长度必须在1-200个字符之间")
            return v.strip()
        return v

    @validator("status")
    def validate_status(cls, v):
        if v is not None:
            allowed_statuses = ["draft", "published", "archived"]
            if v not in allowed_statuses:
                raise ValueError(f"作品状态必须是: {', '.join(allowed_statuses)}")
        return v


class WorkExportRequest(BaseModel):
    """导出作品请求"""
    format: str = "text"  # text, word
    chapter_ids: Optional[List[int]] = None

class WorkResponse(WorkBase):
    """作品响应模式"""
    id: str
    title: str
    subtitle: Optional[str]
    description: Optional[str]
    work_type: str
    status: str
    cover_image_url: Optional[str]
    tags: List[str]
    category: Optional[str]
    genre: Optional[str]
    target_audience: Optional[str]
    language: str
    word_count: int
    chapter_count: int
    reading_time: int
    collaborator_count: int
    is_public: bool
    is_collaborative: bool
    settings: Dict[str, Any]
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
    owner_id: str
    collaborators: Optional[List['WorkCollaboratorResponse']] = None

    class Config:
        from_attributes = True


class WorkListItem(BaseModel):
    """作品列表项模式"""
    id: str
    title: str
    subtitle: Optional[str]
    description: Optional[str]
    work_type: str
    status: str
    cover_image_url: Optional[str]
    tags: List[str]
    category: Optional[str]
    genre: Optional[str]
    word_count: int
    chapter_count: int
    reading_time: int
    is_public: bool
    is_collaborative: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkListResponse(BaseModel):
    """作品列表响应模式"""
    works: List[WorkListItem]
    pagination: Dict[str, Any]


class WorkCollaboratorBase(BaseModel):
    """作品协作者基础模式"""
    user_id: str
    permission: str  # owner/editor/reader
    role: Optional[str] = None

    @validator("permission")
    def validate_permission(cls, v):
        allowed_permissions = ["owner", "editor", "reader", "pending"]
        if v not in allowed_permissions:
            raise ValueError(f"权限级别必须是: {', '.join(allowed_permissions)}")
        return v


class WorkCollaboratorCreate(BaseModel):
    """作品协作者创建模式"""
    username_or_email: str
    permission: str = "editor"  # admin/editor/reader
    role: Optional[str] = None

    @validator("permission")
    def validate_permission(cls, v):
        allowed_permissions = ["admin", "editor", "reader", "pending"]
        if v not in allowed_permissions:
            raise ValueError(f"权限级别必须是: {', '.join(allowed_permissions)}")
        return v


class WorkCollaboratorUpdate(BaseModel):
    """作品协作者更新模式"""
    permission: Optional[str] = None
    role: Optional[str] = None

    @validator("permission")
    def validate_permission(cls, v):
        if v is not None:
            allowed_permissions = ["admin", "editor", "reader", "pending"]
            if v not in allowed_permissions:
                raise ValueError(f"权限级别必须是: {', '.join(allowed_permissions)}")
        return v


class WorkCollaboratorResponse(BaseModel):
    """作品协作者响应模式"""
    id: int
    work_id: str
    user_id: str
    permission: str
    role: Optional[str]
    invited_by: Optional[str]
    joined_at: datetime
    created_at: datetime
    username: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class WorkStatistics(BaseModel):
    """作品统计信息模式"""
    work_id: str
    total_word_count: int
    total_chapter_count: int
    estimated_reading_time: int
    collaborator_count: int
    last_updated: datetime
    writing_streak_days: int
    average_chapter_length: int


class WorkSearchRequest(BaseModel):
    """作品搜索请求模式"""
    query: Optional[str] = None
    work_type: Optional[str] = None
    category: Optional[str] = None
    genre: Optional[str] = None
    status: Optional[str] = None
    target_audience: Optional[str] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    is_collaborative: Optional[bool] = None
    owner_id: Optional[int] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    updated_after: Optional[datetime] = None
    updated_before: Optional[datetime] = None
    page: int = 1
    page_size: int = 20
    sort_by: str = "updated_at"
    sort_order: str = "desc"

    @validator("page")
    def validate_page(cls, v):
        if v < 1:
            raise ValueError("页码必须大于0")
        return v

    @validator("page_size")
    def validate_page_size(cls, v):
        if v < 1 or v > 100:
            raise ValueError("每页数量必须在1-100之间")
        return v

    @validator("sort_by")
    def validate_sort_by(cls, v):
        allowed_fields = ["created_at", "updated_at", "title", "word_count", "chapter_count"]
        if v not in allowed_fields:
            raise ValueError(f"排序字段必须是: {', '.join(allowed_fields)}")
        return v

    @validator("sort_order")
    def validate_sort_order(cls, v):
        if v not in ["asc", "desc"]:
            raise ValueError("排序方向必须是 'asc' 或 'desc'")
        return v


class WorkExportRequest(BaseModel):
    """作品导出请求模式"""
    format: str  # text/word/pdf/markdown
    include_metadata: bool = True
    include_toc: bool = True
    chapter_ids: Optional[List[int]] = None  # 指定章节，空则导出全部

    @validator("format")
    def validate_format(cls, v):
        allowed_formats = ["text", "word", "pdf", "markdown"]
        if v not in allowed_formats:
            raise ValueError(f"导出格式必须是: {', '.join(allowed_formats)}")
        return v


class WorkPermissionCheck(BaseModel):
    """作品权限检查模式"""
    work_id: int
    user_id: int
    required_permission: str  # read/edit/delete/manage

    @validator("required_permission")
    def validate_required_permission(cls, v):
        allowed_permissions = ["read", "edit", "delete", "manage"]
        if v not in allowed_permissions:
            raise ValueError(f"所需权限必须是: {', '.join(allowed_permissions)}")
        return v


class WorkPermissionResponse(BaseModel):
    """作品权限检查响应模式"""
    has_permission: bool
    permission_level: str
    message: str

WorkResponse.update_forward_refs()
