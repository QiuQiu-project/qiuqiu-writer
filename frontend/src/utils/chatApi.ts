import { API_BASE_URL } from './apiConfig';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatCompleteResponse {
  code: number;
  message: string;
  data?: string | null;
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

  const token = localStorage.getItem('access_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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

  const resp = await fetch(`${API_BASE_URL}/product/chat/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`对话接口调用失败: ${resp.status} ${resp.statusText} ${text}`);
  }

  let data: ChatCompleteResponse;
  try {
    data = (await resp.json()) as ChatCompleteResponse;
  } catch {
    throw new Error('对话接口返回不是有效的 JSON');
  }

  if (data.code !== 200) {
    throw new Error(data.message || '对话接口返回错误');
  }

  const content = typeof data.data === 'string' ? data.data : '';
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

  const token = localStorage.getItem('access_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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

  const resp = await fetch(`${API_BASE_URL}/product/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    throw new Error(`对话流式接口调用失败: ${resp.status} ${resp.statusText} ${text}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr) continue;

      try {
        const parsed = JSON.parse(dataStr);
        const type = parsed.type as ChatStreamEvent['type'];
        const event: ChatStreamEvent = { type, data: parsed.data ?? parsed.content };
        onEvent?.(event);
      } catch (e) {
        console.warn('解析聊天 SSE 消息失败:', e, dataStr);
      }
    }
  }
}



