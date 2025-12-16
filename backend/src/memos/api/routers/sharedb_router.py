"""
ShareDB API 路由
提供文档同步和协作编辑接口
借鉴 nexcode_server 的实现
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging

from memos.api.services.sharedb_service import sharedb_service
from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from sqlalchemy.ext.asyncio import AsyncSession

# 辅助函数：确保返回的是 AsyncSession 对象，而不是生成器
async def get_db_session(db: AsyncSession = Depends(get_async_db)) -> AsyncSession:
    """
    确保返回的是 AsyncSession 对象，而不是生成器
    FastAPI 的 Depends 应该已经处理了生成器，但为了安全起见，我们再次检查
    """
    # FastAPI 的 Depends 应该已经处理了生成器，直接返回
    # 但如果仍然是生成器，尝试获取会话对象
    if hasattr(db, '__aiter__') and not hasattr(db, 'execute'):
        # 如果是生成器，尝试获取会话对象
        try:
            db = await db.__anext__()
        except StopAsyncIteration:
            raise ValueError("无法从生成器获取数据库会话")
    
    return db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/sharedb", tags=["ShareDB"])


class DocumentSyncRequest(BaseModel):
    """文档同步请求"""
    doc_id: str
    version: int  # 客户端当前版本号
    content: str  # 客户端当前内容（HTML 格式）
    content_json: Optional[Dict[str, Any]] = None  # TipTap JSON 格式内容（用于更精确的段落级合并）
    base_version: Optional[int] = None  # 基于哪个版本做的更改（用于合并）
    base_content: Optional[str] = None  # 上次同步的内容（HTML 格式，用于计算差异）
    base_content_json: Optional[Dict[str, Any]] = None  # 上次同步的内容（JSON 格式，用于更精确的合并）
    create_version: bool = False  # 是否创建版本快照


class DocumentResponse(BaseModel):
    """文档响应"""
    doc_id: str
    content: str
    version: int
    created_at: str
    updated_at: str


class SyncResponse(BaseModel):
    """同步响应"""
    success: bool
    version: int
    content: str
    operations: List[Dict[str, Any]] = []
    error: Optional[str] = None
    work: Optional[Dict[str, Any]] = None  # 如果更新了字数，返回更新后的作品信息
    chapter: Optional[Dict[str, Any]] = None  # 如果更新了字数，返回更新后的章节信息


@router.get("/ping")
async def ping():
    """健康检查端点"""
    return {"status": "ok", "message": "ShareDB service is running"}


@router.get("/documents/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    """获取文档当前状态"""
    try:
        result = await sharedb_service.get_document(doc_id)
        if not result:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return DocumentResponse(
            doc_id=result.get("id", doc_id),
            content=result.get("content", ""),
            version=result.get("version", 0),
            created_at=result.get("created_at", ""),
            updated_at=result.get("updated_at", "")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get document")


@router.post("/documents/sync", response_model=SyncResponse)
async def sync_document(
    request: DocumentSyncRequest,
    current_user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db_session)
):
    """
    同步文档，智能版本控制
    借鉴 nexcode_server 的实现
    """
    try:
        # 调用 ShareDB 服务同步
        result = await sharedb_service.sync_document(
            document_id=request.doc_id,
            version=request.version,
            content=request.content,
            base_version=request.base_version,  # 传递基础版本号
            base_content=request.base_content,  # 传递基础内容（HTML 格式）用于差异计算
            content_json=request.content_json,  # 传递 JSON 格式内容，用于更精确的段落级合并
            base_content_json=request.base_content_json,  # 传递基础内容（JSON 格式）
            user_id=current_user_id,
            create_version=request.create_version,
            db_session=db
        )
        
        # 返回 SyncResponse 对象
        return SyncResponse(**result)
    except Exception as e:
        logger.error(f"Sync document failed: {e}")
        return SyncResponse(
            success=False,
            error=str(e),
            content=request.content,
            version=request.version,
            operations=[]
        )


@router.post("/documents/{doc_id}/operations")
async def apply_operation(
    doc_id: str,
    operation: Dict[str, Any] = Body(...),
    current_user_id: int = Depends(get_current_user_id)
):
    """应用操作到文档"""
    try:
        result = await sharedb_service.submit_operation(
            document_id=doc_id,
            operation=operation,
            user_id=current_user_id
        )
        
        return {
            "success": result.get("success", True),
            "version": result.get("version"),
            "content": result.get("content"),
            "operation_id": result.get("operation_id")
        }
    except Exception as e:
        logger.error(f"Failed to apply operation to {doc_id}: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/documents/{doc_id}/operations")
async def get_operations(
    doc_id: str,
    since_version: int = 0
):
    """获取指定版本之后的操作"""
    try:
        # 这里需要实现获取操作的方法
        # 暂时返回空列表
        return {
            "success": True,
            "operations": [],
            "doc_id": doc_id,
            "since_version": since_version
        }
    except Exception as e:
        logger.error(f"Failed to get operations for {doc_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get operations")

