"""
多人协作 AI 对话管理器

每个 Work 对应一个 CollabAIRoom，房间内：
- 所有协作者通过 WebSocket 实时看到彼此的 AI 任务进度
- 不同章节的 AI 指令并行执行
- 同一章节的 AI 指令串行执行（队列等待，防止内容冲突）
- 每个用户各自消耗自己的 Token 配额
- 聊天：普通消息广播，@球球 触发 AI 回复（流式）
"""

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import httpx
from fastapi import WebSocket
from sqlalchemy import select

logger = logging.getLogger(__name__)

AI_NAME = "球球"
AI_TRIGGER = f"@{AI_NAME}"
AI_USER_ID = "ai_qiuqiu"


@dataclass
class CollabAITask:
    """单个 AI 任务"""
    request_id: str
    chapter_id: int
    chapter_title: str
    user_id: str
    user_name: str
    query: str
    status: str = "queued"  # queued | running | done | cancelled | error
    asyncio_task: Optional[asyncio.Task] = field(default=None, repr=False)
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if k != "asyncio_task"}


class CollabAIRoom:
    """
    单个 Work 的协作 AI 房间。

    不同章节的任务并行执行；同一章节的任务通过 asyncio.Queue 串行执行。
    """

    def __init__(self, work_id: str):
        self.work_id = work_id
        self.connections: Dict[WebSocket, dict] = {}  # ws -> {user_id, user_name}
        self.chapter_queues: Dict[int, asyncio.Queue] = {}
        self.chapter_workers: Dict[int, asyncio.Task] = {}
        self.all_tasks: Dict[str, CollabAITask] = {}

    # ── Broadcast ─────────────────────────────────────────────────────────────

    async def broadcast(self, msg: dict, exclude: Optional[WebSocket] = None):
        """广播 JSON 消息到房间内所有连接（除 exclude 外）。"""
        data = json.dumps(msg, ensure_ascii=False)
        dead = []
        for ws in list(self.connections):
            if ws is exclude:
                continue
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections.pop(ws, None)

    # ── Connection lifecycle ───────────────────────────────────────────────────

    async def add_connection(self, ws: WebSocket, user_id: str, user_name: str):
        """用户加入房间：注册连接，发送当前房间状态，广播 user_joined。"""
        self.connections[ws] = {"user_id": user_id, "user_name": user_name}
        # 向新用户发送当前所有任务状态
        await ws.send_text(json.dumps({
            "type": "room_state",
            "tasks": [t.to_dict() for t in self.all_tasks.values()],
        }, ensure_ascii=False))

        # 向新用户发送聊天历史
        try:
            history = await self._load_chat_history()
            await ws.send_text(json.dumps({
                "type": "chat_history",
                "messages": history,
            }, ensure_ascii=False))
        except Exception as e:
            logger.warning(f"[CollabAI:{self.work_id}] Failed to load chat history: {e}")

        await self.broadcast(
            {"type": "user_joined", "user_id": user_id, "user_name": user_name},
            exclude=ws,
        )
        logger.info(f"[CollabAI:{self.work_id}] {user_name}({user_id}) joined "
                    f"({len(self.connections)} total)")

    async def remove_connection(self, ws: WebSocket):
        """用户离开房间：注销连接，广播 user_left。"""
        user = self.connections.pop(ws, None)
        if user:
            await self.broadcast({"type": "user_left", **user})
            logger.info(f"[CollabAI:{self.work_id}] {user['user_name']} left "
                        f"({len(self.connections)} total)")

    # ── Chat ──────────────────────────────────────────────────────────────────

    async def _load_chat_history(self) -> List[dict]:
        """从 DB 加载最近 100 条聊天记录（按时间升序）。"""
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.work_chat_message import WorkChatMessage

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(WorkChatMessage)
                .where(WorkChatMessage.work_id == self.work_id)
                .order_by(WorkChatMessage.created_at.desc())
                .limit(100)
            )
            rows = result.scalars().all()
            # 倒序查询，逆转后得到时间升序
            return [row.to_dict() for row in reversed(rows)]

    async def _save_chat_message(
        self,
        user_id: str,
        user_name: str,
        content: str,
        is_ai: bool = False,
        message_id: Optional[str] = None,
    ) -> dict:
        """写入 DB，返回消息 dict。"""
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.work_chat_message import WorkChatMessage

        msg_id = message_id or str(uuid.uuid4())
        now = time.time()
        async with AsyncSessionLocal() as session:
            row = WorkChatMessage(
                id=msg_id,
                work_id=self.work_id,
                user_id=user_id,
                user_name=user_name,
                content=content,
                is_ai=is_ai,
                created_at=now,
            )
            session.add(row)
            await session.commit()
            return row.to_dict()

    async def handle_chat_message(self, user_id: str, user_name: str, content: str):
        """
        处理用户聊天消息：
        1. 保存到 DB
        2. 广播 chat_message
        3. 如果含 @球球，异步触发 AI 回复
        """
        content = content.strip()
        if not content:
            return

        # 保存并广播用户消息
        msg_dict = await self._save_chat_message(user_id, user_name, content, is_ai=False)
        await self.broadcast({"type": "chat_message", "message": msg_dict})

        # 触发 AI 回复
        if AI_TRIGGER in content:
            asyncio.create_task(self._run_ai_chat(user_id, user_name, content))

    async def _run_ai_chat(self, user_id: str, user_name: str, content: str):
        """
        AI 聊天回复：流式广播 + 完成后保存 DB。
        """
        # 去掉 @球球 后作为 query
        query = content.replace(AI_TRIGGER, "").strip()
        if not query:
            query = "请介绍一下你自己"

        port = int(os.getenv("PORT", "8001"))
        base_url = f"http://127.0.0.1:{port}"
        memos_user_id = f"user_{user_id}_work_{self.work_id}"
        message_id = str(uuid.uuid4())

        payload = {
            "user_id": memos_user_id,
            "query": query,
            "history": [],
            "internet_search": False,
            "moscube": True,
            "session_id": f"chat_{self.work_id}",
        }

        accumulated = ""
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/v1/product/chat",
                    json=payload,
                    headers={"Accept": "text/event-stream"},
                ) as resp:
                    if resp.status_code == 402:
                        err_msg = await self._save_chat_message(
                            AI_USER_ID, AI_NAME,
                            "⚠️ Token 配额不足，无法回复。", is_ai=True,
                        )
                        await self.broadcast({"type": "chat_message", "message": err_msg})
                        return

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if not data_str:
                            continue
                        try:
                            event = json.loads(data_str)
                            if event.get("type") == "text" and isinstance(event.get("data"), str):
                                delta = event["data"]
                                accumulated += delta
                                await self.broadcast({
                                    "type": "chat_stream",
                                    "message_id": message_id,
                                    "delta": delta,
                                })
                        except json.JSONDecodeError:
                            pass

            # 流完成
            await self.broadcast({"type": "chat_stream_done", "message_id": message_id})

            if accumulated:
                ai_msg = await self._save_chat_message(
                    AI_USER_ID, AI_NAME, accumulated, is_ai=True, message_id=message_id,
                )
                await self.broadcast({"type": "chat_message", "message": ai_msg})

            logger.info(f"[CollabAI:{self.work_id}] AI chat replied ({len(accumulated)} chars)")

        except Exception as e:
            logger.error(f"[CollabAI:{self.work_id}] AI chat error: {e}")
            await self.broadcast({"type": "chat_stream_done", "message_id": message_id})

    # ── Task management ────────────────────────────────────────────────────────

    async def queue_ai_request(
        self,
        user_id: str,
        user_name: str,
        chapter_id: int,
        chapter_title: str,
        query: str,
    ) -> str:
        """将 AI 请求加入章节队列，返回 request_id。"""
        request_id = str(uuid.uuid4())
        task = CollabAITask(
            request_id=request_id,
            chapter_id=chapter_id,
            chapter_title=chapter_title,
            user_id=user_id,
            user_name=user_name,
            query=query,
        )
        self.all_tasks[request_id] = task

        if chapter_id not in self.chapter_queues:
            self.chapter_queues[chapter_id] = asyncio.Queue()

        queue_position = self.chapter_queues[chapter_id].qsize()
        await self.chapter_queues[chapter_id].put(task)

        await self.broadcast({
            "type": "ai_queued",
            "task": task.to_dict(),
            "queue_position": queue_position,
        })

        # 确保该章节的工作协程正在运行
        worker = self.chapter_workers.get(chapter_id)
        if worker is None or worker.done():
            self.chapter_workers[chapter_id] = asyncio.create_task(
                self._chapter_worker(chapter_id)
            )

        logger.info(f"[CollabAI:{self.work_id}] Task {request_id[:8]} queued for "
                    f"chapter {chapter_id} by {user_name} (queue_pos={queue_position})")
        return request_id

    async def cancel_task(self, request_id: str, requester_user_id: str) -> bool:
        """取消任务（仅任务发起者可取消）。"""
        task = self.all_tasks.get(request_id)
        if not task:
            return False
        if task.user_id != requester_user_id:
            logger.warning(f"[CollabAI:{self.work_id}] {requester_user_id} tried to cancel "
                           f"task {request_id[:8]} owned by {task.user_id}")
            return False

        task.status = "cancelled"
        if task.asyncio_task and not task.asyncio_task.done():
            task.asyncio_task.cancel()

        await self.broadcast({
            "type": "ai_cancelled",
            "request_id": request_id,
            "chapter_id": task.chapter_id,
        })
        logger.info(f"[CollabAI:{self.work_id}] Task {request_id[:8]} cancelled by "
                    f"{requester_user_id}")
        return True

    # ── Worker coroutines ──────────────────────────────────────────────────────

    async def _chapter_worker(self, chapter_id: int):
        """章节工作协程：从队列中串行处理该章节的所有任务。"""
        queue = self.chapter_queues[chapter_id]
        logger.info(f"[CollabAI:{self.work_id}] Worker started for chapter {chapter_id}")
        while True:
            try:
                task = await asyncio.wait_for(queue.get(), timeout=60.0)
            except asyncio.TimeoutError:
                logger.info(f"[CollabAI:{self.work_id}] Worker idle timeout for chapter "
                            f"{chapter_id}, exiting")
                break

            if task.status == "cancelled":
                queue.task_done()
                continue

            task.status = "running"
            ai_task = asyncio.create_task(self._run_ai_task(task))
            task.asyncio_task = ai_task
            try:
                await ai_task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"[CollabAI:{self.work_id}] Unexpected error in task "
                             f"{task.request_id[:8]}: {e}")
            finally:
                queue.task_done()
                # 30 秒后从内存中清理已完成任务
                loop = asyncio.get_event_loop()
                loop.call_later(30, self.all_tasks.pop, task.request_id, None)

    async def _run_ai_task(self, task: CollabAITask):
        """
        分发 AI 任务：
        - /gen_chapter  → 调用章节内容生成接口，输出直接写入编辑器
        - 其他指令     → 调用 /api/v1/product/chat SSE，流式广播给所有用户
        """
        is_gen_chapter = task.query.strip().lower().startswith("/gen_chapter")

        await self.broadcast({
            "type": "ai_start",
            "request_id": task.request_id,
            "chapter_id": task.chapter_id,
            "chapter_title": task.chapter_title,
            "user_id": task.user_id,
            "user_name": task.user_name,
            "write_to_editor": is_gen_chapter,
        })
        logger.info(f"[CollabAI:{self.work_id}] Task {task.request_id[:8]} started, "
                    f"chapter={task.chapter_id}, user={task.user_name}, "
                    f"write_to_editor={is_gen_chapter}")

        if is_gen_chapter:
            await self._run_gen_chapter_task(task)
        else:
            await self._run_chat_task(task)

    async def _run_gen_chapter_task(self, task: CollabAITask):
        """
        /gen_chapter 专用：从 DB 读取章节大纲和细纲，调用 generate_content_stream，
        将每个文本 chunk 以 ai_stream {type:"text"} 形式广播。
        """
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.chapter import Chapter
        from memos.api.models.work import Work
        from memos.api.services.ai_service import get_ai_service

        try:
            # 1. 从 DB 读取章节元数据和作品角色信息
            async with AsyncSessionLocal() as session:
                chapter_row = await session.get(Chapter, task.chapter_id)
                if not chapter_row:
                    raise ValueError(f"章节 {task.chapter_id} 不存在")

                meta = (chapter_row.chapter_metadata or {}) if hasattr(chapter_row, 'chapter_metadata') else {}
                outline = str(meta.get("outline", "")).strip()
                detailed_outline = str(meta.get("detailed_outline", "")).strip()
                chapter_title = chapter_row.title or ""

                # 读取作品角色
                work_row = await session.get(Work, self.work_id)
                work_meta = {}
                if work_row:
                    work_meta = (work_row.work_metadata or {}) if hasattr(work_row, 'work_metadata') else {}
                    if not work_meta:
                        work_meta = (work_row.metadata or {}) if hasattr(work_row, 'metadata') else {}

            if not outline or not detailed_outline:
                raise ValueError("当前章节未填写大纲或细纲，请先在章节设置中填写")

            chars_raw = work_meta.get("characters") or work_meta.get("component_data", {}).get("characters", [])
            character_names = [c.get("name", "") for c in chars_raw if isinstance(c, dict) and c.get("name")]

            # 2. 调用 generate_content_stream
            ai_service = get_ai_service()
            if not ai_service.is_healthy():
                raise ValueError("AI 服务不可用")

            system_prompt = (
                "你是一位经验丰富的小说创作专家，擅长根据大纲和细纲创作引人入胜的章节内容。"
                "直接输出章节正文内容，不要添加标题、说明等额外文字。"
                "使用段落分隔，每个段落之间用空行分隔。"
            )
            parts = []
            if chapter_title:
                parts.append(f"## 章节标题\n{chapter_title}\n")
            parts.append(f"## 章节大纲\n{outline}\n")
            parts.append(f"## 章节细纲\n{detailed_outline}\n")
            if character_names:
                parts.append(f"## 出场人物\n{', '.join(character_names)}\n")
            parts.append("\n请根据以上大纲和细纲，创作完整的章节内容。")
            user_prompt = "\n".join(parts)

            usage_ref: dict = {}
            async for chunk in ai_service.generate_content_stream(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.7,
                max_tokens=8000,
                usage_ref=usage_ref,
                user_id=str(task.user_id),
                feature="generate",
                work_id=str(self.work_id),
            ):
                if task.status == "cancelled":
                    break
                await self.broadcast({
                    "type": "ai_stream",
                    "request_id": task.request_id,
                    "event": {"type": "text", "data": chunk},
                })

            if task.status != "cancelled":
                task.status = "done"
                await self.broadcast({
                    "type": "ai_done",
                    "request_id": task.request_id,
                    "chapter_id": task.chapter_id,
                })
                logger.info(f"[CollabAI:{self.work_id}] gen_chapter task {task.request_id[:8]} done")

        except asyncio.CancelledError:
            task.status = "cancelled"
            await self.broadcast({
                "type": "ai_cancelled",
                "request_id": task.request_id,
                "chapter_id": task.chapter_id,
            })
            raise

        except Exception as e:
            task.status = "error"
            logger.error(f"[CollabAI:{self.work_id}] gen_chapter task {task.request_id[:8]} error: {e}")
            await self.broadcast({
                "type": "ai_error",
                "request_id": task.request_id,
                "error": str(e),
            })

    async def _run_chat_task(self, task: CollabAITask):
        """
        通过内部 httpx 调用 /api/v1/product/chat SSE 端点，
        将流式事件广播给房间内所有用户。
        """
        port = int(os.getenv("PORT", "8001"))
        base_url = f"http://127.0.0.1:{port}"
        # 构造 MemOS 格式的 user_id
        memos_user_id = f"user_{task.user_id}_work_{self.work_id}"

        payload = {
            "user_id": memos_user_id,
            "query": task.query,
            "history": [],
            "internet_search": False,
            "moscube": True,
            "session_id": f"collab_{task.chapter_id}",
        }

        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/v1/product/chat",
                    json=payload,
                    headers={"Accept": "text/event-stream"},
                ) as resp:
                    if resp.status_code == 402:
                        task.status = "error"
                        await self.broadcast({
                            "type": "ai_error",
                            "request_id": task.request_id,
                            "error": "Token 配额不足，请升级套餐",
                        })
                        return

                    async for line in resp.aiter_lines():
                        if task.status == "cancelled":
                            break
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if not data_str:
                            continue
                        try:
                            event = json.loads(data_str)
                            await self.broadcast({
                                "type": "ai_stream",
                                "request_id": task.request_id,
                                "event": event,
                            })
                        except json.JSONDecodeError:
                            pass

            if task.status != "cancelled":
                task.status = "done"
                await self.broadcast({
                    "type": "ai_done",
                    "request_id": task.request_id,
                    "chapter_id": task.chapter_id,
                })
                logger.info(f"[CollabAI:{self.work_id}] Task {task.request_id[:8]} done")

        except asyncio.CancelledError:
            task.status = "cancelled"
            await self.broadcast({
                "type": "ai_cancelled",
                "request_id": task.request_id,
                "chapter_id": task.chapter_id,
            })
            raise

        except Exception as e:
            task.status = "error"
            logger.error(f"[CollabAI:{self.work_id}] Task {task.request_id[:8]} error: {e}")
            await self.broadcast({
                "type": "ai_error",
                "request_id": task.request_id,
                "error": str(e),
            })


class CollabAIManager:
    """顶层管理器：管理所有 Work 的房间生命周期。"""

    def __init__(self):
        self.rooms: Dict[str, CollabAIRoom] = {}

    def get_room(self, work_id: str) -> CollabAIRoom:
        if work_id not in self.rooms:
            self.rooms[work_id] = CollabAIRoom(work_id)
        return self.rooms[work_id]

    async def handle_connection(
        self,
        ws: WebSocket,
        work_id: str,
        user_id: str,
        user_name: str,
    ):
        """处理一个完整的 WebSocket 连接生命周期。"""
        room = self.get_room(work_id)
        try:
            await room.add_connection(ws, user_id, user_name)
            while True:
                raw = await ws.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type")
                if msg_type == "ai_request":
                    await room.queue_ai_request(
                        user_id=user_id,
                        user_name=user_name,
                        chapter_id=int(msg["chapter_id"]),
                        chapter_title=msg.get("chapter_title", ""),
                        query=msg["query"],
                    )
                elif msg_type == "cancel_task":
                    await room.cancel_task(msg["request_id"], user_id)
                elif msg_type == "chat_message":
                    await room.handle_chat_message(user_id, user_name, msg.get("content", ""))
                elif msg_type == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))

        except Exception as e:
            # WebSocketDisconnect 或其他异常
            logger.debug(f"[CollabAI:{work_id}] Connection closed for {user_id}: {e}")
        finally:
            await room.remove_connection(ws)
            # 房间空了则释放内存
            if not room.connections and work_id in self.rooms:
                del self.rooms[work_id]
                logger.info(f"[CollabAI] Room {work_id} destroyed (empty)")


# 单例
collab_ai_manager = CollabAIManager()
