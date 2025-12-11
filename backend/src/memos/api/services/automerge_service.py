"""
Automerge CRDT服务 - 处理实时协作编辑
使用Automerge实现无冲突的协作编辑
"""

import asyncio
import json
import logging
from typing import Dict, Any, Optional, Set
from datetime import datetime
from fastapi import WebSocket
import redis.asyncio as redis

from memos.api.core.config import get_settings
from memos.api.core.redis import get_redis

settings = get_settings()
logger = logging.getLogger(__name__)

try:
    import automerge
    AUTOMERGE_AVAILABLE = True
except ImportError:
    logger.warning(
        "automerge not installed. "
        "Install with: pip install automerge (requires Rust). "
        "Or use Yjs instead (recommended)."
    )
    AUTOMERGE_AVAILABLE = False
    automerge = None
except Exception as e:
    logger.warning(f"automerge import failed: {e}. Use Yjs instead (recommended).")
    AUTOMERGE_AVAILABLE = False
    automerge = None


class AutomergeService:
    """Automerge CRDT服务类"""

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.documents: Dict[str, Any] = {}  # 存储Automerge文档
        self._initialized = False

    async def initialize(self):
        """初始化服务"""
        if self._initialized:
            return

        if not AUTOMERGE_AVAILABLE:
            raise ImportError("automerge is not installed. Install with: pip install automerge")

        try:
            self.redis_client = await get_redis()
            self._initialized = True
            logger.info("Automerge服务初始化成功")
        except Exception as e:
            logger.error(f"Automerge服务初始化失败: {e}")
            raise

    async def get_document(self, document_id: str):
        """获取或创建Automerge文档"""
        if not self._initialized:
            await self.initialize()

        if document_id not in self.documents:
            # 尝试从Redis加载
            try:
                cached = await self.redis_client.get(f"automerge:{document_id}")
                if cached:
                    doc = automerge.load(cached)
                    self.documents[document_id] = doc
                    logger.info(f"从Redis加载Automerge文档: {document_id}")
                else:
                    # 创建新文档
                    doc = automerge.init()
                    # 初始化content字段
                    doc = automerge.change(doc, lambda d: setattr(d, "content", ""))
                    self.documents[document_id] = doc
                    logger.info(f"创建新Automerge文档: {document_id}")
            except Exception as e:
                logger.error(f"加载Automerge文档失败: {e}")
                doc = automerge.init()
                doc = automerge.change(doc, lambda d: setattr(d, "content", ""))
                self.documents[document_id] = doc

        return self.documents[document_id]

    async def apply_changes(self, document_id: str, changes: bytes, user_id: Optional[int] = None):
        """应用更改到文档"""
        if not self._initialized:
            await self.initialize()

        try:
            doc = await self.get_document(document_id)
            
            # 应用更改
            doc = automerge.apply_changes(doc, [changes])
            self.documents[document_id] = doc
            
            # 保存到Redis
            state = automerge.save(doc)
            await self.redis_client.setex(
                f"automerge:{document_id}",
                settings.SHAREDB_DOCUMENT_TTL or 86400,  # 24小时默认TTL
                state
            )
            
            # 广播更改给其他客户端
            await self._broadcast_changes(document_id, changes, exclude_user_id=user_id)
            
            logger.debug(f"Automerge文档更改已应用: {document_id}")
            return doc
        except Exception as e:
            logger.error(f"应用Automerge更改失败 {document_id}: {e}")
            raise

    async def get_changes(self, document_id: str, since: Optional[bytes] = None) -> bytes:
        """获取文档更改（用于同步）"""
        if not self._initialized:
            await self.initialize()

        doc = await self.get_document(document_id)
        if since:
            changes = automerge.get_changes(since, doc)
        else:
            # 获取所有更改
            empty_doc = automerge.init()
            changes = automerge.get_changes(empty_doc, doc)
        
        return json.dumps([change.hex() for change in changes]).encode()

    async def join_collaboration(self, websocket: WebSocket, document_id: str, user_id: int):
        """加入协作会话"""
        if not self._initialized:
            await self.initialize()

        # 加入活跃连接
        if document_id not in self.active_connections:
            self.active_connections[document_id] = set()

        self.active_connections[document_id].add(websocket)

        # 获取文档并发送初始状态
        doc = await self.get_document(document_id)
        changes = await self.get_changes(document_id)

        # 发送初始更改
        await websocket.send_bytes(changes)

        # 发送连接成功消息
        await websocket.send_text(json.dumps({
            "type": "automerge_connected",
            "document_id": document_id,
            "user_id": user_id
        }))

        logger.info(f"用户 {user_id} 加入Automerge协作: {document_id}")

        try:
            # 保持连接并处理消息
            while True:
                try:
                    message = await websocket.receive()
                    
                    if message.get("type") == "websocket.receive":
                        if "bytes" in message:
                            # 收到Automerge更改
                            changes_data = message["bytes"]
                            # 解析JSON格式的更改列表
                            changes_list = json.loads(changes_data)
                            for change_hex in changes_list:
                                change_bytes = bytes.fromhex(change_hex)
                                await self.apply_changes(document_id, change_bytes, user_id)
                        elif "text" in message:
                            # 处理文本消息（如ping）
                            data = json.loads(message["text"])
                            if data.get("type") == "ping":
                                await websocket.send_text(json.dumps({"type": "pong"}))

                except json.JSONDecodeError:
                    logger.warning(f"无效的JSON消息")
                except Exception as e:
                    logger.error(f"处理Automerge WebSocket消息错误: {e}")
                    break

        except Exception as e:
            logger.error(f"Automerge WebSocket连接错误: {e}")
        finally:
            # 清理连接
            await self._cleanup_connection(websocket, document_id, user_id)

    async def _broadcast_changes(self, document_id: str, changes: bytes, exclude_user_id: Optional[int] = None):
        """广播更改给所有连接的客户端"""
        if document_id not in self.active_connections:
            return

        # 将单个更改包装成列表
        changes_list = json.dumps([changes.hex()]).encode()
        
        disconnected = set()

        for websocket in self.active_connections[document_id]:
            try:
                await websocket.send_bytes(changes_list)
            except Exception:
                disconnected.add(websocket)

        # 清理断开的连接
        for websocket in disconnected:
            self.active_connections[document_id].discard(websocket)

    async def _cleanup_connection(self, websocket: WebSocket, document_id: str, user_id: int):
        """清理连接"""
        if document_id in self.active_connections:
            self.active_connections[document_id].discard(websocket)

            if not self.active_connections[document_id]:
                del self.active_connections[document_id]

        logger.info(f"用户 {user_id} 离开Automerge协作: {document_id}")

    async def get_document_content(self, document_id: str) -> str:
        """获取文档内容"""
        if not self._initialized:
            await self.initialize()

        doc = await self.get_document(document_id)
        return getattr(doc, "content", "")

    async def set_document_content(self, document_id: str, content: str):
        """设置文档内容"""
        if not self._initialized:
            await self.initialize()

        doc = await self.get_document(document_id)
        
        # 使用change函数更新内容
        def update_content(d):
            d.content = content
        
        doc = automerge.change(doc, update_content)
        self.documents[document_id] = doc
        
        # 保存到Redis
        state = automerge.save(doc)
        await self.redis_client.setex(
            f"automerge:{document_id}",
            settings.SHAREDB_DOCUMENT_TTL or 86400,
            state
        )


# 全局Automerge服务实例
automerge_service = AutomergeService() if AUTOMERGE_AVAILABLE else None

