"""
Server API Router for MemOS (Class-based handlers version).

This router demonstrates the improved architecture using class-based handlers
with dependency injection, providing better modularity and maintainability.

Comparison with function-based approach:
- Cleaner code: No need to pass dependencies in every endpoint
- Better testability: Easy to mock handler dependencies
- Improved extensibility: Add new handlers or modify existing ones easily
- Clear separation of concerns: Router focuses on routing, handlers handle business logic
"""

import os
import random as _random
import socket

from fastapi import APIRouter

from memos.api import handlers
from memos.api.handlers.add_handler import AddHandler
from memos.api.handlers.base_handler import HandlerDependencies
from memos.api.handlers.chat_handler import ChatHandler
from memos.api.handlers.search_handler import SearchHandler
from memos.api.product_models import (
    APIADDRequest,
    APIChatCompleteRequest,
    APISearchRequest,
    ChatRequest,
    GetMemoryRequest,
    MemoryResponse,
    SearchResponse,
    SuggestionRequest,
    SuggestionResponse,
)
from memos.log import get_logger
from memos.mem_scheduler.base_scheduler import BaseScheduler


logger = get_logger(__name__)

router = APIRouter(prefix="/product", tags=["Server API"])

# Instance ID for identifying this server instance in logs and responses
INSTANCE_ID = f"{socket.gethostname()}:{os.getpid()}:{_random.randint(1000, 9999)}"

# Lazy initialization - components will be initialized on first use
_components = None
_dependencies = None
_search_handler = None
_add_handler = None
_chat_handler = None
_mem_scheduler = None
_llm = None
_naive_mem_cube = None


def _init_components():
    """Lazy initialization of server components."""
    global _components, _dependencies, _search_handler, _add_handler, _chat_handler
    global _mem_scheduler, _llm, _naive_mem_cube
    
    if _components is None:
        try:
            _components = handlers.init_server()
            _dependencies = HandlerDependencies.from_init_server(_components)
            _search_handler = SearchHandler(_dependencies)
            _add_handler = AddHandler(_dependencies)
            _chat_handler = ChatHandler(
                _dependencies, _search_handler, _add_handler, online_bot=_components.get("online_bot")
            )
            _mem_scheduler = _components["mem_scheduler"]
            _llm = _components["llm"]
            _naive_mem_cube = _components["naive_mem_cube"]
        except Exception as e:
            logger.error(f"Failed to initialize server components: {e}", exc_info=True)
            raise
    
    return {
        "components": _components,
        "dependencies": _dependencies,
        "search_handler": _search_handler,
        "add_handler": _add_handler,
        "chat_handler": _chat_handler,
        "mem_scheduler": _mem_scheduler,
        "llm": _llm,
        "naive_mem_cube": _naive_mem_cube,
    }


def get_components():
    """Get initialized components, initializing if necessary."""
    return _init_components()


# =============================================================================
# Search API Endpoints
# =============================================================================


@router.post("/search", summary="Search memories", response_model=SearchResponse)
def search_memories(search_req: APISearchRequest):
    """
    Search memories for a specific user.

    This endpoint uses the class-based SearchHandler for better code organization.
    """
    comps = get_components()
    return comps["search_handler"].handle_search_memories(search_req)


# =============================================================================
# Add API Endpoints
# =============================================================================


@router.post("/add", summary="Add memories", response_model=MemoryResponse)
def add_memories(add_req: APIADDRequest):
    """
    Add memories for a specific user.

    This endpoint uses the class-based AddHandler for better code organization.
    """
    comps = get_components()
    return comps["add_handler"].handle_add_memories(add_req)


# =============================================================================
# Scheduler API Endpoints
# =============================================================================


@router.get("/scheduler/status", summary="Get scheduler running status")
def scheduler_status(user_name: str | None = None):
    """Get scheduler running status."""
    comps = get_components()
    return handlers.scheduler_handler.handle_scheduler_status(
        user_name=user_name,
        mem_scheduler=comps["mem_scheduler"],
        instance_id=INSTANCE_ID,
    )


@router.post("/scheduler/wait", summary="Wait until scheduler is idle for a specific user")
def scheduler_wait(
    user_name: str,
    timeout_seconds: float = 120.0,
    poll_interval: float = 0.2,
):
    """Wait until scheduler is idle for a specific user."""
    comps = get_components()
    return handlers.scheduler_handler.handle_scheduler_wait(
        user_name=user_name,
        timeout_seconds=timeout_seconds,
        poll_interval=poll_interval,
        mem_scheduler=comps["mem_scheduler"],
    )


@router.get("/scheduler/wait/stream", summary="Stream scheduler progress for a user")
def scheduler_wait_stream(
    user_name: str,
    timeout_seconds: float = 120.0,
    poll_interval: float = 0.2,
):
    """Stream scheduler progress via Server-Sent Events (SSE)."""
    comps = get_components()
    return handlers.scheduler_handler.handle_scheduler_wait_stream(
        user_name=user_name,
        timeout_seconds=timeout_seconds,
        poll_interval=poll_interval,
        mem_scheduler=comps["mem_scheduler"],
        instance_id=INSTANCE_ID,
    )


# =============================================================================
# Chat API Endpoints
# =============================================================================


@router.post("/chat/complete", summary="Chat with MemOS (Complete Response)")
def chat_complete(chat_req: APIChatCompleteRequest):
    """
    Chat with MemOS for a specific user. Returns complete response (non-streaming).

    This endpoint uses the class-based ChatHandler.
    """
    comps = get_components()
    return comps["chat_handler"].handle_chat_complete(chat_req)


@router.post("/chat", summary="Chat with MemOS")
def chat(chat_req: ChatRequest):
    """
    Chat with MemOS for a specific user. Returns SSE stream.

    This endpoint uses the class-based ChatHandler which internally
    composes SearchHandler and AddHandler for a clean architecture.
    """
    comps = get_components()
    return comps["chat_handler"].handle_chat_stream(chat_req)


# =============================================================================
# Suggestion API Endpoints
# =============================================================================


@router.post(
    "/suggestions",
    summary="Get suggestion queries",
    response_model=SuggestionResponse,
)
def get_suggestion_queries(suggestion_req: SuggestionRequest):
    """Get suggestion queries for a specific user with language preference."""
    comps = get_components()
    return handlers.suggestion_handler.handle_get_suggestion_queries(
        user_id=suggestion_req.mem_cube_id,
        language=suggestion_req.language,
        message=suggestion_req.message,
        llm=comps["llm"],
        naive_mem_cube=comps["naive_mem_cube"],
    )


# =============================================================================
# Memory Retrieval API Endpoints
# =============================================================================


@router.post("/get_all", summary="Get all memories for user", response_model=MemoryResponse)
def get_all_memories(memory_req: GetMemoryRequest):
    """
    Get all memories or subgraph for a specific user.

    If search_query is provided, returns a subgraph based on the query.
    Otherwise, returns all memories of the specified type.
    """
    comps = get_components()
    if memory_req.search_query:
        return handlers.memory_handler.handle_get_subgraph(
            user_id=memory_req.user_id,
            mem_cube_id=(
                memory_req.mem_cube_ids[0] if memory_req.mem_cube_ids else memory_req.user_id
            ),
            query=memory_req.search_query,
            top_k=20,
            naive_mem_cube=comps["naive_mem_cube"],
        )
    else:
        return handlers.memory_handler.handle_get_all_memories(
            user_id=memory_req.user_id,
            mem_cube_id=(
                memory_req.mem_cube_ids[0] if memory_req.mem_cube_ids else memory_req.user_id
            ),
            memory_type=memory_req.memory_type or "text_mem",
            naive_mem_cube=comps["naive_mem_cube"],
        )
