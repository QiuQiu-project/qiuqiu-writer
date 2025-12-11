"""
用户模型
"""

from datetime import datetime
from typing import Optional, Dict, Any, List

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, JSON,
    Index, ForeignKey
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from memos.api.core.database import Base


class User(Base):
    """用户表"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100))
    avatar_url = Column(String(255))
    bio = Column(Text)
    status = Column(String(20), default="active", index=True)  # active/inactive/banned
    preferences = Column(JSON, default=dict)  # 用户偏好设置
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    works = relationship("Work", back_populates="owner", cascade="all, delete-orphan")
    work_collaborations = relationship(
        "WorkCollaborator", 
        back_populates="user", 
        foreign_keys=lambda: [_get_work_collaborator_user_id()],
        cascade="all, delete-orphan"
    )
    chapter_versions = relationship("ChapterVersion", back_populates="created_by_user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    document_sync_history = relationship("DocumentSyncHistory", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}')>"

    @property
    def is_active(self) -> bool:
        """用户是否活跃"""
        return self.status == "active"

    @property
    def full_name(self) -> str:
        """获取用户全名"""
        if self.profile and self.profile.real_name:
            return self.profile.real_name
        return self.display_name or self.username

    def to_dict(self, include_sensitive: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        # 安全地转换日期字段
        def safe_isoformat(dt):
            if dt is None:
                return None
            if isinstance(dt, str):
                # 如果已经是字符串，直接返回
                return dt
            if hasattr(dt, 'isoformat'):
                return dt.isoformat()
            return str(dt)
        
        data = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "display_name": self.display_name,
            "avatar_url": self.avatar_url,
            "bio": self.bio,
            "status": self.status,
            "preferences": self.preferences or {},
            "last_login_at": safe_isoformat(self.last_login_at),
            "created_at": safe_isoformat(self.created_at),
            "updated_at": safe_isoformat(self.updated_at),
        }

        if include_sensitive:
            data["password_hash"] = self.password_hash

        return data


class UserProfile(Base):
    """用户详细信息表"""

    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    display_name = Column(String(100))
    real_name = Column(String(100))
    gender = Column(String(10))
    birthday = Column(DateTime(timezone=True))
    location = Column(String(100))
    website = Column(String(255))
    social_links = Column(JSON, default=list)  # 社交媒体链接
    writing_stats = Column(JSON, default=dict)  # 写作统计信息
    preferences = Column(JSON, default=dict)  # 详细用户偏好
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    user = relationship("User", back_populates="profile")

    def __repr__(self):
        return f"<UserProfile(id={self.id}, user_id={self.user_id})>"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        # 安全地转换日期字段
        def safe_isoformat(dt):
            if dt is None:
                return None
            if isinstance(dt, str):
                # 如果已经是字符串，直接返回
                return dt
            if hasattr(dt, 'isoformat'):
                return dt.isoformat()
            return str(dt)
        
        return {
            "id": self.id,
            "user_id": self.user_id,
            "display_name": self.display_name,
            "real_name": self.real_name,
            "gender": self.gender,
            "birthday": safe_isoformat(self.birthday),
            "location": self.location,
            "website": self.website,
            "social_links": self.social_links or [],
            "writing_stats": self.writing_stats or {},
            "preferences": self.preferences or {},
            "created_at": safe_isoformat(self.created_at),
            "updated_at": safe_isoformat(self.updated_at),
        }


# 索引
Index("idx_users_username", User.username)
Index("idx_users_email", User.email)
Index("idx_users_status", User.status)
Index("idx_users_created_at", User.created_at)

Index("idx_user_profiles_user_id", UserProfile.user_id)


# 延迟导入 WorkCollaborator 以避免循环导入
def _get_work_collaborator_user_id():
    """获取 WorkCollaborator.user_id 列对象"""
    from memos.api.models.work import WorkCollaborator
    return WorkCollaborator.user_id