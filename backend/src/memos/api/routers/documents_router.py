"""
文档接口适配器
将前端的 /api/documents/ 接口映射到后端的 /api/v1/works/ 接口
保持前端代码不变，通过适配器实现接口兼容
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.core.database import get_async_db
from memos.api.services.work_service import WorkService
from memos.api.schemas.work import WorkCreate, WorkUpdate
from memos.api.models.work import Work

router = APIRouter(prefix="/api/documents", tags=["文档管理"])


def _work_to_document(work: Work, user_id: str) -> Dict[str, Any]:
    """将 Work 模型转换为 Document 格式（前端期望的格式）"""
    work_dict = work.to_dict()
    return {
        "id": str(work.id),
        "user_id": user_id,
        "title": work.title or "未命名文档",
        "content": "",  # 文档内容通常存储在章节中，这里返回空字符串
        "created_at": work_dict.get("created_at"),
        "updated_at": work_dict.get("updated_at"),
        "mem_cube_id": None,  # 暂时不支持 mem_cube_id
    }


@router.post("/", response_model=Dict[str, Any])
async def create_document(
    request: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_async_db),
) -> Dict[str, Any]:
    """
    创建新文档（映射到作品）
    """
    try:
        user_id = request.get("user_id", "1")
        title = request.get("title", "未命名文档")
        content = request.get("content", "")
        mem_cube_id = request.get("mem_cube_id")
        
        # 将 user_id 字符串转换为整数（如果可能）
        owner_id = int(user_id) if str(user_id).isdigit() else 1
        
        work_service = WorkService(db)
        
        # 创建作品（作为文档）
        work_data = WorkCreate(
            title=title or "未命名文档",
            work_type="novel",  # 默认类型为小说
            status="draft",
            description="",
        )
        
        work = await work_service.create_work(
            owner_id=owner_id,
            **work_data.dict()
        )
        
        # 如果有内容，创建第一个章节
        if content:
            from memos.api.services.chapter_service import ChapterService
            from memos.api.services.sharedb_service import ShareDBService
            chapter_service = ChapterService(db)
            chapter = await chapter_service.create_chapter(
                work_id=work.id,
                title="第一章",
                chapter_number=1,
                content=content,  # 这个content会传递给ShareDB
            )
            # 确保ShareDB中有内容
            try:
                sharedb_service = ShareDBService()
                await sharedb_service.initialize()
                await sharedb_service.create_document(
                    document_id=f"chapter_{chapter.id}",
                    initial_content={
                        "title": chapter.title,
                        "content": content,
                        "metadata": {
                            "work_id": work.id,
                            "chapter_number": 1,
                        }
                    }
                )
            except Exception:
                pass  # ShareDB不可用时忽略
        
        return {
            "code": 200,
            "message": "创建成功",
            "data": _work_to_document(work, str(user_id)),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"创建文档失败: {str(e)}"
        )


@router.get("/", response_model=Dict[str, Any])
async def list_documents(
    user_id: str = Query(..., description="用户ID"),
    mem_cube_id: Optional[str] = Query(None, description="MemCube ID"),
    db: AsyncSession = Depends(get_async_db),
) -> Dict[str, Any]:
    """
    获取文档列表（映射到作品列表）
    """
    try:
        owner_id = int(user_id) if user_id.isdigit() else 1
        
        work_service = WorkService(db)
        works, total = await work_service.get_user_works(
            user_id=owner_id,
            filters={},
            page=1,
            size=100,  # 返回所有文档
            sort_by="created_at",
            sort_order="desc"
        )
        
        documents = [
            _work_to_document(work, user_id)
            for work in works
        ]
        
        return {
            "code": 200,
            "message": "获取成功",
            "data": documents,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取文档列表失败: {str(e)}"
        )


@router.get("/{doc_id}", response_model=Dict[str, Any])
async def get_document(
    doc_id: str,
    user_id: str = Query(..., description="用户ID"),
    mem_cube_id: Optional[str] = Query(None, description="MemCube ID"),
    db: AsyncSession = Depends(get_async_db),
) -> Dict[str, Any]:
    """
    获取单个文档（映射到作品）
    """
    try:
        work_id = int(doc_id)
        owner_id = int(user_id) if user_id.isdigit() else 1
        
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        
        if not work:
            raise HTTPException(
                status_code=404,
                detail="文档不存在"
            )
        
        # 检查权限
        if work.owner_id != owner_id:
            raise HTTPException(
                status_code=403,
                detail="无权访问此文档"
            )
        
        # 获取第一个章节的内容作为文档内容（从ShareDB获取）
        content = ""
        if work.chapters and len(work.chapters) > 0:
            first_chapter = work.chapters[0]
            try:
                from memos.api.services.sharedb_service import ShareDBService
                sharedb_service = ShareDBService()
                await sharedb_service.initialize()
                doc = await sharedb_service.get_document(f"chapter_{first_chapter.id}")
                if doc:
                    content = doc.get("content", "") or ""
            except Exception:
                # 如果ShareDB不可用，返回空内容
                content = ""
        
        document = _work_to_document(work, user_id)
        document["content"] = content
        
        return {
            "code": 200,
            "message": "获取成功",
            "data": document,
        }
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="无效的文档ID"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"获取文档失败: {str(e)}"
        )


@router.put("/{doc_id}", response_model=Dict[str, Any])
async def update_document(
    doc_id: str,
    updates: Dict[str, Any] = Body(...),
    user_id: str = Query(..., description="用户ID"),
    mem_cube_id: Optional[str] = Query(None, description="MemCube ID"),
    db: AsyncSession = Depends(get_async_db),
) -> Dict[str, Any]:
    """
    更新文档（映射到作品）
    """
    try:
        work_id = int(doc_id)
        owner_id = int(user_id) if user_id.isdigit() else 1
        
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        
        if not work:
            raise HTTPException(
                status_code=404,
                detail="文档不存在"
            )
        
        # 检查权限
        if work.owner_id != owner_id:
            raise HTTPException(
                status_code=403,
                detail="无权修改此文档"
            )
        
        # 更新作品信息
        update_data = {}
        if "title" in updates:
            update_data["title"] = updates["title"]
        
        updated_work = await work_service.update_work(
            work_id=work_id,
            **update_data
        )
        
        # 如果更新了内容，更新第一个章节（通过ShareDB）
        if "content" in updates and updates["content"]:
            from memos.api.services.chapter_service import ChapterService
            from memos.api.services.sharedb_service import ShareDBService
            chapter_service = ChapterService(db)
            
            if work.chapters and len(work.chapters) > 0:
                # 更新第一个章节的ShareDB内容
                first_chapter = work.chapters[0]
                try:
                    sharedb_service = ShareDBService()
                    await sharedb_service.initialize()
                    await sharedb_service.update_document(
                        document_id=f"chapter_{first_chapter.id}",
                        updates={"content": updates["content"]}
                    )
                except Exception:
                    pass  # ShareDB不可用时忽略
            else:
                # 创建第一个章节
                chapter = await chapter_service.create_chapter(
                    work_id=work_id,
                    title="第一章",
                    chapter_number=1,
                    content=updates["content"],
                )
                # 在ShareDB中创建文档
                try:
                    sharedb_service = ShareDBService()
                    await sharedb_service.initialize()
                    await sharedb_service.create_document(
                        document_id=f"chapter_{chapter.id}",
                        initial_content={
                            "title": chapter.title,
                            "content": updates["content"],
                            "metadata": {
                                "work_id": work_id,
                                "chapter_number": 1,
                            }
                        }
                    )
                except Exception:
                    pass  # ShareDB不可用时忽略
        
        document = _work_to_document(updated_work, user_id)
        if "content" in updates:
            document["content"] = updates["content"]
        
        return {
            "code": 200,
            "message": "更新成功",
            "data": document,
        }
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="无效的文档ID"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"更新文档失败: {str(e)}"
        )


@router.delete("/{doc_id}", response_model=Dict[str, Any])
async def delete_document(
    doc_id: str,
    user_id: str = Query(..., description="用户ID"),
    mem_cube_id: Optional[str] = Query(None, description="MemCube ID"),
    db: AsyncSession = Depends(get_async_db),
) -> Dict[str, Any]:
    """
    删除文档（映射到作品）
    """
    try:
        work_id = int(doc_id)
        owner_id = int(user_id) if user_id.isdigit() else 1
        
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        
        if not work:
            raise HTTPException(
                status_code=404,
                detail="文档不存在"
            )
        
        # 检查权限
        if work.owner_id != owner_id:
            raise HTTPException(
                status_code=403,
                detail="无权删除此文档"
            )
        
        await work_service.delete_work(work_id)
        
        return {
            "code": 200,
            "message": "删除成功",
            "data": None,
        }
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="无效的文档ID"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"删除文档失败: {str(e)}"
        )

