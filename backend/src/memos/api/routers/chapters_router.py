"""
章节管理API路由 (使用ShareDB进行实时协作)
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_
import json
import asyncio
import base64
from datetime import datetime
from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id

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
from memos.api.services.chapter_service import ChapterService
from memos.api.services.work_service import WorkService
from memos.api.services.sharedb_service import ShareDBService
from memos.api.models.chapter import Chapter, ChapterVersion
from memos.api.schemas.chapter import (
    ChapterCreate, ChapterUpdate, ChapterResponse, ChapterListResponse,
    ChapterVersionCreate, ChapterVersionResponse
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chapters", tags=["章节管理"])
sharedb_service = ShareDBService()


# 章节CRUD操作
@router.post("/", response_model=ChapterResponse)
async def create_chapter(
    chapter_data: ChapterCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建新章节
    """
    chapter_service = ChapterService(db)

    # 检查作品权限
    if not await chapter_service.can_edit_work(
        user_id=current_user_id,
        work_id=chapter_data.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 如果未提供章节号，自动计算
    chapter_dict = chapter_data.dict()
    if chapter_dict.get('chapter_number') is None:
        # 获取该作品（或该卷）的最大章节号
        volume_number = chapter_dict.get('volume_number')
        max_chapter_number = await chapter_service.get_max_chapter_number(
            work_id=chapter_data.work_id,
            volume_number=volume_number
        )
        chapter_dict['chapter_number'] = max_chapter_number + 1

    # 创建章节记录
    chapter = await chapter_service.create_chapter(
        **chapter_dict
    )

    # 在ShareDB中创建文档
    # 使用新格式 work_{work_id}_chapter_{chapter_id}，与前端保持一致
    document_id = f"work_{chapter.work_id}_chapter_{chapter.id}"
    await sharedb_service.create_document(
        document_id=document_id,
        initial_content={
            "title": chapter.title,
            "content": chapter_data.content or "",
            "metadata": {
                "work_id": chapter.work_id,
                "chapter_number": chapter.chapter_number,
                "created_by": current_user_id,
                "created_at": chapter.created_at.isoformat() if chapter.created_at else None
            }
        }
    )

    # 记录审计日志
    await chapter_service.create_audit_log(
        user_id=current_user_id,
        action="create_chapter",
        target_type="chapter",
        target_id=chapter.id,
        details={
            "title": chapter.title,
            "work_id": chapter.work_id,
            "chapter_number": chapter.chapter_number
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return chapter.to_dict()


@router.get("/", response_model=ChapterListResponse)
async def list_chapters(
    work_id: str = Query(..., description="作品ID"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    status: Optional[str] = Query(None, description="章节状态"),
    include_deleted: bool = Query(False, description="是否包含已软删除的章节（回收站）"),
    sort_by: str = Query("chapter_number", description="排序字段"),
    sort_order: str = Query("asc", regex="^(asc|desc)$", description="排序方向"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取章节列表（默认不包含已软删除的章节）
    """
    chapter_service = ChapterService(db)

    # 检查作品访问权限
    if not await chapter_service.can_access_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )

    filters = {"work_id": work_id, "include_deleted": include_deleted}
    if status:
        filters["status"] = status

    chapters, total = await chapter_service.get_chapters(
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    return {
        "chapters": [chapter.to_dict() for chapter in chapters],
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size
    }


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(
    chapter_id: int,
    include_versions: bool = Query(False, description="是否包含版本历史"),
    check_recovery: bool = Query(False, description="是否检查恢复建议"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取章节详情
    如果章节不存在但check_recovery=true，会检查ShareDB/MongoDB中是否有相关文档，返回恢复建议
    """
    chapter_service = ChapterService(db)

    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        # 如果请求检查恢复建议，检查ShareDB/MongoDB中是否有相关文档
        if check_recovery:
            await sharedb_service.initialize()
            
            # 尝试从文档ID推断work_id
            # 格式可能是 work_{work_id}_chapter_{chapter_id} 或 chapter_{chapter_id}
            has_content_in_storage = False
            work_id_from_doc = None
            document_content = None
            
            try:
                # 先尝试新格式
                # 由于不知道work_id，需要遍历查找
                if sharedb_service.use_mongodb and sharedb_service.mongodb_db:
                    collection = sharedb_service.mongodb_db.documents
                    # 查找包含该章节ID的文档
                    pattern = f"_chapter_{chapter_id}$"
                    doc = await collection.find_one({
                        "id": {"$regex": pattern}
                    })
                    if doc:
                        has_content_in_storage = True
                        document_content = doc.get("content", "")
                        # 从文档ID中提取work_id
                        doc_id = doc.get("id", "")
                        match = re.match(r"work_(\d+)_chapter_", doc_id)
                        if match:
                            work_id_from_doc = int(match.group(1))
                elif sharedb_service.redis_client:
                    # Redis中查找（简化处理）
                    has_content_in_storage = False
            except Exception as e:
                logger.warning(f"检查ShareDB文档失败: {e}")
            
            if has_content_in_storage:
                # 返回恢复建议，而不是404错误
                return {
                    "id": chapter_id,
                    "needs_recovery": True,
                    "recovery_info": {
                        "chapter_id": chapter_id,
                        "work_id": work_id_from_doc,
                        "has_content_in_storage": True,
                        "content_length": len(str(document_content)) if document_content else 0,
                        "message": f"章节 {chapter_id} 在数据库中不存在，但在存储中发现内容，可以从本地缓存恢复"
                    },
                    "work_id": work_id_from_doc or 0,
                    "title": f"待恢复的章节 {chapter_id}",
                    "chapter_number": 0,
                    "volume_number": 1,
                    "status": "draft",
                    "word_count": len(str(document_content)) if document_content else 0,
                    "content": document_content or "",
                    "created_at": None,
                    "updated_at": None,
                }
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )

    # 检查访问权限
    if not await chapter_service.can_access_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该章节的权限"
        )

    # 从ShareDB获取最新内容
    # 优先使用新格式，兼容旧格式
    try:
        document_id_new = f"work_{chapter.work_id}_chapter_{chapter_id}"
        document_id_old = f"chapter_{chapter_id}"
        
        logger.info(f"🔍 [GetChapter] 正在尝试从ShareDB获取内容: new_id={document_id_new}, old_id={document_id_old}")
        
        document = await sharedb_service.get_document(document_id_new)
        if document:
            logger.info(f"✅ [GetChapter] 命中新格式文档: {document_id_new}")
        
        if not document:
            logger.info(f"⚠️ [GetChapter] 新格式文档未找到，尝试旧格式: {document_id_old}")
            document = await sharedb_service.get_document(document_id_old)
            if document:
                logger.info(f"✅ [GetChapter] 命中旧格式文档: {document_id_old}")
        
        if document:
            content = document.get("content", "")
            logger.info(f"📄 [GetChapter] ShareDB返回内容长度: {len(str(content))}")
            chapter.content = content
        else:
            # Chapter模型本身没有content字段，所以这里不能访问chapter.content
            logger.warning(f"❌ [GetChapter] ShareDB中未找到任何文档，且SQL数据库不存储内容")
            chapter.content = ""
            
    except Exception as e:
        logger.error(f"❌ [GetChapter] ShareDB获取失败: {e}")
        # 如果ShareDB获取失败，使用数据库中的内容
        pass

    return chapter.to_dict(include_versions=include_versions)


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    chapter_id: int,
    chapter_update: ChapterUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新章节元数据（不包含内容，内容通过ShareDB实时编辑）
    如果更新了字数，会同时更新作品的总字数
    """
    chapter_service = ChapterService(db)
    work_service = WorkService(db)

    # 检查章节是否存在
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )

    # 检查编辑权限
    if not await chapter_service.can_edit_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该章节的权限"
        )

    # 如果更新了字数，需要同时更新作品总字数
    old_word_count = chapter.word_count or 0
    new_word_count = chapter_update.word_count if chapter_update.word_count is not None else old_word_count
    
    # 更新章节元数据
    updated_chapter = await chapter_service.update_chapter(
        chapter_id=chapter_id,
        **chapter_update.dict(exclude_unset=True)
    )
    
    # 如果字数发生变化，增量更新作品总字数
    if chapter_update.word_count is not None and new_word_count != old_word_count:
        word_count_diff = new_word_count - old_word_count
        work = await work_service.get_work_by_id(chapter.work_id)
        if work:
            current_total_word_count = work.word_count or 0
            new_total_word_count = current_total_word_count + word_count_diff
            
            # 更新作品总字数
            await work_service.update_work(
                work_id=chapter.work_id,
                word_count=new_total_word_count
            )
            
            logger.info(f"✅ [字数统计] PUT端点: 章节 {chapter_id} 字数: {old_word_count} -> {new_word_count}, 作品 {chapter.work_id} 总字数: {current_total_word_count} -> {new_total_word_count}")

    # 如果有标题更新，同时更新ShareDB文档
    # 优先使用新格式，兼容旧格式
    if chapter_update.title:
        document_id_new = f"work_{chapter.work_id}_chapter_{chapter_id}"
        document_id_old = f"chapter_{chapter_id}"
        # 尝试更新新格式文档
        document = await sharedb_service.get_document(document_id_new)
        if not document:
            # 如果新格式不存在，尝试旧格式
            document = await sharedb_service.get_document(document_id_old)
            if document:
                # 如果旧格式存在，迁移到新格式
                await sharedb_service.create_document(
                    document_id=document_id_new,
                    initial_content=document
                )
        
        await sharedb_service.update_document(
            document_id=document_id_new,
            update_data={
                "title": chapter_update.title,
                "metadata.updated_by": current_user_id,
                "metadata.updated_at": datetime.utcnow().isoformat()
            }
        )

    # 记录审计日志
    await chapter_service.create_audit_log(
        user_id=current_user_id,
        action="update_chapter",
        target_type="chapter",
        target_id=chapter_id,
        details=chapter_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return updated_chapter.to_dict()


@router.delete("/{chapter_id}")
async def delete_chapter(
    chapter_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    删除章节
    """
    chapter_service = ChapterService(db)

    # 检查章节是否存在
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )

    # 检查删除权限
    if not await chapter_service.can_edit_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有删除该章节的权限"
        )

    # 软删除：仅标记 status=deleted，不删 ShareDB 文档，便于恢复
    await chapter_service.soft_delete_chapter(chapter_id)

    # 记录审计日志
    await chapter_service.create_audit_log(
        user_id=current_user_id,
        action="delete_chapter",
        target_type="chapter",
        target_id=chapter_id,
        details={"title": chapter.title, "work_id": chapter.work_id, "soft_delete": True},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {"message": "章节已移至回收站，可恢复"}


@router.post("/{chapter_id}/restore", response_model=ChapterResponse)
async def restore_chapter(
    chapter_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    恢复已软删除的章节（status 恢复为 draft）
    """
    chapter_service = ChapterService(db)
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )
    if chapter.status != "deleted":
        return chapter.to_dict()
    if not await chapter_service.can_edit_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有恢复该章节的权限"
        )
    await chapter_service.restore_chapter(chapter_id)
    await chapter_service.create_audit_log(
        user_id=current_user_id,
        action="restore_chapter",
        target_type="chapter",
        target_id=chapter_id,
        details={"title": chapter.title, "work_id": chapter.work_id},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )
    restored = await chapter_service.get_chapter_by_id(chapter_id)
    return restored.to_dict()


# Yjs 原生快照（Git 式版本历史）
@router.get("/{chapter_id}/yjs-snapshots")
async def list_yjs_snapshots(
    chapter_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """列出章节的 Yjs 快照（仅元数据）"""
    chapter_service = ChapterService(db)
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="章节不存在")
    if not await chapter_service.can_access_work(user_id=current_user_id, work_id=chapter.work_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    snapshots, total = await chapter_service.list_yjs_snapshots(chapter_id, page=page, size=size)
    return {
        "snapshots": [s.to_meta_dict() for s in snapshots],
        "total": total,
        "page": page,
        "size": size,
    }


@router.post("/{chapter_id}/yjs-snapshots")
async def create_yjs_snapshot(
    chapter_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """创建 Yjs 快照，body: { snapshot: base64, label?: string }"""
    body = await request.json()
    snapshot_b64 = body.get("snapshot")
    if not snapshot_b64:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="缺少 snapshot (base64)")
    try:
        snapshot_bytes = base64.b64decode(snapshot_b64)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="snapshot 需为合法 base64")
    chapter_service = ChapterService(db)
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="章节不存在")
    if not await chapter_service.can_edit_work(user_id=current_user_id, work_id=chapter.work_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    label = body.get("label")
    row = await chapter_service.create_yjs_snapshot(chapter_id, snapshot_bytes, label=label)
    return row.to_meta_dict()


@router.get("/{chapter_id}/yjs-snapshots/{snapshot_id}")
async def get_yjs_snapshot(
    chapter_id: int,
    snapshot_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """获取单个 Yjs 快照（含 base64 二进制，用于恢复）"""
    chapter_service = ChapterService(db)
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="章节不存在")
    if not await chapter_service.can_access_work(user_id=current_user_id, work_id=chapter.work_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    row = await chapter_service.get_yjs_snapshot(chapter_id, snapshot_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="快照不存在")
    return {
        **row.to_meta_dict(),
        "snapshot": base64.b64encode(row.snapshot).decode("ascii"),
    }


# 版本管理
@router.get("/{chapter_id}/versions", response_model=List[ChapterVersionResponse])
async def get_chapter_versions(
    chapter_id: int,
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> List[Dict[str, Any]]:
    """
    获取章节版本历史
    """
    chapter_service = ChapterService(db)

    # 检查章节访问权限
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )

    if not await chapter_service.can_access_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该章节的权限"
        )

    versions, total = await chapter_service.get_chapter_versions(
        chapter_id=chapter_id,
        page=page,
        size=size
    )

    return [version.to_dict() for version in versions]


@router.post("/{chapter_id}/versions", response_model=ChapterVersionResponse)
async def create_chapter_version(
    chapter_id: int,
    version_data: ChapterVersionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建章节版本快照
    """
    chapter_service = ChapterService(db)

    # 检查章节访问权限
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )

    if not await chapter_service.can_access_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该章节的权限"
        )

    # 获取当前ShareDB文档内容
    # 优先使用新格式，兼容旧格式
    try:
        document_id_new = f"work_{chapter.work_id}_chapter_{chapter_id}"
        document_id_old = f"chapter_{chapter_id}"
        document = await sharedb_service.get_document(document_id_new)
        if not document:
            document = await sharedb_service.get_document(document_id_old)
        current_content = document.get("content", "") if document else ""
        current_title = document.get("title", chapter.title) if document else chapter.title
    except Exception:
        current_content = chapter.content or ""
        current_title = chapter.title

    # 创建版本
    version = await chapter_service.create_chapter_version(
        chapter_id=chapter_id,
        title=current_title,
        content=current_content,
        **version_data.dict()
    )

    # 记录审计日志
    await chapter_service.create_audit_log(
        user_id=current_user_id,
        action="create_chapter_version",
        target_type="chapter_version",
        target_id=version.id,
        details={
            "chapter_id": chapter_id,
            "version_number": version.version_number
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return version.to_dict()


# ShareDB WebSocket连接用于实时协作
@router.websocket("/{chapter_id}/collaborate")
async def websocket_collaborate(
    websocket: WebSocket,
    chapter_id: int,
    token: Optional[str] = None
):
    """
    章节实时协作WebSocket连接
    """
    await websocket.accept()

    # 验证用户身份
    try:
        if not token:
            await websocket.close(code=1008, reason="Token缺少")
            return

        # 这里应该验证JWT token，简化处理
        # user_id = await verify_websocket_token(token)
        user_id = 1  # 临时使用硬编码，实际应该从token解析

        # 检查章节访问权限
        chapter_service = ChapterService(websocket.app.state.db)
        chapter = await chapter_service.get_chapter_by_id(chapter_id)
        if not chapter:
            await websocket.close(code=1004, reason="章节不存在")
            return

        if not await chapter_service.can_access_work(
            user_id=user_id,
            work_id=chapter.work_id
        ):
            await websocket.close(code=1003, reason="没有访问权限")
            return

        # 加入协作会话
        # 优先使用新格式，兼容旧格式
        document_id_new = f"work_{chapter.work_id}_chapter_{chapter_id}"
        document_id_old = f"chapter_{chapter_id}"
        # 尝试使用新格式，如果不存在则使用旧格式
        document = await sharedb_service.get_document(document_id_new)
        if not document:
            document = await sharedb_service.get_document(document_id_old)
            if document:
                # 如果旧格式存在，迁移到新格式
                await sharedb_service.create_document(
                    document_id=document_id_new,
                    initial_content=document
                )
        
        await sharedb_service.join_collaboration(
            websocket=websocket,
            document_id=document_id_new,
            user_id=user_id
        )

    except WebSocketDisconnect:
        # 客户端断开连接
        pass
    except Exception as e:
        await websocket.close(code=1011, reason=f"服务器错误: {str(e)}")


# ShareDB文档操作
@router.get("/{chapter_id}/document")
async def get_chapter_document(
    chapter_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取章节ShareDB文档内容
    """
    chapter_service = ChapterService(db)

    # 检查章节访问权限
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )

    if not await chapter_service.can_access_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该章节的权限"
        )

    # 获取ShareDB文档
    # 优先使用新格式 work_{work_id}_chapter_{chapter_id}，兼容旧格式 chapter_{chapter_id}
    document_id_new = f"work_{chapter.work_id}_chapter_{chapter_id}"
    
    document = await sharedb_service.get_document(document_id_new)

    # 关键修复：只返回文档的 content 字段，而不是整个 document 对象
    # 这样前端就不会显示 JSON 信息，只显示内容
    import json
    document_content = ""
    document_exists = False
    
    if document:
        document_exists = True
        document_content = document.get("content", "")
        if isinstance(document_content, dict):
            # 如果 content 是字典，尝试提取文本内容
            document_content = document_content.get("content", "") or json.dumps(document_content, ensure_ascii=False)
        elif not isinstance(document_content, str):
            document_content = str(document_content) if document_content else ""
    else:
        # 如果ShareDB文档不存在，返回特殊标记，让前端知道需要使用本地缓存
        logger.warning(f"ShareDB文档不存在（新格式和旧格式都不存在）: {document_id_new} / {document_id_old}，返回空内容标记")
        document_content = ""  # 空字符串表示 MongoDB 没有数据
    
    return {
        "document_id": document_id_new,  # 返回新格式的文档ID
        "content": document_content,  # 只返回内容字符串，而不是整个 document 对象
        "document_exists": document_exists,  # 关键修复：标记文档是否存在于 MongoDB
        "chapter_info": chapter.to_dict()
    }


@router.post("/{chapter_id}/document/operations")
async def submit_document_operation(
    chapter_id: int,
    operation: Dict[str, Any],
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    提交文档操作（通过ShareDB）
    """
    chapter_service = ChapterService(db)

    # 检查章节编辑权限
    chapter = await chapter_service.get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="章节不存在"
        )

    if not await chapter_service.can_edit_work(
        user_id=current_user_id,
        work_id=chapter.work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该章节的权限"
        )

    # 提交操作到ShareDB
    try:
        result = await sharedb_service.submit_operation(
            document_id=f"chapter_{chapter_id}",
            operation=operation,
            user_id=current_user_id
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"操作提交失败: {str(e)}"
        )


# 工具函数
def get_client_ip(request: Request) -> Optional[str]:
    """获取客户端IP地址"""
    return request.client.host if request.client else None


def get_user_agent(request: Request) -> Optional[str]:
    """获取用户代理"""
    return request.headers.get("user-agent")