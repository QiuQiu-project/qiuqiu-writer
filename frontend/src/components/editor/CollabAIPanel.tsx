/**
 * 多人协作 AI 面板组件
 *
 * 展示当前 Work 中所有用户发起的 AI 任务（实时广播），
 * 并允许当前用户针对特定章节发送 AI 指令。
 * 同时提供聊天 Tab，支持 @球球 触发 AI 参与对话。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquare, Send, Users, Zap } from 'lucide-react';
import {
  applyCollabAIMessage,
  applyChatMessages,
  CollabAIClient,
  type CollabAITask,
  type CollabAIServerMessage,
  type RoomChatMessage,
} from '../../utils/collabAiApi';
import { formatOutlineSummary } from '../../utils/outlineFormat';
import './CollabAIPanel.css';

/** 面板只需要章节的最基本字段 */
interface ChapterItem {
  id: string | number;
  title: string;
  chapter_number?: number;
}

interface CollabAIPanelProps {
  workId: string | number;
  /** 可选章节列表（用于章节选择器） */
  chapters?: ChapterItem[];
  /** 当前打开的章节 ID（默认选中） */
  currentChapterId?: string | number;
  /** 用于处理"使用续写推荐"按钮 */
  onUseContinueRecommendation?: (payload: {
    title: string;
    outline: Record<string, unknown> | string;
    detailed_outline: Record<string, unknown> | string;
    next_chapter_number: number;
  }) => void;
  /** 当前登录用户 ID（用于判断是否可以取消某任务） */
  currentUserId?: string;
  /** /gen_chapter 流式内容写入编辑器的回调（content=累积全文, isDone=流完成） */
  onWriteToEditor?: (content: string, isDone: boolean) => void;
}

// ── 小辅助组件 ───────────────────────────────────────────────────────────────

function UserAvatar({ name }: { name: string }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return <div className="task-user-avatar">{initial}</div>;
}

function StatusBadge({ status }: { status: CollabAITask['status'] }) {
  const labels: Record<string, string> = {
    queued: '排队中',
    running: 'AI 处理中',
    done: '已完成',
    cancelled: '已取消',
    error: '出错',
  };
  return <span className={`task-status-badge ${status}`}>{labels[status] ?? status}</span>;
}

function LoadingDots() {
  return (
    <div className="loading-dots">
      <span /><span /><span />
    </div>
  );
}

// ── 单个任务卡片 ──────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: CollabAITask;
  canCancel: boolean;
  onCancel: (requestId: string) => void;
  onUseContinueRecommendation?: CollabAIPanelProps['onUseContinueRecommendation'];
}

function TaskCard({ task, canCancel, onCancel, onUseContinueRecommendation }: TaskCardProps) {
  const queryShort = task.query.length > 60
    ? task.query.slice(0, 60) + '…'
    : task.query;

  return (
    <div className={`collab-ai-task ${task.status}`}>
      {/* 任务头部 */}
      <div className="task-header">
        <UserAvatar name={task.user_name} />
        <span className="task-user-badge">{task.user_name}</span>
        <span className="task-chapter-badge">
          {task.chapter_title ? task.chapter_title : `章节 ${task.chapter_id}`}
        </span>
        <StatusBadge status={task.status} />
        {canCancel && (task.status === 'queued' || task.status === 'running') && (
          <button
            className="task-cancel-btn"
            onClick={() => onCancel(task.request_id)}
            title="取消任务"
          >
            取消
          </button>
        )}
      </div>

      {/* 排队提示 */}
      {task.status === 'queued' && typeof task.queue_position === 'number' && task.queue_position > 0 && (
        <div className="task-queue-hint">
          ⏳ 等待前方 {task.queue_position} 个任务完成
        </div>
      )}

      {/* 查询摘要 */}
      <div className="task-query-summary" title={task.query}>{queryShort}</div>

      {/* 流式内容 */}
      {task.status === 'running' && !task.streamContent && (
        <div className="task-loading">
          <LoadingDots />
          <span>AI 正在思考…</span>
        </div>
      )}

      {task.streamContent && (
        <div className="task-stream-content">{task.streamContent}</div>
      )}

      {/* 续写推荐卡片 */}
      {task.continueChapterResult && onUseContinueRecommendation && (
        <div className="task-recommendation-cards">
          {task.continueChapterResult.recommendations.map((rec, i) => (
            <div key={i} className="recommendation-card">
              <div className="recommendation-card-title">方案 {i + 1}：{rec.title}</div>
              <div className="recommendation-card-outline">
                {formatOutlineSummary(rec.outline)}
              </div>
              <button
                className="recommendation-use-btn"
                onClick={() => onUseContinueRecommendation({
                  title: rec.title,
                  outline: rec.outline,
                  detailed_outline: rec.detailed_outline,
                  next_chapter_number: task.continueChapterResult!.next_chapter_number,
                })}
              >
                使用此方案
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 聊天气泡 ──────────────────────────────────────────────────────────────────

function ChatBubble({
  message,
  currentUserId,
}: {
  message: RoomChatMessage;
  currentUserId?: string;
}) {
  const isAI = message.is_ai;
  const isMine = !isAI && message.user_id === currentUserId;
  const displayContent = message.streaming
    ? (message.streamContent ?? '')
    : message.content;

  return (
    <div className={`chat-message ${isAI ? 'is-ai' : ''} ${isMine ? 'is-mine' : ''}`}>
      <div className="chat-avatar">
        {isAI
          ? <div className="chat-avatar-ai"><Bot size={12} /></div>
          : <div className={`chat-avatar-user ${isMine ? 'mine' : ''}`}>{(message.user_name || '?').charAt(0).toUpperCase()}</div>
        }
      </div>
      <div className="chat-bubble-wrap">
        <div className="chat-sender-name">{message.user_name}</div>
        <div className={`chat-bubble ${isAI ? 'ai' : isMine ? 'mine' : 'other'} ${message.streaming ? 'streaming' : ''}`}>
          {displayContent || (message.streaming ? '' : '…')}
        </div>
      </div>
    </div>
  );
}

// ── 指令定义 ──────────────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { id: 'continue-chapter',        name: '/continue-chapter',        subtitle: '续写章节：可跟章节号与对下一章的语言描述，生成3个推荐大纲细纲' },
  { id: 'gen_chapter',             name: '/gen_chapter',             subtitle: '根据大纲和细纲生成章节内容，直接写入编辑器' },
  { id: 'analysis-chapter',        name: '/analysis-chapter',        subtitle: '分析指定章节' },
  { id: 'analysis-chapter-info',   name: '/analysis-chapter-info',   subtitle: '分析章节组件信息' },
  { id: 'verification-chapter-info', name: '/verification-chapter-info', subtitle: '校验章节信息' },
];

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function CollabAIPanel({
  workId,
  chapters = [],
  currentChapterId,
  onUseContinueRecommendation,
  currentUserId,
  onWriteToEditor,
}: CollabAIPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks'>('chat');
  const [tasks, setTasks] = useState<Map<string, CollabAITask>>(new Map());
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | number | ''>(
    currentChapterId ?? (chapters?.[0]?.id ?? ''),
  );
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chapterDropdownOpen, setChapterDropdownOpen] = useState(false);

  // slash 命令菜单
  const [cmdMenuOpen, setCmdMenuOpen] = useState(false);
  const [cmdMenuItems, setCmdMenuItems] = useState(SLASH_COMMANDS);
  const [cmdMenuIndex, setCmdMenuIndex] = useState(0);

  const clientRef = useRef<CollabAIClient | null>(null);
  const tasksEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const taskTextareaRef = useRef<HTMLTextAreaElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const cmdMenuRef = useRef<HTMLDivElement>(null);
  const chapterDropdownRef = useRef<HTMLDivElement>(null);
  // write_to_editor 任务的累积内容：request_id -> 累积文本
  const editorWriteRef = useRef<Map<string, string>>(new Map());
  const onWriteToEditorRef = useRef(onWriteToEditor);
  useEffect(() => { onWriteToEditorRef.current = onWriteToEditor; }, [onWriteToEditor]);

  // 当 currentChapterId 变化时同步选中章节
  useEffect(() => {
    if (currentChapterId) {
      setSelectedChapterId(currentChapterId);
    }
  }, [currentChapterId]);

  // 建立 WebSocket 连接
  useEffect(() => {
    const workIdStr = String(workId);
    const client = new CollabAIClient();
    clientRef.current = client;

    const handleMessage = (msg: CollabAIServerMessage) => {
      if (msg.type === 'room_state') {
        setConnected(true);
      }
      // 聊天类消息
      if (
        msg.type === 'chat_history' ||
        msg.type === 'chat_message' ||
        msg.type === 'chat_stream' ||
        msg.type === 'chat_stream_done'
      ) {
        setChatMessages(prev => applyChatMessages(prev, msg));
        return;
      }

      // write_to_editor 任务的编辑器写入
      if (msg.type === 'ai_start' && msg.write_to_editor) {
        editorWriteRef.current.set(msg.request_id, '');
      }
      if (msg.type === 'ai_stream') {
        const content = editorWriteRef.current.get(msg.request_id);
        if (content !== undefined) {
          const event = msg.event;
          if (event.type === 'text' && typeof event.data === 'string') {
            const next = content + event.data;
            editorWriteRef.current.set(msg.request_id, next);
            onWriteToEditorRef.current?.(next, false);
          }
        }
      }
      if (msg.type === 'ai_done' || msg.type === 'ai_cancelled' || msg.type === 'ai_error') {
        const content = editorWriteRef.current.get(msg.request_id);
        if (content !== undefined) {
          editorWriteRef.current.delete(msg.request_id);
          if (msg.type === 'ai_done') {
            onWriteToEditorRef.current?.(content, true);
          }
        }
      }

      setTasks(prev => applyCollabAIMessage(prev, msg));
    };

    client.connect(workIdStr, handleMessage);

    // 轮询 isConnected 来更新连接状态指示器
    const checkInterval = setInterval(() => {
      setConnected(client.isConnected);
    }, 2000);

    return () => {
      clearInterval(checkInterval);
      client.disconnect();
    };
  }, [workId]);

  // 新任务出现时滚动到底部（任务 tab）
  useEffect(() => {
    tasksEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tasks.size]);

  // 聊天新消息时滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  // 发送 AI 请求（任务 tab）
  const handleSend = useCallback(() => {
    if (!query.trim() || selectedChapterId === '' || !clientRef.current) return;

    const chapterId = Number(selectedChapterId);
    const chapter = chapters?.find(c => Number(c.id) === chapterId);
    const chapterTitle = chapter
      ? `第 ${chapter.chapter_number} 章 ${chapter.title}`
      : `章节 ${chapterId}`;

    setSending(true);
    clientRef.current.sendAIRequest(chapterId, chapterTitle, query.trim());
    setQuery('');
    setSending(false);
  }, [query, selectedChapterId, chapters]);

  // 发送聊天消息
  const handleSendChat = useCallback(() => {
    const content = chatInput.trim();
    if (!content || !clientRef.current) return;
    clientRef.current.sendChatMessage(content);
    setChatInput('');
  }, [chatInput]);

  // 取消任务
  const handleCancel = useCallback((requestId: string) => {
    clientRef.current?.cancelTask(requestId);
  }, []);

  // slash 命令菜单：检测输入
  const handleQueryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setQuery(value);
    const cursor = e.target.selectionStart ?? value.length;
    const textBefore = value.substring(0, cursor);
    const lastSlash = textBefore.lastIndexOf('/');
    if (lastSlash !== -1) {
      const afterSlash = textBefore.substring(lastSlash + 1);
      if (!afterSlash.includes(' ') && !afterSlash.includes('\n')) {
        const filtered = SLASH_COMMANDS.filter(c =>
          c.name.toLowerCase().includes('/' + afterSlash.toLowerCase())
        );
        if (filtered.length > 0) {
          setCmdMenuItems(filtered);
          setCmdMenuIndex(0);
          setCmdMenuOpen(true);
          return;
        }
      }
    }
    setCmdMenuOpen(false);
  };

  // 点击菜单项选中指令
  const handleSelectCmd = useCallback((cmd: typeof SLASH_COMMANDS[0]) => {
    const el = taskTextareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? query.length;
    const textBefore = query.substring(0, cursor);
    const lastSlash = textBefore.lastIndexOf('/');
    const before = lastSlash !== -1 ? query.substring(0, lastSlash) : query;
    const after = query.substring(cursor);
    const newQuery = before + cmd.name + ' ' + after;
    setQuery(newQuery);
    setCmdMenuOpen(false);
    // 焦点和光标移到命令末尾
    setTimeout(() => {
      const pos = before.length + cmd.name.length + 1;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  }, [query]);

  // 任务 textarea 键盘事件：菜单导航 + Ctrl+Enter 发送
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (cmdMenuOpen && cmdMenuItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCmdMenuIndex(i => Math.min(i + 1, cmdMenuItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCmdMenuIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectCmd(cmdMenuItems[cmdMenuIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCmdMenuOpen(false);
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // 点击外部关闭菜单
  useEffect(() => {
    if (!cmdMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        cmdMenuRef.current && !cmdMenuRef.current.contains(e.target as Node) &&
        taskTextareaRef.current && !taskTextareaRef.current.contains(e.target as Node)
      ) {
        setCmdMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cmdMenuOpen]);

  // 点击外部关闭章节下拉
  useEffect(() => {
    if (!chapterDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (chapterDropdownRef.current && !chapterDropdownRef.current.contains(e.target as Node)) {
        setChapterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [chapterDropdownOpen]);

  // 点击 @球球 按钮：插入到聊天输入末尾并聚焦
  const handleInsertAtAI = () => {
    const insert = '@球球 ';
    setChatInput(prev => prev + insert);
    setTimeout(() => chatTextareaRef.current?.focus(), 0);
  };

  // 点击 / 指令按钮：插入 / 并触发菜单
  const handleInsertSlash = () => {
    const el = taskTextareaRef.current;
    if (!el || selectedChapterId === '') return;
    const newQuery = query.endsWith(' ') || query === '' ? query + '/' : query + ' /';
    setQuery(newQuery);
    // 触发菜单
    const filtered = SLASH_COMMANDS;
    setCmdMenuItems(filtered);
    setCmdMenuIndex(0);
    setCmdMenuOpen(true);
    setTimeout(() => el.focus(), 0);
  };

  // 聊天输入框：Enter 发送，Shift+Enter 换行
  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  // 任务按创建时间倒序排列（最新在上）
  const sortedTasks = Array.from(tasks.values()).sort(
    (a, b) => b.created_at - a.created_at,
  );

  const hasActiveTasks = sortedTasks.some(
    t => t.status === 'queued' || t.status === 'running',
  );

  return (
    <div className="collab-ai-panel">
      {/* 头部 */}
      <div className="collab-ai-header">
        <div className="collab-ai-title">
          <Users size={15} />
          协作 AI
        </div>
        <div className="collab-ai-status">
          <div className={`status-dot ${connected ? 'connected' : ''}`} />
          {connected ? '已连接' : '连接中…'}
          {hasActiveTasks && (
            <>
              <span>·</span>
              <Loader2 size={11} className="spinning" />
              <span>运行中</span>
            </>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="collab-ai-tabs">
        <button
          className={`collab-ai-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={13} />
          聊天
        </button>
        <button
          className={`collab-ai-tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <Zap size={13} />
          AI 任务
          {hasActiveTasks && <span className="tab-badge" />}
        </button>
      </div>

      {/* ── 聊天 Tab ── */}
      {activeTab === 'chat' && (
        <>
          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="collab-ai-empty">
                <MessageSquare size={28} strokeWidth={1.5} />
                <span>暂无消息</span>
                <span>输入 @球球 让 AI 参与对话</span>
              </div>
            ) : (
              chatMessages.map(m => (
                <ChatBubble key={m.id} message={m} currentUserId={currentUserId} />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="chat-input-box">
              <textarea
                ref={chatTextareaRef}
                className="chat-input-textarea"
                placeholder={'发消息…'}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={2}
              />
              <div className="chat-input-toolbar">
                <button className="toolbar-chip" onClick={handleInsertAtAI} title="插入 @球球">
                  @球球
                </button>
                <span className="toolbar-sep" />
                <button
                  className="chat-input-send"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  title="发送 (Enter)"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── AI 任务 Tab ── */}
      {activeTab === 'tasks' && (
        <>
          <div className="collab-ai-tasks">
            {sortedTasks.length === 0 ? (
              <div className="collab-ai-empty">
                <Zap size={28} strokeWidth={1.5} />
                <span>暂无协作 AI 任务</span>
                <span>选择章节发送指令，所有协作者都能看到进度</span>
              </div>
            ) : (
              sortedTasks.map(task => (
                <TaskCard
                  key={task.request_id}
                  task={task}
                  canCancel={task.user_id === currentUserId}
                  onCancel={handleCancel}
                  onUseContinueRecommendation={onUseContinueRecommendation}
                />
              ))
            )}
            <div ref={tasksEndRef} />
          </div>

          <div className="collab-ai-input-area">
            {/* 查询输入（含 slash 菜单） */}
            <div className="chat-input-box" style={{ position: 'relative' }}>
              {/* slash 命令下拉菜单 */}
              {cmdMenuOpen && cmdMenuItems.length > 0 && (
                <div className="slash-cmd-menu" ref={cmdMenuRef}>
                  {cmdMenuItems.map((cmd, idx) => (
                    <div
                      key={cmd.id}
                      className={`slash-cmd-option ${idx === cmdMenuIndex ? 'selected' : ''}`}
                      onMouseDown={e => { e.preventDefault(); handleSelectCmd(cmd); }}
                    >
                      <span className="slash-cmd-name">{cmd.name}</span>
                      <span className="slash-cmd-subtitle">{cmd.subtitle}</span>
                    </div>
                  ))}
                  <div className="slash-cmd-footer">
                    <span>↑↓ 选择</span><kbd>Enter</kbd><span>确认</span><kbd>Esc</kbd><span>关闭</span>
                  </div>
                </div>
              )}
              <textarea
                ref={taskTextareaRef}
                className="chat-input-textarea"
                placeholder={selectedChapterId ? '输入 / 查看指令…' : '请先选择章节'}
                value={query}
                onChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                disabled={selectedChapterId === ''}
                rows={2}
              />
              <div className="chat-input-toolbar">
                {/* 自定义章节下拉 */}
                {chapters && chapters.length > 0 && (
                  <div className="chapter-picker" ref={chapterDropdownRef}>
                    <button
                      className={`toolbar-chip chapter-chip ${!selectedChapterId ? 'placeholder' : ''}`}
                      onClick={() => setChapterDropdownOpen(o => !o)}
                      title={selectedChapterId
                        ? (() => { const ch = chapters.find(c => String(c.id) === String(selectedChapterId)); return ch ? `第${ch.chapter_number}章 ${ch.title}` : '章节'; })()
                        : '选择章节'}
                    >
                      {selectedChapterId
                        ? (() => { const ch = chapters.find(c => String(c.id) === String(selectedChapterId)); return ch ? `§${ch.chapter_number}` : '§'; })()
                        : '§'}
                      <span className="chip-arrow">▾</span>
                    </button>
                    {chapterDropdownOpen && (
                      <div className="chapter-dropdown">
                        <div
                          className={`chapter-option ${selectedChapterId === '' ? 'selected' : ''}`}
                          onMouseDown={e => { e.preventDefault(); setSelectedChapterId(''); setChapterDropdownOpen(false); }}
                        >
                          — 不限章节 —
                        </div>
                        {chapters.map(ch => (
                          <div
                            key={ch.id}
                            className={`chapter-option ${String(selectedChapterId) === String(ch.id) ? 'selected' : ''}`}
                            onMouseDown={e => { e.preventDefault(); setSelectedChapterId(ch.id); setChapterDropdownOpen(false); }}
                          >
                            第 {ch.chapter_number} 章&nbsp;{ch.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  className="toolbar-chip"
                  onClick={handleInsertSlash}
                  disabled={selectedChapterId === ''}
                  title="插入指令"
                >
                  / 指令
                </button>
                <span className="toolbar-sep" />
                <span className="chat-input-hint">Ctrl+Enter</span>
                <button
                  className="chat-input-send"
                  onClick={handleSend}
                  disabled={!query.trim() || selectedChapterId === '' || sending}
                  title="发送 (Ctrl+Enter)"
                >
                  {sending ? <Loader2 size={13} className="spinning" /> : <Send size={13} />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
