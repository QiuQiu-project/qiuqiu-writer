import json
import os
import time
import traceback
import asyncio

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.config import APIConfig
from memos.api.core.database import get_async_db
from memos.api.services.mention_service import MentionService
from memos.api.services.book_analysis_service import BookAnalysisService
from memos.api.services.chapter_service import ChapterService
from memos.api.services.work_service import WorkService
from memos.api.ai_models import AnalysisSettings
from memos.api.services.ai_service import get_ai_service


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
from memos.api.product_models import (
    BaseResponse,
    ChatCompleteRequest,
    ChatRequest,
    GetMemoryRequest,
    MemoryCreateRequest,
    MemoryResponse,
    SearchRequest,
    SearchResponse,
    SimpleResponse,
    SuggestionRequest,
    SuggestionResponse,
    UserRegisterRequest,
    UserRegisterResponse,
)
from memos.configs.mem_os import MOSConfig
from memos.log import get_logger
from memos.mem_os.product import MOSProduct
from memos.memos_tools.notification_service import get_error_bot_function, get_online_bot_function


logger = get_logger(__name__)

router = APIRouter(prefix="/product", tags=["Product API"])

# Initialize MOSProduct instance with lazy initialization
MOS_PRODUCT_INSTANCE = None


def get_mos_product_instance():
    """Get or create MOSProduct instance."""
    global MOS_PRODUCT_INSTANCE
    if MOS_PRODUCT_INSTANCE is None:
        default_config = APIConfig.get_product_default_config()
        logger.info(f"*********init_default_mos_config********* {default_config}")
        from memos.configs.mem_os import MOSConfig

        mos_config = MOSConfig(**default_config)

        # Get default cube config from APIConfig (may be None if disabled)
        default_cube_config = APIConfig.get_default_cube_config()
        logger.info(f"*********initdefault_cube_config******** {default_cube_config}")

        # Get DingDing bot functions
        dingding_enabled = APIConfig.is_dingding_bot_enabled()
        online_bot = get_online_bot_function() if dingding_enabled else None
        error_bot = get_error_bot_function() if dingding_enabled else None

        MOS_PRODUCT_INSTANCE = MOSProduct(
            default_config=mos_config,
            default_cube_config=default_cube_config,
            online_bot=online_bot,
            error_bot=error_bot,
        )
        logger.info("MOSProduct instance created successfully with inheritance architecture")
    return MOS_PRODUCT_INSTANCE


def _parse_work_id_from_user_id(user_id: str) -> int | None:
    """
    解析形如 user_{uid}_work_{workId} 的 user_id，提取 workId
    """
    try:
        if "_work_" in user_id:
            parts = user_id.split("_work_")
            work_part = parts[-1]
            work_id = int(work_part)
            return work_id
    except Exception:
        pass
    return None


def _parse_chapter_ids_from_command(query: str) -> list[int]:
    """
    从命令文本中提取章节ID/编号
    优先识别 @chapter:数字 格式，然后提取纯数字
    """
    import re

    ids = []
    
    # 优先识别 @chapter:数字 格式
    chapter_mention_pattern = r'@chapter:(\d+)'
    for match in re.findall(chapter_mention_pattern, query):
        try:
            chapter_id = int(match)
            if chapter_id not in ids:
                ids.append(chapter_id)
        except ValueError:
            continue
    
    # 如果没有找到 @chapter 格式，再提取所有数字（向后兼容）
    if not ids:
        for match in re.findall(r"\d+", query):
            try:
                chapter_id = int(match)
                if chapter_id not in ids:
                    ids.append(chapter_id)
            except ValueError:
                continue
    
    return ids


get_mos_product_instance()


@router.post("/configure", summary="Configure MOSProduct", response_model=SimpleResponse)
def set_config(config):
    """Set MOSProduct configuration."""
    global MOS_PRODUCT_INSTANCE
    MOS_PRODUCT_INSTANCE = MOSProduct(default_config=config)
    return SimpleResponse(message="Configuration set successfully")


@router.post("/users/register", summary="Register a new user", response_model=UserRegisterResponse)
def register_user(user_req: UserRegisterRequest):
    """Register a new user with configuration and default cube."""
    try:
        # Get configuration for the user
        time_start_register = time.time()
        user_config, default_mem_cube = APIConfig.create_user_config(
            user_name=user_req.user_id, user_id=user_req.user_id
        )
        logger.info(f"user_config: {user_config.model_dump(mode='json')}")
        logger.info(f"default_mem_cube: {default_mem_cube.config.model_dump(mode='json')}")
        logger.info(
            f"time register api : create user config time user_id: {user_req.user_id} time is: {time.time() - time_start_register}"
        )
        mos_product = get_mos_product_instance()

        # Register user with default config and mem cube
        result = mos_product.user_register(
            user_id=user_req.user_id,
            user_name=user_req.user_name,
            interests=user_req.interests,
            config=user_config,
            default_mem_cube=default_mem_cube,
            mem_cube_id=user_req.mem_cube_id,
        )
        logger.info(
            f"time register api : register time user_id: {user_req.user_id} time is: {time.time() - time_start_register}"
        )
        if result["status"] == "success":
            return UserRegisterResponse(
                message="User registered successfully",
                data={"user_id": result["user_id"], "mem_cube_id": result["default_cube_id"]},
            )
        else:
            raise HTTPException(status_code=400, detail=result["message"])

    except Exception as err:
        logger.error(f"Failed to register user: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.get(
    "/suggestions/{user_id}", summary="Get suggestion queries", response_model=SuggestionResponse
)
def get_suggestion_queries(user_id: str):
    """Get suggestion queries for a specific user."""
    try:
        mos_product = get_mos_product_instance()
        suggestions = mos_product.get_suggestion_query(user_id)
        return SuggestionResponse(
            message="Suggestions retrieved successfully", data={"query": suggestions}
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to get suggestions: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.post(
    "/suggestions",
    summary="Get suggestion queries with language",
    response_model=SuggestionResponse,
)
def get_suggestion_queries_post(suggestion_req: SuggestionRequest):
    """Get suggestion queries for a specific user with language preference."""
    try:
        mos_product = get_mos_product_instance()
        suggestions = mos_product.get_suggestion_query(
            user_id=suggestion_req.user_id,
            language=suggestion_req.language,
            message=suggestion_req.message,
        )
        return SuggestionResponse(
            message="Suggestions retrieved successfully", data={"query": suggestions}
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to get suggestions: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.post("/get_all", summary="Get all memories for user", response_model=MemoryResponse)
def get_all_memories(memory_req: GetMemoryRequest):
    """Get all memories for a specific user."""
    try:
        mos_product = get_mos_product_instance()
        if memory_req.search_query:
            result = mos_product.get_subgraph(
                user_id=memory_req.user_id,
                query=memory_req.search_query,
                mem_cube_ids=memory_req.mem_cube_ids,
            )
            return MemoryResponse(message="Memories retrieved successfully", data=result)
        else:
            result = mos_product.get_all(
                user_id=memory_req.user_id,
                memory_type=memory_req.memory_type,
                mem_cube_ids=memory_req.mem_cube_ids,
            )
            return MemoryResponse(message="Memories retrieved successfully", data=result)

    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to get memories: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.post("/add", summary="add a new memory", response_model=SimpleResponse)
def create_memory(memory_req: MemoryCreateRequest):
    """Create a new memory for a specific user."""
    try:
        time_start_add = time.time()
        mos_product = get_mos_product_instance()
        mos_product.add(
            user_id=memory_req.user_id,
            memory_content=memory_req.memory_content,
            messages=memory_req.messages,
            doc_path=memory_req.doc_path,
            mem_cube_id=memory_req.mem_cube_id,
            source=memory_req.source,
            user_profile=memory_req.user_profile,
            session_id=memory_req.session_id,
        )
        logger.info(
            f"time add api : add time user_id: {memory_req.user_id} time is: {time.time() - time_start_add}"
        )
        return SimpleResponse(message="Memory created successfully")

    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to create memory: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.post("/search", summary="Search memories", response_model=SearchResponse)
def search_memories(search_req: SearchRequest):
    """Search memories for a specific user."""
    try:
        time_start_search = time.time()
        mos_product = get_mos_product_instance()
        result = mos_product.search(
            query=search_req.query,
            user_id=search_req.user_id,
            install_cube_ids=[search_req.mem_cube_id] if search_req.mem_cube_id else None,
            top_k=search_req.top_k,
            session_id=search_req.session_id,
        )
        logger.info(
            f"time search api : add time user_id: {search_req.user_id} time is: {time.time() - time_start_search}"
        )
        return SearchResponse(message="Search completed successfully", data=result)

    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to search memories: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


def ensure_memos_user_exists(user_id: str):
    """
    确保 MemOS 用户存在，如果不存在则自动注册。
    如果用户已存在，确保其 cube 使用最新的配置（特别是 embedder 配置）。
    
    Args:
        user_id: MemOS 用户 ID
    
    Raises:
        HTTPException: 如果用户注册失败
    """
    try:
        mos_product = get_mos_product_instance()
        # 尝试获取用户信息，如果不存在会抛出 ValueError
        mos_product.get_user_info(user_id)
        logger.debug(f"MemOS user '{user_id}' already exists")
        
        # 用户已存在，但需要确保 cube 使用最新的配置
        # 重新加载 cube 以使用新的 embedder 配置
        try:
            from memos.api.config import APIConfig
            user_config, default_cube_config = APIConfig.create_user_config(
                user_name=user_id,
                user_id=user_id,
            )
            
            # 获取用户的所有 cube 并强制重新加载以使用新配置
            accessible_cubes = mos_product.user_manager.get_user_cubes(user_id)
            for cube in accessible_cubes:
                # 从内存中移除旧的 cube（如果存在）
                if cube.cube_id in mos_product.mem_cubes:
                    logger.info(
                        f"🔄 Removing old cube {cube.cube_id} from memory for user {user_id} "
                        f"to reload with latest embedder configuration"
                    )
                    del mos_product.mem_cubes[cube.cube_id]
                    logger.debug(f"Removed old cube {cube.cube_id} from memory")
                
                # 重新加载 cube 使用新配置（register_mem_cube 会处理重新加载）
                if cube.cube_path and os.path.exists(cube.cube_path):
                    logger.info(
                        f"🔄 Reloading cube {cube.cube_id} for user {user_id} "
                        f"with new embedder configuration"
                    )
                    mos_product.register_mem_cube(
                        cube.cube_path,
                        cube.cube_id,
                        user_id,
                        memory_types=["act_mem"] if mos_product.config.enable_activation_memory else [],
                        default_config=default_cube_config,  # 传递新配置以强制重新加载
                    )
                    logger.info(f"✅ Reloaded cube {cube.cube_id} with new configuration")
                else:
                    logger.warning(
                        f"Cube path {cube.cube_path} does not exist for cube {cube.cube_id}, "
                        f"cannot reload with new configuration"
                    )
        except Exception as e:
            logger.warning(
                f"Failed to reload cube for user {user_id} with new config: {e}. "
                f"This is not critical, but may result in using old embedder configuration."
            )
        
        return  # 用户已存在，直接返回
    except (ValueError, KeyError) as e:
        # 用户不存在，自动注册
        logger.info(f"MemOS user '{user_id}' does not exist, auto-registering...")
        try:
            from memos.api.config import APIConfig
            from memos.api.product_models import UserRegisterRequest
            
            user_req = UserRegisterRequest(
                user_id=user_id,
                user_name=user_id,
                mem_cube_id=None,
                interests=None,
            )
            
            user_config, default_mem_cube = APIConfig.create_user_config(
                user_name=user_req.user_id,
                user_id=user_req.user_id,
            )
            
            result = mos_product.user_register(
                user_id=user_req.user_id,
                user_name=user_req.user_name,
                interests=user_req.interests,
                config=user_config,
                default_mem_cube=default_mem_cube,
                mem_cube_id=user_req.mem_cube_id,
            )
            
            if result.get("status") == "success":
                logger.info(f"Successfully auto-registered MemOS user '{user_id}'")
                # 验证注册是否真的成功
                try:
                    mos_product.get_user_info(user_id)
                    logger.debug(f"Verified MemOS user '{user_id}' exists after registration")
                except (ValueError, KeyError):
                    logger.error(f"User '{user_id}' registration reported success but user still not found")
                    raise HTTPException(
                        status_code=500,
                        detail=f"用户注册失败：注册后无法验证用户存在"
                    )
            else:
                error_msg = result.get("message", "未知错误")
                logger.error(f"Failed to auto-register user '{user_id}': {error_msg}")
                raise HTTPException(
                    status_code=500,
                    detail=f"用户注册失败：{error_msg}"
                )
        except HTTPException:
            # 重新抛出 HTTPException
            raise
        except Exception as e:
            error_str = str(e)
            error_type = type(e).__name__
            logger.error(
                f"Error auto-registering MemOS user '{user_id}': {error_type}: {error_str}",
                exc_info=True
            )
            
            # 检查是否是 Qdrant 相关错误
            is_qdrant_error = (
                "qdrant" in error_str.lower() or
                "502" in error_str or
                "503" in error_str or
                "Bad Gateway" in error_str or
                "UnexpectedResponse" in error_type or
                "connection" in error_str.lower()
            )
            
            if is_qdrant_error:
                # 提供更详细的错误信息，包括如何诊断
                detail_msg = (
                    f"AI对话服务暂时不可用：向量数据库（Qdrant）连接失败。\n"
                    f"错误类型: {error_type}\n"
                    f"错误信息: {error_str[:500]}\n\n"
                    f"请检查：\n"
                    f"1. Qdrant 服务是否运行: docker ps | grep qdrant\n"
                    f"2. Qdrant API 是否可访问: curl http://localhost:6333/collections\n"
                    f"3. 查看 Qdrant 日志: docker logs --tail 50 qdrant\n"
                    f"4. 检查后端日志中的详细错误堆栈"
                )
                logger.error(f"Qdrant connection error details: {detail_msg}")
                raise HTTPException(
                    status_code=503,
                    detail=detail_msg
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"用户注册失败：{error_type}: {error_str[:500]}"
                )


@router.post("/chat", summary="Chat with MemOS")
async def chat(chat_req: ChatRequest, db: AsyncSession = Depends(get_db_session)):
    """Chat with MemOS for a specific user. Returns SSE stream."""
    try:
        mos_product = get_mos_product_instance()
        
        # 确保用户存在，如果不存在则自动注册
        ensure_memos_user_exists(chat_req.user_id)

        # 如果是命令，需要先提取章节ID（在替换提及之前）
        command_prefixes = ("/analysis-chapter", "/analysis-work", "/analysis-chapter-info")
        is_command = chat_req.query.strip().lower().startswith(command_prefixes)
        
        # 处理提及替换
        mention_service = MentionService(db)
        processed_query = await mention_service.replace_mentions_in_text(chat_req.query, chat_req.user_id)
        processed_history = await mention_service.replace_mentions_in_history(chat_req.history or [], chat_req.user_id)

        # 如果是命令或用户要求禁用记忆，则走无记忆流程
        disable_memory = not chat_req.use_memory or is_command

        async def run_generate_outlines_stream():
            """调用章节大纲生成服务并流式返回结果文本。"""
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                yield f"data: {json.dumps({'type': 'error', 'content': '未能从 user_id 解析出 work_id，无法执行章节分析'})}\n\n"
                return

            chapter_ids = None
            if chat_req.query.strip().lower().startswith("/analysis-chapter"):
                # 使用原始的 chat_req.query 而不是 processed_query，因为 processed_query 已经替换了 @chapter:2122
                ids = _parse_chapter_ids_from_command(chat_req.query)
                chapter_ids = ids if ids else None

            try:
                yield f"data: {json.dumps({'type': 'status', 'data': '0'})}\n\n"

                # 权限与服务检查
                work_service = WorkService(db)
                work = await work_service.get_work_by_id(work_id)
                if not work:
                    raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")

                chapter_service = ChapterService(db)
                if not await chapter_service.can_edit_work(user_id=int(work.owner_id), work_id=work_id):
                    raise HTTPException(status_code=403, detail="没有编辑该作品的权限")

                ai_service = get_ai_service()
                if not ai_service.is_healthy():
                    raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

                analysis_settings = AnalysisSettings()
                book_analysis_service = BookAnalysisService(db)

                # 组装章节ID
                chapter_id_list = chapter_ids
                # 执行生成（复用服务内部逻辑）
                success_count = 0
                error_count = 0
                total = 0
                async for result in book_analysis_service.generate_outlines_for_all_chapters(
                    work_id=work_id,
                    ai_service=ai_service,
                    prompt=None,
                    settings={
                        "model": analysis_settings.model,
                        "temperature": analysis_settings.temperature,
                        "max_tokens": analysis_settings.max_tokens,
                    },
                    chapter_ids=chapter_id_list,
                ):
                    total += 1
                    if "error" in result:
                        error_count += 1
                        error_msg = f"章节 {result.get('chapter_number') or result.get('chapter_id')} 失败: {result.get('error')}"
                        yield f"data: {json.dumps({'type': 'text', 'data': error_msg}, ensure_ascii=False)}\n\n"
                    else:
                        success_count += 1
                        success_msg = f"章节 {result.get('chapter_number') or result.get('chapter_id')} 完成"
                        yield f"data: {json.dumps({'type': 'text', 'data': success_msg}, ensure_ascii=False)}\n\n"

                summary = f"章节大纲生成完成：成功 {success_count}，失败 {error_count}，总计 {total}"
                yield f"data: {json.dumps({'type': 'text', 'data': summary}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'end'})}\n\n"
            except Exception as e:
                logger.error(f"Error in analysis stream: {e}", exc_info=True)
                error_data = f"data: {json.dumps({'type': 'error', 'content': str(traceback.format_exc())})}\n\n"
                yield error_data

        async def run_chapter_info_analysis_stream():
            """调用章节组件信息分析服务并流式返回结果文本。"""
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                yield f"data: {json.dumps({'type': 'error', 'content': '未能从 user_id 解析出 work_id，无法执行章节组件信息分析'})}\n\n"
                return

            try:
                yield f"data: {json.dumps({'type': 'status', 'data': '0'})}\n\n"

                # 权限与服务检查
                work_service = WorkService(db)
                work = await work_service.get_work_by_id(work_id)
                if not work:
                    raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")

                chapter_service = ChapterService(db)
                if not await chapter_service.can_edit_work(user_id=int(work.owner_id), work_id=work_id):
                    raise HTTPException(status_code=403, detail="没有编辑该作品的权限")

                # 解析章节ID（从原始命令中提取，在替换提及之前）
                # 使用原始的 chat_req.query 而不是 processed_query，因为 processed_query 已经替换了 @chapter:2122
                chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
                if not chapter_ids:
                    # 如果没有指定章节，尝试获取第一个章节
                    chapters, _ = await chapter_service.get_chapters(
                        filters={"work_id": work_id},
                        page=1,
                        size=1,
                        sort_by="chapter_number",
                        sort_order="asc"
                    )
                    if chapters:
                        chapter_ids = [chapters[0].id]
                    else:
                        yield f"data: {json.dumps({'type': 'error', 'content': '作品中没有章节，无法执行组件信息分析'})}\n\n"
                        return

                ai_service = get_ai_service()
                if not ai_service.is_healthy():
                    raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

                analysis_settings = AnalysisSettings()
                book_analysis_service = BookAnalysisService(db)

                # 解析当前用户ID
                current_user_id = int(work.owner_id)

                # 处理每个章节
                total = len(chapter_ids)
                success_count = 0
                error_count = 0
                all_summaries = []

                for idx, chapter_id in enumerate(chapter_ids, 1):
                    try:
                        yield f"data: {json.dumps({'type': 'text', 'data': f'正在分析章节 {idx}/{total} (ID: {chapter_id})...'}, ensure_ascii=False)}\n\n"

                        # 调用组件信息分析
                        result = await book_analysis_service.component_data_insert_to_work(
                            work_id=work_id,
                            chapter_id=chapter_id,
                            ai_service=ai_service,
                            current_user_id=current_user_id,
                            analysis_settings={
                                "model": analysis_settings.model,
                                "temperature": analysis_settings.temperature,
                                "max_tokens": analysis_settings.max_tokens,
                            },
                            build_text_summary=True,
                        )

                        # 提取 summary_text
                        summary_text = result.get("summary_text", "")
                        if summary_text:
                            all_summaries.append(f"章节 {chapter_id}:\n{summary_text}")
                            yield f"data: {json.dumps({'type': 'text', 'data': summary_text}, ensure_ascii=False)}\n\n"

                        success_count += 1
                        yield f"data: {json.dumps({'type': 'text', 'data': f'章节 {chapter_id} 分析完成'}, ensure_ascii=False)}\n\n"

                    except Exception as e:
                        error_count += 1
                        error_msg = str(e)
                        logger.error(f"分析章节 {chapter_id} 失败: {e}", exc_info=True)
                        yield f"data: {json.dumps({'type': 'text', 'data': f'章节 {chapter_id} 分析失败: {error_msg}'}, ensure_ascii=False)}\n\n"

                # 生成最终摘要
                final_summary = f"\n章节组件信息分析完成：成功 {success_count}，失败 {error_count}，总计 {total}"
                if all_summaries:
                    final_summary += "\n\n" + "\n\n".join(all_summaries)
                yield f"data: {json.dumps({'type': 'text', 'data': final_summary}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'end'})}\n\n"

            except Exception as e:
                logger.error(f"Error in chapter info analysis stream: {e}", exc_info=True)
                error_data = f"data: {json.dumps({'type': 'error', 'content': str(traceback.format_exc())})}\n\n"
                yield error_data

        async def generate_simple_stream():
            """流式直接调用大模型（无记忆检索）。"""
            try:
                yield f"data: {json.dumps({'type': 'status', 'data': '0'})}\n\n"
                # 构建消息列表（保留最多20条历史）
                history_msgs = processed_history[-20:] if processed_history else []
                messages = [*history_msgs, {"role": "user", "content": processed_query}]

                backend = mos_product.config.chat_model.backend
                if backend in ["huggingface", "vllm", "openai"]:
                    response_stream = mos_product.chat_llm.generate_stream(messages)
                else:
                    response_stream = mos_product.chat_llm.generate(messages)

                buffer = ""
                for chunk in response_stream:
                    if chunk in ["<think>", "</think>"]:
                        continue
                    buffer += chunk
                    if len(buffer) >= 16:
                        yield f"data: {json.dumps({'type': 'text', 'data': buffer}, ensure_ascii=False)}\n\n"
                        buffer = ""

                if buffer:
                    yield f"data: {json.dumps({'type': 'text', 'data': buffer}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'end'})}\n\n"
            except Exception as e:
                logger.error(f"Error in simple chat stream: {e}", exc_info=True)
                error_data = f"data: {json.dumps({'type': 'error', 'content': str(traceback.format_exc())})}\n\n"
                yield error_data

        async def generate_chat_response():
            """Generate chat response as SSE stream."""
            try:
                query_lower = processed_query.strip().lower()
                if disable_memory and query_lower.startswith("/analysis-chapter-info"):
                    async for chunk in run_chapter_info_analysis_stream():
                        yield chunk
                elif disable_memory and query_lower.startswith(("/analysis-chapter", "/analysis-work")):
                    async for chunk in run_generate_outlines_stream():
                        yield chunk
                elif disable_memory:
                    async for chunk in generate_simple_stream():
                        yield chunk
                else:
                    # Directly yield from the generator without async wrapper
                    for chunk in mos_product.chat_with_references(
                        query=processed_query,
                        user_id=chat_req.user_id,
                        cube_id=chat_req.mem_cube_id,
                        history=processed_history,
                        internet_search=chat_req.internet_search,
                        moscube=chat_req.moscube,
                        session_id=chat_req.session_id,
                    ):
                        yield chunk

            except Exception as e:
                logger.error(f"Error in chat stream: {e}")
                error_data = f"data: {json.dumps({'type': 'error', 'content': str(traceback.format_exc())})}\n\n"
                yield error_data

        return StreamingResponse(
            generate_chat_response(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Content-Type": "text/event-stream",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        )

    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to start chat: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.post("/chat/complete", summary="Chat with MemOS (Complete Response)")
async def chat_complete(chat_req: ChatCompleteRequest, db: AsyncSession = Depends(get_db_session)):
    """Chat with MemOS for a specific user. Returns complete response (non-streaming)."""
    try:
        mos_product = get_mos_product_instance()
        
        # 确保用户存在，如果不存在则自动注册
        ensure_memos_user_exists(chat_req.user_id)

        # 如果是命令，需要先提取章节ID（在替换提及之前）
        command_prefixes = ("/analysis-chapter", "/analysis-work", "/analysis-chapter-info")
        is_command = chat_req.query.strip().lower().startswith(command_prefixes)
        
        # 处理提及替换
        mention_service = MentionService(db)
        processed_query = await mention_service.replace_mentions_in_text(chat_req.query, chat_req.user_id)
        processed_history = await mention_service.replace_mentions_in_history(chat_req.history or [], chat_req.user_id)

        disable_memory = not chat_req.use_memory or is_command

        query_lower = chat_req.query.strip().lower()
        if disable_memory and query_lower.startswith("/analysis-chapter-info"):
            # 处理章节组件信息分析命令
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                raise HTTPException(status_code=400, detail="未能从 user_id 解析 work_id，无法执行章节组件信息分析")

            # 使用原始的 chat_req.query 而不是 processed_query，因为 processed_query 已经替换了 @chapter:2122
            chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
            if not chapter_ids:
                # 如果没有指定章节，尝试获取第一个章节
                chapter_service = ChapterService(db)
                chapters, _ = await chapter_service.get_chapters(
                    filters={"work_id": work_id},
                    page=1,
                    size=1,
                    sort_by="chapter_number",
                    sort_order="asc"
                )
                if chapters:
                    chapter_ids = [chapters[0].id]
                else:
                    raise HTTPException(status_code=400, detail="作品中没有章节，无法执行组件信息分析")

            # 权限与服务检查
            work_service = WorkService(db)
            work = await work_service.get_work_by_id(work_id)
            if not work:
                raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")

            if not await chapter_service.can_edit_work(user_id=int(work.owner_id), work_id=work_id):
                raise HTTPException(status_code=403, detail="没有编辑该作品的权限")

            ai_service = get_ai_service()
            if not ai_service.is_healthy():
                raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

            analysis_settings = AnalysisSettings()
            book_analysis_service = BookAnalysisService(db)
            current_user_id = int(work.owner_id)

            # 处理每个章节
            all_summaries = []
            success_count = 0
            error_count = 0
            for chapter_id in chapter_ids:
                try:
                    result = await book_analysis_service.component_data_insert_to_work(
                        work_id=work_id,
                        chapter_id=chapter_id,
                        ai_service=ai_service,
                        current_user_id=current_user_id,
                        analysis_settings={
                            "model": analysis_settings.model,
                            "temperature": analysis_settings.temperature,
                            "max_tokens": analysis_settings.max_tokens,
                        },
                        build_text_summary=True,
                    )
                    summary_text = result.get("summary_text", "")
                    if summary_text:
                        all_summaries.append(f"章节 {chapter_id}:\n{summary_text}")
                    success_count += 1
                except Exception as e:
                    error_count += 1
                    logger.error(f"分析章节 {chapter_id} 失败: {e}", exc_info=True)
                    all_summaries.append(f"章节 {chapter_id} 分析失败: {str(e)}")

            # 构建返回消息
            response_text = f"章节组件信息分析完成：成功 {success_count}，失败 {error_count}，总计 {len(chapter_ids)}"
            if all_summaries:
                response_text += "\n\n" + "\n\n".join(all_summaries)

            return {
                "code": 200,
                "message": "分析完成",
                "data": response_text,
            }

        elif disable_memory and query_lower.startswith(("/analysis-chapter", "/analysis-work")):
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                raise HTTPException(status_code=400, detail="未能从 user_id 解析 work_id，无法执行章节分析")

            # 使用原始的 chat_req.query 而不是 processed_query，因为 processed_query 已经替换了 @chapter:2122
            ids = _parse_chapter_ids_from_command(chat_req.query) if chat_req.query.strip().lower().startswith("/analysis-chapter") else None
            chapter_id_list = ids if ids else None

            # 权限与服务检查
            work_service = WorkService(db)
            work = await work_service.get_work_by_id(work_id)
            if not work:
                raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")

            chapter_service = ChapterService(db)
            if not await chapter_service.can_edit_work(user_id=int(work.owner_id), work_id=work_id):
                raise HTTPException(status_code=403, detail="没有编辑该作品的权限")

            ai_service = get_ai_service()
            if not ai_service.is_healthy():
                raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

            analysis_settings = AnalysisSettings()
            book_analysis_service = BookAnalysisService(db)

            success_count = 0
            error_count = 0
            total = 0
            messages_log = []
            async for result in book_analysis_service.generate_outlines_for_all_chapters(
                work_id=work_id,
                ai_service=ai_service,
                prompt=None,
                settings={
                    "model": analysis_settings.model,
                    "temperature": analysis_settings.temperature,
                    "max_tokens": analysis_settings.max_tokens,
                },
                chapter_ids=chapter_id_list,
            ):
                total += 1
                if "error" in result:
                    error_count += 1
                    messages_log.append(f"章节 {result.get('chapter_number') or result.get('chapter_id')} 失败: {result.get('error')}")
                else:
                    success_count += 1
                    messages_log.append(f"章节 {result.get('chapter_number') or result.get('chapter_id')} 完成")

            summary = f"章节大纲生成完成：成功 {success_count}，失败 {error_count}，总计 {total}"
            content = "\n".join(messages_log + [summary])
            references = []
        elif disable_memory:
            # 无记忆模式：直接调用大模型
            history_msgs = processed_history[-20:] if processed_history else []
            messages = [*history_msgs, {"role": "user", "content": processed_query}]

            backend = mos_product.config.chat_model.backend
            if backend in ["huggingface", "vllm", "openai"]:
                resp_stream = mos_product.chat_llm.generate_stream(messages)
                content = ""
                for chunk in resp_stream:
                    if chunk in ["<think>", "</think>"]:
                        continue
                    content += chunk
                references = []
            else:
                content = mos_product.chat_llm.generate(messages)
                references = []
        else:
            # Collect all responses from the generator
            content, references = mos_product.chat(
                query=processed_query,
                user_id=chat_req.user_id,
                cube_id=chat_req.mem_cube_id,
                history=processed_history,
                internet_search=chat_req.internet_search,
                moscube=chat_req.moscube,
                base_prompt=chat_req.base_prompt,
                top_k=chat_req.top_k,
                threshold=chat_req.threshold,
                session_id=chat_req.session_id,
            )

        # Return the complete response
        return {
            "message": "Chat completed successfully",
            "data": {"response": content, "references": references},
        }

    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to start chat: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.get("/users", summary="List all users", response_model=BaseResponse[list])
def list_users():
    """List all registered users."""
    try:
        mos_product = get_mos_product_instance()
        users = mos_product.list_users()
        return BaseResponse(message="Users retrieved successfully", data=users)
    except Exception as err:
        logger.error(f"Failed to list users: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.get("/users/{user_id}", summary="Get user info", response_model=BaseResponse[dict])
async def get_user_info(user_id: str):
    """Get user information including accessible cubes."""
    try:
        mos_product = get_mos_product_instance()
        user_info = mos_product.get_user_info(user_id)
        return BaseResponse(message="User info retrieved successfully", data=user_info)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to get user info: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.get(
    "/configure/{user_id}", summary="Get MOSProduct configuration", response_model=SimpleResponse
)
def get_config(user_id: str):
    """Get MOSProduct configuration."""
    global MOS_PRODUCT_INSTANCE
    config = MOS_PRODUCT_INSTANCE.default_config
    return SimpleResponse(message="Configuration retrieved successfully", data=config)


@router.get(
    "/users/{user_id}/config", summary="Get user configuration", response_model=BaseResponse[dict]
)
def get_user_config(user_id: str):
    """Get user-specific configuration."""
    try:
        mos_product = get_mos_product_instance()
        config = mos_product.get_user_config(user_id)
        if config:
            return BaseResponse(
                message="User configuration retrieved successfully",
                data=config.model_dump(mode="json"),
            )
        else:
            raise HTTPException(
                status_code=404, detail=f"Configuration not found for user {user_id}"
            )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to get user config: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.put(
    "/users/{user_id}/config", summary="Update user configuration", response_model=SimpleResponse
)
def update_user_config(user_id: str, config_data: dict):
    """Update user-specific configuration."""
    try:
        mos_product = get_mos_product_instance()

        # Create MOSConfig from the provided data
        config = MOSConfig(**config_data)

        # Update the configuration
        success = mos_product.update_user_config(user_id, config)
        if success:
            return SimpleResponse(message="User configuration updated successfully")
        else:
            raise HTTPException(status_code=500, detail="Failed to update user configuration")

    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(traceback.format_exc())) from err
    except Exception as err:
        logger.error(f"Failed to update user config: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.get(
    "/instances/status", summary="Get user configuration status", response_model=BaseResponse[dict]
)
def get_instance_status():
    """Get information about active user configurations in memory."""
    try:
        mos_product = get_mos_product_instance()
        status_info = mos_product.get_user_instance_info()
        return BaseResponse(
            message="User configuration status retrieved successfully", data=status_info
        )
    except Exception as err:
        logger.error(f"Failed to get user configuration status: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err


@router.get("/instances/count", summary="Get active user count", response_model=BaseResponse[int])
def get_active_user_count():
    """Get the number of active user configurations in memory."""
    try:
        mos_product = get_mos_product_instance()
        count = mos_product.get_active_user_count()
        return BaseResponse(message="Active user count retrieved successfully", data=count)
    except Exception as err:
        logger.error(f"Failed to get active user count: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(traceback.format_exc())) from err
