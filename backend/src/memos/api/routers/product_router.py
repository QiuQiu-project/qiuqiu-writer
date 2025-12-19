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

        # 处理提及替换
        mention_service = MentionService(db)
        processed_query = await mention_service.replace_mentions_in_text(chat_req.query, chat_req.user_id)
        processed_history = await mention_service.replace_mentions_in_history(chat_req.history or [], chat_req.user_id)

        def generate_chat_response():
            """Generate chat response as SSE stream."""
            try:
                # Directly yield from the generator without async wrapper
                yield from mos_product.chat_with_references(
                    query=processed_query,
                    user_id=chat_req.user_id,
                    cube_id=chat_req.mem_cube_id,
                    history=processed_history,
                    internet_search=chat_req.internet_search,
                    moscube=chat_req.moscube,
                    session_id=chat_req.session_id,
                )

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

        # 处理提及替换
        mention_service = MentionService(db)
        processed_query = await mention_service.replace_mentions_in_text(chat_req.query, chat_req.user_id)
        processed_history = await mention_service.replace_mentions_in_history(chat_req.history or [], chat_req.user_id)

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
