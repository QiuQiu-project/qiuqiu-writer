"""
AI接口路由
提供章节分析、健康检查和默认提示词接口
"""

import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.ai_models import (
    AnalyzeChapterRequest,
    AnalyzeChapterByFileRequest,
    DefaultPromptData,
    DefaultPromptResponse,
    ErrorResponse,
    HealthCheckData,
    HealthCheckResponse,
)
from memos.api.core.database import get_async_db
from memos.api.services.ai_service import get_ai_service
from memos.api.services.book_analysis_service import BookAnalysisService
from memos.api.routers.auth_router import get_current_user_id
from memos.log import get_logger


logger = get_logger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Analysis"])


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
    db: AsyncSession = Depends(get_async_db),
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
        prompt = request.prompt
        if not prompt:
            book_analysis_service = BookAnalysisService(db)
            prompt_template = await book_analysis_service.get_default_prompt_template("chapter_analysis")
            if prompt_template:
                prompt = prompt_template.format_prompt(content=request.content)
            else:
                # 使用AI服务的默认prompt
                prompt = ai_service.get_default_prompt().format(content=request.content)

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
                    prompt=prompt,
                    model=settings.model,
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
    db: AsyncSession = Depends(get_async_db),
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
                    full_prompt = enhanced_prompt_template.format(content=accumulated_content)
                    
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
    db: AsyncSession = Depends(get_async_db),
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
        prompt_template = await book_analysis_service.get_default_prompt_template("book_analysis")
        if prompt_template:
            # 使用数据库中的模板
            enhanced_prompt = prompt_template.format_prompt(content=request.content)
        else:
            # 使用默认的增强prompt
            enhanced_prompt = book_analysis_service.get_enhanced_book_analysis_prompt().format(
                content=request.content
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
    db: AsyncSession = Depends(get_async_db),
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
                            "chapter_id": result["chapter_id"],
                            "chapter_number": result["chapter_number"],
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
