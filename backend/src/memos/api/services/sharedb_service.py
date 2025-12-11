"""
ShareDB服务 - 处理实时协作编辑
"""

import asyncio
import json
import uuid
import hashlib
from typing import Dict, Any, List, Optional, Set
from datetime import datetime
import logging
from fastapi import WebSocket
import redis.asyncio as redis

from memos.api.core.config import get_settings
from memos.api.core.redis import get_redis

settings = get_settings()
logger = logging.getLogger(__name__)


class ShareDBService:
    """ShareDB服务类，模拟ShareDB功能用于实时协作"""

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.document_locks: Dict[str, asyncio.Lock] = {}
        self._initialized = False

    async def initialize(self):
        """初始化服务"""
        if self._initialized:
            return

        try:
            self.redis_client = await get_redis()
            self._initialized = True
            logger.info("ShareDB服务初始化成功")
        except Exception as e:
            logger.error(f"ShareDB服务初始化失败: {e}")
            raise

    async def create_document(self, document_id: str, initial_content: Dict[str, Any]):
        """创建新文档"""
        if not self._initialized:
            await self.initialize()

        document = {
            "id": document_id,
            "content": initial_content.get("content", ""),
            "title": initial_content.get("title", ""),
            "metadata": initial_content.get("metadata", {}),
            "operations": [],
            "version": 0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        # 存储到Redis
        await self.redis_client.setex(
            f"doc:{document_id}",
            settings.SHAREDB_DOCUMENT_TTL or 86400,  # 24小时默认TTL
            json.dumps(document)
        )

        logger.info(f"创建ShareDB文档: {document_id}")
        return document

    async def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """获取文档内容"""
        if not self._initialized:
            await self.initialize()

        try:
            document_data = await self.redis_client.get(f"doc:{document_id}")
            if document_data:
                return json.loads(document_data)
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

            # 保存到Redis
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

        # 删除Redis中的文档
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

    async def submit_operation(self, document_id: str, operation: Dict[str, Any], user_id: int) -> Dict[str, Any]:
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

            # 保存到Redis
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

    async def join_collaboration(self, websocket: WebSocket, document_id: str, user_id: int):
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

    async def _apply_operation(self, document: Dict[str, Any], operation: Dict[str, Any], user_id: int) -> Dict[str, Any]:
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

    def _calculate_diff_operations(self, old_content: str, new_content: str) -> List[Dict[str, Any]]:
        """
        计算两个内容之间的差异，生成操作列表
        使用 difflib 计算差异，生成 insert_text/delete_text/replace_text 操作
        """
        import difflib
        
        if not old_content:
            # 如果旧内容为空，所有新内容都是插入
            return [{
                "type": "insert_text",
                "position": 0,
                "text": new_content
            }]
        
        if not new_content:
            # 如果新内容为空，所有旧内容都是删除
            return [{
                "type": "delete_text",
                "position": 0,
                "length": len(old_content)
            }]
        
        # 使用 difflib 计算差异
        differ = difflib.SequenceMatcher(None, old_content, new_content)
        operations = []
        current_pos = 0
        
        for tag, i1, i2, j1, j2 in differ.get_opcodes():
            if tag == 'equal':
                # 相同部分，跳过
                current_pos += (i2 - i1)
            elif tag == 'delete':
                # 删除操作
                operations.append({
                    "type": "delete_text",
                    "position": current_pos,
                    "length": i2 - i1
                })
                # 删除后位置不变
            elif tag == 'insert':
                # 插入操作
                operations.append({
                    "type": "insert_text",
                    "position": current_pos,
                    "text": new_content[j1:j2]
                })
                current_pos += (j2 - j1)
            elif tag == 'replace':
                # 替换操作（删除+插入）
                operations.append({
                    "type": "delete_text",
                    "position": current_pos,
                    "length": i2 - i1
                })
                operations.append({
                    "type": "insert_text",
                    "position": current_pos,
                    "text": new_content[j1:j2]
                })
                current_pos += (j2 - j1) - (i2 - i1)
        
        return operations

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

    async def _broadcast_operation(self, document_id: str, message: Dict[str, Any], exclude_user_id: Optional[int] = None):
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

    async def _cleanup_connection(self, websocket: WebSocket, document_id: str, user_id: int):
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
        
        # 策略：以服务器内容为基础
        # 1. 删除客户端删除的内容（如果服务器中有）
        # 2. 添加客户端新增的内容
        merged_blocks = []
        seen_texts = set()
        
        # 先添加服务器中未被客户端删除的块
        for block in server_blocks:
            block_text = get_block_text(block)
            if block_text and block_text not in deleted_texts:
                if block_text not in seen_texts:
                    merged_blocks.append(block)
                    seen_texts.add(block_text)
        
        # 添加客户端新增的块
        for text in added_texts:
            if text in client_text_to_block and text not in seen_texts:
                merged_blocks.append(client_text_to_block[text])
                seen_texts.add(text)
                logger.debug(f"添加客户端新增的块: {text[:50]}")
        
        merged_html = ''.join(merged_blocks)
        logger.info(f"✅ 差异合并完成：合并后 {len(merged_blocks)} 个块，长度 {len(merged_html)}")
        return merged_html if merged_html else client_content
    
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
            logger.warning("合并结果异常，内容可能丢失，使用较长的版本")
            return client_content if len(client_content) > len(server_content) else server_content
        
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
            # 备用策略：简单拼接
            if server_text not in client_text and client_text not in server_text:
                merged = server_text + '\n' + client_text
            else:
                merged = client_text if len(client_text) > len(server_text) else server_text
        
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
        
        # 策略4：最后手段，返回较长的内容
        logger.warning("所有合并策略失败，返回较长的内容")
        return client_html if len(client_html) > len(server_html) else server_html

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
            # 如果无法提取段落，返回较长的内容
            return client_html if len(client_html) > len(server_html) else server_html

    async def sync_document(
        self, 
        document_id: str, 
        version: int, 
        content: str,
        base_content: Optional[str] = None,  # 上次同步的内容（用于计算差异）
        user_id: Optional[int] = None,
        create_version: bool = False,
        db_session: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        同步文档到ShareDB，支持冲突检测和智能合并
        借鉴 nexcode_server 的实现，适配 Redis 存储
        
        策略：
        1. 如果服务器版本 > 客户端版本：先合并服务器内容，再应用客户端更改
        2. 如果服务器版本 <= 客户端版本：直接更新
        """
        if not self._initialized:
            await self.initialize()

        # 获取锁以保证原子操作
        if document_id not in self.document_locks:
            self.document_locks[document_id] = asyncio.Lock()

        async with self.document_locks[document_id]:
            try:
                # 获取当前文档
                document = await self.get_document(document_id)
                
                # 如果文档不存在，创建新文档
                if not document:
                    document = {
                        "id": document_id,
                        "content": content,
                        "version": 1,
                        "created_at": datetime.utcnow().isoformat(),
                        "updated_at": datetime.utcnow().isoformat(),
                        "last_editor_id": user_id
                    }
                else:
                    # 冲突检测和智能合并
                    original_server_version = document.get("version", 0) or 0
                    server_version = original_server_version  # 保存原始服务器版本用于记录
                    server_content = document.get("content", "")
                    
                    # 关键改进：即使版本号相同或客户端更大，也要检查内容是否不同
                    # 因为可能存在并发修改但版本号相同的情况
                    content_different = server_content != content
                    
                    # 关键改进：如果有 base_content 且不为空，使用基于差异的合并
                    if base_content is not None and base_content.strip() and base_content != content:
                        logger.info(f"使用基于差异的合并: base长度={len(base_content)}, client长度={len(content)}, server长度={len(server_content)}")
                        logger.info(f"base内容预览: {base_content[:100]}...")
                        logger.info(f"client内容预览: {content[:100]}...")
                        logger.info(f"server内容预览: {server_content[:100]}...")
                        merged_content = await self._merge_with_diff(
                            base_content=base_content,
                            client_content=content,
                            server_content=server_content
                        )
                        document["content"] = merged_content
                        document["version"] = max(server_version, version) + 1
                        logger.info(f"✅ 差异合并完成，新版本: {document['version']}, 合并后长度: {len(merged_content)}")
                        logger.info(f"合并后内容预览: {merged_content[:100]}...")
                    elif base_content is not None and not base_content.strip():
                        # base_content 为空，可能是第一次同步，使用智能合并
                        logger.info(f"base_content 为空，使用智能合并")
                        merged_content = await self._smart_merge_content(
                            server_content=server_content,
                            client_content=content,
                            server_version=server_version,
                            client_version=version
                        )
                        document["content"] = merged_content
                        document["version"] = max(server_version, version) + 1
                        logger.info(f"智能合并完成，新版本: {document['version']}, 合并后长度: {len(merged_content)}")
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
                        document["version"] = max(server_version, version) + 1  # 合并后版本递增
                        logger.info(f"内容已合并，新版本: {document['version']}, 合并后长度: {len(merged_content)}")
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
                        logger.info(f"并发修改已合并，新版本: {document['version']}")
                    else:
                        # 内容和版本都相同，无需更新
                        logger.info("内容和版本都相同，无需更新")
                        # 但仍然更新版本号和时间戳，表示有同步操作
                        document["version"] = max(version + 1, server_version + 1)
                        document["content"] = content  # 保持原内容
                    
                    document["updated_at"] = datetime.utcnow().isoformat()
                    if user_id:
                        document["last_editor_id"] = user_id

                # 保存到Redis
                await self.redis_client.setex(
                    f"doc:{document_id}",
                    settings.SHAREDB_DOCUMENT_TTL or 86400,  # 24小时默认TTL
                    json.dumps(document)
                )

                # 计算内容哈希
                final_content = document["content"]
                content_hash = hashlib.md5(final_content.encode('utf-8')).hexdigest() if final_content else None
                
                # 确定合并策略和冲突信息
                # 注意：这里需要使用合并前的server_version，所以需要在合并逻辑中保存
                merge_strategy = None
                conflict_resolved = False
                sync_type = "sync"
                
                # 根据实际的合并逻辑确定策略
                # 如果文档不存在，说明是新文档
                if not document or (document.get("version", 0) == 1 and not document.get("updated_at")):
                    # 新文档，无冲突
                    sync_type = "sync"
                    original_server_version = 0
                else:
                    # 使用在合并逻辑中保存的server_version
                    original_server_version = server_version
                    
                    # 判断合并策略
                    if base_content is not None and base_content.strip() and base_content != content:
                        # 使用差异合并
                        merge_strategy = "diff_based"
                        conflict_resolved = True
                        sync_type = "merge"
                    elif server_version > version or (content_different and server_version == version):
                        # 有冲突并已解决
                        merge_strategy = "smart_merge"
                        conflict_resolved = True
                        sync_type = "merge"
                    elif content_different:
                        # 并发修改
                        merge_strategy = "smart_merge"
                        conflict_resolved = True
                        sync_type = "merge"
                    else:
                        # 普通同步
                        sync_type = "sync"
                
                # 保存同步历史到数据库（如果提供了db_session）
                if db_session is not None:
                    try:
                        from memos.api.models.document import DocumentSyncHistory
                        
                        sync_history = DocumentSyncHistory(
                            document_id=document_id,
                            version=document["version"],
                            content=final_content if create_version else None,  # 只有create_version=True时才保存内容
                            content_hash=content_hash,
                            user_id=user_id,
                            sync_type=sync_type,
                            conflict_resolved=conflict_resolved,
                            merge_strategy=merge_strategy,
                            base_version=version if base_content else None,
                            client_version=version,
                            server_version=original_server_version if document else None,
                            metadata={
                                "create_version": create_version,
                                "content_length": len(final_content) if final_content else 0,
                            }
                        )
                        db_session.add(sync_history)
                        await db_session.commit()
                        logger.info(f"已保存文档同步历史: {document_id}, 版本: {document['version']}")
                    except Exception as e:
                        logger.warning(f"保存同步历史失败（不影响同步功能）: {e}")
                        # 如果保存历史失败，不影响同步功能，只记录警告
                        if db_session:
                            try:
                                await db_session.rollback()
                            except:
                                pass

                # 计算差异并生成操作（增量更新）
                operations = []
                if document and "content" in document:
                    # 获取之前的文档内容（用于计算差异）
                    previous_content = document.get("previous_content") or server_content if document else ""
                    new_content = document["content"]
                    
                    # 如果内容不同，计算差异
                    if previous_content != new_content:
                        operations = self._calculate_diff_operations(previous_content, new_content)
                        logger.info(f"计算差异: 从 {len(previous_content)} 到 {len(new_content)} 字符，生成 {len(operations)} 个操作")
                    
                    # 保存当前内容作为下次的previous_content
                    document["previous_content"] = new_content
                
                # 始终发送完整内容更新（更可靠）
                # 同时也可以发送操作作为辅助信息，但优先使用完整内容
                await self._broadcast_update(document_id, {
                    "type": "document_synced",
                    "document_id": document_id,
                    "version": document["version"],
                    "content": document["content"],  # 完整内容（主要方式）
                    "operations": operations if len(operations) <= 100 else [],  # 操作（辅助，可选）
                    "full_content": True  # 标记这是完整内容更新
                })
                
                # 记录是否使用了增量操作
                if operations and len(operations) <= 100:
                    logger.info(f"已发送完整内容更新，同时包含 {len(operations)} 个增量操作（可选）")
                else:
                    logger.info(f"已发送完整内容更新（操作数: {len(operations) if operations else 0}，超过限制）")

                logger.info(f"文档 {document_id} 已同步，版本: {document['version']}")

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