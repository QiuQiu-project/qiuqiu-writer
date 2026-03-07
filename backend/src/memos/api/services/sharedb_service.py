"""
ShareDB服务 - 处理实时协作编辑
"""

import asyncio
import json
import uuid
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
import logging
from fastapi import WebSocket
import redis.asyncio as redis

from memos.api.core.config import get_settings
from memos.api.core.redis import get_redis
from memos.api.core.mongodb import get_mongodb_db

settings = get_settings()
logger = logging.getLogger(__name__)


class ShareDBService:
    """ShareDB服务类，模拟ShareDB功能用于实时协作
    优先使用MongoDB，如果MongoDB不可用则回退到Redis
    """

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.mongodb_db = None
        self.use_mongodb = False
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.document_locks: Dict[str, asyncio.Lock] = {}
        self._initialized = False

    async def initialize(self):
        """初始化服务"""
        # 如果已用 MongoDB 成功初始化，直接返回
        if self._initialized and self.use_mongodb:
            return

        # 优先尝试使用MongoDB（每次 use_mongodb=False 时都重试，解决启动时序问题）
        try:
            self.mongodb_db = await get_mongodb_db()
            # 测试MongoDB连接
            await self.mongodb_db.command('ping')
            self.use_mongodb = True
            self._initialized = True
            logger.info("ShareDB服务初始化成功（使用MongoDB）")
            return
        except Exception as e:
            logger.warning(f"MongoDB连接失败，回退到Redis: {e}")

        # 如果已经用 Redis 初始化过，不需要重复初始化
        if self._initialized:
            return

        # 首次初始化：回退到 Redis
        try:
            self.redis_client = await get_redis()
            self.use_mongodb = False
            self._initialized = True
            logger.info("ShareDB服务初始化成功（使用Redis，后续调用将持续重试MongoDB）")
        except Exception as redis_err:
            logger.error(f"Redis连接也失败: {redis_err}")
            raise

    async def create_document(self, document_id: str, initial_content: Dict[str, Any]):
        """创建新文档"""
        if not self._initialized:
            await self.initialize()

        # 确保content是字符串格式
        content = initial_content.get("content", "")
        if isinstance(content, dict):
            content = json.dumps(content, ensure_ascii=False)
        elif not isinstance(content, str):
            content = str(content)

        document = {
            "id": document_id,
            "content": content,
            "title": initial_content.get("title", ""),
            "metadata": initial_content.get("metadata", {}),
            "operations": [],
            "version": 1,  # 初始版本为1
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        # 根据配置选择存储方式
        if self.use_mongodb and self.mongodb_db is not None:
            # 存储到MongoDB
            collection = self.mongodb_db.documents
            await collection.replace_one(
                {"id": document_id},
                document,
                upsert=True  # 如果不存在则创建
            )
            logger.info(f"创建ShareDB文档到MongoDB: {document_id}, 内容长度: {len(content)}")
        else:
            # 存储到Redis
            if not self.redis_client:
                raise RuntimeError("Redis客户端未初始化，且MongoDB不可用")
            await self.redis_client.setex(
                f"doc:{document_id}",
                settings.SHAREDB_DOCUMENT_TTL or 86400,  # 24小时默认TTL
                json.dumps(document)
            )
            logger.info(f"创建ShareDB文档到Redis: {document_id}, 内容长度: {len(content)}")

        return document

    async def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """获取文档内容"""
        if not self._initialized:
            await self.initialize()

        logger.info(f"🔍 [ShareDB] 正在获取文档: {document_id}, use_mongodb={self.use_mongodb}")

        try:
            if self.use_mongodb and self.mongodb_db is not None:
                # 从MongoDB获取
                collection = self.mongodb_db.documents
                document = await collection.find_one({"id": document_id})
                if document:
                    content_len = len(str(document.get("content", "")))
                    logger.info(f"✅ [ShareDB] MongoDB 命中文档: {document_id}, content_len={content_len}")
                    # 移除MongoDB的_id字段
                    if "_id" in document:
                        del document["_id"]
                    return document
                else:
                    logger.warning(f"⚠️ [ShareDB] MongoDB 未找到文档: {document_id}")
            else:
                # 从Redis获取
                if not self.redis_client:
                    raise RuntimeError("Redis客户端未初始化，且MongoDB不可用")
                document_data = await self.redis_client.get(f"doc:{document_id}")
                if document_data:
                    logger.info(f"✅ [ShareDB] Redis 命中文档: {document_id}")
                    return json.loads(document_data)
                else:
                    logger.warning(f"⚠️ [ShareDB] Redis 未找到文档: {document_id}")
        except Exception as e:
            logger.error(f"获取文档失败 {document_id}: {e}")

        return None

    async def update_document(self, document_id: str, update_data: Dict[str, Any]):
        """更新文档"""
        if not self._initialized:
            await self.initialize()

        document = await self.get_document(document_id)
        if not document:
            raise ValueError(f"文档不存在: {document_id}")

        # 获取锁以保证原子操作
        if document_id not in self.document_locks:
            self.document_locks[document_id] = asyncio.Lock()

        async with self.document_locks[document_id]:
            # 更新文档
            for key, value in update_data.items():
                if "." in key:
                    # 支持嵌套路径更新，如 "metadata.updated_by"
                    self._set_nested_value(document, key, value)
                else:
                    document[key] = value

            document["version"] += 1
            document["updated_at"] = datetime.utcnow().isoformat()

            # 根据配置选择存储方式
            if self.use_mongodb and self.mongodb_db is not None:
                # 保存到MongoDB
                collection = self.mongodb_db.documents
                await collection.replace_one(
                    {"id": document_id},
                    document,
                    upsert=True
                )
            else:
                # 保存到Redis
                if not self.redis_client:
                    raise RuntimeError("Redis客户端未初始化，且MongoDB不可用")
                await self.redis_client.setex(
                    f"doc:{document_id}",
                    settings.SHAREDB_DOCUMENT_TTL or 86400,
                    json.dumps(document)
                )

            # 广播更新给所有连接的客户端
            await self._broadcast_update(document_id, {
                "type": "document_updated",
                "document_id": document_id,
                "version": document["version"],
                "updated_data": update_data
            })

            logger.info(f"更新ShareDB文档: {document_id}")
            return document

    async def delete_document(self, document_id: str):
        """删除文档"""
        if not self._initialized:
            await self.initialize()

        # 根据配置选择删除方式
        # 关键修复：PyMongo Database 对象不能直接用于布尔判断，需要使用 is not None
        if self.use_mongodb and self.mongodb_db is not None:
            # 从MongoDB删除
            collection = self.mongodb_db.documents
            await collection.delete_one({"id": document_id})
        else:
            # 从Redis删除
            if not self.redis_client:
                raise RuntimeError("Redis客户端未初始化，且MongoDB不可用")
            await self.redis_client.delete(f"doc:{document_id}")

        # 断开所有连接
        if document_id in self.active_connections:
            for websocket in self.active_connections[document_id].copy():
                try:
                    await websocket.close(code=1001, reason="文档已删除")
                except:
                    pass
            del self.active_connections[document_id]

        logger.info(f"删除ShareDB文档: {document_id}")

    async def submit_operation(self, document_id: str, operation: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """提交操作到文档"""
        if not self._initialized:
            await self.initialize()

        document = await self.get_document(document_id)
        if not document:
            raise ValueError(f"文档不存在: {document_id}")

        # 获取锁
        if document_id not in self.document_locks:
            self.document_locks[document_id] = asyncio.Lock()

        async with self.document_locks[document_id]:
            # 应用操作
            op_result = await self._apply_operation(document, operation, user_id)

            # 更新文档
            document["version"] += 1
            document["updated_at"] = datetime.utcnow().isoformat()

            operation_id = str(uuid.uuid4())
            operation_record = {
                "id": operation_id,
                "operation": operation,
                "user_id": user_id,
                "timestamp": datetime.utcnow().isoformat(),
                "version": document["version"]
            }
            document["operations"].append(operation_record)

            # 根据配置选择存储方式
            if self.use_mongodb and self.mongodb_db is not None:
                # 保存到MongoDB
                collection = self.mongodb_db.documents
                await collection.replace_one(
                    {"id": document_id},
                    document,
                    upsert=True
                )
            else:
                # 保存到Redis
                if not self.redis_client:
                    raise RuntimeError("Redis客户端未初始化，且MongoDB不可用")
                await self.redis_client.setex(
                    f"doc:{document_id}",
                    settings.SHAREDB_DOCUMENT_TTL or 86400,
                    json.dumps(document)
                )

            # 广播操作给其他用户
            await self._broadcast_operation(document_id, {
                "type": "operation_applied",
                "operation": operation,
                "operation_id": operation_id,
                "user_id": user_id,
                "version": document["version"]
            }, exclude_user_id=user_id)

            return op_result

    async def join_collaboration(self, websocket: WebSocket, document_id: str, user_id: str):
        """加入协作会话"""
        if not self._initialized:
            await self.initialize()

        # 加入活跃连接
        if document_id not in self.active_connections:
            self.active_connections[document_id] = set()

        self.active_connections[document_id].add(websocket)

        # 获取当前文档状态
        document = await self.get_document(document_id)
        if document:
            # 发送当前文档状态给新用户
            await websocket.send_text(json.dumps({
                "type": "document_state",
                "document_id": document_id,
                "document": document,
                "current_users": len(self.active_connections[document_id]) - 1
            }))

        # 广播用户加入消息
        await self._broadcast_user_event(document_id, {
            "type": "user_joined",
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
            "current_users": len(self.active_connections[document_id])
        }, exclude_websocket=websocket)

        logger.info(f"用户 {user_id} 加入文档协作: {document_id}")

        try:
            # 保持连接并处理消息
            while True:
                try:
                    message = await websocket.receive_text()
                    data = json.loads(message)

                    # 处理不同类型的消息
                    if data.get("type") == "operation":
                        await self.submit_operation(document_id, data["operation"], user_id)
                    elif data.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))

                except json.JSONDecodeError:
                    logger.warning(f"无效的JSON消息: {message}")
                except Exception as e:
                    logger.error(f"处理WebSocket消息错误: {e}")
                    break

        except Exception as e:
            logger.error(f"WebSocket连接错误: {e}")
        finally:
            # 清理连接
            await self._cleanup_connection(websocket, document_id, user_id)

    async def get_document_users(self, document_id: str) -> List[Dict[str, Any]]:
        """获取文档当前用户列表"""
        if document_id not in self.active_connections:
            return []

        # 这里应该从连接中获取用户信息，简化处理
        return [
            {"user_id": i, "joined_at": datetime.utcnow().isoformat()}
            for i in range(len(self.active_connections[document_id]))
        ]

    async def _apply_operation(self, document: Dict[str, Any], operation: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """应用操作到文档"""
        op_type = operation.get("type")
        path = operation.get("path", [])
        value = operation.get("value")

        result = {"success": True, "applied": True}

        try:
            if op_type == "insert_text":
                # 文本插入操作
                content = document.get("content", "")
                position = operation.get("position", 0)
                text = operation.get("text", "")

                if position >= len(content):
                    document["content"] = content + text
                else:
                    document["content"] = content[:position] + text + content[position:]

                result["new_content_length"] = len(document["content"])

            elif op_type == "delete_text":
                # 文本删除操作
                content = document.get("content", "")
                position = operation.get("position", 0)
                length = operation.get("length", 0)

                if position < len(content):
                    end_pos = min(position + length, len(content))
                    document["content"] = content[:position] + content[end_pos:]

                result["new_content_length"] = len(document["content"])

            elif op_type == "replace_text":
                # 文本替换操作
                content = document.get("content", "")
                position = operation.get("position", 0)
                length = operation.get("length", 0)
                text = operation.get("text", "")

                if position < len(content):
                    end_pos = min(position + length, len(content))
                    document["content"] = content[:position] + text + content[end_pos:]

                result["new_content_length"] = len(document["content"])

            elif op_type == "set_attribute":
                # 设置属性操作
                attribute = operation.get("attribute")
                self._set_nested_value(document, attribute, value)
                result["attribute"] = attribute
                result["value"] = value

            else:
                result["success"] = False
                result["error"] = f"不支持的操作类型: {op_type}"

        except Exception as e:
            result["success"] = False
            result["error"] = str(e)
            logger.error(f"应用操作失败: {e}")

        return result

    async def _broadcast_update(self, document_id: str, message: Dict[str, Any]):
        """广播文档更新给所有连接的客户端"""
        if document_id not in self.active_connections:
            return

        message_text = json.dumps(message)
        disconnected = set()

        for websocket in self.active_connections[document_id]:
            try:
                await websocket.send_text(message_text)
            except Exception:
                disconnected.add(websocket)

        # 清理断开的连接
        for websocket in disconnected:
            self.active_connections[document_id].discard(websocket)

    async def _broadcast_operation(self, document_id: str, message: Dict[str, Any], exclude_user_id: Optional[str] = None):
        """广播操作给其他用户"""
        await self._broadcast_update(document_id, message)

    async def _broadcast_user_event(self, document_id: str, message: Dict[str, Any], exclude_websocket: Optional[WebSocket] = None):
        """广播用户事件"""
        message_text = json.dumps(message)

        if document_id not in self.active_connections:
            return

        for websocket in self.active_connections[document_id]:
            if websocket != exclude_websocket:
                try:
                    await websocket.send_text(message_text)
                except Exception:
                    pass

    async def _cleanup_connection(self, websocket: WebSocket, document_id: str, user_id: str):
        """清理连接资源"""
        # 从活跃连接中移除
        if document_id in self.active_connections:
            self.active_connections[document_id].discard(websocket)

            # 如果没有用户连接了，清空集合
            if not self.active_connections[document_id]:
                del self.active_connections[document_id]
            else:
                # 广播用户离开消息
                await self._broadcast_user_event(document_id, {
                    "type": "user_left",
                    "user_id": user_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "current_users": len(self.active_connections[document_id])
                })

        logger.info(f"用户 {user_id} 离开文档协作: {document_id}")

    def _set_nested_value(self, obj: Dict[str, Any], path: str, value: Any):
        """设置嵌套字典值"""
        keys = path.split(".")
        current = obj

        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]

        current[keys[-1]] = value

    async def _merge_with_diff(
        self,
        base_content: str,
        client_content: str,
        server_content: str
    ) -> str:
        """
        基于差异的合并策略
        计算从 base_content 到 client_content 的差异，然后应用到 server_content
        
        策略：
        1. 找出客户端删除的内容（在 base 中但不在 client 中）
        2. 找出客户端新增的内容（在 client 中但不在 base 中）
        3. 将删除操作应用到服务器内容
        4. 将新增操作应用到服务器内容
        """
        import re
        
        logger.info(f"开始基于差异的合并: base={len(base_content)}, client={len(client_content)}, server={len(server_content)}")
        
        # 对于 HTML 内容，使用块级差异
        if base_content.startswith('<') and client_content.startswith('<') and server_content.startswith('<'):
            return await self._merge_html_with_diff(base_content, client_content, server_content)
        
        # 对于纯文本，使用行级差异
        return await self._merge_text_with_diff(base_content, client_content, server_content)
    
    async def _merge_html_with_diff(
        self,
        base_content: str,
        client_content: str,
        server_content: str
    ) -> str:
        """
        基于差异的 HTML 合并
        """
        import re
        
        # 提取所有块级元素
        block_pattern = r'(<(?:p|h[1-6]|li|div|blockquote|br|span)[^>]*>.*?</(?:p|h[1-6]|li|div|blockquote|span)>|<(?:p|h[1-6]|li|div|blockquote|br)[^>]*/?>)'
        
        base_blocks = re.findall(block_pattern, base_content, re.DOTALL)
        client_blocks = re.findall(block_pattern, client_content, re.DOTALL)
        server_blocks = re.findall(block_pattern, server_content, re.DOTALL)
        
        logger.info(f"差异合并：base {len(base_blocks)} 个块，client {len(client_blocks)} 个块，server {len(server_blocks)} 个块")
        
        # 提取块文本用于比较
        def get_block_text(block: str) -> str:
            text = re.sub(r'<[^>]+>', '', block)
            return text.strip()
        
        # 创建文本到块的映射
        base_text_to_block = {get_block_text(block): block for block in base_blocks if get_block_text(block)}
        client_text_to_block = {get_block_text(block): block for block in client_blocks if get_block_text(block)}
        server_text_to_block = {get_block_text(block): block for block in server_blocks if get_block_text(block)}
        
        # 找出客户端删除的内容（在 base 中但不在 client 中）
        base_texts = set(base_text_to_block.keys())
        client_texts = set(client_text_to_block.keys())
        deleted_texts = base_texts - client_texts
        
        # 找出客户端新增的内容（在 client 中但不在 base 中）
        added_texts = client_texts - base_texts
        
        logger.info(f"客户端删除: {len(deleted_texts)} 个块，新增: {len(added_texts)} 个块")
        if deleted_texts:
            logger.info(f"删除的块文本预览: {list(deleted_texts)[:3]}")
        if added_texts:
            logger.info(f"新增的块文本预览: {list(added_texts)[:3]}")
        
        # 关键修复：改进合并逻辑，保持文本位置
        # 策略：基于 base_content 的结构，在正确位置插入新增块
        # 1. 构建 base_content 的块索引（文本 -> 位置）
        # 2. 构建 client_content 的块索引（文本 -> 位置）
        # 3. 找出新增块在 client_content 中的位置
        # 4. 在服务器内容的相应位置插入新增块
        
        # 构建 base_content 的块位置索引
        base_block_positions = {}
        for idx, block in enumerate(base_blocks):
            block_text = get_block_text(block)
            if block_text:
                if block_text not in base_block_positions:
                    base_block_positions[block_text] = idx
        
        # 构建 client_content 的块位置索引
        client_block_positions = {}
        for idx, block in enumerate(client_blocks):
            block_text = get_block_text(block)
            if block_text:
                if block_text not in client_block_positions:
                    client_block_positions[block_text] = idx
        
        # 找出新增块在 client_content 中的位置
        added_blocks_with_position = []
        for block in client_blocks:
            block_text = get_block_text(block)
            if block_text and block_text in added_texts:
                position = client_block_positions.get(block_text, len(client_blocks))
                added_blocks_with_position.append((position, block, block_text))
        
        # 按位置排序新增块
        added_blocks_with_position.sort(key=lambda x: x[0])
        
        # 构建服务器块的映射（文本 -> 块）
        server_text_to_block = {get_block_text(block): block for block in server_blocks if get_block_text(block)}
        
        # 构建合并后的块列表
        merged_blocks = []
        seen_texts = set()
        
        # 策略：按照 base_content 的顺序处理服务器块，在适当位置插入新增块
        # 1. 遍历 base_blocks，确定每个块的位置
        # 2. 对于 base 中的块，如果在 server 中存在且未被删除，添加到合并结果
        # 3. 对于新增的块，根据它在 client 中的位置，插入到相应位置
        
        # 先处理服务器块（按照 base 的顺序）
        base_block_to_server_block = {}
        for base_block in base_blocks:
            base_block_text = get_block_text(base_block)
            if base_block_text and base_block_text in server_text_to_block:
                base_block_to_server_block[base_block_text] = server_text_to_block[base_block_text]
        
        # 关键修复：改进合并逻辑，确保新内容不会插入到旧内容前面
        # 策略：按照 client_content 的顺序构建合并结果，这样可以保持客户端编辑的顺序
        # 1. 构建 client_content 的完整块列表（包括新增和保留的块）
        client_block_map = {get_block_text(block): block for block in client_blocks if get_block_text(block)}
        
        # 2. 按照 client_content 的顺序处理块
        for client_block in client_blocks:
            client_block_text = get_block_text(client_block)
            
            if not client_block_text:
                # 空块也保留
                if client_block not in merged_blocks:
                    merged_blocks.append(client_block)
                continue
            
            # 如果是新增的块，直接添加
            if client_block_text in added_texts:
                if client_block_text not in seen_texts:
                    merged_blocks.append(client_block)
                    seen_texts.add(client_block_text)
                    logger.debug(f"添加客户端新增块: {client_block_text[:50]}")
                continue
            
            # 如果是保留的块（在 base 中也存在），检查服务器是否有更新
            if client_block_text in base_texts:
                # 检查是否被客户端删除（不应该发生，因为已经在 client_blocks 中）
                if client_block_text in deleted_texts:
                    logger.debug(f"跳过被删除的块: {client_block_text[:50]}")
                    continue
                
                # 如果服务器中有对应的块，使用服务器块（可能被其他用户更新了）
                if client_block_text in server_text_to_block:
                    server_block = server_text_to_block[client_block_text]
                    if client_block_text not in seen_texts:
                        merged_blocks.append(server_block)
                        seen_texts.add(client_block_text)
                        logger.debug(f"使用服务器更新的块: {client_block_text[:50]}")
                elif client_block_text not in seen_texts:
                    # 如果服务器中没有，使用客户端块
                    merged_blocks.append(client_block)
                    seen_texts.add(client_block_text)
                    logger.debug(f"使用客户端块: {client_block_text[:50]}")
        
        # 3. 添加服务器中独有的块（不在 base 中，也不在 client 中，是其他用户新增的）
        # 这些块应该添加到末尾，因为它们是在服务器端新增的
        for server_block in server_blocks:
            server_block_text = get_block_text(server_block)
            if server_block_text and server_block_text not in seen_texts:
                # 检查是否在 base 或 client 中
                if server_block_text not in base_texts and server_block_text not in client_texts:
                    # 服务器独有的块，添加到末尾
                    merged_blocks.append(server_block)
                    seen_texts.add(server_block_text)
                    logger.debug(f"添加服务器独有的块: {server_block_text[:50]}")
        
        merged_html = ''.join(merged_blocks)
        logger.info(f"✅ 差异合并完成：合并后 {len(merged_blocks)} 个块，长度 {len(merged_html)}")
        
        # 如果合并后为空，返回客户端内容（保留删除操作）
        if not merged_html or merged_html.strip() == '':
            logger.warning("合并后内容为空，返回客户端内容（保留删除操作）")
            return client_content
        
        return merged_html
    
    async def _merge_json_with_diff(
        self,
        base_content_json: Dict[str, Any],
        client_content_json: Dict[str, Any],
        server_content_json: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        基于 TipTap JSON 格式的段落级合并
        使用 JSON 格式可以更精确地识别和合并段落
        """
        logger.info("开始基于 JSON 格式的段落级合并")
        
        # 提取段落内容
        def extract_paragraphs(doc_json: Dict[str, Any]) -> List[Dict[str, Any]]:
            """从 TipTap JSON 中提取所有段落"""
            paragraphs = []
            if doc_json.get("type") == "doc" and "content" in doc_json:
                for item in doc_json["content"]:
                    if item.get("type") == "paragraph":
                        # 提取段落文本
                        text_content = ""
                        if "content" in item:
                            for text_node in item["content"]:
                                if text_node.get("type") == "text":
                                    text_content += text_node.get("text", "")
                        paragraphs.append({
                            "node": item,
                            "text": text_content.strip(),
                            "full_node": item
                        })
            return paragraphs
        
        base_paragraphs = extract_paragraphs(base_content_json)
        client_paragraphs = extract_paragraphs(client_content_json)
        server_paragraphs = extract_paragraphs(server_content_json)
        
        logger.info(f"JSON 合并：base {len(base_paragraphs)} 个段落，client {len(client_paragraphs)} 个段落，server {len(server_paragraphs)} 个段落")
        
        # 创建文本到段落的映射
        base_text_to_para = {para["text"]: para for para in base_paragraphs if para["text"]}
        client_text_to_para = {para["text"]: para for para in client_paragraphs if para["text"]}
        server_text_to_para = {para["text"]: para for para in server_paragraphs if para["text"]}
        
        # 找出客户端删除的段落（在 base 中但不在 client 中）
        base_texts = set(base_text_to_para.keys())
        client_texts = set(client_text_to_para.keys())
        deleted_texts = base_texts - client_texts
        
        # 找出客户端新增的段落（在 client 中但不在 base 中）
        added_texts = client_texts - base_texts
        
        logger.info(f"客户端删除: {len(deleted_texts)} 个段落，新增: {len(added_texts)} 个段落")
        
        # 按照 client_content_json 的顺序构建合并结果
        merged_content_items = []
        seen_texts = set()
        
        # 1. 按照 client_content_json 的顺序处理段落
        for client_para in client_paragraphs:
            client_text = client_para["text"]
            
            if not client_text:
                # 空段落也保留
                if client_para["full_node"] not in [item.get("full_node") for item in merged_content_items]:
                    merged_content_items.append(client_para["full_node"])
                continue
            
            # 如果是新增的段落，直接添加
            if client_text in added_texts:
                if client_text not in seen_texts:
                    merged_content_items.append(client_para["full_node"])
                    seen_texts.add(client_text)
                    logger.debug(f"添加客户端新增段落: {client_text[:50]}")
                continue
            
            # 如果是保留的段落（在 base 中也存在），检查服务器是否有更新
            if client_text in base_texts:
                # 如果服务器中有对应的段落，使用服务器段落（可能被其他用户更新了）
                if client_text in server_text_to_para:
                    server_para = server_text_to_para[client_text]
                    if client_text not in seen_texts:
                        merged_content_items.append(server_para["full_node"])
                        seen_texts.add(client_text)
                        logger.debug(f"使用服务器更新的段落: {client_text[:50]}")
                elif client_text not in seen_texts:
                    # 如果服务器中没有，使用客户端段落
                    merged_content_items.append(client_para["full_node"])
                    seen_texts.add(client_text)
                    logger.debug(f"使用客户端段落: {client_text[:50]}")
        
        # 2. 添加服务器中独有的段落（不在 base 中，也不在 client 中，是其他用户新增的）
        for server_para in server_paragraphs:
            server_text = server_para["text"]
            if server_text and server_text not in seen_texts:
                if server_text not in base_texts and server_text not in client_texts:
                    # 服务器独有的段落，添加到末尾
                    merged_content_items.append(server_para["full_node"])
                    seen_texts.add(server_text)
                    logger.debug(f"添加服务器独有的段落: {server_text[:50]}")
        
        # 构建合并后的 JSON 文档
        merged_json = {
            "type": "doc",
            "content": merged_content_items
        }
        
        logger.info(f"✅ JSON 合并完成：合并后 {len(merged_content_items)} 个段落")
        
        return merged_json
    
    async def _json_to_html(self, json_content: Dict[str, Any]) -> str:
        """
        将 TipTap JSON 格式转换为 HTML
        这是一个简化版本，实际应该使用 TipTap 的转换逻辑
        """
        html_parts = []
        
        if json_content.get("type") == "doc" and "content" in json_content:
            for item in json_content["content"]:
                if item.get("type") == "paragraph":
                    # 提取段落文本
                    text_content = ""
                    if "content" in item:
                        for text_node in item["content"]:
                            if text_node.get("type") == "text":
                                text_content += text_node.get("text", "")
                    html_parts.append(f"<p>{text_content}</p>")
                elif item.get("type") == "heading":
                    level = item.get("attrs", {}).get("level", 1)
                    text_content = ""
                    if "content" in item:
                        for text_node in item["content"]:
                            if text_node.get("type") == "text":
                                text_content += text_node.get("text", "")
                    html_parts.append(f"<h{level}>{text_content}</h{level}>")
        
        return ''.join(html_parts) if html_parts else "<p></p>"
    
    async def _merge_text_with_diff(
        self,
        base_content: str,
        client_content: str,
        server_content: str
    ) -> str:
        """
        基于差异的文本合并
        """
        base_lines = base_content.splitlines(keepends=True)
        client_lines = client_content.splitlines(keepends=True)
        server_lines = server_content.splitlines(keepends=True)
        
        # 找出删除的行和新增的行
        base_line_set = set(line.strip() for line in base_lines if line.strip())
        client_line_set = set(line.strip() for line in client_lines if line.strip())
        deleted_lines = base_line_set - client_line_set
        added_lines = client_line_set - base_line_set
        
        logger.info(f"文本差异合并：删除 {len(deleted_lines)} 行，新增 {len(added_lines)} 行")
        
        # 以服务器内容为基础，删除客户端删除的行，添加客户端新增的行
        merged_lines = []
        seen_lines = set()
        
        # 添加服务器中未被删除的行
        for line in server_lines:
            line_stripped = line.strip()
            if line_stripped and line_stripped not in deleted_lines:
                if line_stripped not in seen_lines:
                    merged_lines.append(line)
                    seen_lines.add(line_stripped)
        
        # 添加客户端新增的行
        for line in client_lines:
            line_stripped = line.strip()
            if line_stripped in added_lines and line_stripped not in seen_lines:
                merged_lines.append(line)
                seen_lines.add(line_stripped)
        
        merged = ''.join(merged_lines)
        logger.info(f"✅ 文本差异合并完成：合并后 {len(merged_lines)} 行")
        return merged if merged else client_content
    
    async def _smart_merge_content(
        self,
        server_content: str,
        client_content: str,
        server_version: int,
        client_version: int
    ) -> str:
        """
        智能合并内容 - 改进版本，正确处理删除操作
        策略：智能识别删除和新增操作
        
        核心原则：
        1. 如果客户端内容明显更短，可能是删除操作，应该保留删除
        2. 如果客户端内容更长，可能是新增操作，应该保留新增
        3. 如果内容长度相近，进行智能合并
        """
        # 如果内容相同，直接返回
        if server_content == client_content:
            return server_content
        
        logger.info(f"开始智能合并: 服务器长度={len(server_content)}, 客户端长度={len(client_content)}")
        
        # 关键改进：如果客户端内容明显更短（小于服务器内容的70%），可能是删除操作
        # 这种情况下，应该优先保留客户端的删除操作
        if len(client_content) < len(server_content) * 0.7:
            logger.info(f"检测到可能的删除操作: 客户端内容明显更短 ({len(client_content)} < {len(server_content) * 0.7})")
            # 对于 HTML，尝试智能合并，但优先保留客户端的删除
            if server_content.startswith('<') and client_content.startswith('<'):
                merged = await self._merge_html_content_with_deletion(server_content, client_content)
                if merged:
                    logger.info(f"删除合并成功: 合并后长度={len(merged)}")
                    return merged
            # 如果合并失败，直接返回客户端内容（保留删除）
            logger.info("保留客户端删除操作")
            return client_content
        
        # 对于 HTML 内容，使用更智能的合并
        if server_content.startswith('<') and client_content.startswith('<'):
            merged = await self._merge_html_content_smart(server_content, client_content)
            if merged and len(merged) >= max(len(server_content), len(client_content)) * 0.8:
                # 合并后的内容应该至少包含大部分原始内容
                logger.info(f"HTML 合并成功: 合并后长度={len(merged)}")
                return merged
            else:
                logger.warning("HTML 合并结果不理想，使用备用策略")
        
        # 对于纯文本，使用文本合并
        merged = await self._merge_text_content(server_content, client_content)
        
        # 验证合并结果：合并后的内容应该包含大部分原始内容
        if len(merged) < min(len(server_content), len(client_content)) * 0.5:
            logger.warning("合并结果异常，内容可能丢失，使用备用策略")
            # 备用策略：如果一个是另一个的子集，返回超集
            if server_content in client_content:
                return client_content
            elif client_content in server_content:
                return server_content
            else:
                # 如果无法判断，返回服务器内容（已知的最新版本）
                logger.warning("无法智能合并，返回服务器内容")
                return server_content
        
        return merged

    async def _merge_text_content(self, server_text: str, client_text: str) -> str:
        """
        合并纯文本内容 - 改进版本，确保不丢失内容
        策略：保留所有唯一行，确保不丢失内容
        """
        import difflib
        
        # 如果内容相同
        if server_text == client_text:
            return server_text
        
        # 按行分割
        server_lines = server_text.splitlines(keepends=True)
        client_lines = client_text.splitlines(keepends=True)
        
        # 找出所有唯一的行（保留顺序）
        merged_lines = []
        seen_lines = set()
        
        # 1. 先添加服务器行
        for line in server_lines:
            line_stripped = line.strip()
            if line_stripped and line_stripped not in seen_lines:
                merged_lines.append(line)
                seen_lines.add(line_stripped)
        
        # 2. 添加客户端独有的行
        for line in client_lines:
            line_stripped = line.strip()
            if line_stripped and line_stripped not in seen_lines:
                merged_lines.append(line)
                seen_lines.add(line_stripped)
        
        # 3. 如果客户端有更多行，确保都包含
        if len(client_lines) > len(server_lines):
            # 检查是否有客户端独有的行
            client_set = set(line.strip() for line in client_lines if line.strip())
            server_set = set(line.strip() for line in server_lines if line.strip())
            client_only = client_set - server_set
            
            if client_only:
                # 找出这些行在客户端中的位置，按顺序插入
                for line in client_lines:
                    if line.strip() in client_only and line.strip() not in seen_lines:
                        merged_lines.append(line)
                        seen_lines.add(line.strip())
        
        # 组合合并后的文本
        merged = ''.join(merged_lines)
        
        # 验证：合并后的内容应该包含大部分原始内容
        if len(merged) < max(len(server_text), len(client_text)) * 0.7:
            logger.warning("合并结果异常，使用备用策略")
            # 备用策略：尝试智能拼接
            # 如果一个是另一个的子集，返回超集
            if server_text in client_text:
                merged = client_text
            elif client_text in server_text:
                merged = server_text
            # 否则，尝试拼接（避免重复）
            elif server_text not in client_text and client_text not in server_text:
                # 找出共同后缀，避免重复拼接
                common_suffix = ''
                min_len = min(len(server_text), len(client_text))
                for i in range(1, min_len + 1):
                    if server_text[-i:] == client_text[:i]:
                        common_suffix = server_text[-i:]
                        break
                if common_suffix:
                    merged = server_text + client_text[len(common_suffix):]
                else:
                    merged = server_text + '\n' + client_text
            else:
                # 如果无法判断，返回服务器内容（因为它是已知的最新版本）
                logger.warning("无法智能合并，返回服务器内容")
                merged = server_text
        
        logger.info(f"文本合并完成: 服务器 {len(server_lines)} 行，客户端 {len(client_lines)} 行，合并后 {len(merged_lines)} 行")
        return merged

    async def _merge_html_content(
        self, server_html: str, client_html: str
    ) -> str:
        """
        合并 HTML 内容 - 旧版本（保留用于兼容）
        """
        return await self._merge_html_content_smart(server_html, client_html)

    async def _merge_html_content_with_deletion(self, server_html: str, client_html: str) -> str:
        """
        合并 HTML 内容 - 处理删除操作
        当客户端内容明显更短时，识别为删除操作，保留删除
        策略：以客户端内容为基础，添加服务器中客户端没有的新内容
        """
        import re
        
        # 提取所有块级元素
        block_pattern = r'(<(?:p|h[1-6]|li|div|blockquote|br|span)[^>]*>.*?</(?:p|h[1-6]|li|div|blockquote|span)>|<(?:p|h[1-6]|li|div|blockquote|br)[^>]*/?>)'
        
        server_blocks = re.findall(block_pattern, server_html, re.DOTALL)
        client_blocks = re.findall(block_pattern, client_html, re.DOTALL)
        
        logger.info(f"删除合并：服务器 {len(server_blocks)} 个块，客户端 {len(client_blocks)} 个块")
        
        # 提取块文本用于比较
        def get_block_text(block: str) -> str:
            text = re.sub(r'<[^>]+>', '', block)
            return text.strip()
        
        # 创建客户端块的文本集合（用于识别哪些块被保留了）
        client_texts = set(get_block_text(block) for block in client_blocks if get_block_text(block))
        
        # 创建服务器块的文本集合（用于找出服务器新增的内容）
        server_texts = set(get_block_text(block) for block in server_blocks if get_block_text(block))
        
        # 找出服务器中客户端没有的新内容
        server_only_texts = server_texts - client_texts
        
        # 策略：以客户端内容为基础（保留删除），添加服务器新增的内容
        merged_blocks = list(client_blocks)  # 先保留客户端的所有块（包括删除）
        
        # 添加服务器中客户端没有的新内容
        for block in server_blocks:
            block_text = get_block_text(block)
            if block_text in server_only_texts:
                merged_blocks.append(block)
                logger.debug(f"添加服务器新增的块: {block_text[:50]}")
        
        merged_html = ''.join(merged_blocks)
        logger.info(f"✅ 删除合并完成：保留客户端 {len(client_blocks)} 个块，添加服务器 {len(server_only_texts)} 个新块，合并后 {len(merged_blocks)} 个块")
        logger.info(f"合并后内容长度: {len(merged_html)} (服务器: {len(server_html)}, 客户端: {len(client_html)})")
        return merged_html if merged_html else client_html  # 如果合并后为空，返回客户端内容
    
    async def _merge_html_content_smart(self, server_html: str, client_html: str) -> str:
        """
        智能合并 HTML 内容 - 改进版本，确保不丢失内容
        策略：提取所有有意义的块（段落、标题等），去重后合并，保留所有唯一内容
        """
        import re
        
        # 如果内容相同
        if server_html == client_html:
            return server_html
        
        # 提取所有块级元素（段落、标题、列表项等）
        # 使用更宽松的模式，匹配更多 HTML 标签
        block_pattern = r'(<(?:p|h[1-6]|li|div|blockquote|br|span)[^>]*>.*?</(?:p|h[1-6]|li|div|blockquote|span)>|<(?:p|h[1-6]|li|div|blockquote|br)[^>]*/?>)'
        
        server_blocks = re.findall(block_pattern, server_html, re.DOTALL)
        client_blocks = re.findall(block_pattern, client_html, re.DOTALL)
        
        logger.info(f"提取块：服务器 {len(server_blocks)} 个，客户端 {len(client_blocks)} 个")
        
        # 提取块文本用于去重和比较
        def get_block_text(block: str) -> str:
            # 移除所有标签，只保留文本
            text = re.sub(r'<[^>]+>', '', block)
            # 移除空白字符，但保留换行信息
            return text.strip()
        
        def get_block_hash(block: str) -> str:
            """获取块的哈希值，用于精确去重"""
            text = get_block_text(block)
            # 使用文本内容作为唯一标识
            return text
        
        # 创建块的映射（哈希 -> HTML），保留所有唯一的块
        server_block_map = {}
        for block in server_blocks:
            block_hash = get_block_hash(block)
            if block_hash:  # 只保留有文本内容的块
                # 如果哈希相同，保留较长的 HTML（可能包含更多格式）
                if block_hash not in server_block_map or len(block) > len(server_block_map[block_hash]):
                    server_block_map[block_hash] = block
        
        client_block_map = {}
        for block in client_blocks:
            block_hash = get_block_hash(block)
            if block_hash:
                if block_hash not in client_block_map or len(block) > len(client_block_map[block_hash]):
                    client_block_map[block_hash] = block
        
        # 合并：保留所有唯一的块
        merged_blocks = []
        seen_hashes = set()
        
        # 1. 添加服务器块
        for block_hash, block in server_block_map.items():
            if block_hash not in seen_hashes:
                merged_blocks.append(block)
                seen_hashes.add(block_hash)
        
        # 2. 添加客户端独有的块（这是关键：保留客户端新增的内容）
        for block_hash, block in client_block_map.items():
            if block_hash not in seen_hashes:
                merged_blocks.append(block)
                seen_hashes.add(block_hash)
                logger.debug(f"添加客户端独有的块: {get_block_text(block)[:50]}")
        
        # 3. 如果客户端 HTML 明显更长，尝试提取更多内容
        # 注意：只提取尚未添加的块，避免重复
        if len(client_html) > len(server_html) * 1.1:
            # 使用更细粒度的方式找出客户端新增的内容
            # 提取所有文本节点进行比较
            server_text_nodes = re.findall(r'>([^<]+)<', server_html)
            client_text_nodes = re.findall(r'>([^<]+)<', client_html)
            
            # 找出客户端独有的文本节点
            server_text_set = set(t.strip() for t in server_text_nodes if t.strip())
            client_text_set = set(t.strip() for t in client_text_nodes if t.strip())
            client_only_texts = client_text_set - server_text_set
            
            if client_only_texts:
                logger.info(f"发现客户端独有的文本节点: {len(client_only_texts)} 个")
                # 尝试从客户端 HTML 中提取包含这些文本的块
                # 关键：只添加尚未在 seen_hashes 中的块
                for text in client_only_texts:
                    # 查找包含此文本的块
                    for block in client_blocks:
                        block_hash = get_block_hash(block)
                        # 确保块有内容且尚未添加
                        if block_hash and block_hash not in seen_hashes and text in get_block_text(block):
                            merged_blocks.append(block)
                            seen_hashes.add(block_hash)
                            logger.debug(f"添加客户端独有的块（通过文本节点）: {get_block_text(block)[:50]}")
                            break  # 每个文本节点只添加一个块，避免重复
        
        # 组合合并后的 HTML
        if merged_blocks:
            merged_html = ''.join(merged_blocks)
            logger.info(f"✅ HTML 合并完成：服务器 {len(server_blocks)} 个块，客户端 {len(client_blocks)} 个块，合并后 {len(merged_blocks)} 个块")
            logger.info(f"合并后内容长度: {len(merged_html)} (服务器: {len(server_html)}, 客户端: {len(client_html)})")
            return merged_html
        else:
            # 如果无法提取块，使用更宽松的策略
            logger.warning("无法提取 HTML 块，使用备用合并策略")
            return await self._merge_html_fallback(server_html, client_html)

    async def _merge_html_fallback(self, server_html: str, client_html: str) -> str:
        """
        HTML 合并的备用策略
        如果无法提取块，尝试其他方法
        """
        import re
        
        # 策略1：如果一个是另一个的子集，返回超集
        if server_html in client_html:
            logger.info("服务器内容是客户端内容的子集，返回客户端内容")
            return client_html
        if client_html in server_html:
            logger.info("客户端内容是服务器内容的子集，返回服务器内容")
            return server_html
        
        # 策略2：提取所有文本节点，合并
        server_text = re.sub(r'<[^>]+>', '', server_html)
        client_text = re.sub(r'<[^>]+>', '', client_html)
        
        # 如果客户端文本更长，可能包含新内容
        if len(client_text) > len(server_text) * 1.2:
            logger.info("客户端文本明显更长，优先保留客户端内容")
            return client_html
        
        # 策略3：简单拼接（保留服务器内容，追加客户端新增部分）
        # 找出客户端独有的部分
        if len(client_html) > len(server_html):
            # 尝试找出客户端新增的部分
            # 使用简单的字符串差异
            common_prefix_len = 0
            for i in range(min(len(server_html), len(client_html))):
                if server_html[i] == client_html[i]:
                    common_prefix_len += 1
                else:
                    break
            
            # 如果前缀很长，说明客户端在末尾添加了内容
            if common_prefix_len > len(server_html) * 0.8:
                client_suffix = client_html[common_prefix_len:]
                if len(client_suffix) > 10:  # 有显著的新内容
                    merged = server_html + client_suffix
                    logger.info("使用后缀追加策略合并")
                    return merged
        
        # 策略4：最后手段，尝试智能合并
        logger.warning("所有合并策略失败，尝试智能合并")
        # 不要简单地返回较长的内容，而是尝试合并
        # 如果服务器内容包含客户端内容，返回服务器内容
        # 如果客户端内容包含服务器内容，返回客户端内容
        # 否则，尝试拼接
        if server_html in client_html:
            return client_html
        elif client_html in server_html:
            return server_html
        else:
            # 尝试拼接，但确保不重复
            # 找出共同前缀和后缀
            common_prefix = ''
            common_suffix = ''
            min_len = min(len(server_html), len(client_html))
            for i in range(min_len):
                if server_html[i] == client_html[i]:
                    common_prefix += server_html[i]
                else:
                    break
            for i in range(1, min_len + 1):
                if server_html[-i] == client_html[-i]:
                    common_suffix = server_html[-i] + common_suffix
                else:
                    break
            # 如果共同部分足够大，尝试合并
            if len(common_prefix) > min_len * 0.5 or len(common_suffix) > min_len * 0.5:
                # 使用服务器内容作为基础，添加客户端独有的部分
                if len(common_prefix) > len(common_suffix):
                    client_unique = client_html[len(common_prefix):]
                    return server_html + client_unique
                else:
                    client_unique = client_html[:-len(common_suffix)] if len(common_suffix) > 0 else client_html
                    return client_unique + server_html
            # 最后手段：返回服务器内容（因为它是已知的最新版本）
            logger.warning("无法智能合并，返回服务器内容")
            return server_html

    async def _merge_html_content(self, server_html: str, client_html: str) -> str:
        """
        合并 HTML 内容
        策略：提取所有段落，去重后合并
        """
        import re
        
        # 提取所有段落标签
        server_paragraphs = re.findall(r'<p[^>]*>.*?</p>', server_html, re.DOTALL)
        client_paragraphs = re.findall(r'<p[^>]*>.*?</p>', client_html, re.DOTALL)
        
        # 提取段落文本用于去重
        def get_paragraph_text(p: str) -> str:
            return re.sub(r'<[^>]+>', '', p).strip()
        
        # 合并段落，去重
        merged_paragraphs = []
        seen_texts = set()
        
        # 先添加服务器段落
        for p in server_paragraphs:
            text = get_paragraph_text(p)
            if text and text not in seen_texts:
                merged_paragraphs.append(p)
                seen_texts.add(text)
        
        # 再添加客户端段落（如果不存在）
        for p in client_paragraphs:
            text = get_paragraph_text(p)
            if text and text not in seen_texts:
                merged_paragraphs.append(p)
                seen_texts.add(text)
        
        # 注意：不再需要额外添加，因为前面已经添加了所有唯一的段落
        # 避免重复添加已存在的段落
        
        # 组合合并后的 HTML
        if merged_paragraphs:
            return ''.join(merged_paragraphs)
        else:
            # 如果无法提取段落，尝试其他策略
            # 如果一个是另一个的子集，返回超集
            if server_html in client_html:
                return client_html
            elif client_html in server_html:
                return server_html
            else:
                # 如果无法判断，返回服务器内容（已知的最新版本）
                logger.warning("无法提取段落，返回服务器内容")
                return server_html

    async def sync_document(
        self, 
        document_id: str, 
        version: int, 
        content: str,
        base_version: Optional[int] = None,  # 基于哪个版本做的更改
        base_content: Optional[str] = None,  # 上次同步的内容（HTML 格式，用于计算差异）
        content_json: Optional[Dict[str, Any]] = None,  # TipTap JSON 格式内容（用于更精确的段落级合并）
        base_content_json: Optional[Dict[str, Any]] = None,  # 上次同步的内容（JSON 格式，用于更精确的合并）
        user_id: Optional[str] = None,
        create_version: bool = False,
        db_session: Optional[Any] = None,
        metadata: Optional[Dict[str, Any]] = None  # 文档的元数据（章节信息等）
    ) -> Dict[str, Any]:
        """
        同步文档到ShareDB，支持多端同步和冲突合并
        
        核心逻辑：
        1. 在锁内获取服务器最新版本（确保原子性）
        2. 基于 base_version 获取 base_content（三路合并的基础）
        3. 执行三路合并：base_content + server_content + client_content
        4. 版本号严格递增：new_version = server_version + 1
        5. 保存到Redis并创建版本历史记录
        
        这样确保：
        - 两个客户端同时同步时，都会基于相同的 server_version 进行合并
        - 合并后的版本号 = server_version + 1，保证严格递增
        - 所有客户端最终都会获得相同的版本号
        """
        if not self._initialized:
            await self.initialize()

        # 获取锁以保证原子操作（关键：确保多端同步时串行执行）
        if document_id not in self.document_locks:
            self.document_locks[document_id] = asyncio.Lock()

        async with self.document_locks[document_id]:
            try:
                # ========== 步骤1: 在锁内获取服务器最新版本（关键：确保原子性）==========
                document = await self.get_document(document_id)
                
                # ========== 步骤2: 处理文档不存在的情况 ==========
                if not document:
                    # 创建新文档
                    new_version = 1
                    document = {
                        "id": document_id,
                        "content": content,
                        "version": new_version,
                        "created_at": datetime.utcnow().isoformat(),
                        "updated_at": datetime.utcnow().isoformat(),
                        "last_editor_id": user_id or ""
                    }
                    # 如果提供了 JSON 格式，也保存到文档中
                    if content_json:
                        try:
                            # content_json 现在已经是字典对象，直接序列化为字符串存储
                            document["content_json"] = json.dumps(content_json) if isinstance(content_json, dict) else content_json
                            logger.info("已保存 JSON 格式内容到新文档")
                        except Exception as json_err:
                            logger.warning(f"保存 JSON 格式失败: {json_err}")
                    # 关键修复：如果提供了 metadata，保存到文档中
                    if metadata:
                        document["metadata"] = metadata
                        logger.info(f"已保存 metadata 到新文档: {list(metadata.keys())}")
                    merge_strategy = "create"
                    logger.info(f"📝 [同步] 创建新文档: {document_id}, 版本: {new_version}")
                else:
                    # ========== 步骤3: 处理文档已存在的情况，执行合并 ==========
                    # 冲突检测和智能合并
                    # 关键：获取服务器最新版本（在锁内获取，确保是最新的）
                    server_version = document.get("version", 0) or 0
                    server_content = document.get("content", "")
                    merge_strategy = None  # 初始化合并策略变量
                    
                    logger.info(f"📊 [版本管理] 同步请求: base_version={base_version}, client_version={version}, server_version={server_version}")
                    
                    # 关键改进：优先使用 base_version 获取 base_content
                    # 如果提供了 base_version，尝试从历史记录获取对应版本的内容
                    actual_base_content = base_content
                    if base_version is not None and base_version > 0:
                        # 尝试从数据库获取历史版本内容
                        if db_session is not None:
                            try:
                                from memos.api.models.document import DocumentSyncHistory
                                from sqlalchemy import select
                                from sqlalchemy.ext.asyncio import AsyncSession
                                
                                # FastAPI 的 Depends 应该已经解析了生成器
                                # 但如果 db_session 仍然是生成器，我们需要处理它
                                session = db_session
                                
                                # 检查是否是 AsyncSession 对象（有 execute 方法）
                                if not hasattr(session, 'execute'):
                                    # 可能是生成器，尝试获取会话对象
                                    if hasattr(session, '__aiter__'):
                                        logger.warning("db_session 是生成器，尝试获取会话对象")
                                        try:
                                            # 尝试获取生成器的第一个值
                                            session = await session.__anext__()
                                        except StopAsyncIteration:
                                            logger.error("无法从生成器获取会话对象，跳过历史记录查询")
                                            # 不抛出异常，而是使用提供的 base_content
                                            session = None
                                    else:
                                        logger.error(f"db_session 类型错误: {type(session)}，跳过历史记录查询")
                                        session = None
                                
                                # 如果无法获取会话，使用服务器内容作为 base_content
                                if session is None:
                                    logger.warning("无法获取数据库会话，使用服务器内容作为 base_content 进行融合")
                                    actual_base_content = server_content
                                else:
                                    stmt = select(DocumentSyncHistory).where(
                                        DocumentSyncHistory.document_id == document_id,
                                        DocumentSyncHistory.version == base_version
                                    ).order_by(DocumentSyncHistory.created_at.desc())
                                    
                                    result = await session.execute(stmt)
                                    history_record = result.scalar_one_or_none()

                                    if history_record and history_record.content:
                                        actual_base_content = history_record.content
                                        logger.info(f"从历史记录获取 base_content (版本 {base_version})")
                                    elif base_version == server_version:
                                        # 如果 base_version 等于服务器版本，使用服务器内容
                                        actual_base_content = server_content
                                        logger.info(f"base_version 等于服务器版本，使用服务器内容作为 base_content")
                                    else:
                                        # 关键改进：如果没有历史版本，使用服务器内容作为 base_content
                                        # 这样可以确保即使没有历史记录，也能进行正确的差异合并
                                        logger.info(f"无法获取版本 {base_version} 的历史记录，使用服务器内容作为 base_content 进行融合")
                                        actual_base_content = server_content
                            except Exception as e:
                                error_str = str(e)
                                # 关键改进：如果查询失败（如表不存在），尝试创建表
                                if "does not exist" in error_str or "UndefinedTableError" in error_str:
                                    logger.warning(f"历史记录表不存在: {e}，尝试创建表")
                                    # 尝试创建表
                                    try:
                                        if session is not None:
                                            # 回滚失败的事务
                                            try:
                                                await session.rollback()
                                            except Exception:
                                                pass
                                            
                                            # 创建表
                                            from memos.api.core.database import Base, engine
                                            from memos.api.models.document import DocumentSyncHistory
                                            
                                            # 使用独立的连接来创建表，避免事务问题
                                            async with engine.begin() as conn:
                                                await conn.run_sync(Base.metadata.create_all)
                                            logger.info("✅ 已创建 document_sync_history 表")
                                            
                                            # 表创建后，使用服务器内容作为 base_content
                                            actual_base_content = server_content
                                            logger.info("使用服务器内容作为 base_content 进行融合")
                                        else:
                                            actual_base_content = server_content
                                            logger.warning("无数据库会话，无法创建表，使用服务器内容作为 base_content")
                                    except Exception as create_table_error:
                                        logger.warning(f"创建表失败: {create_table_error}，使用服务器内容作为 base_content")
                                        actual_base_content = server_content
                                        # 回滚事务
                                        if session is not None and hasattr(session, 'rollback'):
                                            try:
                                                await session.rollback()
                                            except Exception:
                                                pass
                                else:
                                    # 其他错误，使用服务器内容作为 base_content
                                    logger.warning(f"获取历史版本内容失败: {e}，使用服务器内容作为 base_content 进行融合")
                                    actual_base_content = server_content
                                    # 如果会话存在且事务失败，回滚事务
                                    if session is not None and hasattr(session, 'rollback'):
                                        try:
                                            await session.rollback()
                                            logger.debug("已回滚失败的事务")
                                        except Exception as rollback_error:
                                            logger.debug(f"回滚事务失败（可能已经回滚）: {rollback_error}")
                        elif base_version == server_version:
                            # 如果 base_version 等于服务器版本，使用服务器内容
                            actual_base_content = server_content
                            logger.info(f"base_version 等于服务器版本，使用服务器内容作为 base_content (无db_session)")
                        else:
                            # 关键改进：如果没有 db_session，使用服务器内容作为 base_content
                            logger.info(f"无db_session且无法获取版本 {base_version} 的内容，使用服务器内容作为 base_content 进行融合")
                            actual_base_content = server_content
                    
                    # 关键改进：即使版本号相同或客户端更大，也要检查内容是否不同
                    # 因为可能存在并发修改但版本号相同的情况
                    content_different = server_content != content
                    
                    # 关键改进：如果有 base_content 且不为空，使用基于差异的合并
                    if actual_base_content is not None and actual_base_content.strip() and actual_base_content != content:
                        logger.info(f"使用基于差异的合并: base版本={base_version}, base长度={len(actual_base_content)}, client长度={len(content)}, server版本={server_version}, server长度={len(server_content)}")
                        logger.info(f"base内容预览: {actual_base_content[:100]}...")
                        logger.info(f"client内容预览: {content[:100]}...")
                        logger.info(f"server内容预览: {server_content[:100]}...")
                        
                        # 关键修复：如果提供了 JSON 格式，使用 JSON 格式进行更精确的段落级合并
                        if content_json and base_content_json:
                            try:
                                # content_json 和 base_content_json 现在已经是字典对象，不需要解析
                                client_json = content_json
                                base_json = base_content_json
                                
                                # 尝试从服务器文档中获取 JSON 格式
                                server_json_str = document.get("content_json")
                                if server_json_str:
                                    # 服务器存储的是字符串，需要解析
                                    server_json = json.loads(server_json_str) if isinstance(server_json_str, str) else server_json_str
                                    logger.info("使用 JSON 格式进行段落级合并")
                                    merged_json = await self._merge_json_with_diff(
                                        base_content_json=base_json,
                                        client_content_json=client_json,
                                        server_content_json=server_json
                                    )
                                    # 保存 JSON 格式到文档（存储为字符串）
                                    document["content_json"] = json.dumps(merged_json) if isinstance(merged_json, dict) else merged_json
                                    # 同时更新 HTML 内容（从 JSON 转换）
                                    merged_content = await self._json_to_html(merged_json)
                                else:
                                    # 如果没有服务器 JSON，使用 HTML 合并
                                    merged_content = await self._merge_with_diff(
                                        base_content=actual_base_content,
                                        client_content=content,
                                        server_content=server_content
                                    )
                            except Exception as json_err:
                                logger.warning(f"JSON 合并失败，回退到 HTML 合并: {json_err}")
                                merged_content = await self._merge_with_diff(
                                    base_content=actual_base_content,
                                    client_content=content,
                                    server_content=server_content
                                )
                        else:
                            # 没有 JSON 格式，使用 HTML 合并
                            merged_content = await self._merge_with_diff(
                                base_content=actual_base_content,
                                client_content=content,
                                server_content=server_content
                            )
                        document["content"] = merged_content
                        # 关键修复：版本号应该是服务器最新版本 + 1，确保版本号严格递增
                        document["version"] = server_version + 1
                        merge_strategy = "diff_based"  # 记录合并策略
                        logger.info(f"✅ 差异合并完成，新版本: {document['version']} (基于服务器版本 {server_version} + 1), 合并后长度: {len(merged_content)}")
                        logger.info(f"合并后内容预览: {merged_content[:100]}...")
                    elif actual_base_content is not None and not actual_base_content.strip():
                        # base_content 为空，可能是第一次同步，使用智能合并
                        logger.info(f"base_content 为空，使用智能合并")
                        merged_content = await self._smart_merge_content(
                            server_content=server_content,
                            client_content=content,
                            server_version=server_version,
                            client_version=version
                        )
                        document["content"] = merged_content
                        # 关键修复：版本号应该是服务器最新版本 + 1，确保版本号严格递增
                        document["version"] = server_version + 1
                        merge_strategy = "smart_merge"  # 记录合并策略
                        logger.info(f"智能合并完成，新版本: {document['version']} (基于服务器版本 {server_version} + 1), 合并后长度: {len(merged_content)}")
                    # 如果服务器版本更新，或者内容不同，都需要合并
                    elif server_version > version or (content_different and server_version == version):
                        if server_version > version:
                            logger.info(f"检测到版本冲突: 服务器版本 {server_version} > 客户端版本 {version}")
                        else:
                            logger.info(f"检测到内容冲突: 版本相同但内容不同 (版本 {version})")
                        
                        logger.info(f"服务器内容长度: {len(server_content)}, 客户端内容长度: {len(content)}")
                        
                        # 使用三路合并策略：base (旧版本) + server (服务器修改) + client (客户端修改)
                        # 由于我们没有保存历史版本，使用智能合并策略
                        merged_content = await self._smart_merge_content(
                            server_content=server_content,
                            client_content=content,
                            server_version=server_version,
                            client_version=version
                        )
                        
                        document["content"] = merged_content
                        # 关键修复：版本号应该是服务器最新版本 + 1，确保版本号严格递增
                        document["version"] = server_version + 1
                        merge_strategy = "smart_merge"  # 记录合并策略
                        logger.info(f"内容已合并，新版本: {document['version']} (基于服务器版本 {server_version} + 1), 合并后长度: {len(merged_content)}")
                    elif content_different:
                        # 版本号相同但内容不同（可能是并发修改），也需要合并
                        logger.info(f"检测到并发修改: 版本相同 ({version}) 但内容不同")
                        merged_content = await self._smart_merge_content(
                            server_content=server_content,
                            client_content=content,
                            server_version=server_version,
                            client_version=version
                        )
                        document["content"] = merged_content
                        document["version"] = server_version + 1
                        merge_strategy = "smart_merge"  # 记录合并策略
                        logger.info(f"并发修改已合并，新版本: {document['version']}")
                    else:
                        # 内容和版本都相同，无需更新
                        logger.info("内容和版本都相同，无需更新")
                        # 关键修复：即使内容相同，版本号也应该基于服务器版本 + 1，确保版本号严格递增
                        # 这样可以确保即使两个客户端同时同步相同内容，也能获得相同的版本号
                        document["version"] = server_version + 1
                        document["content"] = content  # 保持原内容
                        logger.info(f"版本号递增: {server_version} -> {document['version']} (内容未变化)")
                    
                    document["updated_at"] = datetime.utcnow().isoformat()
                    if user_id:
                        document["last_editor_id"] = user_id
                    # 关键修复：如果提供了 metadata，更新文档的 metadata
                    if metadata:
                        # 合并现有的 metadata（如果存在）
                        if "metadata" in document and document["metadata"]:
                            document["metadata"] = {**document["metadata"], **metadata}
                        else:
                            document["metadata"] = metadata
                        logger.info(f"已更新文档 metadata: {list(metadata.keys())}")

                # 根据配置选择存储方式
                if self.use_mongodb and self.mongodb_db is not None:
                    # 保存到MongoDB
                    collection = self.mongodb_db.documents
                    content_value = document.get('content', '')
                    content_length = len(content_value) if isinstance(content_value, str) else 0
                    
                    # 关键修复：确保 content 字段存在且不为 None
                    if 'content' not in document or document['content'] is None:
                        logger.warning(f"⚠️ [ShareDB] 文档 {document_id} 的 content 字段缺失或为 None，设置为空字符串")
                        document['content'] = ''
                    
                    await collection.replace_one(
                        {"id": document_id},
                        document,
                        upsert=True
                    )
                    logger.info(f"✅ [ShareDB] 已保存到MongoDB: {document_id}, 版本 {document.get('version')}, 内容长度 {content_length}, content类型: {type(content_value).__name__}")
                    
                    # 验证保存：立即读取验证
                    verify_doc = await collection.find_one({"id": document_id})
                    if verify_doc:
                        verify_content = verify_doc.get('content', '')
                        verify_length = len(verify_content) if isinstance(verify_content, str) else 0
                        if verify_length != content_length:
                            logger.error(f"❌ [ShareDB] 保存验证失败: 期望长度 {content_length}, 实际长度 {verify_length}")
                        else:
                            logger.debug(f"✅ [ShareDB] 保存验证成功: 内容长度 {verify_length}")
                    else:
                        logger.error(f"❌ [ShareDB] 保存验证失败: 文档不存在")
                else:
                    # 保存到Redis
                    if not self.redis_client:
                        raise RuntimeError("Redis客户端未初始化，且MongoDB不可用")
                    await self.redis_client.setex(
                        f"doc:{document_id}",
                        settings.SHAREDB_DOCUMENT_TTL or 86400,  # 24小时默认TTL
                        json.dumps(document)
                    )
                    logger.info(f"✅ [ShareDB] 已保存到Redis: {document_id}, 版本 {document.get('version')}, 内容长度 {len(document.get('content', ''))}")

                # 关键改进：如果 create_version 为 True 或表不存在，创建版本历史记录
                # 使用当前合并后的内容作为版本历史
                if db_session is not None and document.get("version"):
                    try:
                        from memos.api.models.document import DocumentSyncHistory
                        from sqlalchemy.ext.asyncio import AsyncSession
                        from sqlalchemy import select
                        import hashlib
                        
                        # FastAPI 的 Depends 应该已经解析了生成器，db_session 应该是 AsyncSession 对象
                        # 直接使用，不要手动从生成器中获取（避免连接泄漏）
                        session = db_session
                        
                        # 检查是否是 AsyncSession 对象（有 execute 方法）
                        if not hasattr(session, 'execute'):
                            logger.warning(f"db_session 类型错误: {type(session)}，跳过创建版本历史记录")
                            session = None
                        
                        if session is not None:
                            try:
                                # 关键修复：如果之前有错误导致事务回滚，先回滚事务
                                try:
                                    await session.rollback()
                                except Exception:
                                    # 如果回滚失败（可能已经回滚或没有事务），继续
                                    pass
                                
                                # 检查是否已存在该版本的记录
                                stmt = select(DocumentSyncHistory).where(
                                    DocumentSyncHistory.document_id == document_id,
                                    DocumentSyncHistory.version == document["version"]
                                )
                                result = await session.execute(stmt)
                                existing = result.scalar_one_or_none()
                                
                                if not existing:
                                    # 创建版本历史记录
                                    merged_content = document.get("content", content)
                                    content_hash = hashlib.md5(merged_content.encode()).hexdigest()
                                    
                                    # 获取合并策略（从之前的合并逻辑中）
                                    # 如果文档是新创建的，server_version 可能不存在
                                    current_server_version = document.get("version", 1) - 1 if document.get("version", 1) > 1 else 0
                                    if 'server_version' in locals():
                                        current_server_version = server_version
                                    
                                    current_merge_strategy = merge_strategy if merge_strategy else "diff_based"
                                    
                                    history_record = DocumentSyncHistory(
                                        document_id=document_id,
                                        version=document["version"],
                                        content=merged_content,
                                        content_hash=content_hash,
                                        user_id=user_id,
                                        sync_type="version_snapshot" if create_version else "sync",
                                        conflict_resolved=True if document.get("version", 0) > current_server_version else False,
                                        merge_strategy=current_merge_strategy,
                                        base_version=base_version,
                                        client_version=version,
                                        server_version=current_server_version,
                                        sync_metadata={"auto_created": False}
                                    )
                                    session.add(history_record)
                                    await session.commit()
                                    logger.info(f"✅ 已创建版本历史记录: 版本 {document['version']}, 内容长度 {len(merged_content)}")
                                else:
                                    logger.debug(f"版本历史记录已存在: 版本 {document['version']}")
                            except Exception as e:
                                error_str = str(e)
                                # 如果创建失败，回滚事务
                                try:
                                    await session.rollback()
                                except Exception:
                                    pass
                                
                                if "does not exist" in error_str or "UndefinedTableError" in error_str:
                                    logger.warning(f"版本历史表不存在: {e}，尝试创建表")
                                    # 尝试创建表
                                    try:
                                        # 回滚失败的事务
                                        try:
                                            await session.rollback()
                                        except Exception:
                                            pass
                                        
                                        # 创建表 - 使用独立的连接来创建表，避免事务问题
                                        from memos.api.core.database import Base, engine
                                        from memos.api.models.document import DocumentSyncHistory
                                        
                                        async with engine.begin() as conn:
                                            await conn.run_sync(Base.metadata.create_all)
                                        logger.info("✅ 已创建 document_sync_history 表")
                                        
                                        # 表创建后，尝试再次创建版本历史记录
                                        try:
                                            # 回滚当前会话，准备新事务
                                            try:
                                                await session.rollback()
                                            except Exception:
                                                pass
                                            
                                            merged_content = document.get("content", content)
                                            content_hash = hashlib.md5(merged_content.encode()).hexdigest()
                                            
                                            current_server_version = document.get("version", 1) - 1 if document.get("version", 1) > 1 else 0
                                            if 'server_version' in locals():
                                                current_server_version = server_version
                                            
                                            current_merge_strategy = merge_strategy if merge_strategy else "diff_based"
                                            
                                            history_record = DocumentSyncHistory(
                                                document_id=document_id,
                                                version=document["version"],
                                                content=merged_content,
                                                content_hash=content_hash,
                                                user_id=user_id,
                                                sync_type="version_snapshot" if create_version else "sync",
                                                conflict_resolved=True if document.get("version", 0) > current_server_version else False,
                                                merge_strategy=current_merge_strategy,
                                                base_version=base_version,
                                                client_version=version,
                                                server_version=current_server_version,
                                                sync_metadata={"auto_created": False, "table_created": True}
                                            )
                                            session.add(history_record)
                                            await session.commit()
                                            logger.info(f"✅ 已创建版本历史记录: 版本 {document['version']}, 内容长度 {len(merged_content)}")
                                        except Exception as retry_error:
                                            logger.warning(f"表创建后再次创建版本历史记录失败: {retry_error}")
                                    except Exception as create_table_error:
                                        logger.warning(f"创建表失败: {create_table_error}")
                                elif "InFailedSQLTransactionError" in error_str or "transaction is aborted" in error_str:
                                    logger.warning(f"事务已中止，跳过创建版本历史记录: {e}")
                                else:
                                    logger.warning(f"创建版本历史记录失败: {e}")
                    except Exception as e:
                        logger.debug(f"创建版本历史记录时出错（不影响同步）: {e}")

                # 记录操作历史（可选）
                operation_record = {
                    "doc_id": document_id,
                    "version": document["version"],
                    "operation": {
                        "type": "full_update",
                        "content": content
                    },
                    "user_id": user_id or "",
                    "timestamp": datetime.utcnow().isoformat()
                }

                # 广播更新给所有连接的客户端（广播合并后的内容）
                await self._broadcast_update(document_id, {
                    "type": "document_synced",
                    "document_id": document_id,
                    "version": document["version"],
                    "content": document["content"]  # 广播合并后的内容，不是客户端原始内容
                })

                logger.info(f"文档 {document_id} 已同步，版本: {document['version']}")

                # 更新章节字数和作品总字数（如果 document_id 是章节文档）
                # document_id 格式: work_{workId}_chapter_{chapterId}
                if db_session is not None and document_id.startswith("work_") and "_chapter_" in document_id:
                    try:
                        import re
                        from memos.api.services.chapter_service import ChapterService
                        from memos.api.services.work_service import WorkService
                        
                        # 从 document_id 中提取 work_id（40位字符串）和 chapter_id
                        match = re.match(r"work_([a-zA-Z0-9_-]+)_chapter_(\d+)", document_id)
                        if match:
                            work_id = match.group(1)
                            chapter_id = int(match.group(2))
                            
                            # 计算章节字数（去除HTML标签，统计纯文本字符数）
                            import re as re_module
                            import html
                            text_content = re_module.sub(r'<[^>]+>', '', document["content"])
                            # 解码HTML实体（如 &nbsp; &lt; 等）
                            text_content = html.unescape(text_content)
                            # 统计字符数（只统计汉字、英文字母和数字，去除空格、换行、标点等，与前端保持一致）
                            matches = re_module.findall(r'[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]', text_content)
                            chapter_word_count = len(matches)
                            
                            # 获取章节服务
                            session = db_session
                            if not hasattr(session, 'execute'):
                                if hasattr(session, '__aiter__'):
                                    try:
                                        session = await session.__anext__()
                                    except StopAsyncIteration:
                                        session = None
                            
                            if session is not None:
                                chapter_service = ChapterService(session)
                                work_service = WorkService(session)
                                
                                # 获取章节的旧字数
                                chapter = await chapter_service.get_chapter_by_id(chapter_id)
                                if chapter:
                                    old_word_count = chapter.word_count or 0

                                    # 更新章节字数（update_chapter 内部会 commit）
                                    await chapter_service.update_chapter(
                                        chapter_id=chapter_id,
                                        word_count=chapter_word_count
                                    )

                                    # 用 SUM 重算作品总字数，替代增量逻辑（防止累积误差）
                                    if chapter_word_count != old_word_count:
                                        from sqlalchemy import func, select
                                        from memos.api.models.chapter import Chapter as ChapterModel
                                        sum_result = await session.execute(
                                            select(func.sum(ChapterModel.word_count)).where(
                                                ChapterModel.work_id == db_work_id,
                                                ChapterModel.status != "deleted",
                                            )
                                        )
                                        new_total_word_count = sum_result.scalar() or 0

                                        work = await work_service.get_work_by_id(work_id)
                                        if work:
                                            await work_service.update_work(
                                                work_id=work_id,
                                                word_count=new_total_word_count
                                            )
                                            logger.info(f"✅ [字数统计] 章节 {chapter_id} 字数: {old_word_count} -> {chapter_word_count}, 作品 {work_id} 总字数: {work.word_count or 0} -> {new_total_word_count}")
                                    
                                    # 重新获取更新后的章节和作品数据，用于返回给前端
                                    updated_chapter = await chapter_service.get_chapter_by_id(chapter_id)
                                    updated_work = await work_service.get_work_by_id(work_id)
                                    
                                    # 将更新后的数据添加到返回响应中
                                    response_data = {
                                        "success": True,
                                        "content": document["content"],  # 返回合并后的内容，不是客户端原始内容
                                        "version": document["version"],
                                        "operations": []
                                    }
                                    
                                    # 总是返回更新后的章节和作品数据（如果存在）
                                    if updated_chapter:
                                        response_data["chapter"] = updated_chapter.to_dict()
                                    if updated_work:
                                        response_data["work"] = updated_work.to_dict()
                                    
                                    return response_data
                    except Exception as word_count_error:
                        # 字数更新失败不影响文档同步，只记录错误
                        logger.warning(f"⚠️ [字数统计] 更新字数失败: {word_count_error}")

                return {
                    "success": True,
                    "content": document["content"],  # 返回合并后的内容，不是客户端原始内容
                    "version": document["version"],
                    "operations": []
                }
            except Exception as e:
                logger.error(f"同步文档失败 {document_id}: {e}")
                return {
                    "success": False,
                    "error": str(e),
                    "content": content,
                    "version": version,
                    "operations": []
                }


# 全局ShareDB服务实例
sharedb_service = ShareDBService()