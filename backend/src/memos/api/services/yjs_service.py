"""
Yjs CRDT服务 - 处理实时协作编辑
使用Yjs实现无冲突的协作编辑
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
    # 尝试导入Yjs Python库
    # y-py是Yjs的Python实现
    import y_py as y_py_module
    YJS_AVAILABLE = True
    # y-py的API可能不同，需要适配
    yjs = y_py_module
except ImportError:
    try:
        # 尝试其他可能的包名
        import pyyjs as y_py_module
        YJS_AVAILABLE = True
        yjs = y_py_module
    except ImportError:
        logger.warning("y-py or pyyjs not installed. Install with: pip install y-py")
        YJS_AVAILABLE = False
        yjs = None


class YjsService:
    """Yjs CRDT服务类"""

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.documents: Dict[str, Any] = {}  # 存储Y.Doc对象
        self._initialized = False

    async def initialize(self):
        """初始化服务"""
        if self._initialized:
            return

        if not YJS_AVAILABLE:
            raise ImportError("y-py is not installed. Install with: pip install y-py")

        try:
            self.redis_client = await get_redis()
            self._initialized = True
            logger.info("Yjs服务初始化成功")
        except Exception as e:
            logger.error(f"Yjs服务初始化失败: {e}")
            raise

    async def get_document(self, document_id: str):
        """获取或创建Yjs文档"""
        if not self._initialized:
            await self.initialize()

        if document_id not in self.documents:
            # 尝试从Redis加载
            try:
                cached = await self.redis_client.get(f"yjs:{document_id}")
                if cached:
                    # y-py的API可能不同，需要根据实际库调整
                    ydoc = yjs.YDoc() if hasattr(yjs, 'YDoc') else yjs.Doc()
                    if hasattr(yjs, 'apply_update'):
                        yjs.apply_update(ydoc, cached)
                    elif hasattr(ydoc, 'apply_update'):
                        ydoc.apply_update(cached)
                    self.documents[document_id] = ydoc
                    logger.info(f"从Redis加载Yjs文档: {document_id}")
                else:
                    # 创建新文档
                    self.documents[document_id] = yjs.YDoc() if hasattr(yjs, 'YDoc') else yjs.Doc()
                    logger.info(f"创建新Yjs文档: {document_id}")
            except Exception as e:
                logger.error(f"加载Yjs文档失败: {e}")
                self.documents[document_id] = yjs.YDoc()

        return self.documents[document_id]

    async def apply_update(self, document_id: str, update: bytes, user_id: Optional[int] = None):
        """应用更新到文档"""
        if not self._initialized:
            await self.initialize()

        try:
            ydoc = await self.get_document(document_id)
            
            # 应用更新
            yjs.apply_update(ydoc, update)
            
            # 保存到Redis
            state = yjs.encode_state_as_update(ydoc)
            await self.redis_client.setex(
                f"yjs:{document_id}",
                settings.SHAREDB_DOCUMENT_TTL or 86400,  # 24小时默认TTL
                state
            )
            
            # 广播更新给其他客户端（排除发送者）
            await self._broadcast_update(document_id, update, exclude_user_id=user_id)
            
            logger.debug(f"Yjs文档更新已应用: {document_id}")
            return ydoc
        except Exception as e:
            logger.error(f"应用Yjs更新失败 {document_id}: {e}")
            raise

    async def get_state_vector(self, document_id: str) -> bytes:
        """获取状态向量（用于同步）"""
        if not self._initialized:
            await self.initialize()

        ydoc = await self.get_document(document_id)
        return yjs.encode_state_vector(ydoc)

    async def get_document_update(self, document_id: str, state_vector: Optional[bytes] = None) -> bytes:
        """获取文档更新（用于同步）"""
        if not self._initialized:
            await self.initialize()

        ydoc = await self.get_document(document_id)
        if state_vector:
            return yjs.encode_state_as_update(ydoc, state_vector)
        else:
            return yjs.encode_state_as_update(ydoc)

    async def join_collaboration(self, websocket: WebSocket, document_id: str, user_id: int):
        """加入协作会话"""
        if not self._initialized:
            await self.initialize()

        # 加入活跃连接
        if document_id not in self.active_connections:
            self.active_connections[document_id] = set()

        self.active_connections[document_id].add(websocket)

        # 获取文档并发送初始状态
        ydoc = await self.get_document(document_id)
        state_vector = await self.get_state_vector(document_id)
        document_update = await self.get_document_update(document_id)

        # 发送初始状态
        await websocket.send_bytes(state_vector)
        await websocket.send_bytes(document_update)

        # 发送连接成功消息
        await websocket.send_text(json.dumps({
            "type": "yjs_connected",
            "document_id": document_id,
            "user_id": user_id
        }))

        logger.info(f"用户 {user_id} 加入Yjs协作: {document_id}")

        try:
            # 保持连接并处理消息
            while True:
                try:
                    message = await websocket.receive()
                    
                    if message.get("type") == "websocket.receive":
                        if "bytes" in message:
                            # 收到Yjs更新
                            update = message["bytes"]
                            await self.apply_update(document_id, update, user_id)
                        elif "text" in message:
                            # 处理文本消息（如ping）
                            data = json.loads(message["text"])
                            if data.get("type") == "ping":
                                await websocket.send_text(json.dumps({"type": "pong"}))

                except json.JSONDecodeError:
                    logger.warning(f"无效的JSON消息")
                except Exception as e:
                    logger.error(f"处理Yjs WebSocket消息错误: {e}")
                    break

        except Exception as e:
            logger.error(f"Yjs WebSocket连接错误: {e}")
        finally:
            # 清理连接
            await self._cleanup_connection(websocket, document_id, user_id)

    async def _broadcast_update(self, document_id: str, update: bytes, exclude_user_id: Optional[int] = None):
        """广播更新给所有连接的客户端"""
        if document_id not in self.active_connections:
            return

        disconnected = set()

        for websocket in self.active_connections[document_id]:
            try:
                await websocket.send_bytes(update)
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

        logger.info(f"用户 {user_id} 离开Yjs协作: {document_id}")

    async def get_document_content(self, document_id: str) -> str:
        """获取文档内容（从Y.Text）"""
        if not self._initialized:
            await self.initialize()

        ydoc = await self.get_document(document_id)
        ytext = ydoc.get_text("content")
        return ytext.to_string()

    async def set_document_content(self, document_id: str, content: str):
        """设置文档内容（到Y.Text）"""
        if not self._initialized:
            await self.initialize()

        ydoc = await self.get_document(document_id)
        ytext = ydoc.get_text("content")
        
        # 清空并设置新内容
        with ydoc.begin_transaction():
            ytext.delete(0, len(ytext.to_string()))
            ytext.insert(0, content)
        
        # 保存到Redis
        state = yjs.encode_state_as_update(ydoc)
        await self.redis_client.setex(
            f"yjs:{document_id}",
            settings.SHAREDB_DOCUMENT_TTL or 86400,
            state
        )


# 全局Yjs服务实例
yjs_service = YjsService() if YJS_AVAILABLE else None

