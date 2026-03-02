"""
用户反馈 Pydantic Schemas
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    type: str = Field(..., pattern="^(bug|suggestion|other)$", description="反馈类型：bug/suggestion/other")
    title: str = Field(..., min_length=1, max_length=200, description="反馈标题")
    description: str = Field(..., min_length=1, description="详细描述")
    context: Optional[Dict[str, Any]] = Field(default=None, description="上下文信息（work_id, chapter_id 等）")


class FeedbackResponse(BaseModel):
    id: int
    user_id: Optional[str] = None
    type: str
    title: str
    description: str
    status: str
    context: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    admin_note: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class FeedbackStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|reviewing|resolved|closed)$", description="新状态")
    admin_note: Optional[str] = Field(default=None, description="管理员备注")


class FeedbackListResponse(BaseModel):
    items: list[FeedbackResponse]
    total: int
    page: int
    size: int
