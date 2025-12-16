"""
AI接口路由
提供章节分析、健康检查和默认提示词接口
"""

import traceback
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
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
    "/analyze-chapter",
    summary="章节分析接口",
    description="对小说章节内容进行AI分析，返回结构化的章节分析结果（流式响应）",
    responses={
        200: {"description": "分析成功，返回流式响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        429: {"model": ErrorResponse, "description": "请求过于频繁"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_chapter(
    request: AnalyzeChapterRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """
    对章节内容进行AI分析

    Args:
        request: 章节分析请求
        db: 数据库会话

    Returns:
        StreamingResponse: 服务器发送事件流
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

        # 获取分析设置
        settings = request.settings or AnalyzeChapterRequest.model_fields["settings"].default_factory()

        # 如果没有提供prompt，从数据库获取默认模板
        system_prompt = None
        user_prompt = None
        
        if not request.prompt:
            book_analysis_service = BookAnalysisService(db)
            prompt_template = await book_analysis_service.get_default_prompt_template("chapter_analysis")
            if prompt_template:
                # 从模板的 metadata 中提取 system_prompt 和 user_prompt
                template_metadata = prompt_template.template_metadata or {}
                system_prompt = template_metadata.get("system_prompt")
                user_prompt = template_metadata.get("user_prompt")
                
                # 如果 metadata 中没有，则使用 prompt_content 作为 user_prompt
                if not user_prompt:
                    user_prompt = prompt_template.format_prompt(content=request.content)
                else:
                    # 如果 user_prompt 中有 {content} 变量，需要替换
                    user_prompt = user_prompt.replace("{content}", request.content)
            else:
                # 使用AI服务的默认prompt
                default_prompt = ai_service.get_default_prompt()
                user_prompt = default_prompt.replace("{content}", request.content)
        else:
            # 如果提供了 prompt，将其作为 user_prompt
            user_prompt = request.prompt.replace("{content}", request.content) if "{content}" in request.prompt else request.prompt

        logger.info(
            f"Received chapter analysis request: "
            f"content_length={len(request.content)}, "
            f"model={settings.model}, "
            f"temperature={settings.temperature}, "
            f"max_tokens={settings.max_tokens}"
        )

        # 执行流式分析
        async def generate_analysis():
            """生成分析响应"""
            try:
                full_response = ""
                async for message in ai_service.analyze_chapter_stream(
                    content=request.content,
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    model=settings.model,  # 如果为None，AI服务会使用默认模型
                    temperature=settings.temperature,
                    max_tokens=settings.max_tokens,
                ):
                    # 如果是chunk消息，累积内容用于后续解析
                    if message.startswith("data: "):
                        import json
                        try:
                            data = json.loads(message[6:])
                            if data.get("type") == "chunk":
                                full_response += data.get("content", "")
                        except:
                            pass
                    
                    yield message
                
                # 尝试解析JSON格式的响应（如果prompt返回JSON）
                if full_response:
                    try:
                        book_analysis_service = BookAnalysisService(db)
                        parsed_data = book_analysis_service.parse_single_chapter_response(full_response)
                        
                        if parsed_data:
                            # 发送结构化数据消息
                            import json
                            structured_msg = json.dumps({
                                "type": "structured_data",
                                "data": parsed_data
                            })
                            yield f"data: {structured_msg}\n\n"
                            logger.info("✅ 成功解析章节结构化数据（包含大纲和细纲）")
                    except Exception as e:
                        logger.debug(f"解析结构化数据失败（可能是Markdown格式）: {e}")
                        
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
                "X-Accel-Buffering": "no",  # 禁用nginx缓冲
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze chapter: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/analyze-chapters-incremental",
    summary="逐章渐进式分析接口",
    description="逐章分析小说内容，每分析完一章就立即插入到目标作品中（包括角色、地点、章节）",
    responses={
        200: {"description": "分析成功，返回流式响应"},
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
        StreamingResponse: 服务器发送事件流
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

        # 执行流式分析
        async def generate_analysis():
            """生成分析响应"""
            try:
                accumulated_content = ""  # 累积的章节内容
                
                for idx, chapter_content in enumerate(chapters_content, 1):
                    # 累积当前章节内容
                    accumulated_content += chapter_content + "\n\n"
                    
                    # 构建包含所有已分析章节的prompt
                    # 使用 replace 而不是 format，避免 JSON 示例中的大括号被误解析
                    full_prompt = enhanced_prompt_template.replace("{content}", accumulated_content)
                    
                    # 发送章节开始分析的消息
                    import json
                    chapter_start_msg = json.dumps({
                        "type": "chapter_start",
                        "message": f"开始分析第 {idx} 章",
                        "chapter_index": idx,
                        "total_chapters": len(chapters_content)
                    })
                    yield f"data: {chapter_start_msg}\n\n"
                    
                    # 分析当前累积的内容
                    full_response = ""
                    async for message in ai_service.analyze_chapter_stream(
                        content=accumulated_content,
                        prompt=full_prompt,
                        system_prompt=None,  # 使用默认 system_prompt
                        model=settings.model,
                        temperature=settings.temperature,
                        max_tokens=settings.max_tokens * 2,
                    ):
                        # 如果是chunk消息，累积内容
                        if message.startswith("data: "):
                            try:
                                data = json.loads(message[6:])
                                if data.get("type") == "chunk":
                                    full_response += data.get("content", "")
                            except:
                                pass
                        
                        yield message
                    
                    # 解析AI响应并渐进式插入
                    try:
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
                        
                        # 发送插入成功的消息
                        insert_success_msg = json.dumps({
                            "type": "chapter_inserted",
                            "message": f"第 {idx} 章分析完成并已插入作品",
                            "chapter_index": idx,
                            "data": result
                        })
                        yield f"data: {insert_success_msg}\n\n"
                        
                    except Exception as e:
                        logger.error(f"渐进式插入失败 (章节 {idx}): {traceback.format_exc()}")
                        error_msg = json.dumps({
                            "type": "chapter_insert_error",
                            "message": f"第 {idx} 章插入失败: {str(e)}",
                            "chapter_index": idx
                        })
                        yield f"data: {error_msg}\n\n"
                
                # 发送完成消息
                complete_msg = json.dumps({
                    "type": "all_chapters_complete",
                    "message": "所有章节分析完成",
                    "total_chapters": len(chapters_content)
                })
                yield f"data: {complete_msg}\n\n"
                        
            except Exception as e:
                logger.error(f"Error in incremental analysis stream: {traceback.format_exc()}")
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
        logger.error(f"Failed to analyze chapters incrementally: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/analyze-work-chapters",
    summary="分析作品所有章节接口",
    description="直接分析作品的所有章节，后端自动获取章节内容并逐章处理（流式响应）",
    responses={
        200: {"description": "分析成功，返回流式响应"},
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
        StreamingResponse: 服务器发送事件流
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

        # 执行流式分析
        async def generate_analysis():
            """生成分析响应"""
            try:
                import json
                
                # 发送开始消息
                start_msg = json.dumps({
                    "type": "start",
                    "message": f"开始分析作品《{work.title}》的所有章节，共 {total} 章",
                    "total_chapters": total
                })
                yield f"data: {start_msg}\n\n"
                
                accumulated_content = ""  # 累积的章节内容
                
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
                                # 发送跳过消息
                                skip_msg = json.dumps({
                                    "type": "chapter_skipped",
                                    "message": f"第 {idx} 章《{chapter.title}》没有内容，跳过",
                                    "chapter_index": idx,
                                    "chapter_id": chapter.id,
                                    "chapter_title": chapter.title
                                })
                                yield f"data: {skip_msg}\n\n"
                                continue
                    except Exception as e:
                        logger.error(f"获取章节 {chapter.id} 内容失败: {traceback.format_exc()}")
                        # 发送错误消息但继续处理下一章
                        error_msg = json.dumps({
                            "type": "chapter_error",
                            "message": f"第 {idx} 章《{chapter.title}》获取内容失败: {str(e)}",
                            "chapter_index": idx,
                            "chapter_id": chapter.id
                        })
                        yield f"data: {error_msg}\n\n"
                        continue
                    
                    # 累积当前章节内容
                    accumulated_content += f"第{chapter.chapter_number}章 {chapter.title}\n\n{chapter_content}\n\n"
                    
                    # 构建包含所有已分析章节的prompt
                    # 使用 replace 而不是 format，避免 JSON 示例中的大括号被误解析
                    full_prompt = enhanced_prompt_template.replace("{content}", accumulated_content)
                    
                    # 发送章节开始分析的消息
                    chapter_start_msg = json.dumps({
                        "type": "chapter_start",
                        "message": f"开始分析第 {idx} 章《{chapter.title}》",
                        "chapter_index": idx,
                        "total_chapters": total,
                        "chapter_id": chapter.id,
                        "chapter_number": chapter.chapter_number,
                        "chapter_title": chapter.title
                    })
                    yield f"data: {chapter_start_msg}\n\n"
                    
                    # 分析当前累积的内容
                    full_response = ""
                    async for message in ai_service.analyze_chapter_stream(
                        content=accumulated_content,
                        prompt=full_prompt,
                        system_prompt=None,  # 使用默认 system_prompt
                        model=analysis_settings.model,
                        temperature=analysis_settings.temperature,
                        max_tokens=analysis_settings.max_tokens * 2,
                    ):
                        # 如果是chunk消息，累积内容
                        if message.startswith("data: "):
                            try:
                                data = json.loads(message[6:])
                                if data.get("type") == "chunk":
                                    full_response += data.get("content", "")
                            except:
                                pass
                        
                        yield message
                    
                    # 解析AI响应并渐进式插入
                    try:
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
                        
                        # 发送插入成功的消息
                        insert_success_msg = json.dumps({
                            "type": "chapter_inserted",
                            "message": f"第 {idx} 章《{chapter.title}》分析完成并已插入作品",
                            "chapter_index": idx,
                            "chapter_id": chapter.id,
                            "chapter_number": chapter.chapter_number,
                            "chapter_title": chapter.title,
                            "data": result
                        })
                        yield f"data: {insert_success_msg}\n\n"
                        
                    except Exception as e:
                        logger.error(f"渐进式插入失败 (章节 {idx}): {traceback.format_exc()}")
                        error_msg = json.dumps({
                            "type": "chapter_insert_error",
                            "message": f"第 {idx} 章《{chapter.title}》插入失败: {str(e)}",
                            "chapter_index": idx,
                            "chapter_id": chapter.id
                        })
                        yield f"data: {error_msg}\n\n"
                
                # 发送完成消息
                complete_msg = json.dumps({
                    "type": "all_chapters_complete",
                    "message": "所有章节分析完成",
                    "total_chapters": total
                })
                yield f"data: {complete_msg}\n\n"
                        
            except Exception as e:
                logger.error(f"Error in work chapters analysis stream: {traceback.format_exc()}")
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


@router.get(
    "/default-prompt",
    summary="获取默认提示词接口",
    description="获取默认的章节分析提示词模板",
    response_model=DefaultPromptResponse,
    responses={
        200: {"model": DefaultPromptResponse, "description": "成功获取默认提示词"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
    },
)
async def get_default_prompt():
    """
    获取默认提示词

    Returns:
        DefaultPromptResponse: 默认提示词信息
    """
    try:
        ai_service = get_ai_service()
        default_prompt = ai_service.get_default_prompt()

        prompt_data = DefaultPromptData(
            prompt=default_prompt,
            version="1.0",
        )

        logger.info("Retrieved default prompt")

        return DefaultPromptResponse(
            code=200,
            message="成功",
            data=prompt_data,
        )

    except Exception as e:
        logger.error(f"Failed to get default prompt: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"获取默认提示词失败: {str(e)}")


@router.post(
    "/analyze-book",
    summary="增强拆书分析接口",
    description="对小说内容进行增强分析，识别角色、地图、章节大纲和细纲，并可直接创建作品（流式响应）",
    responses={
        200: {"description": "分析成功，返回流式响应"},
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
        StreamingResponse: 服务器发送事件流
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

        # 执行流式分析
        async def generate_analysis():
            """生成分析响应"""
            try:
                full_response = ""
                async for message in ai_service.analyze_chapter_stream(
                    content=request.content,
                    prompt=enhanced_prompt,
                    system_prompt=None,  # 使用默认 system_prompt
                    model=settings.model,
                    temperature=settings.temperature,
                    max_tokens=settings.max_tokens * 2,  # 增强分析需要更多tokens
                ):
                    # 如果是chunk消息，累积内容
                    if message.startswith("data: "):
                        import json
                        try:
                            data = json.loads(message[6:])
                            if data.get("type") == "chunk":
                                full_response += data.get("content", "")
                        except:
                            pass
                    
                    yield message
                
                # 如果启用了自动创建作品，解析响应并创建作品
                if auto_create_work:
                    try:
                        # 解析AI响应
                        analysis_data = book_analysis_service.parse_ai_response(full_response)
                        
                        if not analysis_data:
                            raise ValueError("无法解析AI响应，可能返回的不是有效的JSON格式")
                        
                        # 创建作品
                        result = await book_analysis_service.create_work_from_analysis(
                            analysis_data=analysis_data,
                            user_id=current_user_id
                        )
                        
                        # 发送创建成功的消息
                        import json
                        success_msg = json.dumps({
                            "type": "work_created",
                            "message": "作品创建成功",
                            "data": result
                        })
                        yield f"data: {success_msg}\n\n"
                        
                    except Exception as e:
                        logger.error(f"自动创建作品失败: {traceback.format_exc()}")
                        import json
                        error_msg = json.dumps({
                            "type": "work_creation_error",
                            "message": f"自动创建作品失败: {str(e)}"
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
    description="为作品的所有章节（或指定章节）逐章生成大纲和细纲，从work的metadata中获取characters和locations信息",
    responses={
        200: {"description": "生成成功，返回流式响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def generate_chapter_outlines(
    work_id: int = Query(..., description="作品ID"),
    chapter_ids: Optional[str] = Query(None, description="指定要处理的章节ID列表（逗号分隔），如果不提供则处理所有章节"),
    prompt: Optional[str] = Query(None, description="自定义prompt（可选）"),
    settings: Optional[AnalysisSettings] = None,
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
        StreamingResponse: 服务器发送事件流
    """
    try:
        # 验证作品是否存在
        from memos.api.services.work_service import WorkService
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
        
        # 执行流式生成
        # 注意：在异步生成器中创建独立的数据库会话，避免使用依赖注入的会话
        # 这样可以防止会话生命周期冲突
        async def generate_outlines():
            """生成大纲和细纲响应"""
            # 创建独立的数据库会话用于生成器内部操作
            from memos.api.core.database import AsyncSessionLocal
            async_session = AsyncSessionLocal()
            try:
                import json
                
                # 发送开始消息
                start_msg = json.dumps({
                    "type": "start",
                    "message": f"开始为作品《{work.title}》生成章节大纲和细纲"
                })
                yield f"data: {start_msg}\n\n"
                
                # 使用独立会话创建服务实例
                book_analysis_service_internal = BookAnalysisService(async_session)
                
                # 逐章生成大纲和细纲
                async for result in book_analysis_service_internal.generate_outlines_for_all_chapters(
                    work_id=work_id,
                    ai_service=ai_service,
                    prompt=prompt,
                    settings=analysis_settings,
                    chapter_ids=chapter_id_list
                ):
                    if "error" in result:
                        # 发送错误消息
                        error_msg = json.dumps({
                            "type": "chapter_error",
                            "chapter_id": result.get("chapter_id"),
                            "chapter_number": result.get("chapter_number"),
                            "index": result.get("index"),
                            "total": result.get("total"),
                            "message": result.get("error")
                        })
                        yield f"data: {error_msg}\n\n"
                    else:
                        # 发送成功消息
                        success_msg = json.dumps({
                            "type": "chapter_complete",
                            "chapter_id": result.get("chapter_id"),
                            "chapter_number": result.get("chapter_number"),
                            "title": result.get("title"),
                            "index": result.get("index"),
                            "total": result.get("total"),
                            "outline": result.get("outline", {}),
                            "detailed_outline": result.get("detailed_outline", {}),
                            "message": f"第 {result.get('chapter_number')} 章《{result.get('title')}》大纲和细纲生成完成"
                        })
                        yield f"data: {success_msg}\n\n"
                
                # 提交所有更改
                await async_session.commit()
                
                # 发送完成消息
                done_msg = json.dumps({
                    "type": "done",
                    "message": "所有章节的大纲和细纲生成完成"
                })
                yield f"data: {done_msg}\n\n"
                
            except Exception as e:
                logger.error(f"生成大纲和细纲过程出错: {traceback.format_exc()}")
                # 回滚事务
                try:
                    await async_session.rollback()
                except Exception as rollback_error:
                    logger.error(f"回滚事务失败: {rollback_error}")
                
                error_msg = json.dumps({
                    "type": "error",
                    "message": f"服务器错误: {str(e)}"
                })
                yield f"data: {error_msg}\n\n"
            finally:
                # 确保会话被正确关闭
                try:
                    await async_session.close()
                except Exception as close_error:
                    logger.error(f"关闭数据库会话失败: {close_error}")
        
        return StreamingResponse(
            generate_outlines(),
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
                
                # 流式生成内容
                full_content = ""
                async for message in ai_service.analyze_chapter_stream(
                    content="",  # 这里不需要内容，因为我们在prompt中已经包含了所有信息
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    model=analysis_settings.get("model"),
                    temperature=analysis_settings.get("temperature", 0.7),
                    max_tokens=analysis_settings.get("max_tokens", 8000),
                ):
                    # 转发AI服务的消息
                    if message.startswith("data: "):
                        try:
                            data = json.loads(message[6:])
                            if data.get("type") == "chunk":
                                full_content += data.get("content", "")
                        except:
                            pass
                    
                    yield message
                
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
