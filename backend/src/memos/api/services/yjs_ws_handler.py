"""
Y-WebSocket Protocol Handler for FastAPI

Implements the y-websocket binary sync protocol, compatible with the
y-websocket npm package's WebsocketProvider on the frontend.

Protocol:
- Message type 0 (MSG_SYNC): Yjs document sync protocol
  - Sub-type 0 (SYNC_STEP1): State vector exchange
  - Sub-type 1 (SYNC_STEP2): State diff (update)
  - Sub-type 2 (SYNC_UPDATE): Incremental update
- Message type 1 (MSG_AWARENESS): Cursor/selection awareness relay
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Optional, Set, Tuple

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# y-protocols message types
MSG_SYNC = 0
MSG_AWARENESS = 1

# y-protocols sync sub-types
MSG_SYNC_STEP1 = 0
MSG_SYNC_STEP2 = 1
MSG_SYNC_UPDATE = 2


# ===== lib0 variable-length integer encoding =====

def write_var_uint(value: int) -> bytes:
    """Encode a variable-length unsigned integer (lib0 compatible)."""
    buf = bytearray()
    while value > 0x7F:
        buf.append(0x80 | (value & 0x7F))
        value >>= 7
    buf.append(value & 0x7F)
    return bytes(buf)


def write_var_uint8_array(data: bytes) -> bytes:
    """Encode a length-prefixed byte array (lib0 compatible)."""
    return write_var_uint(len(data)) + data


def read_var_uint(data: bytes, offset: int) -> Tuple[int, int]:
    """Decode a variable-length unsigned integer. Returns (value, new_offset)."""
    result = 0
    shift = 0
    while offset < len(data):
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        if (byte & 0x80) == 0:
            break
        shift += 7
    return result, offset


def read_var_uint8_array(data: bytes, offset: int) -> Tuple[bytes, int]:
    """Decode a length-prefixed byte array. Returns (bytes, new_offset)."""
    length, offset = read_var_uint(data, offset)
    end = offset + length
    if end > len(data):
        raise ValueError(f"Unexpected end of data: need {end} bytes, have {len(data)}")
    return data[offset:end], end


class YjsRoom:
    """
    Manages a collaborative editing room.

    Each room corresponds to a document (e.g., a chapter) and maintains:
    - A server-side pycrdt.Doc for state management
    - A set of WebSocket connections (clients)
    - Periodic persistence to PostgreSQL
    """

    def __init__(self, room_name: str):
        self.room_name = room_name
        self.connections: Set[WebSocket] = set()
        self._doc = None
        self._lock = asyncio.Lock()
        self._persist_task: Optional[asyncio.Task] = None
        self._dirty = False

    @property
    def doc(self):
        """Lazily create pycrdt.Doc."""
        if self._doc is None:
            from pycrdt import Doc
            self._doc = Doc()
        return self._doc

    async def load_from_db(self):
        """Load document state from database on room creation."""
        try:
            from memos.api.core.database import AsyncSessionLocal
            from memos.api.models.yjs_document import YjsDocument
            from sqlalchemy import select

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(YjsDocument).where(
                        YjsDocument.document_id == self.room_name
                    )
                )
                doc_record = result.scalar_one_or_none()
                if doc_record and doc_record.yjs_state:
                    self.doc.apply_update(doc_record.yjs_state)
                    logger.info(
                        f"[YjsRoom:{self.room_name}] Loaded from DB "
                        f"({len(doc_record.yjs_state)} bytes)"
                    )
                else:
                    logger.info(
                        f"[YjsRoom:{self.room_name}] No existing state, starting fresh"
                    )
        except Exception as e:
            logger.error(f"[YjsRoom:{self.room_name}] Failed to load from DB: {e}")

    async def save_to_db(self):
        """Persist document state to database."""
        if not self._dirty:
            return
        try:
            from memos.api.core.database import AsyncSessionLocal
            from memos.api.models.yjs_document import YjsDocument
            from sqlalchemy import select

            async with self._lock:
                state = bytes(self.doc.get_update())

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(YjsDocument).where(
                        YjsDocument.document_id == self.room_name
                    )
                )
                existing = result.scalar_one_or_none()
                if existing:
                    existing.yjs_state = state
                    existing.updated_at = datetime.utcnow()
                else:
                    session.add(YjsDocument(
                        document_id=self.room_name,
                        yjs_state=state,
                    ))
                await session.commit()

            self._dirty = False
            logger.info(
                f"[YjsRoom:{self.room_name}] Saved to DB ({len(state)} bytes)"
            )
        except Exception as e:
            logger.error(f"[YjsRoom:{self.room_name}] Failed to save: {e}")

    async def add_client(self, ws: WebSocket):
        """Add a client and send initial sync step 1 (server's state vector)."""
        self.connections.add(ws)
        logger.info(
            f"[YjsRoom:{self.room_name}] Client joined "
            f"({len(self.connections)} total)"
        )

        # Send sync step 1: our state vector so the client can compute a diff
        async with self._lock:
            sv = bytes(self.doc.get_state())

        msg = (
            write_var_uint(MSG_SYNC)
            + write_var_uint(MSG_SYNC_STEP1)
            + write_var_uint8_array(sv)
        )
        await ws.send_bytes(msg)

        # Start periodic persistence if not running
        if self._persist_task is None or self._persist_task.done():
            self._persist_task = asyncio.create_task(self._periodic_persist())

    async def remove_client(self, ws: WebSocket):
        """Remove a client. Persist if room becomes empty."""
        self.connections.discard(ws)
        logger.info(
            f"[YjsRoom:{self.room_name}] Client left "
            f"({len(self.connections)} total)"
        )

        if not self.connections:
            # Room is empty - persist document and stop background task
            await self.save_to_db()
            if self._persist_task and not self._persist_task.done():
                self._persist_task.cancel()
                self._persist_task = None

    async def handle_message(self, ws: WebSocket, data: bytes):
        """Handle an incoming binary WebSocket message."""
        if len(data) < 1:
            return

        try:
            msg_type, offset = read_var_uint(data, 0)

            if msg_type == MSG_SYNC:
                await self._handle_sync(ws, data, offset)
            elif msg_type == MSG_AWARENESS:
                # Relay awareness messages to all other clients
                await self._broadcast(data, exclude=ws)
            else:
                logger.warning(
                    f"[YjsRoom:{self.room_name}] Unknown message type: {msg_type}"
                )
        except Exception as e:
            logger.error(
                f"[YjsRoom:{self.room_name}] Error handling message: {e}"
            )

    async def _handle_sync(self, ws: WebSocket, data: bytes, offset: int):
        """Handle sync protocol messages."""
        if offset >= len(data):
            return

        sync_type, offset = read_var_uint(data, offset)

        if sync_type == MSG_SYNC_STEP1:
            # Client sent its state vector → respond with our diff
            client_sv, _ = read_var_uint8_array(data, offset)

            async with self._lock:
                update = bytes(self.doc.get_update(client_sv))

            response = (
                write_var_uint(MSG_SYNC)
                + write_var_uint(MSG_SYNC_STEP2)
                + write_var_uint8_array(update)
            )
            await ws.send_bytes(response)

        elif sync_type == MSG_SYNC_STEP2:
            # Client sent an update in response to our step 1
            update, _ = read_var_uint8_array(data, offset)

            async with self._lock:
                self.doc.apply_update(update)
            self._dirty = True

        elif sync_type == MSG_SYNC_UPDATE:
            # Client sent an incremental document update
            update, _ = read_var_uint8_array(data, offset)

            async with self._lock:
                self.doc.apply_update(update)
            self._dirty = True

            # Broadcast update to all other clients in the room
            await self._broadcast(data, exclude=ws)

    async def _broadcast(
        self, data: bytes, exclude: Optional[WebSocket] = None
    ):
        """Broadcast a binary message to all clients except the sender."""
        disconnected = set()
        for conn in self.connections:
            if conn is exclude:
                continue
            try:
                await conn.send_bytes(data)
            except Exception:
                disconnected.add(conn)
        for conn in disconnected:
            self.connections.discard(conn)

    async def _periodic_persist(self):
        """Background task: save document to DB every 30 seconds."""
        try:
            while True:
                await asyncio.sleep(30)
                if self._dirty and self.connections:
                    await self.save_to_db()
        except asyncio.CancelledError:
            pass


class YjsWebSocketManager:
    """
    Top-level manager for all Y.js collaborative rooms.

    Handles room lifecycle:
    - Lazy room creation on first connection
    - Loading persisted state from DB
    - Cleaning up empty rooms
    - Graceful shutdown with persistence
    """

    def __init__(self):
        self.rooms: Dict[str, YjsRoom] = {}

    async def get_room(self, room_name: str) -> YjsRoom:
        """Get or create a room, loading state from DB if new."""
        if room_name not in self.rooms:
            room = YjsRoom(room_name)
            await room.load_from_db()
            self.rooms[room_name] = room
        return self.rooms[room_name]

    async def handle_connection(self, ws: WebSocket, room_name: str):
        """Handle a full WebSocket connection lifecycle for a room."""
        room = await self.get_room(room_name)
        await room.add_client(ws)

        try:
            while True:
                data = await ws.receive_bytes()
                await room.handle_message(ws, data)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"[YjsWS:{room_name}] Connection error: {e}")
        finally:
            await room.remove_client(ws)

            # Clean up empty rooms to free memory
            if not room.connections and room_name in self.rooms:
                del self.rooms[room_name]

    async def shutdown(self):
        """Persist all room states on server shutdown."""
        for room_name, room in self.rooms.items():
            room._dirty = True  # Force save
            await room.save_to_db()
        logger.info(
            f"[YjsWSManager] Saved {len(self.rooms)} rooms on shutdown"
        )


# Singleton instance
yjs_ws_manager = YjsWebSocketManager()
