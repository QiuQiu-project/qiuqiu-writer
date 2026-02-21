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
MSG_SAVE = 2  # Added for force sync via WebSocket

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
            from pycrdt import Doc, XmlFragment, Text
            self._doc = Doc()
            self._XmlFragment = XmlFragment
            self._Text = Text
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

            # Also save to MongoDB documents collection for other services to use
            try:
                from memos.api.services.sharedb_service import sharedb_service
                from memos.api.models.chapter import Chapter
                
                # Extract work_id from room_name (work_{work_id})
                work_id = None
                if self.room_name.startswith("work_"):
                    work_id = self.room_name.replace("work_", "")
                
                if work_id:
                    # Initialize sharedb_service to get MongoDB connection
                    await sharedb_service.initialize()
                    if sharedb_service.use_mongodb and sharedb_service.mongodb_db is not None:
                        collection = sharedb_service.mongodb_db.documents
                        
                        # Find all chapters for this work to sync their content
                        async with AsyncSessionLocal() as session:
                            from memos.api.models.work import Work
                            from memos.api.models.chapter import Chapter
                            from sqlalchemy import select

                            # Improved work_id handling
                            db_work_id = work_id
                            # If it's a short ID like "54", try to find the long version in DB
                            if work_id and len(work_id) < 10:
                                work_result = await session.execute(
                                    select(Work).where(Work.id.like(f"%{work_id}"))
                                )
                                work_obj = work_result.scalar_one_or_none()
                                if work_obj:
                                    db_work_id = work_obj.id
                                    logger.info(f"[YjsRoom:{self.room_name}] Mapped short work_id {work_id} to {db_work_id}")

                            chapter_result = await session.execute(
                                select(Chapter).where(Chapter.work_id == db_work_id)
                            )
                            chapters = chapter_result.scalars().all()
                            
                            logger.info(f"[YjsRoom:{self.room_name}] Found {len(chapters)} chapters for work {db_work_id} to sync")
                            
                            # Ensure doc is initialized to have access to _XmlFragment and _Text
                            _ = self.doc
                            ydoc_keys = list(self.doc.keys())

                            for chapter in chapters:
                                field = f"chapter_{chapter.id}"
                                content = None
                                content_type = None

                                # Try to get the object with the expected types
                                async with self._lock:
                                    try:
                                        if field in ydoc_keys:
                                            # In pycrdt 0.12.x, the type argument is required
                                            # The frontend uses XmlFragment for chapters (see useYjsEditor.ts)
                                            try:
                                                raw_obj = self.doc.get(field, type=self._XmlFragment)
                                                content_type = "XmlFragment"
                                            except:
                                                # Fallback to Text if XmlFragment fails
                                                raw_obj = self.doc.get(field, type=self._Text)
                                                content_type = "Text"
                                            
                                            if raw_obj:
                                                # pycrdt's str() method returns the string representation of the fragment
                                                # For XmlFragment, it might wrap content in <xml_fragment> tags
                                                # We need to ensure we get the inner HTML content
                                                raw_content = str(raw_obj)
                                                
                                                # Check if it's wrapped in default xml_fragment tags and strip them if needed
                                                # This behavior might depend on pycrdt version
                                                if raw_content.startswith("<xml_fragment>") and raw_content.endswith("</xml_fragment>"):
                                                    content = raw_content[14:-15]
                                                else:
                                                    content = raw_content
                                                
                                                # If content is still empty but object has length, it might be an issue with string conversion
                                                if (not content or content.strip() == "") and content_type == "XmlFragment":
                                                    try:
                                                        if hasattr(raw_obj, "__len__") and len(raw_obj) > 0:
                                                            # Attempt to iterate children if string conversion failed
                                                            # This is a fallback strategy
                                                            logger.warning(f"[YjsSync] Chapter {chapter.id} empty string content but has {len(raw_obj)} children. Raw content: {raw_content[:100]}...")
                                                    except:
                                                        pass
                                    except Exception as e:
                                        logger.error(f"Error exploring field {field}: {e}")
                                
                                if content is not None:
                                    # Update MongoDB
                                    doc_id = f"work_{db_work_id}_chapter_{chapter.id}"
                                    now = datetime.utcnow().isoformat()
                                    result = await collection.update_one(
                                        {"id": doc_id},
                                        {
                                            "$set": {
                                                "content": content,
                                                "updated_at": now,
                                                "mtime": int(datetime.utcnow().timestamp() * 1000)
                                            },
                                            "$setOnInsert": {
                                                "id": doc_id,
                                                "title": chapter.title,
                                                "metadata": {},
                                                "operations": [],
                                                "version": 1,
                                                "created_at": now,
                                                "type": "json0",
                                                "v": 0,
                                                "data": {}
                                            }
                                        },
                                        upsert=True
                                    )
                                    
                                    if result.modified_count > 0 or result.upserted_id:
                                        logger.info(f"✅ [YjsSync] Chapter {chapter.id} synced to MongoDB ({content_type}), len={len(content)}, matched={result.matched_count}, upserted={result.upserted_id is not None}")
                                    else:
                                        # Already has the same content, still log at debug level
                                        logger.debug(f"ℹ️ [YjsSync] Chapter {chapter.id} already up-to-date in MongoDB")
                                else:
                                    # Log if field is missing or empty in ydoc
                                    logger.debug(f"ℹ️ [YjsSync] Chapter {chapter.id} has no content in Yjs doc (field: {field})")
                        
                        # logger.info(f"[YjsRoom:{self.room_name}] Completed MongoDB sync")
            except Exception as mongo_err:
                logger.error(f"[YjsRoom:{self.room_name}] Failed to sync to MongoDB: {mongo_err}")

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
            elif msg_type == MSG_SAVE:
                # Trigger force save to DB
                logger.info(f"[YjsRoom:{self.room_name}] Received MSG_SAVE via WebSocket")
                await self.save_to_db()
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
        # Iterate over a copy of the connections to avoid "Set changed size during iteration"
        # errors if a client disconnects during the broadcast (which involves await).
        for conn in list(self.connections):
            if conn is exclude:
                continue
            try:
                await conn.send_bytes(data)
            except Exception:
                disconnected.add(conn)
        for conn in disconnected:
            self.connections.discard(conn)

    async def _periodic_persist(self):
        """Background task: save document to DB every 5 seconds."""
        try:
            while True:
                await asyncio.sleep(5)
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

        try:
            await room.add_client(ws)
            while True:
                data = await ws.receive_bytes()
                await room.handle_message(ws, data)
        except (WebSocketDisconnect, RuntimeError):
            # RuntimeError can occur if the connection is closed during send/receive
            pass
        except Exception as e:
            logger.error(f"[YjsWS:{room_name}] Connection error: {e}")
        finally:
            await room.remove_client(ws)

            # Clean up empty rooms to free memory
            if not room.connections and room_name in self.rooms:
                del self.rooms[room_name]

    async def force_sync(self, room_name: str):
        """Force a database sync for a specific room."""
        if room_name in self.rooms:
            room = self.rooms[room_name]
            # Set dirty to True to ensure it saves even if no recent changes
            # (though normally we'd only sync if dirty)
            room._dirty = True
            await room.save_to_db()
            return True
        return False

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
