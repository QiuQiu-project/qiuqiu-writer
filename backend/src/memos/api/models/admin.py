"""
Admin User Model
"""

from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from memos.api.core.database import Base

class AdminUser(Base):
    """Admin User Table"""
    __tablename__ = "admin_users"

    id = Column(String(40), primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100))
    status = Column(String(20), default="active")  # active/inactive
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at = Column(DateTime(timezone=True))

    def __repr__(self):
        return f"<AdminUser(id={self.id}, username='{self.username}')>"
