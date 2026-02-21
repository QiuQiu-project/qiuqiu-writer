import { BaseApiClient } from './baseApiClient';

const productChatApi = new BaseApiClient();

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatCompleteResponse {
  code: number;
  status?: 'success' | 'failure';
  message: string;
  data?: string | { response: string; references?: unknown[] } | null;
}

/** 续写章节推荐一项 */
export interface ContinueChapterRecommendation {
  title: string;
  outline: Record<string, unknown> | string;
  detailed_outline: Record<string, unknown> | string;
}

/** 续写章节结果（后端返回的 JSON） */
export interface ContinueChapterResult {
  next_chapter_number: number;
  recommendations: ContinueChapterRecommendation[];
}

export interface ChatStreamEvent {
  type: 'status' | 'reference' | 'text' | 'time' | 'suggestion' | 'end' | 'error' | 'continue_chapter_result';
  data?: unknown;
}

/**
 * 生成 MemOS 用户 ID（格式：user_{userId}_work_{workId}）
 */
function getMemosUserId(workId?: number | string | null): string | null {
  try {
    const userStr = localStorage.getItem('user_info');
    if (!userStr) {
      console.warn('[getMemosUserId] 未找到 user_info');
      return null; // 未登录
    }
    
    const userInfo = JSON.parse(userStr) as Record<string, unknown>;
    console.log('[getMemosUserId] 用户信息:', userInfo);
    
    // 尝试多种可能的用户ID字段名
    const userId = userInfo.user_id || userInfo.id || userInfo.userId;
    
    if (!userId) {
      console.warn('[getMemosUserId] 用户信息中未找到 user_id 或 id 字段:', userInfo);
      return null; // 用户信息不完整
    }
    
    // 处理 workId：可能是字符串、数字、null 或空字符串
    const workIdStr = workId !== null && workId !== undefined && workId !== '' 
      ? String(workId).trim() 
      : null;
    
    if (!workIdStr) {
      console.warn('[getMemosUserId] 未提供有效的 workId:', workId);
      return null; // 没有作品ID
    }
    
    // 格式：user_{userId}_work_{workId}
    const memosUserId = `user_${userId}_work_${workIdStr}`;
    console.log('[getMemosUserId] 生成的 MemOS 用户ID:', memosUserId);
    return memosUserId;
  } catch (e) {
    console.error('[getMemosUserId] 无法获取用户信息:', e);
    return null;
  }
}

/**
 * 调用后端对话接口（非流式，一次性返回完整回复）
 */
export async function sendChatMessage(
  query: string,
  history: ChatMessage[] = [],
  workId?: number | string | null,
): Promise<ChatMessage> {
  if (!query.trim()) {
    throw new Error('问题不能为空');
  }

  // 检查登录状态和作品ID
  const memosUserId = getMemosUserId(workId);
  if (!memosUserId) {
    throw new Error('请先登录并选择作品');
  }

  // 将前端的对话历史转换为后端需要的格式
  const historyPayload = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    user_id: memosUserId,
    query,
    mem_cube_id: null,
    history: historyPayload,
    internet_search: false,
    moscube: true,
    base_prompt: null,
    top_k: 10,
    threshold: 0.5,
    session_id: 'default_session',
  };

  let data: ChatCompleteResponse;
  try {
    data = await productChatApi.post<ChatCompleteResponse>('/api/v1/product/chat/complete', body);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : '对话接口调用失败');
  }

  // 检查状态码和状态字段
  if (data.code !== 200 || (data.status && data.status !== 'success')) {
    throw new Error(data.message || '对话接口返回错误');
  }

  // 支持两种格式：data 为字符串，或 data 为对象 { response: string, references: [] }
  let content = '';
  if (typeof data.data === 'string') {
    content = data.data;
  } else if (data.data && typeof data.data === 'object' && 'response' in data.data) {
    content = data.data.response || '';
  }
  
  if (!content) {
    throw new Error('AI 没有返回任何内容');
  }

  return {
    role: 'assistant',
    content,
  };
}

/**
 * 调用后端流式对话接口（SSE）
 */
export async function streamChatMessage(
  query: string,
  history: ChatMessage[] = [],
  onEvent?: (event: ChatStreamEvent) => void,
  workId?: number | string | null,
): Promise<void> {
  if (!query.trim()) {
    throw new Error('问题不能为空');
  }

  // 检查登录状态和作品ID
  const memosUserId = getMemosUserId(workId);
  if (!memosUserId) {
    throw new Error('请先登录并选择作品');
  }

  const historyPayload = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const body = {
    user_id: memosUserId,
    query,
    mem_cube_id: null,
    history: historyPayload,
    internet_search: false,
    moscube: true,
    session_id: 'default_session',
  };

  const resp = await productChatApi.requestRaw('/api/v1/product/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    throw new Error(`对话流式接口调用失败: ${resp.status} ${resp.statusText} ${text}`);
  }

    const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        parseAndDispatch(rawLine, onEvent);
      }
    }

    // 处理剩余的 buffer（最后一行可能没有换行符）
    if (buffer.trim()) {
      parseAndDispatch(buffer, onEvent);
    }
  } catch (e) {
    console.error('读取流失败:', e);
    throw e;
  }
}

/**
 * 解析单行 SSE 消息并分发事件
 */
function parseAndDispatch(rawLine: string, onEvent?: (event: ChatStreamEvent) => void) {
  const line = rawLine.trim();
  if (!line) return;

  let dataStr = '';
  if (line.startsWith('data:')) {
    dataStr = line.slice(5).trim();
  } else if (line.startsWith('{')) {
    // 尝试解析纯 JSON 行（容错）
    dataStr = line;
  } else {
    return;
  }

  if (!dataStr) return;

  try {
    const parsed = JSON.parse(dataStr);
    const type = parsed.type;
    const data = parsed.data !== undefined ? parsed.data : parsed.content;

    const event: ChatStreamEvent = { type, data };

    if (type === 'continue_chapter_result') {
      console.log('[chatApi] 收到 continue_chapter_result:', event.data);
    }

    onEvent?.(event);
  } catch (e) {
    console.warn('解析聊天 SSE 消息失败:', e, dataStr);
  }
}



