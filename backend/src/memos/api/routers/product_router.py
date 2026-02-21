import json
import os
import queue
import threading
import time
import traceback
import asyncio

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.config import APIConfig
from memos.api.core.database import get_async_db, AsyncSessionLocal
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

router = APIRouter(prefix="/api/v1/product", tags=["Product API"])

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


def _parse_work_id_from_user_id(user_id: str) -> str | None:
    """
    解析形如 user_{uid}_work_{workId} 的 user_id，提取 workId（支持 40 位字符串或数字）。
    """
    if not user_id or "_work_" not in user_id:
        return None
    parts = user_id.split("_work_")
    work_part = (parts[-1] or "").strip()
    if not work_part:
        return None
    # 兼容历史数字 ID
    if work_part.isdigit():
        return work_part
    # 40 位字符串 ID（可含字母、数字、-、_）
    if len(work_part) <= 50 and all(c.isalnum() or c in "-_" for c in work_part):
        return work_part
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


def _parse_continue_chapter_user_description(query: str) -> str | None:
    """
    从 /continue-chapter 命令中解析用户对下一章的语言描述。
    格式：/continue-chapter [可选章节号或 @chapter:id] [用户描述]
    返回用户描述部分，若无则返回 None。
    """
    import re
    prefix = "/continue-chapter"
    q = query.strip()
    if not q.lower().startswith(prefix):
        return None
    rest = q[len(prefix) :].strip()
    if not rest:
        return None
    # 去掉开头的章节引用（@chapter:123 或纯数字），剩余即为用户描述
    m = re.match(r"^(@chapter:\d+|\d+)\s*", rest, re.IGNORECASE)
    if m:
        rest = rest[m.end() :].strip()
    return rest if rest else None


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
            # create_user_config 返回 (default_config, default_mem_cube)，需用 config 供 register_mem_cube 使用
            user_config, default_mem_cube = APIConfig.create_user_config(
                user_name=user_id,
                user_id=user_id,
            )
            default_cube_config = default_mem_cube.config if default_mem_cube else None

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
                
                # 重新加载 cube 使用新配置（register_mem_cube 需要 GeneralMemCubeConfig，不能传 GeneralMemCube）
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
                        default_config=default_cube_config,  # GeneralMemCubeConfig 以强制重新加载
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
async def chat(chat_req: ChatRequest):
    """Chat with MemOS for a specific user. Returns SSE stream.
    使用短生命周期 session 仅做提及替换后即释放，避免流式响应期间占用连接池影响其他接口。
    """
    try:
        mos_product = get_mos_product_instance()
        ensure_memos_user_exists(chat_req.user_id)

        command_prefixes = ("/analysis-chapter", "/analysis-chapter-info", "/verification-chapter-info", "/continue-chapter")
        is_command = chat_req.query.strip().lower().startswith(command_prefixes)

        # 仅在此处使用 db，用毕即释放，不随流式响应长期占用连接
        async with AsyncSessionLocal() as db:
            mention_service = MentionService(db)
            processed_query = await mention_service.replace_mentions_in_text(chat_req.query, chat_req.user_id)
            processed_history = await mention_service.replace_mentions_in_history(chat_req.history or [], chat_req.user_id)

        disable_memory = not chat_req.use_memory or is_command

        async def run_continue_chapter_stream():
            """续写章节：根据前三章大纲细纲与前一章内容，流式返回 3 个推荐大纲细纲。支持用户描述下一章大致方向。"""
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                yield f"data: {json.dumps({'type': 'error', 'content': '未能从 user_id 解析出 work_id，无法执行续写章节'})}\n\n"
                return
            # 解析命令中的章节 ID，例如 /continue-chapter @chapter:2384
            # 第一个提取到的章节 ID 即为 previous_chapter_id
            chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
            previous_chapter_id = chapter_ids[0] if chapter_ids else None
            user_description = _parse_continue_chapter_user_description(chat_req.query)

            async with AsyncSessionLocal() as stream_db:
                try:
                    yield f"data: {json.dumps({'type': 'status', 'data': '0'})}\n\n"
                    yield f"data: {json.dumps({'type': 'text', 'data': '正在根据前三章大纲、细纲与前一章内容生成续写推荐…'}, ensure_ascii=False)}\n\n"

                    work_service = WorkService(stream_db)
                    work = await work_service.get_work_by_id(work_id)
                    if not work:
                        yield f"data: {json.dumps({'type': 'error', 'content': f'作品 {work_id} 不存在'})}\n\n"
                        return
                    chapter_service = ChapterService(stream_db)
                    if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
                        yield f"data: {json.dumps({'type': 'error', 'content': '没有编辑该作品的权限'})}\n\n"
                        return
                    ai_service = get_ai_service()
                    if not ai_service.is_healthy():
                        yield f"data: {json.dumps({'type': 'error', 'content': 'AI服务不可用，请检查配置'})}\n\n"
                        return

                    analysis_settings = AnalysisSettings()
                    book_analysis_service = BookAnalysisService(stream_db)
                    logger.info(f"开始生成续写章节推荐: work_id={work_id}, previous_chapter_id={previous_chapter_id}, user_description={user_description}")
                    
                    try:
                        # 使用 asyncio.create_task 包装耗时任务，以便发送心跳
                        task = asyncio.create_task(book_analysis_service.generate_continue_chapter_outlines(
                            work_id=work_id,
                            ai_service=ai_service,
                            previous_chapter_id=previous_chapter_id,
                            user_description=user_description,
                            settings={
                                "model": analysis_settings.model,
                                "temperature": analysis_settings.temperature,
                                "max_tokens": analysis_settings.max_tokens,
                            },
                        ))

                        # 循环等待任务完成，期间发送心跳保持连接
                        while not task.done():
                            await asyncio.sleep(3)
                            yield f"data: {json.dumps({'type': 'ping', 'data': 'keep-alive'})}\n\n"

                        # 获取任务结果
                        result = await task
                        await stream_db.commit()

                        payload = {
                            "next_chapter_number": result.get("next_chapter_number"),
                            "recommendations": result.get("recommendations", []),
                        }
                        logger.info(f"续写章节结果: next_chapter_number={payload.get('next_chapter_number')}, recommendations_count={len(payload.get('recommendations', []))}")
                        if not payload.get("next_chapter_number"):
                            logger.warning(f"续写章节结果中 next_chapter_number 为空: result={result}")
                        if not payload.get("recommendations"):
                            logger.warning(f"续写章节结果中 recommendations 为空: result={result}")
                        
                        result_json = json.dumps({'type': 'continue_chapter_result', 'data': payload}, ensure_ascii=False)
                        logger.info(f"发送 continue_chapter_result: {result_json[:200]}...")
                        yield f"data: {result_json}\n\n"
                        yield f"data: {json.dumps({'type': 'end'})}\n\n"
                    except Exception as inner_e:
                        await stream_db.rollback()
                        error_msg = f"生成续写章节推荐失败: {str(inner_e)}"
                        logger.error(f"Error in generate_continue_chapter_outlines: {inner_e}", exc_info=True)
                        yield f"data: {json.dumps({'type': 'error', 'content': error_msg}, ensure_ascii=False)}\n\n"
                        yield f"data: {json.dumps({'type': 'end'})}\n\n"
                        return
                except Exception as e:
                    await stream_db.rollback()
                    error_msg = f"续写章节流处理失败: {str(e)}"
                    logger.error(f"Error in continue-chapter stream: {e}", exc_info=True)
                    yield f"data: {json.dumps({'type': 'error', 'content': error_msg}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'end'})}\n\n"

        async def run_generate_outlines_stream():
            """调用章节大纲生成服务并流式返回结果文本。流内使用独立 session，避免请求 session 在流被取消时非法关闭。"""
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                yield f"data: {json.dumps({'type': 'error', 'content': '未能从 user_id 解析出 work_id，无法执行章节分析'})}\n\n"
                return

            chapter_ids = None
            if chat_req.query.strip().lower().startswith("/analysis-chapter"):
                ids = _parse_chapter_ids_from_command(chat_req.query)
                chapter_ids = ids if ids else None

            async with AsyncSessionLocal() as stream_db:
                try:
                    yield f"data: {json.dumps({'type': 'status', 'data': '0'})}\n\n"

                    work_service = WorkService(stream_db)
                    work = await work_service.get_work_by_id(work_id)
                    if not work:
                        raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")

                    chapter_service = ChapterService(stream_db)
                    if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
                        raise HTTPException(status_code=403, detail="没有编辑该作品的权限")

                    ai_service = get_ai_service()
                    if not ai_service.is_healthy():
                        raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

                    analysis_settings = AnalysisSettings()
                    book_analysis_service = BookAnalysisService(stream_db)

                    chapter_id_list = chapter_ids
                    success_count = 0
                    error_count = 0
                    total = 0
                    
                    iterator = book_analysis_service.generate_outlines_for_all_chapters(
                        work_id=work_id,
                        ai_service=ai_service,
                        prompt=None,
                        settings={
                            "model": analysis_settings.model,
                            "temperature": analysis_settings.temperature,
                            "max_tokens": analysis_settings.max_tokens,
                        },
                        chapter_ids=chapter_id_list,
                    )

                    while True:
                        try:
                            # 包装迭代器的 __anext__ 方法以支持心跳
                            task = asyncio.create_task(iterator.__anext__())
                            while not task.done():
                                await asyncio.sleep(3)
                                yield f"data: {json.dumps({'type': 'ping', 'data': 'keep-alive'})}\n\n"
                            result = await task
                        except StopAsyncIteration:
                            break
                        
                        total += 1
                        if "error" in result:
                            error_count += 1
                            error_msg = f"章节 {result.get('chapter_number') or result.get('chapter_id')} 失败: {result.get('error')}"
                            yield f"data: {json.dumps({'type': 'text', 'data': error_msg}, ensure_ascii=False)}\n\n"
                        else:
                            success_count += 1
                            success_msg = f"章节 {result.get('chapter_number') or result.get('chapter_id')} 完成"
                            yield f"data: {json.dumps({'type': 'text', 'data': success_msg}, ensure_ascii=False)}\n\n"

                    await stream_db.commit()
                    summary = f"章节大纲生成完成：成功 {success_count}，失败 {error_count}，总计 {total}"
                    yield f"data: {json.dumps({'type': 'text', 'data': summary}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'end'})}\n\n"
                except Exception as e:
                    await stream_db.rollback()
                    logger.error(f"Error in analysis stream: {e}", exc_info=True)
                    error_data = f"data: {json.dumps({'type': 'error', 'content': str(traceback.format_exc())})}\n\n"
                    yield error_data

        async def run_chapter_info_analysis_stream():
            """调用章节组件信息分析服务并流式返回结果文本。流内使用独立 session。"""
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                yield f"data: {json.dumps({'type': 'error', 'content': '未能从 user_id 解析出 work_id，无法执行章节组件信息分析'})}\n\n"
                return

            async with AsyncSessionLocal() as stream_db:
                try:
                    yield f"data: {json.dumps({'type': 'status', 'data': '0'})}\n\n"

                    work_service = WorkService(stream_db)
                    work = await work_service.get_work_by_id(work_id)
                    if not work:
                        raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")

                    chapter_service = ChapterService(stream_db)
                    if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
                        raise HTTPException(status_code=403, detail="没有编辑该作品的权限")

                    chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
                    if not chapter_ids:
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
                    book_analysis_service = BookAnalysisService(stream_db)
                    current_user_id = work.owner_id

                    total = len(chapter_ids)
                    success_count = 0
                    error_count = 0
                    all_summaries = []

                    for idx, chapter_id in enumerate(chapter_ids, 1):
                        try:
                            yield f"data: {json.dumps({'type': 'text', 'data': f'正在分析章节 {idx}/{total} (ID: {chapter_id})...'}, ensure_ascii=False)}\n\n"

                            task = asyncio.create_task(book_analysis_service.component_data_insert_to_work(
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
                            ))

                            while not task.done():
                                await asyncio.sleep(3)
                                yield f"data: {json.dumps({'type': 'ping', 'data': 'keep-alive'})}\n\n"

                            result = await task

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

                    await stream_db.commit()
                    final_summary = f"\n章节组件信息分析完成：成功 {success_count}，失败 {error_count}，总计 {total}"
                    if all_summaries:
                        final_summary += "\n\n" + "\n\n".join(all_summaries)
                    yield f"data: {json.dumps({'type': 'text', 'data': final_summary}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'end'})}\n\n"

                except Exception as e:
                    await stream_db.rollback()
                    logger.error(f"Error in chapter info analysis stream: {e}", exc_info=True)
                    error_data = f"data: {json.dumps({'type': 'error', 'content': str(traceback.format_exc())})}\n\n"
                    yield error_data

        async def run_chapter_info_verification_stream():
            """调用章节信息校验服务并流式返回结果文本。流内使用独立 session。"""
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                yield f"data: {json.dumps({'type': 'error', 'content': '未能从 user_id 解析出 work_id，无法执行章节信息校验'})}\n\n"
                return

            async with AsyncSessionLocal() as stream_db:
                try:
                    yield f"data: {json.dumps({'type': 'status', 'data': '0'})}\n\n"

                    work_service = WorkService(stream_db)
                    work = await work_service.get_work_by_id(work_id)
                    if not work:
                        raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")

                    chapter_service = ChapterService(stream_db)
                    if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
                        raise HTTPException(status_code=403, detail="没有编辑该作品的权限")

                    chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
                    if not chapter_ids:
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
                            yield f"data: {json.dumps({'type': 'error', 'content': '作品中没有章节，无法执行信息校验'})}\n\n"
                            return

                    ai_service = get_ai_service()
                    if not ai_service.is_healthy():
                        raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

                    analysis_settings = AnalysisSettings()
                    book_analysis_service = BookAnalysisService(stream_db)
                    current_user_id = work.owner_id

                    total = len(chapter_ids)
                    success_count = 0
                    error_count = 0
                    all_summaries = []

                    for idx, chapter_id in enumerate(chapter_ids, 1):
                        try:
                            yield f"data: {json.dumps({'type': 'text', 'data': f'正在校验章节 {idx}/{total} (ID: {chapter_id})...'}, ensure_ascii=False)}\n\n"

                            task = asyncio.create_task(book_analysis_service.verify_chapter_info(
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
                            ))

                            while not task.done():
                                await asyncio.sleep(3)
                                yield f"data: {json.dumps({'type': 'ping', 'data': 'keep-alive'})}\n\n"

                            result = await task

                            summary_text = result.get("summary_text", "")
                            if summary_text:
                                all_summaries.append(f"章节 {chapter_id}:\n{summary_text}")
                                yield f"data: {json.dumps({'type': 'text', 'data': summary_text}, ensure_ascii=False)}\n\n"

                            success_count += 1
                            yield f"data: {json.dumps({'type': 'text', 'data': f'章节 {chapter_id} 校验完成'}, ensure_ascii=False)}\n\n"

                        except Exception as e:
                            error_count += 1
                            error_msg = str(e)
                            logger.error(f"校验章节 {chapter_id} 失败: {e}", exc_info=True)
                            yield f"data: {json.dumps({'type': 'text', 'data': f'章节 {chapter_id} 校验失败: {error_msg}'}, ensure_ascii=False)}\n\n"

                    await stream_db.commit()
                    final_summary = f"\n章节信息校验完成：成功 {success_count}，失败 {error_count}，总计 {total}"
                    if all_summaries:
                        final_summary += "\n\n" + "\n\n".join(all_summaries)
                    yield f"data: {json.dumps({'type': 'text', 'data': final_summary}, ensure_ascii=False)}\n\n"
                    yield f"data: {json.dumps({'type': 'end'})}\n\n"

                except Exception as e:
                    await stream_db.rollback()
                    logger.error(f"Error in chapter info verification stream: {e}", exc_info=True)
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
                if disable_memory and query_lower.startswith("/continue-chapter"):
                    async for chunk in run_continue_chapter_stream():
                        yield chunk
                elif disable_memory and query_lower.startswith("/verification-chapter-info"):
                    async for chunk in run_chapter_info_verification_stream():
                        yield chunk
                elif disable_memory and query_lower.startswith("/analysis-chapter-info"):
                    async for chunk in run_chapter_info_analysis_stream():
                        yield chunk
                elif disable_memory and query_lower.startswith("/analysis-chapter"):
                    async for chunk in run_generate_outlines_stream():
                        yield chunk
                elif disable_memory:
                    async for chunk in generate_simple_stream():
                        yield chunk
                else:
                    # 同步生成器会阻塞事件循环，导致其他接口卡顿；放到线程中消费，通过队列传回
                    chunk_queue = queue.Queue()
                    thread_exc = []

                    def run_sync_stream():
                        try:
                            for chunk in mos_product.chat_with_references(
                                query=processed_query,
                                user_id=chat_req.user_id,
                                cube_id=chat_req.mem_cube_id,
                                history=processed_history,
                                internet_search=chat_req.internet_search,
                                moscube=chat_req.moscube,
                                session_id=chat_req.session_id,
                            ):
                                chunk_queue.put(chunk)
                        except Exception as e:
                            thread_exc.append(e)
                        finally:
                            chunk_queue.put(None)

                    threading.Thread(target=run_sync_stream, daemon=True).start()
                    loop = asyncio.get_event_loop()
                    while True:
                        chunk = await loop.run_in_executor(None, chunk_queue.get)
                        if chunk is None:
                            break
                        yield chunk
                    if thread_exc:
                        raise thread_exc[0]

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
async def chat_complete(chat_req: ChatCompleteRequest):
    """Chat with MemOS for a specific user. Returns complete response (non-streaming).
    使用短生命周期 session 做提及替换；各命令分支内再按需创建 session，避免 LLM 调用期间占用连接池。
    """
    try:
        mos_product = get_mos_product_instance()
        ensure_memos_user_exists(chat_req.user_id)

        command_prefixes = ("/analysis-chapter", "/analysis-chapter-info", "/verification-chapter-info", "/continue-chapter")
        is_command = chat_req.query.strip().lower().startswith(command_prefixes)

        async with AsyncSessionLocal() as _db:
            mention_service = MentionService(_db)
            processed_query = await mention_service.replace_mentions_in_text(chat_req.query, chat_req.user_id)
            processed_history = await mention_service.replace_mentions_in_history(chat_req.history or [], chat_req.user_id)

        disable_memory = not chat_req.use_memory or is_command

        query_lower = chat_req.query.strip().lower()
        if disable_memory and query_lower.startswith("/continue-chapter"):
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                raise HTTPException(status_code=400, detail="未能从 user_id 解析 work_id，无法执行续写章节")
            chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
            previous_chapter_id = chapter_ids[0] if chapter_ids else None
            user_description = _parse_continue_chapter_user_description(chat_req.query)
            async with AsyncSessionLocal() as db:
                work_service = WorkService(db)
                work = await work_service.get_work_by_id(work_id)
                if not work:
                    raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")
                chapter_service = ChapterService(db)
                if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
                    raise HTTPException(status_code=403, detail="没有编辑该作品的权限")
                ai_service = get_ai_service()
                if not ai_service.is_healthy():
                    raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")
                analysis_settings = AnalysisSettings()
                book_analysis_service = BookAnalysisService(db)
                try:
                    result = await book_analysis_service.generate_continue_chapter_outlines(
                        work_id=work_id,
                        ai_service=ai_service,
                        previous_chapter_id=previous_chapter_id,
                        user_description=user_description,
                        settings={
                            "model": analysis_settings.model,
                            "temperature": analysis_settings.temperature,
                            "max_tokens": analysis_settings.max_tokens,
                        },
                    )
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))
                payload = {
                    "next_chapter_number": result.get("next_chapter_number"),
                    "recommendations": result.get("recommendations", []),
                }
                return {"code": 200, "status": "success", "message": "续写推荐生成完成", "data": payload}

        if disable_memory and query_lower.startswith("/verification-chapter-info"):
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                raise HTTPException(status_code=400, detail="未能从 user_id 解析 work_id，无法执行章节信息校验")
            chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
            async with AsyncSessionLocal() as db:
                if not chapter_ids:
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
                        raise HTTPException(status_code=400, detail="作品中没有章节，无法执行信息校验")
                work_service = WorkService(db)
                work = await work_service.get_work_by_id(work_id)
                if not work:
                    raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")
                chapter_service = ChapterService(db)
                if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
                    raise HTTPException(status_code=403, detail="没有编辑该作品的权限")
                ai_service = get_ai_service()
                if not ai_service.is_healthy():
                    raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")
                analysis_settings = AnalysisSettings()
                book_analysis_service = BookAnalysisService(db)
                current_user_id = work.owner_id
                all_summaries = []
                success_count = 0
                error_count = 0
                for chapter_id in chapter_ids:
                    try:
                        result = await book_analysis_service.verify_chapter_info(
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
                        logger.error(f"校验章节 {chapter_id} 失败: {e}", exc_info=True)
                        all_summaries.append(f"章节 {chapter_id} 校验失败: {str(e)}")
                response_text = f"章节信息校验完成：成功 {success_count}，失败 {error_count}，总计 {len(chapter_ids)}"
                if all_summaries:
                    response_text += "\n\n" + "\n\n".join(all_summaries)
                return {
                    "code": 200,
                    "status": "success",
                    "message": "校验完成",
                    "data": response_text,
                }

        elif disable_memory and query_lower.startswith("/analysis-chapter-info"):
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                raise HTTPException(status_code=400, detail="未能从 user_id 解析 work_id，无法执行章节组件信息分析")
            chapter_ids = _parse_chapter_ids_from_command(chat_req.query)
            async with AsyncSessionLocal() as db:
                if not chapter_ids:
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
                work_service = WorkService(db)
                work = await work_service.get_work_by_id(work_id)
                if not work:
                    raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")
                chapter_service = ChapterService(db)
                if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
                    raise HTTPException(status_code=403, detail="没有编辑该作品的权限")
                ai_service = get_ai_service()
                if not ai_service.is_healthy():
                    raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")
                analysis_settings = AnalysisSettings()
                book_analysis_service = BookAnalysisService(db)
                current_user_id = work.owner_id
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
                response_text = f"章节组件信息分析完成：成功 {success_count}，失败 {error_count}，总计 {len(chapter_ids)}"
                if all_summaries:
                    response_text += "\n\n" + "\n\n".join(all_summaries)
                return {
                    "code": 200,
                    "status": "success",
                    "message": "分析完成",
                    "data": response_text,
                }

        elif disable_memory and query_lower.startswith("/analysis-chapter"):
            work_id = _parse_work_id_from_user_id(chat_req.user_id)
            if not work_id:
                raise HTTPException(status_code=400, detail="未能从 user_id 解析 work_id，无法执行章节分析")
            ids = _parse_chapter_ids_from_command(chat_req.query) if chat_req.query.strip().lower().startswith("/analysis-chapter") else None
            chapter_id_list = ids if ids else None
            async with AsyncSessionLocal() as db:
                work_service = WorkService(db)
                work = await work_service.get_work_by_id(work_id)
                if not work:
                    raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")
                chapter_service = ChapterService(db)
                if not await chapter_service.can_edit_work(user_id=work.owner_id, work_id=work_id):
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
            # 无记忆模式：直接调用大模型（同步调用会阻塞事件循环，放线程池执行）
            history_msgs = processed_history[-20:] if processed_history else []
            messages = [*history_msgs, {"role": "user", "content": processed_query}]
            backend = mos_product.config.chat_model.backend

            def _run_disable_memory_chat():
                if backend in ["huggingface", "vllm", "openai"]:
                    resp_stream = mos_product.chat_llm.generate_stream(messages)
                    content = ""
                    for chunk in resp_stream:
                        if chunk in ["<think>", "</think>"]:
                            continue
                        content += chunk
                    return content, []
                else:
                    content = mos_product.chat_llm.generate(messages)
                    return content, []

            loop = asyncio.get_event_loop()
            content, references = await loop.run_in_executor(None, _run_disable_memory_chat)
        else:
            # 带记忆的 chat 内部有 search + LLM + 后处理，均为同步，放线程池避免阻塞事件循环
            def _run_chat():
                return mos_product.chat(
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

            loop = asyncio.get_event_loop()
            content, references = await loop.run_in_executor(None, _run_chat)

        # Return the complete response
        return {
            "code": 200,
            "status": "success",
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
