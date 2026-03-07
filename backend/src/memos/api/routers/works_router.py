"""
作品管理API路由
"""

from typing import Any, Dict, List, Optional
import io
import re
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_

from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.services.work_service import WorkService
from memos.api.services.template_service import TemplateService
from memos.api.services.chapter_service import ChapterService
from memos.api.services.sharedb_service import ShareDBService
from memos.api.schemas.work import (
    WorkCreate, WorkUpdate, WorkResponse, WorkListResponse,
    WorkCollaboratorCreate, WorkCollaboratorUpdate, WorkCollaboratorResponse,
    WorkExportRequest
)
from memos.api.models.work import Work, WorkCollaborator
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/works", tags=["作品管理"])


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


@router.post("/", response_model=WorkResponse)
async def create_work(
    work_data: WorkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建新作品
    """
    work_service = WorkService(db)

    work = await work_service.create_work(
        owner_id=current_user_id,
        **work_data.dict()
    )
    work_id = work.id
    work_title = work.title
    work_type = work.work_type

    # 小说类型：确保用户有默认模板（没有则用小说标准模板创建），并为该作品绑定默认模板、复制 prompt，并写入 metadata.template_config.templateId
    if work_type == "novel":
        try:
            template_service = TemplateService(db)
            user_template = await template_service.ensure_user_default_novel_template(current_user_id)
            await template_service.create_work_extended_info(
                work_id=work_id,
                template_id=user_template.id,
                field_values={},
            )
            await template_service.copy_prompts_from_template_to_work(
                template_id=user_template.id,
                work_id=work_id,
                creator_id=current_user_id,
            )
            # 创建时直接绑定 work.work_metadata.template_config.templateId（纯 id，不再使用 db- 前缀）
            work = await work_service.update_work(
                work_id,
                metadata={"template_config": {"templateId": f"{user_template.id}"}},
            )
            logger.info(
                "创建作品已绑定用户默认模板: work_id=%s, template_id=%s",
                work_id,
                user_template.id,
            )
        except ValueError as e:
            logger.warning("创建作品时绑定默认模板失败（无小说标准模板）: %s", e)
            await db.rollback()
            work = await work_service.get_work_by_id(work_id)
        except Exception as e:
            logger.warning("创建作品时绑定默认模板失败（不影响作品创建）: %s", e)
            await db.rollback()
            work = await work_service.get_work_by_id(work_id)

    # 记录审计日志（使用已保存的 work_id/work_title/work_type，避免 rollback 后访问过期 ORM 对象）
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="create",
        target_type="work",
        target_id=work_id,
        details={"title": work_title, "work_type": work_type},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )
    return work.to_dict()


@router.get("/", response_model=WorkListResponse)
async def list_works(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    status: Optional[str] = Query(None, description="作品状态"),
    category: Optional[str] = Query(None, description="作品分类"),
    genre: Optional[str] = Query(None, description="作品流派"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    include_collaborators: bool = Query(False, description="是否包含协作者信息"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品列表
    """
    work_service = WorkService(db)

    filters = {}
    if work_type:
        filters["work_type"] = work_type
    if status:
        filters["status"] = status
    if category:
        filters["category"] = category
    if genre:
        filters["genre"] = genre
    if search:
        filters["search"] = search

    works, total = await work_service.get_user_works(
        user_id=current_user_id,
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    pages = (total + size - 1) // size if total > 0 else 0

    # 转换为符合 WorkListItem schema 的格式
    works_data = []
    for work in works:
        work_dict = work.to_dict(include_collaborators=include_collaborators)
        # 确保 created_at 和 updated_at 是 datetime 对象（不是字符串）
        works_data.append({
            "id": work_dict["id"],
            "title": work_dict["title"],
            "subtitle": work_dict.get("subtitle"),
            "description": work_dict.get("description"),
            "work_type": work_dict["work_type"],
            "status": work_dict["status"],
            "cover_image_url": work_dict.get("cover_image_url"),
            "tags": work_dict.get("tags", []),
            "category": work_dict.get("category"),
            "genre": work_dict.get("genre"),
            "word_count": work_dict.get("word_count", 0),
            "chapter_count": work_dict.get("chapter_count", 0),
            "reading_time": work_dict.get("reading_time", 0),
            "is_public": work_dict.get("is_public", False),
            "is_collaborative": work_dict.get("is_collaborative", False),
            "created_at": work.created_at,  # 使用原始的 datetime 对象
            "updated_at": work.updated_at,  # 使用原始的 datetime 对象
        })

    return {
        "works": works_data,
        "pagination": {
            "total": total,
            "page": page,
            "size": size,
            "pages": pages
        }
    }


@router.post("/{work_id}/export", summary="导出作品")
async def export_work(
    work_id: str,
    export_req: WorkExportRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    导出作品为指定格式（TXT或Word）
    """
    work_service = WorkService(db)
    work = await work_service.get_work_by_id(work_id)
    
    if not work:
        raise HTTPException(status_code=404, detail="作品不存在")
        
    if work.owner_id != current_user_id:
        raise HTTPException(status_code=403, detail="没有导出该作品的权限")
        
    # 获取章节列表
    chapter_service = ChapterService(db)
    # 按卷号和章节号排序
    all_chapters, _ = await chapter_service.get_chapters(
        filters={"work_id": work_id, "include_deleted": False},
        page=1,
        size=10000, # 获取所有章节
        sort_by="chapter_number",
        sort_order="asc"
    )
    
    # 过滤章节
    if export_req.chapter_ids:
        chapters_to_export = [c for c in all_chapters if c.id in export_req.chapter_ids]
    else:
        chapters_to_export = all_chapters
        
    # 按卷号和章节号排序
    chapters_to_export.sort(key=lambda c: (c.volume_number or 0, c.chapter_number or 0))
    
    # 获取内容
    sharedb_service = ShareDBService()
    await sharedb_service.initialize()
    
    export_content = []
    
    for chapter in chapters_to_export:
        doc_id = f"work_{work_id}_chapter_{chapter.id}"
        doc = await sharedb_service.get_document(doc_id)
        
        content = ""
        if doc:
            content = doc.get("content", "")
            # 如果是 HTML，需要转换为纯文本 (简单处理)
            if content and isinstance(content, str) and ("<" in content and ">" in content):
                 content = re.sub(r'<[^>]+>', '', content)
                 # 处理常见的 HTML 实体
                 content = content.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        
        export_content.append({
            "title": chapter.title,
            "content": content,
            "volume": chapter.volume_number
        })
        
    # 生成文件
    filename = f"{work.title}"
    
    if export_req.format == "text":
        output = io.StringIO()
        output.write(f"{work.title}\n")
        if work.description:
            output.write(f"{work.description}\n")
        output.write("\n" + "="*20 + "\n\n")
        
        current_volume = None
        for item in export_content:
            if item['volume'] != current_volume and item['volume'] is not None:
                current_volume = item['volume']
                output.write(f"\n\n## 第{current_volume}卷 ##\n\n")
                
            output.write(f"\n\n### {item['title']} ###\n\n")
            output.write(item['content'])
            output.write("\n")
            
        filename += ".txt"
        output.seek(0)
        # 必须编码为 bytes
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
        )
        
    elif export_req.format == "word":
        try:
            from docx import Document
            from docx.oxml.ns import qn
        except ImportError:
            raise HTTPException(status_code=500, detail="Word导出功能不可用：缺少python-docx依赖")

        # XML 1.0 只允许: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
        _xml_illegal = re.compile(
            r'[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]'
        )

        def sanitize(text: str) -> str:
            return _xml_illegal.sub('', text) if text else ''

        doc = Document()

        # 设置全局中文字体为仿宋
        doc.styles['Normal'].font.name = 'FangSong'
        doc.styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), 'FangSong')
        
        # 同样设置标题样式
        for style_name in ['Heading 1', 'Heading 2', 'Title']:
            if style_name in doc.styles:
                style = doc.styles[style_name]
                style.font.name = 'FangSong'
                style.element.rPr.rFonts.set(qn('w:eastAsia'), 'FangSong')

        doc.add_heading(sanitize(work.title), 0)

        if work.description:
            doc.add_paragraph(sanitize(work.description))

        doc.add_page_break()

        current_volume = None
        for item in export_content:
            if item['volume'] != current_volume and item['volume'] is not None:
                current_volume = item['volume']
                doc.add_heading(f"第{current_volume}卷", level=1)

            doc.add_heading(sanitize(item['title']), level=2)
            # 处理段落
            paragraphs = item['content'].split('\n')
            for p in paragraphs:
                cleaned = sanitize(p).strip()
                if cleaned:
                    doc.add_paragraph(cleaned)
            doc.add_page_break()
            
        output = io.BytesIO()
        doc.save(output)
        output.seek(0)
        filename += ".docx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
        )
        
    else:
        raise HTTPException(status_code=400, detail="不支持的导出格式")

@router.get("/public", response_model=WorkListResponse)
async def get_public_works(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    category: Optional[str] = Query(None, description="作品分类"),
    genre: Optional[str] = Query(None, description="作品流派"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    db: AsyncSession = Depends(get_db_session)
) -> Dict[str, Any]:
    """
    获取公开作品列表
    """
    work_service = WorkService(db)

    filters = {"is_public": True}
    if work_type:
        filters["work_type"] = work_type
    if category:
        filters["category"] = category
    if genre:
        filters["genre"] = genre
    if search:
        filters["search"] = search

    works, total = await work_service.get_public_works(
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    pages = (total + size - 1) // size if total > 0 else 0

    # 转换为符合 WorkListItem schema 的格式
    works_data = []
    for work in works:
        work_dict = work.to_dict()
        works_data.append({
            "id": work_dict["id"],
            "title": work_dict["title"],
            "subtitle": work_dict.get("subtitle"),
            "description": work_dict.get("description"),
            "work_type": work_dict["work_type"],
            "status": work_dict["status"],
            "cover_image_url": work_dict.get("cover_image_url"),
            "tags": work_dict.get("tags", []),
            "category": work_dict.get("category"),
            "genre": work_dict.get("genre"),
            "word_count": work_dict.get("word_count", 0),
            "chapter_count": work_dict.get("chapter_count", 0),
            "reading_time": work_dict.get("reading_time", 0),
            "is_public": work_dict.get("is_public", False),
            "is_collaborative": work_dict.get("is_collaborative", False),
            "created_at": work.created_at,  # 使用原始的 datetime 对象
            "updated_at": work.updated_at,  # 使用原始的 datetime 对象
        })

    return {
        "works": works_data,
        "pagination": {
            "total": total,
            "page": page,
            "size": size,
            "pages": pages
        }
    }


@router.get("/{work_id}", response_model=WorkResponse)
async def get_work(
    work_id: str,
    include_collaborators: bool = Query(False, description="是否包含协作者信息"),
    include_chapters: bool = Query(False, description="是否包含章节信息"),
    check_recovery: bool = Query(False, description="是否检查恢复建议"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品详情
    如果作品不存在但check_recovery=true，会检查ShareDB/MongoDB中是否有相关文档，返回恢复建议
    """
    work_service = WorkService(db)

    work = await work_service.get_work_by_id(work_id)
    if not work:
        # 如果请求检查恢复建议，检查ShareDB/MongoDB中是否有相关文档
        if check_recovery:
            from memos.api.services.sharedb_service import ShareDBService
            sharedb_service = ShareDBService()
            await sharedb_service.initialize()
            
            # 检查是否有该作品的章节文档
            # 查找格式为 work_{work_id}_chapter_{chapter_id} 的文档
            has_chapters_in_storage = False
            chapter_count = 0
            
            try:
                if sharedb_service.use_mongodb and sharedb_service.mongodb_db:
                    collection = sharedb_service.mongodb_db.documents
                    # 使用正则表达式查找该作品的所有章节文档
                    pattern = f"^work_{work_id}_chapter_"
                    count_result = await collection.count_documents({
                        "id": {"$regex": pattern}
                    })
                    chapter_count = count_result
                    has_chapters_in_storage = chapter_count > 0
                elif sharedb_service.redis_client:
                    # Redis中查找（需要遍历，性能较差，但作为备选方案）
                    # 这里简化处理，只返回提示信息
                    has_chapters_in_storage = False
            except Exception as e:
                logger.warning(f"检查ShareDB文档失败: {e}")
            
            if has_chapters_in_storage:
                # 尝试从章节文档的metadata中提取作品信息
                work_info_from_storage = None
                try:
                    if sharedb_service.use_mongodb and sharedb_service.mongodb_db:
                        collection = sharedb_service.mongodb_db.documents
                        # 获取第一个章节文档，从中提取作品信息
                        first_chapter_doc = await collection.find_one({
                            "id": {"$regex": f"^work_{work_id}_chapter_"}
                        })
                        if first_chapter_doc:
                            metadata = first_chapter_doc.get("metadata", {})
                            # 从metadata中提取作品信息
                            work_info_from_storage = {
                                "title": metadata.get("work_title") or f"待恢复的作品 {work_id}",
                                "description": metadata.get("work_description") or "",
                                "work_type": metadata.get("work_type") or "novel",
                                "category": metadata.get("work_category") or "",
                                "genre": metadata.get("work_genre") or "",
                                "is_public": metadata.get("work_is_public") or False,
                            }
                except Exception as e:
                    logger.warning(f"从存储中提取作品信息失败: {e}")
                
                # 返回恢复建议，而不是404错误
                recovery_response = {
                    "id": work_id,
                    "needs_recovery": True,
                    "recovery_info": {
                        "work_id": work_id,
                        "has_chapters_in_storage": True,
                        "chapter_count": chapter_count,
                        "message": f"作品 {work_id} 在数据库中不存在，但在存储中发现 {chapter_count} 个章节文档，可以从本地缓存恢复",
                        "work_info_from_storage": work_info_from_storage,
                    },
                    "title": work_info_from_storage.get("title") if work_info_from_storage else f"待恢复的作品 {work_id}",
                    "description": work_info_from_storage.get("description") if work_info_from_storage else "该作品需要从本地缓存恢复",
                    "work_type": work_info_from_storage.get("work_type") if work_info_from_storage else "novel",
                    "status": "draft",
                    "word_count": 0,
                    "chapter_count": chapter_count,
                    "is_public": work_info_from_storage.get("is_public") if work_info_from_storage else False,
                    "category": work_info_from_storage.get("category") if work_info_from_storage else "",
                    "genre": work_info_from_storage.get("genre") if work_info_from_storage else "",
                    "created_at": None,
                    "updated_at": None,
                }
                return recovery_response
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查访问权限
    if not await work_service.can_access_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )

    return work.to_dict(
        include_collaborators=include_collaborators
    )


@router.post("/{work_id}/recover", response_model=WorkResponse)
async def recover_work(
    work_id: str,
    work_data: Optional[WorkCreate] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    恢复作品
    如果作品不存在，可以使用此接口从本地缓存或存储中恢复作品
    可以传递作品信息（work_data），如果不传递，会尝试从存储中提取
    """
    work_service = WorkService(db)
    
    # 检查作品是否已存在
    existing_work = await work_service.get_work_by_id(work_id)
    if existing_work:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"作品 {work_id} 已存在，无需恢复"
        )
    
    # 如果没有传递作品信息，尝试从存储中提取
    if not work_data:
        from memos.api.services.sharedb_service import ShareDBService
        sharedb_service = ShareDBService()
        await sharedb_service.initialize()
        
        work_info_from_storage = None
        chapter_count = 0
        
        try:
            if sharedb_service.use_mongodb and sharedb_service.mongodb_db:
                collection = sharedb_service.mongodb_db.documents
                # 查找该作品的所有章节文档
                pattern = f"^work_{work_id}_chapter_"
                chapter_docs = await collection.find({
                    "id": {"$regex": pattern}
                }).to_list(length=1)
                
                chapter_count = await collection.count_documents({
                    "id": {"$regex": pattern}
                })
                
                if chapter_docs:
                    first_chapter_doc = chapter_docs[0]
                    metadata = first_chapter_doc.get("metadata", {})
                    # 从metadata中提取作品信息
                    work_info_from_storage = {
                        "title": metadata.get("work_title") or f"待恢复的作品 {work_id}",
                        "description": metadata.get("work_description") or "",
                        "work_type": metadata.get("work_type") or "novel",
                        "category": metadata.get("work_category") or "",
                        "genre": metadata.get("work_genre") or "",
                        "is_public": metadata.get("work_is_public") or False,
                    }
        except Exception as e:
            logger.warning(f"从存储中提取作品信息失败: {e}")
        
        # 如果从存储中提取到了作品信息，使用它
        if work_info_from_storage:
            work_data = WorkCreate(
                title=work_info_from_storage["title"],
                description=work_info_from_storage["description"],
                work_type=work_info_from_storage["work_type"],
                category=work_info_from_storage.get("category"),
                genre=work_info_from_storage.get("genre"),
                is_public=work_info_from_storage.get("is_public", False),
            )
        else:
            # 如果无法从存储中提取，使用默认值
            work_data = WorkCreate(
                title=f"恢复的作品 {work_id}",
                description="该作品从本地缓存恢复",
                work_type="novel",
            )
    
    # 创建作品，保持原有的 work_id（如果可能）
    # 注意：如果指定的 ID 已存在，数据库会报错，此时需要让数据库自动分配新 ID
    work_data_dict = work_data.dict()
    work_data_dict["id"] = work_id  # 尝试使用原有的 work_id
    
    try:
        work = await work_service.create_work(
            owner_id=current_user_id,
            **work_data_dict
        )
    except Exception as e:
        # 如果指定的 ID 已存在或不可用，移除 id 让数据库自动分配
        logger.warning(f"无法使用指定的 work_id={work_id}，将使用自动分配的 ID: {e}")
        work_data_dict.pop("id", None)
        work = await work_service.create_work(
            owner_id=current_user_id,
            **work_data_dict
        )
    
    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="recover",
        target_type="work",
        target_id=work.id,
        details={
            "original_work_id": work_id,
            "title": work.title,
            "work_type": work.work_type,
            "recovered_from": "cache_or_storage"
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )
    
    logger.info(f"✅ 作品恢复成功: 原ID={work_id}, 新ID={work.id}, 标题={work.title}")
    
    return work.to_dict()


@router.put("/{work_id}", response_model=WorkResponse)
async def update_work(
    work_id: str,
    work_update: WorkUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新作品信息
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 更新作品
    updated_work = await work_service.update_work(
        work_id=work_id,
        **work_update.dict(exclude_unset=True)
    )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="update",
        target_type="work",
        target_id=work_id,
        details=work_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return updated_work.to_dict()


@router.delete("/{work_id}")
async def delete_work(
    work_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    删除作品
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查删除权限（只有所有者可以删除）
    if work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有作品所有者可以删除作品"
        )

    # 删除作品
    await work_service.delete_work(work_id)

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="delete",
        target_type="work",
        target_id=work_id,
        details={"title": work.title},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {"message": "作品删除成功"}


@router.post("/{work_id}/publish")
async def publish_work(
    work_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    发布作品
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有发布该作品的权限"
        )

    # 发布作品
    published_work = await work_service.publish_work(work_id)

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="publish",
        target_type="work",
        target_id=work_id,
        details={"title": work.title},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return published_work.to_dict()


@router.post("/{work_id}/archive")
async def archive_work(
    work_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    归档作品
    """
    work_service = WorkService(db)

    # 检查作品是否存在
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有归档该作品的权限"
        )

    # 归档作品
    archived_work = await work_service.archive_work(work_id)

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="archive",
        target_type="work",
        target_id=work_id,
        details={"title": work.title},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return archived_work.to_dict()


# 协作者管理
@router.get("/{work_id}/collaborators", response_model=List[WorkCollaboratorResponse])
async def get_work_collaborators(
    work_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> List[Dict[str, Any]]:
    """
    获取作品协作者列表
    """
    work_service = WorkService(db)

    # 检查访问权限
    if not await work_service.can_access_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )

    collaborators = await work_service.get_work_collaborators(work_id)
    return [collaborator.to_dict() for collaborator in collaborators]


@router.post("/{work_id}/collaborators", response_model=WorkCollaboratorResponse)
async def add_collaborator(
    work_id: str,
    collaborator_data: WorkCollaboratorCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    添加协作者
    """
    work_service = WorkService(db)

    # 检查编辑权限
    if not await work_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有添加协作者的权限"
        )

    # 检查目标用户是否存在
    target_user = await work_service.get_user_by_username_or_email(
        collaborator_data.username_or_email
    )
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )

    # 添加协作者
    collaborator = await work_service.add_collaborator(
        work_id=work_id,
        user_id=target_user.id,
        permission=collaborator_data.permission,
        role=collaborator_data.role,
        invited_by=current_user_id
    )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="add_collaborator",
        target_type="work",
        target_id=work_id,
        details={
            "collaborator_user_id": target_user.id,
            "permission": collaborator_data.permission
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return collaborator.to_dict()


@router.put("/{work_id}/collaborators/{user_id}", response_model=WorkCollaboratorResponse)
async def update_collaborator(
    work_id: str,
    user_id: str,
    collaborator_update: WorkCollaboratorUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新协作者权限
    """
    work_service = WorkService(db)

    # 检查是否为所有者
    work = await work_service.get_work_by_id(work_id)
    if not work or work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有作品所有者可以修改协作者权限"
        )

    # 更新协作者
    collaborator = await work_service.update_collaborator(
        work_id=work_id,
        user_id=user_id,
        **collaborator_update.dict(exclude_unset=True)
    )

    if not collaborator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="协作者不存在"
        )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="update_collaborator",
        target_type="work",
        target_id=work_id,
        details={
            "collaborator_user_id": user_id,
            **collaborator_update.dict(exclude_unset=True)
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return collaborator.to_dict()


@router.delete("/{work_id}/collaborators/{user_id}")
async def remove_collaborator(
    work_id: str,
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    移除协作者
    """
    work_service = WorkService(db)

    # 检查是否为所有者
    work = await work_service.get_work_by_id(work_id)
    if not work or work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有作品所有者可以移除协作者"
        )

    # 移除协作者
    success = await work_service.remove_collaborator(work_id=work_id, user_id=user_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="协作者不存在"
        )

    # 记录审计日志
    await work_service.create_audit_log(
        user_id=current_user_id,
        action="remove_collaborator",
        target_type="work",
        target_id=work_id,
        details={"collaborator_user_id": user_id},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {"message": "协作者移除成功"}


# 工具函数
def get_client_ip(request: Request) -> Optional[str]:
    """获取客户端IP地址"""
    return request.client.host if request.client else None


def get_user_agent(request: Request) -> Optional[str]:
    """获取用户代理"""
    return request.headers.get("user-agent")