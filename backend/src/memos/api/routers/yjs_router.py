"""
Y-WebSocket Router

Provides WebSocket endpoints for Yjs real-time collaborative editing.
Compatible with the y-websocket npm package's WebsocketProvider.

Usage from frontend:
  new WebsocketProvider('ws://server/api/v1/yjs', roomName, ydoc)
  → connects to ws://server/api/v1/yjs/{roomName}
"""

import logging
from typing import Optional

from fastapi import APIRouter, WebSocket

from memos.api.services.yjs_ws_handler import yjs_ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/yjs", tags=["yjs"])


@router.post("/{room_name}/sync")
async def force_sync(room_name: str):
    """
    Force a database sync for a room.
    Useful when switching chapters to ensure immediate persistence to MongoDB.
    """
    success = await yjs_ws_manager.force_sync(room_name)
    return {"success": success, "room": room_name}


@router.websocket("/{room_name}")
async def yjs_websocket(
    websocket: WebSocket,
    room_name: str,
    token: Optional[str] = None,
):
    """
    Y-WebSocket endpoint for real-time collaboration.

    Room name format: "work_{workId}" (one WebSocket per work; chapters use Y.Doc fragments "chapter_{chapterId}")
    Optional query param: ?token=xxx for authentication

    The endpoint speaks the standard y-websocket binary protocol:
    - Sync messages (type 0): document state synchronization
    - Awareness messages (type 1): cursor position relay
    """
    await websocket.accept()

    # TODO: Add token-based authentication here
    # if token:
    #     user = await verify_token(token)
    #     if not user:
    #         await websocket.close(code=1008, reason="Invalid token")
    #         return

    logger.info(f"[YjsRouter] New connection for room: {room_name}")
    await yjs_ws_manager.handle_connection(websocket, room_name)
