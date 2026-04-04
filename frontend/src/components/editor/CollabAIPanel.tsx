/**
 * 多人协作 AI 面板组件
 *
 * 展示当前 Work 中所有用户发起的 AI 任务（实时广播），
 * 并允许当前用户针对特定章节发送 AI 指令。
 * 同时提供聊天 Tab，支持 @球球 触发 AI 参与对话。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquare, Send, Users, Zap, Trash2 } from 'lucide-react';
import {
  applyCollabAIMessage,
  applyChatMessages,
  CollabAIClient,
  fetchAvailableModels,
  type CollabAITask,
  type CollabAIServerMessage,
  type LLMModelConfig,
  type RoomChatMessage,
} from '../../utils/collabAiApi';
import { formatOutlineSummary } from '../../utils/outlineFormat';
import type { LocalDramaTask } from '../drama/dramaTypes';
import RatingWidget from '../common/RatingWidget';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  selectedModel?: string;
  onSelectedModelChange?: (modelId: string) => void;
  showBuiltInCommands?: boolean;
  /** Drama 本地任务列表（前端执行，非 WebSocket） */
  localTasks?: LocalDramaTask[];
  /** 追加到 SLASH_COMMANDS 之后的额外命令（drama 专用） */
  extraCommands?: Array<{ id: string; name: string; subtitle: string }>;
  /** 用户提交了一条 extraCommand 时的回调 */
  onExtraCommand?: (commandId: string, fullQuery: string) => void;
  /** 取消一个本地任务 */
  onCancelLocalTask?: (localId: string) => void;
}

// ── 小辅助组件 ───────────────────────────────────────────────────────────────

function UserAvatar({ name }: { name: string }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return <div className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{initial}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    queued: '排队中',
    running: 'AI 处理中',
    done: '已完成',
    cancelled: '已取消',
    error: '出错',
  };
  return (
    <span
      className={cn(
        'ml-auto rounded px-[7px] py-[2px] text-[11px] font-medium',
        status === 'queued' && 'bg-amber-500/15 text-amber-500',
        status === 'running' && 'bg-primary/12 text-primary',
        status === 'done' && 'bg-emerald-500/12 text-emerald-600',
        status === 'error' && 'bg-destructive/12 text-destructive',
        status === 'cancelled' && 'bg-muted text-muted-foreground'
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-[3px]">
      <span className="size-[5px] animate-pulse rounded-full bg-primary [animation-delay:0ms]" />
      <span className="size-[5px] animate-pulse rounded-full bg-primary [animation-delay:200ms]" />
      <span className="size-[5px] animate-pulse rounded-full bg-primary [animation-delay:400ms]" />
    </div>
  );
}

// ── 思考过程及文本渲染组件 ──────────────────────────────────────────────────────────

function parseThinkTags(text: string) {
  const parts: { type: 'text' | 'think', content: string }[] = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    const thinkStart = text.indexOf('<think>', currentIndex);
    if (thinkStart === -1) {
      parts.push({ type: 'text', content: text.substring(currentIndex) });
      break;
    }
    
    if (thinkStart > currentIndex) {
      parts.push({ type: 'text', content: text.substring(currentIndex, thinkStart) });
    }
    
    const thinkEnd = text.indexOf('</think>', thinkStart + 7);
    if (thinkEnd === -1) {
      parts.push({ type: 'think', content: text.substring(thinkStart + 7) });
      break;
    }
    
    parts.push({ type: 'think', content: text.substring(thinkStart + 7, thinkEnd) });
    currentIndex = thinkEnd + 8;
  }
  
  return parts;
}

function MessageContent({ content, streaming }: { content: string, streaming?: boolean }) {
  if (!content) return null;
  const parts = parseThinkTags(content);
  
  return (
    <>
      {parts.map((part, idx) => {
        if (part.type === 'think') {
          const isLastAndStreaming = streaming && idx === parts.length - 1;
          return (
            <details key={idx} className="my-1.5 overflow-hidden rounded-md border border-border bg-black/[0.03] dark:bg-white/[0.03]" open={isLastAndStreaming}>
              <summary className="flex cursor-pointer items-center bg-black/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
                {isLastAndStreaming ? '思考中...' : '已深度思考'}
              </summary>
              <div className="border-t border-dashed border-border px-2.5 py-2 text-xs whitespace-pre-wrap text-muted-foreground opacity-90">{part.content}</div>
            </details>
          );
        }
        return <span key={idx} style={{ whiteSpace: 'pre-wrap' }}>{part.content}</span>;
      })}
    </>
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
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3 transition-colors',
        task.status === 'running' && 'border-primary bg-primary/10',
        task.status === 'error' && 'border-destructive bg-destructive/5',
        task.status === 'cancelled' && 'opacity-60',
        task.status !== 'running' && task.status !== 'error' && 'border-border bg-muted/40'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <UserAvatar name={task.user_name} />
        <span className="text-xs font-medium text-muted-foreground">{task.user_name}</span>
        <span className="rounded bg-muted px-[7px] py-[2px] text-[11px] whitespace-nowrap text-muted-foreground">
          {task.chapter_title ? task.chapter_title : `章节 ${task.chapter_id}`}
        </span>
        <StatusBadge status={task.status} />
        {canCancel && (task.status === 'queued' || task.status === 'running') && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onCancel(task.request_id)}
            title="取消任务"
          >
            取消
          </Button>
        )}
      </div>

      {task.status === 'queued' && typeof task.queue_position === 'number' && task.queue_position > 0 && (
        <div className="flex items-center gap-1 text-[11px] text-amber-500">
          ⏳ 等待前方 {task.queue_position} 个任务完成
        </div>
      )}

      <div className="truncate text-xs text-muted-foreground" title={task.query}>{queryShort}</div>

      {task.status === 'running' && !task.streamContent && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoadingDots />
          <span>AI 正在思考…</span>
        </div>
      )}

      {task.streamContent && (
        <div className="max-h-[200px] overflow-y-auto rounded-md bg-background px-2.5 py-2 text-[13px] leading-6 whitespace-pre-wrap break-words text-foreground">
          <MessageContent content={task.streamContent} streaming={task.status === 'running'} />
        </div>
      )}

      {task.status === 'done' && (
        <RatingWidget
          promptTemplateId={task.prompt_template_id}
          experimentId={task.experiment_id}
          variantId={task.variant_id}
          context={{ chapter_id: task.chapter_id, generation_type: 'collab_ai' }}
          compact
        />
      )}

      {task.status === 'error' && (
        <div className="mt-1 text-xs text-destructive">
          {task.error || '执行失败，请重试'}
        </div>
      )}

      {task.continueChapterResult && onUseContinueRecommendation && (
        <div className="flex flex-col gap-2">
          {task.continueChapterResult.recommendations.map((rec, i) => (
            <div key={i} className="rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary hover:bg-primary/10">
              <div className="mb-1 text-[13px] font-semibold text-foreground">方案 {i + 1}：{rec.title}</div>
              <div className="text-xs leading-5 text-muted-foreground">
                {formatOutlineSummary(rec.outline)}
              </div>
              <Button
                variant="outline"
                size="xs"
                className="mt-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => onUseContinueRecommendation({
                  title: rec.title,
                  outline: rec.outline,
                  detailed_outline: rec.detailed_outline,
                  next_chapter_number: task.continueChapterResult!.next_chapter_number,
                })}
              >
                使用此方案
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 本地 Drama 任务卡片 ────────────────────────────────────────────────────────

const LOCAL_TASK_LABELS: Record<string, string> = {
  'gen-script': '生成剧本正文',
  'extract-characters': '提取角色',
  'extract-scenes': '提取场景',
};

function LocalTaskCard({
  task,
  onCancel,
}: {
  task: LocalDramaTask;
  onCancel?: (localId: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3 transition-colors',
        task.status === 'running' && 'border-primary bg-primary/10',
        task.status === 'error' && 'border-destructive bg-destructive/5',
        task.status === 'cancelled' && 'opacity-60',
        task.status !== 'running' && task.status !== 'error' && 'border-border bg-muted/40'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground"><Bot size={12} /></div>
        <span className="rounded bg-muted px-[7px] py-[2px] text-[11px] whitespace-nowrap text-muted-foreground">{task.episode_title}</span>
        <StatusBadge status={task.status} />
        {task.status === 'running' && onCancel && (
          <Button variant="outline" size="xs" onClick={() => onCancel(task.local_id)} title="取消">
            取消
          </Button>
        )}
      </div>
      <div className="truncate text-xs text-muted-foreground">{LOCAL_TASK_LABELS[task.type] ?? task.query}</div>

      {task.type === 'gen-script' && (
        <>
          {task.status === 'running' && !task.streamContent && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoadingDots /><span>生成剧本中…</span></div>
          )}
          {task.streamContent && (
            <div className="max-h-[200px] overflow-y-auto rounded-md bg-background px-2.5 py-2 text-[13px] leading-6 whitespace-pre-wrap break-words text-foreground">
              <MessageContent content={task.streamContent} streaming={task.status === 'running'} />
            </div>
          )}
        </>
      )}

      {task.status === 'done' && task.type !== 'gen-script' && Array.isArray(task.result) && (
        <div className="mt-1 text-xs text-muted-foreground">
          已提取 {task.result.length} 个{task.type === 'extract-characters' ? '角色' : '场景'}，已应用到侧边栏
        </div>
      )}
      {task.status === 'done' && task.type !== 'gen-script' && !Array.isArray(task.result) && (
        <div className="mt-1 text-xs text-muted-foreground">
          提取完成
        </div>
      )}

      {task.status === 'done' && task.type === 'gen-script' && (
        <RatingWidget
          context={{ generation_type: 'drama_gen_script' }}
          compact
        />
      )}

      {task.status === 'error' && (
        <div className="mt-1 text-xs text-destructive">
          {task.error || '执行失败，请重试'}
        </div>
      )}
    </div>
  );
}

// ── 聊天气泡 ──────────────────────────────────────────────────────────────────

function ChatBubble({
  message,
  currentUserId,
  onDelete,
}: {
  message: RoomChatMessage;
  currentUserId?: string;
  onDelete?: (messageId: string) => void;
}) {
  const isAI = message.is_ai;
  const isMine = !isAI && message.user_id === currentUserId;
  const displayContent = message.streaming
    ? (message.streamContent ?? '')
    : message.content;

  return (
    <div className="flex items-start gap-2">
      <div className="shrink-0">
        {isAI
          ? <div className="flex size-[26px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#4096ff,#722ed1)] text-white"><Bot size={12} /></div>
          : <div className={cn('flex size-[26px] items-center justify-center rounded-full text-xs font-semibold text-white', isMine ? 'bg-emerald-500' : 'bg-primary')}>{(message.user_name || '?').charAt(0).toUpperCase()}</div>
        }
      </div>
      <div className="flex max-w-[78%] flex-col gap-[3px]">
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          {message.user_name}
          {(isMine || isAI) && !message.streaming && onDelete && (
            <button className="flex items-center justify-center rounded p-0.5 text-muted-foreground opacity-60 transition-all hover:bg-destructive/10 hover:text-destructive hover:opacity-100" onClick={() => onDelete(message.id)} title="删除消息">
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-[13px] leading-6 break-words whitespace-pre-wrap',
            isAI && 'border border-primary/20 bg-[linear-gradient(135deg,rgba(64,150,255,0.1),rgba(114,46,209,0.08))] text-foreground rounded-bl-sm',
            isMine && 'bg-primary text-primary-foreground rounded-br-sm',
            !isAI && !isMine && 'bg-muted text-foreground rounded-bl-sm',
            message.streaming && 'after:ml-0.5 after:inline-block after:animate-pulse after:text-primary after:content-["▋"]'
          )}
        >
          {displayContent ? (
            <MessageContent content={displayContent} streaming={message.streaming} />
          ) : (
            message.streaming ? '' : '…'
          )}
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

// ── 模型选择器组件 ──────────────────────────────────────────────────────────────

function ModelPicker({
  availableModels,
  selectedModel,
  onSelectModel
}: {
  availableModels: LLMModelConfig[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (availableModels.length === 0) return null;

  const selectedModelObj = availableModels.find(m => m.model_id === selectedModel);
  const modelLabel = selectedModelObj ? selectedModelObj.name : '默认模型';

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
        onClick={() => setIsOpen(o => !o)}
        title={selectedModelObj?.description || '选择 AI 模型'}
      >
        <Bot size={10} />
        <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelLabel}</span>
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      {isOpen && (
        <div className="absolute bottom-[calc(100%+4px)] left-0 z-[200] max-h-[200px] min-w-[160px] max-w-[220px] overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          <div
            className={cn('cursor-pointer truncate px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary', selectedModel === '' && 'bg-primary/10 text-primary')}
            onMouseDown={e => { e.preventDefault(); onSelectModel(''); setIsOpen(false); }}
          >
            默认模型
          </div>
          {availableModels.map(m => (
            <div
              key={m.id}
              className={cn('cursor-pointer truncate px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary', selectedModel === m.model_id && 'bg-primary/10 text-primary')}
              onMouseDown={e => { e.preventDefault(); onSelectModel(m.model_id); setIsOpen(false); }}
              title={m.description}
            >
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export default function CollabAIPanel({
  workId,
  chapters = [],
  currentChapterId,
  onUseContinueRecommendation,
  currentUserId,
  onWriteToEditor,
  selectedModel: selectedModelProp,
  onSelectedModelChange,
  showBuiltInCommands = true,
  localTasks,
  extraCommands,
  onExtraCommand,
  onCancelLocalTask,
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

  // 模型选择
  const [availableModels, setAvailableModels] = useState<LLMModelConfig[]>([]);
  const [internalSelectedModel, setInternalSelectedModel] = useState<string>(''); // '' = 默认模型
  const selectedModel = selectedModelProp ?? internalSelectedModel;
  const setSelectedModel = onSelectedModelChange ?? setInternalSelectedModel;

  // slash 命令菜单
  const [cmdMenuOpen, setCmdMenuOpen] = useState(false);
  const [cmdMenuItems, setCmdMenuItems] = useState<Array<{ id: string; name: string; subtitle: string }>>([]);
  const [cmdMenuIndex, setCmdMenuIndex] = useState(0);

  // 合并内置命令 + extraCommands（drama 场景）
  const allCommands = useMemo(
    () => [...(showBuiltInCommands ? SLASH_COMMANDS : []), ...(extraCommands ?? [])],
    [extraCommands, showBuiltInCommands],
  );

  useEffect(() => {
    setCmdMenuItems(allCommands);
  }, [allCommands]);

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

  // 拉取可用模型列表
  useEffect(() => {
    fetchAvailableModels().then(models => {
      // 过滤出文本模型（兼容旧版没有 model_type 的情况）
      const textModels = models.filter(m => !m.model_type || m.model_type === 'text');
      setAvailableModels(textModels);
    });
  }, []);

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
        msg.type === 'chat_stream_done' ||
        msg.type === 'chat_message_deleted'
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
    if (!query.trim() || !clientRef.current) return;

    // 优先检查 extraCommands（drama 本地命令，不走 WebSocket）
    const matchedExtra = (extraCommands ?? []).find(cmd => query.trim().startsWith(cmd.name));
    if (matchedExtra && onExtraCommand) {
      onExtraCommand(matchedExtra.id, query.trim());
      setQuery('');
      return;
    }

    // 普通 WebSocket 命令：需要 selectedChapterId
    if (selectedChapterId === '') return;
    const chapterId = Number(selectedChapterId);
    if (isNaN(chapterId)) return; // drama 模式下 episode.id 是 base36 字符串，禁止发送

    const chapter = chapters?.find(c => Number(c.id) === chapterId);
    const chapterTitle = chapter
      ? `第 ${chapter.chapter_number} 章 ${chapter.title}`
      : `章节 ${chapterId}`;

    setSending(true);
    clientRef.current.sendAIRequest(chapterId, chapterTitle, query.trim(), selectedModel || undefined);
    setQuery('');
    setSending(false);
  }, [query, selectedChapterId, chapters, selectedModel, extraCommands, onExtraCommand]);

  // 发送聊天消息
  const handleSendChat = useCallback(() => {
    const content = chatInput.trim();
    if (!content || !clientRef.current) return;
    clientRef.current.sendChatMessage(content, selectedModel || undefined);
    setChatInput('');
  }, [chatInput, selectedModel]);

  // 取消任务
  const handleCancel = useCallback((requestId: string) => {
    clientRef.current?.cancelTask(requestId);
  }, []);

  // 删除聊天消息
  const handleDeleteChat = useCallback((messageId: string) => {
    clientRef.current?.deleteChatMessage(messageId);
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
        const filtered = allCommands.filter(c =>
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
  const handleSelectCmd = useCallback((cmd: { id: string; name: string; subtitle: string }) => {
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
    if (!el) return;
    const newQuery = query.endsWith(' ') || query === '' ? query + '/' : query + ' /';
    setQuery(newQuery);
    // 触发菜单（包含 extraCommands）
    setCmdMenuItems(allCommands);
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

  const hasActiveTasks =
    sortedTasks.some(t => t.status === 'queued' || t.status === 'running') ||
    (localTasks ?? []).some(t => t.status === 'running');

  // 合并远程任务和本地任务，按创建时间倒序
  const allLocalTasks = localTasks ?? [];
  type CombinedItem =
    | { kind: 'remote'; task: CollabAITask; key: string }
    | { kind: 'local'; task: LocalDramaTask; key: string };
  const combinedTaskItems: CombinedItem[] = [
    ...sortedTasks.map(t => ({ kind: 'remote' as const, task: t, key: t.request_id })),
    ...allLocalTasks.map(t => ({ kind: 'local' as const, task: t, key: t.local_id })),
  ].sort((a, b) => b.task.created_at - a.task.created_at);

  return (
    <div className="flex h-full w-full flex-col rounded-xl bg-background shadow-md">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users size={15} />
          协作 AI
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className={cn('size-2 rounded-full bg-muted-foreground shrink-0', connected && 'bg-emerald-500')} />
          {connected ? '已连接' : '连接中…'}
          {hasActiveTasks && (
            <>
              <span>·</span>
              <Loader2 size={11} className="animate-spin" />
              <span>运行中</span>
            </>
          )}
        </div>
      </div>

      <div className="flex border-b border-border">
        <button
          className={cn(
            'relative flex flex-1 items-center justify-center gap-1 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            activeTab === 'chat' && 'border-primary text-primary'
          )}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={13} />
          聊天
        </button>
        <button
          className={cn(
            'relative flex flex-1 items-center justify-center gap-1 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            activeTab === 'tasks' && 'border-primary text-primary'
          )}
          onClick={() => setActiveTab('tasks')}
        >
          <Zap size={13} />
          AI 任务
          {hasActiveTasks && <span className="size-1.5 rounded-full bg-primary" />}
        </button>
      </div>

      {activeTab === 'chat' && (
        <>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {chatMessages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center text-[13px] text-muted-foreground">
                <MessageSquare size={28} strokeWidth={1.5} />
                <span>暂无消息</span>
                <span>输入 @球球 让 AI 参与对话</span>
              </div>
            ) : (
              chatMessages.map(m => (
                <ChatBubble key={m.id} message={m} currentUserId={currentUserId} onDelete={handleDeleteChat} />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="shrink-0 px-3 pb-3 pt-2">
            <div className="flex flex-col rounded-xl border border-border bg-muted/40 transition-colors focus-within:border-primary">
              <textarea
                ref={chatTextareaRef}
                className="min-h-[54px] max-h-[120px] w-full resize-none border-0 bg-transparent px-3 py-2 text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                placeholder={'发消息…'}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={2}
              />
              <div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
                <button className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary" onClick={handleInsertAtAI} title="插入 @球球">
                  @球球
                </button>
                <ModelPicker
                  availableModels={availableModels}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                />
                <span className="flex-1" />
                <button
                  className="flex size-[30px] items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
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

      {activeTab === 'tasks' && (
        <>
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {combinedTaskItems.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center text-[13px] text-muted-foreground">
                <Zap size={28} strokeWidth={1.5} />
                <span>暂无 AI 任务</span>
                <span>输入 / 查看可用指令</span>
              </div>
            ) : (
              combinedTaskItems.map(item =>
                item.kind === 'remote' ? (
                  <TaskCard
                    key={item.key}
                    task={item.task}
                    canCancel={item.task.user_id === currentUserId}
                    onCancel={handleCancel}
                    onUseContinueRecommendation={onUseContinueRecommendation}
                  />
                ) : (
                  <LocalTaskCard
                    key={item.key}
                    task={item.task}
                    onCancel={onCancelLocalTask}
                  />
                )
              )
            )}
            <div ref={tasksEndRef} />
          </div>

          <div className="shrink-0 px-3 pb-3 pt-2">
            <div className="relative flex flex-col rounded-xl border border-border bg-muted/40 transition-colors focus-within:border-primary">
              {cmdMenuOpen && cmdMenuItems.length > 0 && (
                <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-[200] overflow-hidden rounded-lg border border-border bg-background shadow-lg" ref={cmdMenuRef}>
                  {cmdMenuItems.map((cmd, idx) => (
                    <div
                      key={cmd.id}
                      className={cn(
                        'flex cursor-pointer flex-col gap-0.5 border-b border-border px-3 py-2 transition-colors last:border-b-0',
                        idx === cmdMenuIndex ? 'bg-primary/10' : 'hover:bg-primary/10'
                      )}
                      onMouseDown={e => { e.preventDefault(); handleSelectCmd(cmd); }}
                    >
                      <span className="text-[13px] font-medium text-primary">{cmd.name}</span>
                      <span className="text-[11px] leading-4 text-muted-foreground">{cmd.subtitle}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    <span>↑↓ 选择</span><kbd>Enter</kbd><span>确认</span><kbd>Esc</kbd><span>关闭</span>
                  </div>
                </div>
              )}
              <textarea
                ref={taskTextareaRef}
                className="min-h-[54px] max-h-[120px] w-full resize-none border-0 bg-transparent px-3 py-2 text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={selectedChapterId ? '输入 / 查看指令…' : (extraCommands?.length ? '输入 / 查看 AI 指令…' : '请先选择章节')}
                value={query}
                onChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                disabled={selectedChapterId === '' && !extraCommands?.length}
                rows={2}
              />
              <div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
                {chapters && chapters.length > 0 && (
                  <div className="relative shrink-0" ref={chapterDropdownRef}>
                    <button
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary',
                        !selectedChapterId && 'text-muted-foreground/70',
                        'font-serif tracking-[0.02em]'
                      )}
                      onClick={() => setChapterDropdownOpen(o => !o)}
                      title={selectedChapterId
                        ? (() => { const ch = chapters.find(c => String(c.id) === String(selectedChapterId)); return ch ? `第${ch.chapter_number}章 ${ch.title}` : '章节'; })()
                        : '选择章节'}
                    >
                      {selectedChapterId
                        ? (() => { const ch = chapters.find(c => String(c.id) === String(selectedChapterId)); return ch ? `§${ch.chapter_number}` : '§'; })()
                        : '§'}
                      <span className="text-[9px] opacity-60">▾</span>
                    </button>
                    {chapterDropdownOpen && (
                      <div className="absolute bottom-[calc(100%+4px)] left-0 z-[200] max-h-[200px] min-w-[160px] max-w-[220px] overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                        <div
                          className={cn('cursor-pointer truncate px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary', selectedChapterId === '' && 'bg-primary/10 text-primary')}
                          onMouseDown={e => { e.preventDefault(); setSelectedChapterId(''); setChapterDropdownOpen(false); }}
                        >
                          — 不限章节 —
                        </div>
                        {chapters.map(ch => (
                          <div
                            key={ch.id}
                            className={cn('cursor-pointer truncate px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary', String(selectedChapterId) === String(ch.id) && 'bg-primary/10 text-primary')}
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
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleInsertSlash}
                  disabled={selectedChapterId === '' && !extraCommands?.length}
                  title="插入指令"
                >
                  / 指令
                </button>
                <ModelPicker
                  availableModels={availableModels}
                  selectedModel={selectedModel}
                  onSelectModel={setSelectedModel}
                />
                <span className="flex-1" />
                <button
                  className="flex size-[30px] items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleSend}
                  disabled={!query.trim() || (selectedChapterId === '' && !extraCommands?.length) || sending}
                  title="发送 (Ctrl+Enter)"
                >
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
