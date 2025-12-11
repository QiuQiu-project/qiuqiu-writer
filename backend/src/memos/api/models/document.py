"""
文档同步模型
用于记录文档同步历史和版本快照
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


class DocumentSyncHistory(Base):
    """文档同步历史表"""

    __tablename__ = "document_sync_history"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String(255), nullable=False, index=True)  # 文档ID，如 work_4_chapter_6
    version = Column(Integer, nullable=False, index=True)  # 同步后的版本号
    content = Column(Text)  # 同步后的内容（可选，用于版本快照）
    content_hash = Column(String(32), index=True)  # 内容哈希
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # 同步用户
    sync_type = Column(String(20), default="sync", index=True)  # sync/version_snapshot/merge
    conflict_resolved = Column(Boolean, default=False)  # 是否解决了冲突
    merge_strategy = Column(String(50))  # 合并策略：smart_merge/diff_based/last_write_wins
    base_version = Column(Integer)  # 基础版本号（用于差异计算）
    client_version = Column(Integer)  # 客户端版本号
    server_version = Column(Integer)  # 服务器版本号
    sync_metadata = Column("metadata", JSON, default=dict)  # 扩展元数据（使用sync_metadata作为属性名，数据库列名为metadata）
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # 关系
    user = relationship("User", back_populates="document_sync_history")

    def __repr__(self):
        return f"<DocumentSyncHistory(id={self.id}, document_id='{self.document_id}', version={self.version})>"

    def to_dict(self, include_content: bool = False) -> Dict[str, Any]:
        """转换为字典"""
        data = {
            "id": self.id,
            "document_id": self.document_id,
            "version": self.version,
            "content_hash": self.content_hash,
            "user_id": self.user_id,
            "sync_type": self.sync_type,
            "conflict_resolved": self.conflict_resolved,
            "merge_strategy": self.merge_strategy,
            "base_version": self.base_version,
            "client_version": self.client_version,
            "server_version": self.server_version,
            "metadata": self.sync_metadata or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        
        if include_content:
            data["content"] = self.content
        
        return data


# 索引
Index("idx_document_sync_history_document", DocumentSyncHistory.document_id)
Index("idx_document_sync_history_version", DocumentSyncHistory.version)
Index("idx_document_sync_history_user", DocumentSyncHistory.user_id)
Index("idx_document_sync_history_type", DocumentSyncHistory.sync_type)
Index("idx_document_sync_history_created", DocumentSyncHistory.created_at)

# 复合索引
Index("idx_document_sync_history_doc_version", DocumentSyncHistory.document_id, DocumentSyncHistory.version)
Index("idx_document_sync_history_doc_created", DocumentSyncHistory.document_id, DocumentSyncHistory.created_at)

