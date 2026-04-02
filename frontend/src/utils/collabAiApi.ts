/**
 * 多人协作 AI WebSocket 客户端
 *
 * 连接到后端 /api/v1/collab-ai/{workId}?token=<JWT>
 * 管理 AI 任务状态，向外暴露事件回调。
 */

import type { ContinueChapterResult } from './chatApi';

// ── 模型配置 ─────────────────────────────────────────────────────────────────

export interface LLMModelConfig {
  id: string;
  name: string;
  model_id: string;
  model_type?: 'text' | 'image' | 'video' | 'audio';
  description: string;
  enabled: boolean;
}

/** 拉取 admin 配置的可用模型列表 */
export async function fetchAvailableModels(): Promise<LLMModelConfig[]> {
  try {
    const res = await fetch('/api/v1/collab-ai/models');
    if (!res.ok) return [];
    const data = await res.json();
    return data.models ?? [];
  } catch {
    return [];
  }
}

// ── 类型定义 ────────────────────────────────────────────────────────────────

export interface CollabAITask {
  request_id: string;
  chapter_id: number;
  chapter_title: string;
  user_id: string;
  user_name: string;
  query: string;
  status: 'queued' | 'running' | 'done' | 'cancelled' | 'error';
  /** 累积的流式文本内容 */
  streamContent: string;
  /** 续写章节命令结果 */
  continueChapterResult?: ContinueChapterResult;
  created_at: number;
  /** 当前在队列中的位置（0 = 即将执行） */
  queue_position?: number;
  /** 该任务的输出需要直接写入编辑器（如 /gen_chapter） */
  write_to_editor?: boolean;
  /** 用户选择的模型 model_id */
  model?: string;
  /** 本次任务使用的 prompt 模板 ID（用于打分关联） */
  prompt_template_id?: number;
  /** 本次任务命中的实验 ID */
  experiment_id?: number;
  /** 本次任务命中的实验变体 ID */
  variant_id?: number;
}

export interface CollabAIRoomState {
  tasks: CollabAITask[];
}

/** 聊天消息（普通用户或 AI） */
export interface RoomChatMessage {
  id: string;
  work_id: string;
  user_id: string;
  user_name: string;
  content: string;
  is_ai: boolean;
  created_at: number;
  /** 仅前端：AI 正在流式输出中 */
  streaming?: boolean;
  /** 仅前端：累积流式内容（streaming 期间用） */
  streamContent?: string;
}

// 服务端 → 客户端的消息类型
export type CollabAIServerMessage =
  | { type: 'room_state'; tasks: Omit<CollabAITask, 'streamContent' | 'continueChapterResult'>[] }
  | { type: 'user_joined'; user_id: string; user_name: string }
  | { type: 'user_left'; user_id: string; user_name: string }
  | { type: 'ai_queued'; task: Omit<CollabAITask, 'streamContent' | 'continueChapterResult'>; queue_position: number }
  | { type: 'ai_start'; request_id: string; chapter_id: number; chapter_title: string; user_id: string; user_name: string; write_to_editor?: boolean }
  | { type: 'ai_stream'; request_id: string; event: { type: string; data?: unknown } }
  | { type: 'ai_done'; request_id: string; chapter_id: number }
  | { type: 'ai_error'; request_id: string; error: string }
  | { type: 'ai_cancelled'; request_id: string; chapter_id: number }
  | { type: 'chat_history'; messages: RoomChatMessage[] }
  | { type: 'chat_message'; message: RoomChatMessage }
  | { type: 'chat_stream'; message_id: string; delta: string }
  | { type: 'chat_stream_done'; message_id: string }
  | { type: 'chat_message_deleted'; message_id: string }
  | { type: 'pong' };

export type CollabAIEventHandler = (msg: CollabAIServerMessage) => void;

// ── 客户端类 ──────────────────────────────────────────────────────────────────

export class CollabAIClient {
  private ws: WebSocket | null = null;
  private workId: string | null = null;
  private onMessageCallback: CollabAIEventHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;
  private reconnectDelay = 3000;

  /**
   * 连接到协作 AI 服务
   * @param workId 作品 ID
   * @param onMessage 消息回调
   */
  connect(workId: string, onMessage: CollabAIEventHandler): void {
    this.workId = workId;
    this.onMessageCallback = onMessage;
    this.shouldReconnect = true;
    this._connect();
  }

  private _connect(): void {
    if (!this.workId || !this.onMessageCallback) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      console.warn('[CollabAI] No access token, skipping connection');
      return;
    }

    // 构造 WS URL（支持 ws:// 和 wss://）
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/api/v1/collab-ai/${this.workId}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('[CollabAI] Failed to create WebSocket:', e);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log(`[CollabAI] Connected to work ${this.workId}`);
      this.reconnectDelay = 3000; // 重置重连延迟
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as CollabAIServerMessage;
        this.onMessageCallback?.(msg);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[CollabAI] Disconnected (code=${event.code}, reason=${event.reason})`);
      this._stopPing();
      if (this.shouldReconnect && event.code !== 1008) {
        // code 1008 = 认证失败，不重连
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will handle reconnect
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      console.log(`[CollabAI] Reconnecting...`);
      this._connect();
    }, this.reconnectDelay);
    // 指数退避：最长 30 秒
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
  }

  private _startPing(): void {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 25000);
  }

  private _stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * 发送 AI 请求
   * @returns request_id（用于后续取消）
   */
  sendAIRequest(chapterId: number, chapterTitle: string, query: string, model?: string): string {
    const requestId = crypto.randomUUID();
    this.send({
      type: 'ai_request',
      chapter_id: chapterId,
      chapter_title: chapterTitle,
      query,
      request_id: requestId,
      ...(model ? { model } : {}),
    });
    return requestId;
  }

  /**
   * 取消 AI 任务（仅任务发起者可取消）
   */
  cancelTask(requestId: string): void {
    this.send({ type: 'cancel_task', request_id: requestId });
  }

  /**
   * 发送聊天消息
   */
  sendChatMessage(content: string, model?: string): void {
    this.send({ type: 'chat_message', content, model });
  }

  /**
   * 删除自己的聊天消息
   */
  deleteChatMessage(messageId: string): void {
    this.send({ type: 'delete_chat_message', message_id: messageId });
  }

  /**
   * 发送原始 JSON 消息
   */
  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 断开连接（不再重连）
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopPing();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
    this.workId = null;
    this.onMessageCallback = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ── 工具函数：从服务端消息更新任务列表 ──────────────────────────────────────

/**
 * 根据收到的 CollabAI 服务端消息，更新本地 tasks Map。
 * 用于在 React 组件中管理状态。
 */
export function applyCollabAIMessage(
  tasks: Map<string, CollabAITask>,
  msg: CollabAIServerMessage,
): Map<string, CollabAITask> {
  const next = new Map(tasks);

  switch (msg.type) {
    case 'room_state':
      // 初始状态：用服务端数据替换本地
      next.clear();
      for (const t of msg.tasks) {
        next.set(t.request_id, { ...t, streamContent: '', continueChapterResult: undefined });
      }
      break;

    case 'ai_queued': {
      const { task, queue_position } = msg;
      next.set(task.request_id, {
        ...task,
        streamContent: '',
        continueChapterResult: undefined,
        queue_position,
      });
      break;
    }

    case 'ai_start': {
      const existing = next.get(msg.request_id);
      if (existing) {
        next.set(msg.request_id, {
          ...existing,
          status: 'running',
          queue_position: undefined,
          write_to_editor: msg.write_to_editor ?? existing.write_to_editor,
        });
      }
      break;
    }

    case 'ai_stream': {
      const existing = next.get(msg.request_id);
      if (!existing) break;
      const event = msg.event;
      let streamContent = existing.streamContent;
      let continueChapterResult = existing.continueChapterResult;

      if (event.type === 'text' && typeof event.data === 'string') {
        streamContent += event.data;
      } else if (event.type === 'continue_chapter_result') {
        try {
          continueChapterResult = event.data as ContinueChapterResult;
        } catch {
          // ignore
        }
      }
      next.set(msg.request_id, { ...existing, streamContent, continueChapterResult });
      break;
    }

    case 'ai_done': {
      const existing = next.get(msg.request_id);
      if (existing) {
        next.set(msg.request_id, { ...existing, status: 'done' });
      }
      break;
    }

    case 'ai_cancelled': {
      const existing = next.get(msg.request_id);
      if (existing) {
        next.set(msg.request_id, { ...existing, status: 'cancelled' });
      }
      break;
    }

    case 'ai_error': {
      const existing = next.get(msg.request_id);
      if (existing) {
        next.set(msg.request_id, { ...existing, status: 'error' });
      }
      break;
    }

    default:
      break;
  }

  return next;
}

/**
 * 根据聊天相关消息更新聊天消息列表。
 */
export function applyChatMessages(
  messages: RoomChatMessage[],
  msg: CollabAIServerMessage,
): RoomChatMessage[] {
  switch (msg.type) {
    case 'chat_history':
      return msg.messages;

    case 'chat_message': {
      const incoming = msg.message;
      // 如果已有 streaming 占位，替换它；否则追加
      const existingIdx = messages.findIndex(m => m.id === incoming.id);
      if (existingIdx >= 0) {
        const next = [...messages];
        next[existingIdx] = incoming;
        return next;
      }
      return [...messages, incoming];
    }

    case 'chat_stream': {
      const { message_id, delta } = msg;
      const existingIdx = messages.findIndex(m => m.id === message_id);
      if (existingIdx >= 0) {
        // 更新已有占位
        const next = [...messages];
        const prev = next[existingIdx];
        next[existingIdx] = {
          ...prev,
          streamContent: (prev.streamContent ?? '') + delta,
        };
        return next;
      }
      // 创建流式占位消息
      const placeholder: RoomChatMessage = {
        id: message_id,
        work_id: '',
        user_id: 'ai_qiuqiu',
        user_name: '球球',
        content: '',
        is_ai: true,
        created_at: Date.now() / 1000,
        streaming: true,
        streamContent: delta,
      };
      return [...messages, placeholder];
    }

    case 'chat_stream_done': {
      const { message_id } = msg;
      return messages.map(m =>
        m.id === message_id ? { ...m, streaming: false } : m
      );
    }

    case 'chat_message_deleted': {
      const { message_id } = msg;
      return messages.filter(m => m.id !== message_id);
    }

    default:
      return messages;
  }
}
