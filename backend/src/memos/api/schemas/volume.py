"""
卷相关的数据模式
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, validator

class VolumeBase(BaseModel):
    """卷基础模式"""
    title: str
    volume_number: int
    outline: Optional[str] = None
    detail_outline: Optional[str] = None

    @validator("title")
    def validate_title(cls, v):
        if not v or v.strip() == "":
            raise ValueError("卷标题不能为空")
        if len(v) > 200:
            raise ValueError("卷标题长度不能超过200个字符")
        return v.strip()

class VolumeCreate(VolumeBase):
    """创建卷模式"""
    pass

class VolumeUpdate(BaseModel):
    """更新卷模式"""
    title: Optional[str] = None
    volume_number: Optional[int] = None
    outline: Optional[str] = None
    detail_outline: Optional[str] = None

class Volume(VolumeBase):
    """卷详情模式"""
    id: int
    work_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
