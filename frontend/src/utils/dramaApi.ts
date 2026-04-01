import { BaseApiClient } from './baseApiClient';

const client = new BaseApiClient();

export interface DramaChatStreamEvent {
  type: 'ping' | 'text' | 'end' | 'error';
  data?: string;
  content?: string;
}

export interface DramaSceneExtractItem {
  id: string;
  location: string;
  time: string;
  description: string;
}

export interface DramaCharacterExtractItem {
  name: string;
  role: string;
  description: string;
  appearance: string;
  personality: string;
}

export interface DramaPanelItem {
  id: string;
  index: number;
  shotType: string;
  action: string;
  characters: string[];
  dialogue?: string | null;
  emotion?: string;
  imageUrl?: string | null;
  imagePrompt?: string | null;
}

export interface DramaExtractModelOption {
  id: string;
  name: string;
  model_id: string;
  description?: string;
  model_type?: 'text';
}

export interface DramaSceneGenerationStyleOption {
  id: string;
  label: string;
  description: string;
}

/**
 * 非流式剧本 AI 调用（章节→剧情简介转换）
 */
export async function dramaChatComplete(
  prompt: string,
  workId?: string | null,
  options?: { systemPrompt?: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  const res = await client.post<{ content: string }>('/api/v1/drama/chat', {
    prompt,
    work_id: workId ?? null,
    system_prompt: options?.systemPrompt ?? null,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4000,
  });
  return res.content;
}

/**
 * 生成剧本相关的图片
 */
export async function dramaGenerateImage(
  prompt: string,
  workId?: string | null,
  options?: { model?: string; size?: string; referenceImageUrls?: string[] },
): Promise<string> {
  const res = await client.post<{ imageUrl: string }>('/api/v1/drama/image', {
    prompt,
    work_id: workId ?? null,
    model: options?.model ?? 'dall-e-3',
    size: options?.size ?? '1024x1024',
    reference_image_urls: options?.referenceImageUrls ?? [],
  });
  return res.imageUrl;
}

/**
 * 上传本地图片到剧本图片库
 */
export async function dramaUploadImage(file: File): Promise<string> {
  const token = localStorage.getItem('access_token');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/v1/drama/image/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `上传失败 (${res.status})`);
  }
  const data = await res.json();
  return data.imageUrl as string;
}

export async function dramaExtractScenes(
  content: string,
  workId?: string | null,
  maxItems: number = 12,
  modelId?: string | null,
  generationStyle?: string | null,
): Promise<DramaSceneExtractItem[]> {
  const res = await client.post<{ items: DramaSceneExtractItem[] }>('/api/v1/drama/extract/scenes', {
    content,
    work_id: workId ?? null,
    max_items: maxItems,
    model_id: modelId ?? null,
    generation_style: generationStyle ?? null,
  });
  return Array.isArray(res.items) ? res.items : [];
}

export async function getDramaExtractOptions(): Promise<{
  models: DramaExtractModelOption[];
  scene_generation_styles: DramaSceneGenerationStyleOption[];
  image_sizes: string[];
  default_image_size: string;
}> {
  const res = await client.get<{
    models?: DramaExtractModelOption[];
    scene_generation_styles?: DramaSceneGenerationStyleOption[];
    image_sizes?: string[];
    default_image_size?: string;
  }>('/api/v1/drama/extract/options');
  return {
    models: Array.isArray(res.models) ? res.models : [],
    scene_generation_styles: Array.isArray(res.scene_generation_styles) ? res.scene_generation_styles : [],
    image_sizes: Array.isArray(res.image_sizes) ? res.image_sizes : [],
    default_image_size: res.default_image_size || '1024x1024',
  };
}

export async function dramaExtractCharacters(
  content: string,
  workId?: string | null,
  maxItems: number = 12,
  modelId?: string | null,
): Promise<DramaCharacterExtractItem[]> {
  const res = await client.post<{ items: DramaCharacterExtractItem[] }>('/api/v1/drama/extract/characters', {
    content,
    work_id: workId ?? null,
    max_items: maxItems,
    model_id: modelId ?? null,
  });
  return Array.isArray(res.items) ? res.items : [];
}

export async function dramaGenerateStoryboard(
  script: string,
  options?: {
    episodeTitle?: string;
    episodeSynopsis?: string;
    characters?: Array<{ name: string; role: string }>;
    workId?: string | null;
    modelId?: string | null;
    maxPanels?: number;
  },
): Promise<{ panels: DramaPanelItem[]; total: number }> {
  const res = await client.post<{ panels: DramaPanelItem[]; total: number }>('/api/v1/drama/storyboard/generate', {
    script,
    episode_title: options?.episodeTitle ?? '',
    episode_synopsis: options?.episodeSynopsis ?? '',
    characters: options?.characters ?? [],
    work_id: options?.workId ?? null,
    model_id: options?.modelId ?? null,
    max_panels: options?.maxPanels ?? 12,
  });
  return { panels: Array.isArray(res.panels) ? res.panels : [], total: res.total ?? 0 };
}

export async function dramaChatStream(
  prompt: string,
  onChunk: (text: string) => void,
  workId?: string | null,
  options?: { systemPrompt?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal },
): Promise<void> {
  const token = localStorage.getItem('access_token');
  const res = await fetch('/api/v1/drama/chat/stream', {
    method: 'POST',
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      work_id: workId ?? null,
      system_prompt: options?.systemPrompt ?? null,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 8000,
      stream: true,
    }),
  });

  if (!res.ok) throw new Error(`drama stream error: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('no response body');

  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event: DramaChatStreamEvent = JSON.parse(line.slice(6));
        if (event.type === 'text' && event.data) onChunk(event.data);
        if (event.type === 'error') throw new Error(event.content ?? 'AI error');
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}
