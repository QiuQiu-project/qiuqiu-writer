"""
AI接口路由
提供章节分析、健康检查和默认提示词接口
"""

import traceback
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.ai_models import (
    AnalyzeChapterRequest,
    AnalyzeChapterByFileRequest,
    CreateWorkFromFileRequest,
    GenerateChapterContentRequest,
    DefaultPromptData,
    DefaultPromptResponse,
    ErrorResponse,
    HealthCheckData,
    HealthCheckResponse,
    AnalysisSettings,
)
from memos.api.core.database import get_async_db
from memos.api.services.ai_service import get_ai_service
from memos.api.services.book_analysis_service import BookAnalysisService
from memos.api.services.chapter_service import ChapterService
from memos.api.services.sharedb_service import ShareDBService
from memos.api.routers.auth_router import get_current_user_id
from memos.log import get_logger


logger = get_logger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Analysis"])


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


@router.post(
    "/analyze-chapters-incremental",
    summary="逐章渐进式分析接口",
    description="逐章分析小说内容，每分析完一章就立即插入到目标作品中（包括角色、地点、章节）",
    responses={
        200: {"description": "分析成功，返回JSON响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_chapters_incremental(
    request: AnalyzeChapterRequest,
    work_id: int = Query(..., description="目标作品ID"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    逐章渐进式分析，每分析完一章就立即插入到目标作品中
    
    Args:
        request: 章节分析请求（content应包含多章内容，用分隔符分开）
        work_id: 目标作品ID
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        JSONResponse: JSON格式的分析结果
    """
    try:
        # 验证请求参数
        if not request.content or len(request.content.strip()) == 0:
            raise HTTPException(status_code=400, detail="章节内容不能为空")

        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

        # 获取拆书分析服务
        book_analysis_service = BookAnalysisService(db)
        
        # 检查作品权限
        from memos.api.services.work_service import WorkService
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        if not work:
            raise HTTPException(status_code=404, detail="作品不存在")
        if work.owner_id != current_user_id:
            raise HTTPException(status_code=403, detail="没有权限编辑该作品")

        # 获取增强的prompt模板
        prompt_template = await book_analysis_service.get_default_prompt_template("book_analysis")
        if prompt_template:
            enhanced_prompt_template = prompt_template.prompt_content
        else:
            enhanced_prompt_template = book_analysis_service.get_enhanced_book_analysis_prompt()

        # 获取分析设置
        settings = request.settings or AnalyzeChapterRequest.model_fields["settings"].default_factory()

        # 分割章节内容（假设章节之间用空行或特定标记分隔）
        # 这里需要根据实际章节格式来分割
        chapters_content = book_analysis_service.split_chapters_content(request.content)

        logger.info(
            f"Received incremental chapter analysis request: "
            f"work_id={work_id}, "
            f"chapters_count={len(chapters_content)}, "
            f"model={settings.model}"
        )

        # 执行非流式分析
        try:
            accumulated_content = ""  # 累积的章节内容
            results = []  # 存储每章的分析结果
            errors = []  # 存储错误信息
            
            for idx, chapter_content in enumerate(chapters_content, 1):
                try:
                    # 累积当前章节内容
                    accumulated_content += chapter_content + "\n\n"
                    
                    # 构建包含所有已分析章节的prompt
                    # 使用 replace 而不是 format，避免 JSON 示例中的大括号被误解析
                    full_prompt = enhanced_prompt_template.replace("{content}", accumulated_content)
                    
                    logger.info(f"开始分析第 {idx} 章")
                    
                    # 分析当前累积的内容
                    full_response = await ai_service.analyze_chapter_stream(
                        content=accumulated_content,
                        prompt=full_prompt,
                        system_prompt=None,  # 使用默认 system_prompt
                        model=settings.model,
                        temperature=settings.temperature,
                        max_tokens=settings.max_tokens * 2,
                    )
                    
                    # 解析AI响应并渐进式插入
                    analysis_data = book_analysis_service.parse_ai_response(full_response)
                    
                    if not analysis_data:
                        raise ValueError(f"无法解析第 {idx} 章的AI响应，可能返回的不是有效的JSON格式")
                    
                    # 渐进式插入到作品
                    result = await book_analysis_service.incremental_insert_to_work(
                        work_id=work_id,
                        analysis_data=analysis_data,
                        user_id=current_user_id,
                        chapter_index=idx
                    )
                    
                    results.append({
                        "chapter_index": idx,
                        "message": f"第 {idx} 章分析完成并已插入作品",
                        "data": result
                    })
                    logger.info(f"✅ 第 {idx} 章分析完成并已插入作品")
                    
                except Exception as e:
                    logger.error(f"渐进式插入失败 (章节 {idx}): {traceback.format_exc()}")
                    errors.append({
                        "chapter_index": idx,
                        "message": f"第 {idx} 章插入失败: {str(e)}",
                        "error": str(e)
                    })
            
            # 返回JSON响应
            from fastapi.responses import JSONResponse
            return JSONResponse({
                "success": True,
                "message": f"所有章节分析完成，共 {len(chapters_content)} 章",
                "total_chapters": len(chapters_content),
                "results": results,
                "errors": errors,
                "success_count": len(results),
                "error_count": len(errors)
            })
                        
        except Exception as e:
            logger.error(f"Error in incremental analysis: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze chapters incrementally: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/analyze-work-chapters",
    summary="分析作品所有章节接口",
    description="直接分析作品的所有章节，后端自动获取章节内容并逐章处理（非流式响应）",
    responses={
        200: {"description": "分析成功，返回JSON响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_work_chapters(
    work_id: int = Query(..., description="作品ID"),
    settings: Optional[AnalysisSettings] = None,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    分析作品的所有章节，后端自动获取章节内容并逐章处理
    
    Args:
        work_id: 作品ID
        settings: 分析设置（可选）
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        JSONResponse: JSON格式的分析结果
    """
    try:
        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

        # 获取服务
        book_analysis_service = BookAnalysisService(db)
        chapter_service = ChapterService(db)
        sharedb_service = ShareDBService()
        await sharedb_service.initialize()
        
        # 检查作品权限
        from memos.api.services.work_service import WorkService
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        if not work:
            raise HTTPException(status_code=404, detail="作品不存在")
        if work.owner_id != current_user_id:
            raise HTTPException(status_code=403, detail="没有权限编辑该作品")

        # 获取所有章节（不分页，获取全部）
        chapters, total = await chapter_service.get_chapters(
            filters={"work_id": work_id},
            page=1,
            size=10000,  # 设置一个很大的值以获取所有章节
            sort_by="chapter_number",
            sort_order="asc"
        )
        
        if total == 0:
            raise HTTPException(status_code=400, detail="该作品没有章节")

        # 获取增强的prompt模板
        prompt_template_obj = await book_analysis_service.get_default_prompt_template("book_analysis")
        if prompt_template_obj:
            enhanced_prompt_template = prompt_template_obj.prompt_content
        else:
            enhanced_prompt_template = book_analysis_service.get_enhanced_book_analysis_prompt()

        # 获取分析设置
        if settings:
            analysis_settings = settings
        else:
            analysis_settings = AnalysisSettings()

        logger.info(
            f"Received work chapters analysis request: "
            f"work_id={work_id}, "
            f"chapters_count={total}, "
            f"model={analysis_settings.model}"
        )

        # 执行非流式分析
        try:
            import json
            
            logger.info(f"开始分析作品《{work.title}》的所有章节，共 {total} 章")
            
            accumulated_content = ""  # 累积的章节内容
            results = []  # 存储每章的分析结果
            skipped = []  # 存储跳过的章节
            errors = []  # 存储错误信息
            
            for idx, chapter in enumerate(chapters, 1):
                # 获取章节内容
                chapter_content = ""
                try:
                    # 优先从 ShareDB 获取
                    document_id_new = f"work_{work_id}_chapter_{chapter.id}"
                    document_id_old = f"chapter_{chapter.id}"
                    
                    document = await sharedb_service.get_document(document_id_new)
                    if not document:
                        document = await sharedb_service.get_document(document_id_old)
                    
                    if document:
                        content = document.get("content", "")
                        if isinstance(content, dict):
                            # 如果是对象，尝试提取内容
                            content = content.get("content", "") or json.dumps(content, ensure_ascii=False)
                        elif not isinstance(content, str):
                            content = str(content)
                        chapter_content = content
                    else:
                        # 如果 ShareDB 没有，尝试从章节元数据获取
                        if chapter.chapter_metadata and isinstance(chapter.chapter_metadata, dict):
                            chapter_content = chapter.chapter_metadata.get("content", "")
                        
                        if not chapter_content:
                            logger.warning(f"章节 {chapter.id} 没有找到内容，跳过")
                            skipped.append({
                                "chapter_index": idx,
                                "chapter_id": chapter.id,
                                "chapter_number": chapter.chapter_number,
                                "chapter_title": chapter.title,
                                "message": f"第 {idx} 章《{chapter.title}》没有内容，跳过"
                            })
                            continue
                except Exception as e:
                    logger.error(f"获取章节 {chapter.id} 内容失败: {traceback.format_exc()}")
                    errors.append({
                        "chapter_index": idx,
                        "chapter_id": chapter.id,
                        "message": f"第 {idx} 章《{chapter.title}》获取内容失败: {str(e)}",
                        "error": str(e)
                    })
                    continue
                
                try:
                    # 累积当前章节内容
                    accumulated_content += f"第{chapter.chapter_number}章 {chapter.title}\n\n{chapter_content}\n\n"
                    
                    # 构建包含所有已分析章节的prompt
                    # 使用 replace 而不是 format，避免 JSON 示例中的大括号被误解析
                    full_prompt = enhanced_prompt_template.replace("{content}", accumulated_content)
                    
                    logger.info(f"开始分析第 {idx} 章《{chapter.title}》")
                    
                    # 分析当前累积的内容
                    full_response = await ai_service.analyze_chapter_stream(
                        content=accumulated_content,
                        prompt=full_prompt,
                        system_prompt=None,  # 使用默认 system_prompt
                        model=analysis_settings.model,
                        temperature=analysis_settings.temperature,
                        max_tokens=analysis_settings.max_tokens * 2,
                    )
                    
                    # 解析AI响应并渐进式插入
                    analysis_data = book_analysis_service.parse_ai_response(full_response)
                    
                    if not analysis_data:
                        raise ValueError(f"无法解析第 {idx} 章的AI响应，可能返回的不是有效的JSON格式")
                    
                    # 渐进式插入到作品
                    result = await book_analysis_service.incremental_insert_to_work(
                        work_id=work_id,
                        analysis_data=analysis_data,
                        user_id=current_user_id,
                        chapter_index=idx
                    )
                    
                    results.append({
                        "chapter_index": idx,
                        "chapter_id": chapter.id,
                        "chapter_number": chapter.chapter_number,
                        "chapter_title": chapter.title,
                        "message": f"第 {idx} 章《{chapter.title}》分析完成并已插入作品",
                        "data": result
                    })
                    logger.info(f"✅ 第 {idx} 章《{chapter.title}》分析完成并已插入作品")
                    
                except Exception as e:
                    logger.error(f"渐进式插入失败 (章节 {idx}): {traceback.format_exc()}")
                    errors.append({
                        "chapter_index": idx,
                        "chapter_id": chapter.id,
                        "message": f"第 {idx} 章《{chapter.title}》插入失败: {str(e)}",
                        "error": str(e)
                    })
            
            # 返回JSON响应
            from fastapi.responses import JSONResponse
            return JSONResponse({
                "success": True,
                "message": f"所有章节分析完成，共 {total} 章",
                "total_chapters": total,
                "results": results,
                "skipped": skipped,
                "errors": errors,
                "success_count": len(results),
                "skipped_count": len(skipped),
                "error_count": len(errors)
            })
                        
        except Exception as e:
            logger.error(f"Error in work chapters analysis: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze work chapters: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.get(
    "/health",
    summary="健康检查接口",
    description="检查AI服务是否可用",
    response_model=HealthCheckResponse,
    responses={
        200: {"model": HealthCheckResponse, "description": "服务正常"},
        500: {"model": ErrorResponse, "description": "服务异常"},
    },
)
async def health_check():
    """
    健康检查

    Returns:
        HealthCheckResponse: 服务状态信息
    """
    try:
        ai_service = get_ai_service()

        # 获取当前时间（ISO 8601格式）
        current_time = datetime.now(timezone.utc).isoformat()

        # 检查服务状态
        is_healthy = ai_service.is_healthy()
        status = "healthy" if is_healthy else "unhealthy"

        # 获取可用模型列表
        available_models = ai_service.get_available_models()

        health_data = HealthCheckData(
            status=status, models=available_models, timestamp=current_time
        )

        logger.info(f"Health check: status={status}, models={len(available_models)}")

        return HealthCheckResponse(
            code=200,
            message="服务正常" if is_healthy else "服务不可用",
            data=health_data,
        )

    except Exception as e:
        logger.error(f"Health check failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"健康检查失败: {str(e)}")



@router.post(
    "/analyze-book",
    summary="增强拆书分析接口",
    description="对小说内容进行增强分析，识别角色、地图、章节大纲和细纲，并可直接创建作品（非流式响应）",
    responses={
        200: {"description": "分析成功，返回JSON响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_book(
    request: AnalyzeChapterRequest,
    auto_create_work: bool = False,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    对小说内容进行增强分析，可以识别角色、地图、章节大纲和细纲
    
    Args:
        request: 章节分析请求
        auto_create_work: 是否自动创建作品（从分析结果中提取）
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        JSONResponse: JSON格式的分析结果
    """
    try:
        # 验证请求参数
        if not request.content or len(request.content.strip()) == 0:
            raise HTTPException(status_code=400, detail="章节内容不能为空")

        # 获取AI服务
        ai_service = get_ai_service()

        # 检查服务状态
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

        # 获取拆书分析服务
        book_analysis_service = BookAnalysisService(db)
        
        # 获取增强的prompt模板
        prompt_template_obj = await book_analysis_service.get_default_prompt_template("book_analysis")
        if prompt_template_obj:
            # 使用数据库中的模板
            enhanced_prompt = prompt_template_obj.format_prompt(content=request.content)
        else:
            # 使用默认的增强prompt
            enhanced_prompt = book_analysis_service.get_enhanced_book_analysis_prompt().replace(
                "{content}", request.content
            )

        # 获取分析设置
        settings = request.settings or AnalyzeChapterRequest.model_fields["settings"].default_factory()

        logger.info(
            f"Received enhanced book analysis request: "
            f"content_length={len(request.content)}, "
            f"auto_create_work={auto_create_work}, "
            f"model={settings.model}"
        )

        # 执行非流式分析
        try:
            # 直接获取完整响应
            full_response = await ai_service.analyze_chapter_stream(
                content=request.content,
                prompt=enhanced_prompt,
                system_prompt=None,  # 使用默认 system_prompt
                model=settings.model,
                temperature=settings.temperature,
                max_tokens=settings.max_tokens * 2,  # 增强分析需要更多tokens
            )
            
            # 解析AI响应
            analysis_data = book_analysis_service.parse_ai_response(full_response)
            
            if not analysis_data:
                raise ValueError("无法解析AI响应，可能返回的不是有效的JSON格式")
            
            # 如果启用了自动创建作品，解析响应并创建作品
            work_result = None
            work_creation_error = None
            if auto_create_work:
                try:
                    # 创建作品
                    work_result = await book_analysis_service.create_work_from_analysis(
                        analysis_data=analysis_data,
                        user_id=current_user_id
                    )
                    logger.info("✅ 作品创建成功")
                except Exception as e:
                    logger.error(f"自动创建作品失败: {traceback.format_exc()}")
                    work_creation_error = str(e)
            
            # 返回JSON响应
            from fastapi.responses import JSONResponse
            return JSONResponse({
                "success": True,
                "message": "分析完成" + ("，作品已创建" if work_result else ""),
                "data": analysis_data,
                "work_created": work_result is not None,
                "work_result": work_result,
                "work_creation_error": work_creation_error
            })
                        
        except Exception as e:
            logger.error(f"Error in book analysis: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze book: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/analyze-chapter-by-file",
    summary="基于文件名的单章分析接口",
    description="根据文件名分析单章并插入到作品（如果作品不存在则创建），支持大纲和细纲",
    responses={
        200: {"description": "分析成功，返回流式响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_chapter_by_file(
    request: AnalyzeChapterByFileRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    根据文件名分析单章并插入到作品
    
    工作流程：
    1. 根据文件名查找作品（从work_metadata.source_file）
    2. 如果不存在，创建新作品（标题=文件名）
    3. 检查章节是否已存在（避免重复）
    4. 调用AI分析章节内容（使用chapter_analysis prompt）
    5. 解析AI返回的JSON（包含大纲和细纲）
    6. 创建章节并保存大纲和细纲到chapter_metadata
    
    Args:
        request: 基于文件名的章节分析请求
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        StreamingResponse: 服务器发送事件流
    """
    try:
        # 验证请求参数
        if not request.content or len(request.content.strip()) == 0:
            raise HTTPException(status_code=400, detail="章节内容不能为空")
        if not request.file_name or len(request.file_name.strip()) == 0:
            raise HTTPException(status_code=400, detail="文件名不能为空")

        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

        # 获取拆书分析服务
        book_analysis_service = BookAnalysisService(db)
        
        # 获取分析设置
        settings_dict = {}
        if request.settings:
            settings_dict = {
                "model": request.settings.model,
                "temperature": request.settings.temperature,
                "max_tokens": request.settings.max_tokens,
            }

        logger.info(
            f"Received chapter-by-file analysis request: "
            f"file_name={request.file_name}, "
            f"chapter_number={request.chapter_number}, "
            f"volume_number={request.volume_number}, "
            f"content_length={len(request.content)}"
        )

        # 执行流式分析
        async def generate_analysis():
            """生成分析响应"""
            try:
                import json
                
                # 发送开始消息
                start_msg = json.dumps({
                    "type": "start",
                    "message": f"开始分析第 {request.chapter_number} 章"
                })
                yield f"data: {start_msg}\n\n"
                
                # 调用分析方法（这会处理作品查找/创建、AI分析、章节插入）
                try:
                    result = await book_analysis_service.analyze_and_insert_chapter_by_file(
                        file_name=request.file_name,
                        content=request.content,
                        chapter_number=request.chapter_number,
                        volume_number=request.volume_number,
                        user_id=current_user_id,
                        ai_service=ai_service,
                        prompt=request.prompt,
                        settings=settings_dict
                    )
                    
                    # 发送作品信息
                    if result.get("work_created"):
                        work_msg = json.dumps({
                            "type": "work_created",
                            "work_id": result["work_id"],
                            "work_title": result["work_title"],
                            "message": f"创建新作品: {result['work_title']}"
                        })
                    else:
                        work_msg = json.dumps({
                            "type": "work_found",
                            "work_id": result["work_id"],
                            "work_title": result["work_title"],
                            "message": f"找到已存在作品: {result['work_title']}"
                        })
                    yield f"data: {work_msg}\n\n"
                    
                    # 如果章节已存在，发送跳过消息
                    if result.get("skipped"):
                        skip_msg = json.dumps({
                            "type": "chapter_skipped",
                            "work_id": result["work_id"],
                            "work_title": result["work_title"],
                            "chapter_id": result["chapter_id"],
                            "chapter_number": result["chapter_number"],
                            "volume_number": result.get("volume_number"),
                            "title": result.get("title"),
                            "message": f"章节 {result['chapter_number']} 已存在，跳过创建"
                        })
                        yield f"data: {skip_msg}\n\n"
                    else:
                        # 发送章节创建成功消息
                        chapter_msg = json.dumps({
                            "type": "chapter_inserted",
                            "chapter_id": result["chapter_id"],
                            "chapter_number": result["chapter_number"],
                            "volume_number": result["volume_number"],
                            "title": result["title"],
                            "message": f"章节 {result['chapter_number']} 创建成功"
                        })
                        yield f"data: {chapter_msg}\n\n"
                    
                    # 发送最终结果
                    done_msg = json.dumps({
                        "type": "done",
                        "message": "分析完成",
                        "data": {
                            "work_id": result["work_id"],
                            "work_title": result["work_title"],
                            "chapter_id": result.get("chapter_id"),
                            "chapter_number": result["chapter_number"],
                            "volume_number": result["volume_number"],
                            "title": result.get("title"),
                            "outline": result.get("outline", {}),
                            "detailed_outline": result.get("detailed_outline", {}),
                        }
                    })
                    yield f"data: {done_msg}\n\n"
                    
                except ValueError as e:
                    # JSON解析错误等
                    error_msg = json.dumps({
                        "type": "error",
                        "message": f"分析失败: {str(e)}"
                    })
                    yield f"data: {error_msg}\n\n"
                except Exception as e:
                    logger.error(f"分析过程出错: {traceback.format_exc()}")
                    error_msg = json.dumps({
                        "type": "error",
                        "message": f"服务器错误: {str(e)}"
                    })
                    yield f"data: {error_msg}\n\n"
                        
            except Exception as e:
                logger.error(f"Error in analysis stream: {traceback.format_exc()}")
                import json
                error_data = json.dumps({"type": "error", "message": str(e)})
                yield f"data: {error_data}\n\n"

        return StreamingResponse(
            generate_analysis(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze chapter by file: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/generate-chapter-outlines",
    summary="逐章生成大纲和细纲接口",
    description="为作品的所有章节（或指定章节）逐章生成大纲和细纲，从work的metadata.component_data中获取characters和locations信息",
    responses={
        200: {"description": "生成成功，返回JSON格式结果"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def generate_chapter_outlines(
    work_id: int = Query(..., description="作品ID"),
    chapter_ids: Optional[str] = Query(None, description="指定要处理的章节ID列表（逗号分隔），如果不提供则处理所有章节"),
    prompt: Optional[str] = Query(None, description="自定义prompt（可选）"),
    settings: Optional[AnalysisSettings] = Body(None, embed=True, description="AI分析设置（可选）"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    为作品的所有章节（或指定章节）逐章生成大纲和细纲
    
    Args:
        work_id: 作品ID
        chapter_ids: 指定要处理的章节ID列表（逗号分隔，可选）
        prompt: 自定义prompt（可选）
        settings: AI分析设置（可选）
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        JSONResponse: JSON格式的生成结果
    """
    try:
        # 验证作品是否存在
        from memos.api.services.work_service import WorkService
        from fastapi.responses import JSONResponse
        
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        if not work:
            raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")
        
        # 检查权限
        chapter_service = ChapterService(db)
        if not await chapter_service.can_edit_work(user_id=current_user_id, work_id=work_id):
            raise HTTPException(status_code=403, detail="没有编辑该作品的权限")
        
        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")
        
        # 解析章节ID列表
        chapter_id_list = None
        if chapter_ids:
            try:
                chapter_id_list = [int(id.strip()) for id in chapter_ids.split(",") if id.strip()]
            except ValueError:
                raise HTTPException(status_code=400, detail="章节ID格式错误，应为逗号分隔的整数列表")
        
        # 获取分析设置
        analysis_settings = {}
        if settings:
            analysis_settings = {
                "model": settings.model,
                "temperature": settings.temperature,
                "max_tokens": settings.max_tokens,
            }
        
        # 获取拆书分析服务
        book_analysis_service = BookAnalysisService(db)
        
        logger.info(
            f"开始为作品 {work_id} 生成章节大纲和细纲，"
            f"章节数量: {len(chapter_id_list) if chapter_id_list else '全部'}"
        )
        
        # 收集所有章节的处理结果
        results = []
        total_chapters = 0
        success_count = 0
        error_count = 0
        
        # 收集所有章节的角色信息
        all_characters = []
        characters_extraction_errors = []
        
        try:
            # 逐章生成大纲和细纲
            async for result in book_analysis_service.generate_outlines_for_all_chapters(
                work_id=work_id,
                ai_service=ai_service,
                prompt=prompt,
                settings=analysis_settings,
                chapter_ids=chapter_id_list
            ):
                if "error" in result:
                    error_count += 1
                    results.append({
                        "chapter_id": result.get("chapter_id"),
                        "chapter_number": result.get("chapter_number"),
                        "index": result.get("index"),
                        "total": result.get("total"),
                        "error": result.get("error"),
                        "success": False
                    })
                else:
                    success_count += 1
                    chapter_id = result.get("chapter_id")
                    chapter_number = result.get("chapter_number")
                    
                    # 提取该章节的角色信息
                    chapter_characters = []
                    try:
                        # 获取章节内容
                        chapter_content = await book_analysis_service.get_chapter_content(chapter_id)
                        
                        if chapter_content:
                            logger.info(f"开始为章节 {chapter_id} 提取角色信息...")
                            
                            # 获取现有的 work 数据，特别是 component_data 结构
                            work_metadata = work.work_metadata or {}
                            component_data = work_metadata.get("component_data", {})
                            existing_characters = component_data.get("characters", [])
                            
                            # 构建现有数据的描述，用于指导模型生成合适的数据结构
                            existing_data_context = ""
                            if existing_characters:
                                import json
                                # 只展示前3个角色作为示例，避免 prompt 过长
                                example_characters = existing_characters[:3]
                                existing_data_context = f"""
# 现有作品数据结构参考
以下是该作品已有的角色数据结构示例（请参考此结构生成新角色数据）：

```json
{json.dumps(example_characters, ensure_ascii=False, indent=2)}
```

**重要提示：**
1. 新提取的角色数据应该与上述数据结构保持一致
2. 如果提取到已存在的角色（通过 name 字段匹配），请保持该角色的现有字段结构，只更新或补充新信息
3. 新角色的数据结构应该包含以下字段：name, display_name, type, gender, appearance, background, description, personality, display_name
4. 如果章节中出现了新角色，请按照上述数据结构格式生成完整的角色信息
"""
                            
                            # 获取角色状态提取的提示词模板
                            character_status_template = await book_analysis_service.get_default_prompt_template("character_status_extraction")
                            
                            if character_status_template:
                                # 从模板的 metadata 中提取 system_prompt 和 user_prompt
                                template_metadata = character_status_template.template_metadata or {}
                                character_system_prompt = template_metadata.get("system_prompt")
                                character_user_prompt = template_metadata.get("user_prompt")
                                
                                # 如果 metadata 中没有，则使用 prompt_content 作为 user_prompt
                                if not character_user_prompt:
                                    character_user_prompt = character_status_template.format_prompt(content=chapter_content)
                                else:
                                    # 如果 user_prompt 中有 {content} 变量，需要替换
                                    character_user_prompt = character_user_prompt.replace("{content}", chapter_content)
                                
                                # 在 user_prompt 中添加现有数据结构上下文
                                if existing_data_context:
                                    character_user_prompt = existing_data_context + "\n\n" + character_user_prompt
                            else:
                                # 使用默认的角色状态提取提示词
                                character_system_prompt = """# 角色
                                    你是一位专业的小说分析专家，擅长从章节内容中提取角色信息和他们的当前状态。

                                    # 任务
                                    请仔细分析以下章节内容，提取出所有出现的角色信息，包括：
                                    1. 角色的姓名、特征、性格
                                    2. 角色在本章中的状态（情绪、身体状况、心理状态等）
                                    3. 角色之间的关系和互动
                                    4. 角色的行为、动作、对话等

                                    # 输出格式要求
                                    **必须严格按照以下JSON格式输出，不要添加任何其他文字：**

                                    ```json
                                    {
                                    "characters": [
                                        {
                                        "name": "角色名称",
                                        "display_name": "显示名称",
                                        "type": "主要角色",
                                        "gender": "男/女",
                                        "description": "角色描述",
                                        "appearance": {},
                                        "background": {},
                                        "personality": {}
                                        }
                                    ]
                                    }
                                    ```

                                    # 重要提示
                                    1. **必须输出有效的JSON格式**，不要添加任何Markdown代码块标记外的文字
                                    2. 只提取本章中实际出现的角色
                                    3. 如果提供了现有角色数据结构参考，请按照该结构生成数据
                                    4. 新角色的数据结构应该包含：name, display_name, type, gender, appearance, background, description, personality
                                    5. 如果某个角色在本章中没有出现，不要包含在结果中

                                    # 章节内容
                                    {content}
                                    # 开始分析
                                    请严格按照上述JSON格式输出角色信息和状态："""
                                character_user_prompt = character_system_prompt.replace("{content}", chapter_content)
                                
                                # 在 user_prompt 中添加现有数据结构上下文
                                if existing_data_context:
                                    character_user_prompt = existing_data_context + "\n\n" + character_user_prompt
                            
                            # 调用AI服务提取角色信息
                            character_status_response = await ai_service.analyze_chapter_stream(
                                content=chapter_content,
                                prompt=character_user_prompt,
                                system_prompt=character_system_prompt,
                                model=analysis_settings.get("model"),
                                temperature=analysis_settings.get("temperature", 0.7),
                                max_tokens=analysis_settings.get("max_tokens", 4000),
                            )
                            
                            # 解析角色状态信息
                            logger.debug(f"开始解析章节 {chapter_id} 的角色信息，AI响应长度: {len(character_status_response)}")
                            character_status_data = book_analysis_service.parse_single_chapter_response(character_status_response)
                            
                            if character_status_data:
                                logger.debug(f"解析成功，数据键: {list(character_status_data.keys())}")
                                if character_status_data.get("characters"):
                                    chapter_characters = character_status_data.get("characters", [])
                                    logger.info(f"✅ 成功为章节 {chapter_id} 提取 {len(chapter_characters)} 个角色的状态信息")
                                    # 记录每个角色的名称
                                    for char in chapter_characters:
                                        char_name = char.get("name", "未知") if isinstance(char, dict) else "无效数据"
                                        logger.debug(f"  - 角色: {char_name}")
                                    all_characters.extend(chapter_characters)
                                else:
                                    logger.warning(f"⚠️ 章节 {chapter_id} 解析成功但未找到 characters 字段，数据键: {list(character_status_data.keys())}")
                            else:
                                logger.warning(f"⚠️ 章节 {chapter_id} 未提取到角色信息，解析返回 None")
                                logger.debug(f"AI响应内容（前500字符）: {character_status_response[:500]}")
                        else:
                            logger.warning(f"⚠️ 章节 {chapter_id} 内容为空，跳过角色提取")
                    except Exception as e:
                        logger.error(f"提取章节 {chapter_id} 的角色信息失败: {traceback.format_exc()}")
                        characters_extraction_errors.append({
                            "chapter_id": chapter_id,
                            "chapter_number": chapter_number,
                            "error": str(e)
                        })
                        # 角色提取失败不影响主流程，继续执行
                    
                    results.append({
                        "chapter_id": chapter_id,
                        "chapter_number": chapter_number,
                        "title": result.get("title"),
                        "index": result.get("index"),
                        "total": result.get("total"),
                        "outline": result.get("outline", {}),
                        "detailed_outline": result.get("detailed_outline", {}),
                        "characters_count": len(chapter_characters),
                        "success": True
                    })
                    total_chapters = result.get("total", 0)
            
            # 合并并保存角色信息到作品
            characters_saved = False
            characters_count = 0
            save_error = None
            
            if all_characters:
                try:
                    logger.info(f"开始保存 {len(all_characters)} 个角色信息到作品 {work_id}...")
                    logger.debug(f"所有提取的角色列表: {[char.get('name', '未知') if isinstance(char, dict) else '无效' for char in all_characters]}")
                    
                    # 合并角色信息（去重）
                    character_map = {}
                    skipped_count = 0
                    for char_data in all_characters:
                        if not isinstance(char_data, dict):
                            logger.warning(f"跳过无效的角色数据（不是字典）: {type(char_data)}")
                            skipped_count += 1
                            continue
                        char_name = char_data.get("name", "")
                        if char_name:
                            if char_name in character_map:
                                logger.debug(f"合并已存在的角色: {char_name}")
                                # 合并现有角色
                                existing_char = character_map[char_name]
                                # 深度合并
                                for key, value in char_data.items():
                                    if key in existing_char and isinstance(existing_char[key], dict) and isinstance(value, dict):
                                        existing_char[key].update(value)
                                    else:
                                        existing_char[key] = value
                            else:
                                logger.debug(f"添加新角色: {char_name}")
                                # 添加新角色
                                character_map[char_name] = char_data
                        else:
                            logger.warning(f"跳过没有 name 字段的角色数据: {char_data}")
                            skipped_count += 1
                    
                    if skipped_count > 0:
                        logger.warning(f"跳过了 {skipped_count} 个无效的角色数据")
                    
                    characters_count = len(character_map)
                    logger.info(f"合并后共有 {characters_count} 个唯一角色（跳过 {skipped_count} 个无效数据）")
                    
                    if characters_count > 0:
                        # 保存角色信息到作品的 metainfo 中
                        logger.info(f"准备保存 {characters_count} 个角色到作品 {work_id} 的 metainfo 中")
                        save_result = await book_analysis_service.incremental_insert_to_work(
                            work_id=work_id,
                            analysis_data={"characters": list(character_map.values())},
                            user_id=current_user_id,
                        )
                        # characters_processed 现在包含新增和更新的角色总数
                        processed_count = save_result.get("characters_processed", 0)
                        # 如果 processed_count 为 0，但 character_map 不为空，说明所有角色都已存在且没有更新
                        # 这种情况下，我们仍然认为保存成功（因为角色数据已经在数据库中）
                        if processed_count > 0:
                            characters_count = processed_count
                            characters_saved = True
                        elif len(character_map) > 0:
                            # 所有角色都已存在，虽然没有新处理，但数据已保存
                            characters_count = len(character_map)
                            characters_saved = True
                            logger.info(f"所有 {characters_count} 个角色都已存在于数据库中，无需新增或更新")
                        else:
                            characters_count = 0
                            characters_saved = False
                        
                        # 验证角色信息是否已保存到 work.work_metadata.component_data 中
                        if characters_saved:
                            # 重新查询 work 对象以获取最新数据（因为 incremental_insert_to_work 已经提交并刷新了）
                            from memos.api.services.work_service import WorkService
                            work_service = WorkService(db)
                            updated_work = await work_service.get_work_by_id(work_id)
                            if updated_work:
                                work_metadata = updated_work.work_metadata or {}
                                component_data = work_metadata.get("component_data", {})
                                saved_characters = component_data.get("characters", [])
                                logger.info(
                                    f"✅ 成功保存 {characters_count} 个角色信息到作品 {work_id} 的 component_data 中，"
                                    f"当前 component_data 中共有 {len(saved_characters)} 个角色"
                                )
                                # 更新 work 对象引用
                                work = updated_work
                            else:
                                logger.error(f"❌ 无法重新查询作品 {work_id}，无法验证保存结果")
                        else:
                            logger.warning(f"⚠️ 保存角色信息到作品 {work_id} 失败，可能没有新角色（characters_processed=0）")
                except Exception as e:
                    logger.error(f"保存角色信息到作品 metainfo 失败: {traceback.format_exc()}")
                    save_error = str(e)
            
            # 提交所有更改
            await db.commit()
            
            message_parts = [f"所有章节的大纲和细纲生成完成，成功: {success_count}，失败: {error_count}"]
            if characters_saved:
                message_parts.append(f"已保存 {characters_count} 个角色信息到作品")
            elif all_characters:
                message_parts.append(f"提取了 {len(all_characters)} 个角色信息，但保存失败")
            
            return JSONResponse({
                "success": True,
                "message": "；".join(message_parts),
                "work_id": work_id,
                "work_title": work.title,
                "total_chapters": total_chapters,
                "success_count": success_count,
                "error_count": error_count,
                "characters_extracted": len(all_characters),
                "characters_saved": characters_saved,
                "characters_count": characters_count,
                "characters_extraction_errors": characters_extraction_errors,
                "save_error": save_error,
                "results": results
            })
            
        except Exception as e:
            logger.error(f"生成大纲和细纲过程出错: {traceback.format_exc()}")
            # 回滚事务
            try:
                await db.rollback()
            except Exception as rollback_error:
                logger.error(f"回滚事务失败: {rollback_error}")
            
            raise HTTPException(status_code=500, detail=f"生成过程出错: {str(e)}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate chapter outlines: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/generate-chapter-content",
    summary="根据大纲和细纲生成章节内容",
    description="根据章节大纲和细纲，使用AI生成完整的章节内容（流式响应）",
    responses={
        200: {"description": "生成成功，返回流式响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def generate_chapter_content(
    request: GenerateChapterContentRequest,
):
    """
    根据大纲和细纲生成章节内容
    
    Args:
        request: 生成请求，包含大纲、细纲等信息
    
    Returns:
        StreamingResponse: 服务器发送事件流
    """
    try:
        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")
        
        # 获取分析设置
        analysis_settings = {}
        if request.settings:
            analysis_settings = {
                "model": request.settings.model,
                "temperature": request.settings.temperature,
                "max_tokens": request.settings.max_tokens,
            }
        
        # 构建生成提示词
        system_prompt = """# 角色
你是一位经验丰富的小说创作专家，擅长根据大纲和细纲创作引人入胜的章节内容。你能够将抽象的情节框架转化为生动、具体、富有画面感的文字。

# 任务
根据提供的大纲和细纲，创作完整的章节内容。内容应该：
1. 忠实于大纲和细纲的要求
2. 语言流畅自然，富有文学性
3. 情节发展合理，节奏适中
4. 人物形象鲜明，对话生动
5. 场景描写细致，画面感强
6. 字数控制在3000-5000字左右（除非大纲有特殊要求）

# 要求
- 直接输出章节正文内容，不要添加标题、说明等额外文字
- 使用段落分隔，每个段落之间用空行分隔
- 对话使用引号标注
- 保持一致的叙事风格和视角
"""
        
        # 构建用户提示词
        user_prompt_parts = []
        if request.chapter_title:
            user_prompt_parts.append(f"## 章节标题\n{request.chapter_title}\n")
        
        user_prompt_parts.append(f"## 章节大纲\n{request.outline}\n")
        user_prompt_parts.append(f"## 章节细纲\n{request.detailed_outline}\n")
        
        if request.characters:
            user_prompt_parts.append(f"## 出场人物\n{', '.join(request.characters)}\n")
        
        if request.locations:
            user_prompt_parts.append(f"## 剧情地点\n{', '.join(request.locations)}\n")
        
        user_prompt_parts.append("\n请根据以上大纲和细纲，创作完整的章节内容。")
        user_prompt = "\n".join(user_prompt_parts)
        
        logger.info(
            f"开始生成章节内容: "
            f"outline_length={len(request.outline)}, "
            f"detailed_outline_length={len(request.detailed_outline)}, "
            f"model={analysis_settings.get('model')}"
        )
        
        # 执行流式生成
        async def generate_content():
            """生成章节内容响应"""
            try:
                import json
                
                # 发送开始消息
                start_msg = json.dumps({
                    "type": "start",
                    "message": "开始生成章节内容..."
                })
                yield f"data: {start_msg}\n\n"
                
                # 流式生成内容（真正的流式响应）
                full_content = ""
                async for content_chunk in ai_service.generate_content_stream(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    model=analysis_settings.get("model"),
                    temperature=analysis_settings.get("temperature", 0.7),
                    max_tokens=analysis_settings.get("max_tokens", 8000),
                ):
                    # 累积内容
                    full_content += content_chunk
                    
                    # 实时发送内容块
                    chunk_msg = json.dumps({"type": "chunk", "content": content_chunk})
                    yield f"data: {chunk_msg}\n\n"
                
                # 发送完成消息
                done_msg = json.dumps({
                    "type": "done",
                    "message": "章节内容生成完成",
                    "content_length": len(full_content)
                })
                yield f"data: {done_msg}\n\n"
                
            except Exception as e:
                logger.error(f"生成章节内容过程出错: {traceback.format_exc()}")
                error_msg = json.dumps({
                    "type": "error",
                    "message": f"服务器错误: {str(e)}"
                })
                yield f"data: {error_msg}\n\n"
        
        return StreamingResponse(
            generate_content(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate chapter content: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/create-work-from-file",
    summary="从文件创建作品和章节",
    description="根据文件名和章节数据批量创建作品和章节（不进行AI分析）",
    responses={
        200: {"description": "创建成功"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
    },
)
async def create_work_from_file(
    request: CreateWorkFromFileRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    从文件创建作品和章节
    
    工作流程：
    1. 根据文件名查找作品（从work_metadata.source_file）
    2. 如果不存在，创建新作品（标题=文件名）
    3. 批量创建章节
    4. 将章节内容保存到 ShareDB
    
    Args:
        request: 从文件创建作品请求
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        Dict: 创建结果，包含作品ID、标题、创建的章节数等
    """
    try:
        from memos.api.services.work_service import WorkService
        from memos.api.services.chapter_service import ChapterService
        from memos.api.services.sharedb_service import ShareDBService
        
        work_service = WorkService(db)
        chapter_service = ChapterService(db)
        sharedb_service = ShareDBService()
        await sharedb_service.initialize()
        
        # 1. 根据文件名查找作品
        work = await work_service.find_work_by_filename(request.file_name, current_user_id)
        work_created = False
        
        if not work:
            # 2. 如果不存在，创建新作品
            # 从文件名提取标题（去掉扩展名）
            import os
            work_title = os.path.splitext(request.file_name)[0]
            
            work = await work_service.create_work(
                owner_id=current_user_id,
                title=work_title,
                work_type="novel",  # 默认类型
                work_metadata={
                    "source_file": request.file_name
                }
            )
            work_created = True
            logger.info(f"✅ 创建新作品: {work.id} - {work.title}")
        else:
            logger.info(f"📖 找到现有作品: {work.id} - {work.title}")
        
        # 3. 批量创建章节
        created_chapters = []
        skipped_chapters = []
        total_new_word_count = 0  # 累计新创建章节的总字数
        
        for chapter_data in request.chapters:
            try:
                # 检查章节是否已存在（根据章节号和卷号）
                from sqlalchemy import and_
                from sqlalchemy.future import select
                from memos.api.models.chapter import Chapter
                
                existing_chapter_stmt = select(Chapter).where(
                    and_(
                        Chapter.work_id == work.id,
                        Chapter.chapter_number == chapter_data.chapter_number,
                        Chapter.volume_number == (chapter_data.volume_number or 1)
                    )
                )
                existing_result = await db.execute(existing_chapter_stmt)
                existing_chapter = existing_result.scalar_one_or_none()
                
                if existing_chapter:
                    logger.warning(f"⚠️ 章节已存在，跳过: 第{chapter_data.chapter_number}章 - {chapter_data.title}")
                    skipped_chapters.append({
                        "chapter_id": existing_chapter.id,
                        "chapter_number": chapter_data.chapter_number,
                        "volume_number": chapter_data.volume_number or 1,
                        "title": chapter_data.title
                    })
                    continue
                
                # 计算章节字数（去除HTML标签，统计纯文本字符数）
                chapter_word_count = 0
                if chapter_data.content:
                    # 如果内容是HTML，需要提取纯文本
                    import re
                    # 简单的HTML标签去除
                    text_content = re.sub(r'<[^>]+>', '', chapter_data.content)
                    # 统计字符数（包括所有字符，与前端保持一致）
                    chapter_word_count = len(text_content)
                
                # 创建章节
                chapter = await chapter_service.create_chapter(
                    work_id=work.id,
                    title=chapter_data.title,
                    chapter_number=chapter_data.chapter_number,
                    volume_number=chapter_data.volume_number or 1,
                    status="draft",
                    word_count=chapter_word_count,
                )
                
                # 4. 将章节内容保存到 ShareDB
                document_id = f"work_{work.id}_chapter_{chapter.id}"
                await sharedb_service.create_document(
                    document_id=document_id,
                    initial_content={
                        "id": document_id,
                        "content": chapter_data.content,
                        "title": chapter_data.title,
                        "metadata": {
                            "work_id": work.id,
                            "chapter_id": chapter.id,
                            "chapter_number": chapter_data.chapter_number,
                            "volume_number": chapter_data.volume_number or 1,
                        }
                    }
                )
                
                created_chapters.append({
                    "chapter_id": chapter.id,
                    "chapter_number": chapter_data.chapter_number,
                    "volume_number": chapter_data.volume_number or 1,
                    "title": chapter_data.title
                })
                
                # 累加字数
                total_new_word_count += chapter_word_count
                
                logger.info(f"✅ 创建章节: {chapter.id} - 第{chapter_data.chapter_number}章 - {chapter_data.title}, 字数: {chapter_word_count}")
                
            except Exception as e:
                logger.error(f"❌ 创建章节失败: {e}", exc_info=True)
                # 继续处理下一个章节
                continue
        
        # 更新作品统计（累加新创建的章节数和总字数）
        current_chapter_count = work.chapter_count or 0
        current_word_count = work.word_count or 0
        
        # 更新作品统计
        await work_service.update_work(
            work_id=work.id,
            chapter_count=current_chapter_count + len(created_chapters),
            word_count=current_word_count + total_new_word_count
        )
        
        logger.info(f"✅ 作品统计已更新: 章节数={current_chapter_count + len(created_chapters)}, 总字数={current_word_count + total_new_word_count} (新增 {total_new_word_count} 字)")
        
        return {
            "work_id": work.id,
            "work_title": work.title,
            "work_created": work_created,
            "chapters_created": len(created_chapters),
            "chapters_skipped": len(skipped_chapters),
            "created_chapters": created_chapters,
            "skipped_chapters": skipped_chapters,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create work from file: {traceback.format_exc()}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")
