/**
 * 拆书分析 API 服务层
 * 基于 SmartReads 的分析逻辑，预留从 memos 后端获取模型服务的接口
 */

import { BaseApiClient } from './baseApiClient';

const bookAnalysisClient = new BaseApiClient();

export interface BookAnalysisResult {
  work_id?: string;
  work_title?: string;
  characters_count?: number;
  locations_count?: number;
  chapters_count?: number;
}

export interface AnalysisSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  // 预留其他配置项
}

export interface AnalysisProgress {
  text?: string;
  error?: string;
  message?: string;
  structuredData?: Record<string, unknown>;
  characters?: Record<string, unknown>[];
  charactersSaved?: boolean;
  charactersCount?: number;
  metadata?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    duration?: number;
    estimated_tokens?: number;
    start_time?: string;
    end_time?: string;
  };
}

/**
 * 从后端获取分析提示词模板
 * @param templateType 模板类型，默认为 'chapter_analysis'
 */
export async function getAnalysisPromptFromBackend(templateType: string = 'chapter_analysis'): Promise<string> {
  try {
    const result = await bookAnalysisClient.get<{ prompt_content?: string }>(
      `/api/v1/prompt-templates/type/${templateType}/default`
    );
    return result.prompt_content || '';
  } catch {
    // ignore
  }
  return getDefaultAnalysisPrompt();
}

/**
 * 默认的分析提示词（向后兼容，JSON格式）
 */
function getDefaultAnalysisPrompt(): string {
  return `# 角色
你是一位经验丰富的小说编辑和金牌剧情分析师。你擅长解构故事，洞察每一章节的功能、节奏和情感，并能将其转化为高度结构化的分析报告。

# 任务
我将提供一部小说的章节正文。你的任务是通读并深刻理解这个章节，然后分析并提取以下信息：
1. 章节基本信息（标题、章节号、概要）
2. 章节大纲（核心功能、关键情节点、画面感、氛围、结尾钩子）
3. 章节细纲（详细的小节划分）

# 输出格式要求
**必须严格按照以下JSON格式输出，不要添加任何其他文字：**

\`\`\`json
{
  "chapter_number": 章节号（数字）,
  "title": "章节标题",
  "summary": "章节概要（2-3句话）",
  "outline": {
    "core_function": "本章核心功能/目的",
    "key_points": ["关键情节点1", "关键情节点2"],
    "visual_scenes": ["画面1", "画面2"],
    "atmosphere": ["氛围1", "氛围2"],
    "hook": "结尾钩子"
  },
  "detailed_outline": {
    "sections": [
      {
        "section_number": 1,
        "title": "小节标题",
        "content": "小节内容概要"
      }
    ]
  }
}
\`\`\`

# 重要提示
1. **必须输出有效的JSON格式**，不要添加任何Markdown代码块标记外的文字
2. 章节号必须准确提取，统一转换为阿拉伯数字
3. **每一章必须包含outline（大纲）和detailed_outline（细纲）字段**，这是必需字段，不能省略
4. outline字段必须包含：core_function（核心功能）、key_points（关键情节点）、visual_scenes（画面感）、atmosphere（氛围）、hook（结尾钩子）
5. detailed_outline字段必须包含sections数组，每个section包含section_number、title、content

# 章节内容
{content}

# 开始分析
请严格按照上述JSON格式输出分析结果：`;
}

/**
 * 调用 memos 后端的章节分析 API（流式响应）
 * 
 * @param content 章节内容
 * @param onProgress 进度回调函数
 * @param settings 分析设置
 * @param work_id 作品ID（可选，如果提供，分析完成后会将角色信息保存到作品的metainfo中）
 * @returns 分析结果
 */
export async function analyzeChapterContent(
  content: string,
  onProgress?: (progress: AnalysisProgress) => void,
  settings?: AnalysisSettings,
  work_id?: number
): Promise<string> {
  try {
    const response = await bookAnalysisClient.requestRaw('/ai/analyze-chapter', {
      method: 'POST',
      body: JSON.stringify({
        content,
        settings: settings || {},
        work_id: work_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 调用失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // 处理流式响应 (SSE)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let parsed_data: Record<string, unknown> | null = null;
    let characters_saved = false;
    let characters_count = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const msgType = data.type;

            switch (msgType) {
              case 'start':
                onProgress?.({ message: data.message || '开始分析章节内容...' });
                break;
              
              case 'analysis_start':
                onProgress?.({ message: data.message || '正在进行章节分析（大纲、细纲等）...' });
                break;
              
              case 'analysis_complete':
                onProgress?.({ message: data.message || '章节分析完成' });
                break;
              
              case 'character_extraction_start':
                onProgress?.({ message: data.message || '正在提取角色信息和状态...' });
                break;
              
              case 'character_extraction_complete':
                onProgress?.({ 
                  message: data.message || '角色信息提取完成',
                  charactersCount: data.characters_count
                });
                break;
              
              case 'character_extraction_error':
                
                break;
              
              case 'save_start':
                onProgress?.({ message: data.message || '正在保存角色信息到作品...' });
                break;
              
              case 'save_complete':
                characters_saved = true;
                characters_count = data.characters_count || 0;
                onProgress?.({ 
                  message: data.message || '角色信息保存完成',
                  charactersSaved: true,
                  charactersCount: characters_count
                });
                break;
              
              case 'save_error':
                
                break;
              
              case 'structured_data':
                parsed_data = data.data;
                onProgress?.({ 
                  structuredData: parsed_data || undefined,
                  characters: (parsed_data?.characters as Record<string, unknown>[]) || [],
                });
                break;
              
              case 'done':
                onProgress?.({ 
                  message: data.message || '分析完成',
                  structuredData: parsed_data || undefined,
                  characters: (parsed_data?.characters as Record<string, unknown>[]) || [],
                  charactersSaved: data.characters_saved || characters_saved,
                  charactersCount: data.characters_count || characters_count
                });
                break;
              
              case 'error':
                throw new Error(data.message || '分析过程中出错');
              
              default:
                
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              // ignore
            } else {
              throw e;
            }
          }
        }
      }
    }

    if (!parsed_data) {
      throw new Error('未收到分析结果');
    }

    // 返回分析结果文本（用于兼容性）
    return JSON.stringify(parsed_data, null, 2);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    
    onProgress?.({ error: errorMessage });
    throw new Error(errorMessage);
  }
}

/**
 * 批量分析章节组
 * 
 * @param groups 章节组数组
 * @param onFileComplete 单个文件完成回调
 * @param onProgress 进度回调
 * @param settings 分析设置
 */
export async function analyzeMultipleChapterGroups(
  groups: Array<{ name: string; content: string }>,
  onFileComplete?: (
    fileName: string,
    result: string | null,
    index: number,
    total: number,
    error?: string
  ) => void,
  onProgress?: (progress: AnalysisProgress & { fileName?: string }) => void,
  settings?: AnalysisSettings
): Promise<Record<string, { success: boolean; result?: string; error?: string }>> {
  const results: Record<string, { success: boolean; result?: string; error?: string }> = {};

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    try {
      onProgress?.({ text: `开始分析 ${group.name}...`, fileName: group.name });

      const result = await analyzeChapterContent(
        group.content,
        (progress) => onProgress?.({ ...progress, fileName: group.name }),
        settings
      );

      results[group.name] = {
        success: true,
        result,
      };

      onFileComplete?.(group.name, result, i + 1, groups.length);

      // 文件间添加延迟，避免 API 限制
      if (i < groups.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '分析失败';
      results[group.name] = {
        success: false,
        error: errorMessage,
      };

      onFileComplete?.(group.name, null, i + 1, groups.length, errorMessage);
    }
  }

  return results;
}

/**
 * 增强拆书分析接口
 * 能够识别角色、地图、章节大纲和细纲，并可选择自动创建作品
 * 
 * @param content 章节内容
 * @param autoCreateWork 是否自动创建作品
 * @param onProgress 进度回调函数
 * @param settings 分析设置
 * @returns 分析结果（如果autoCreateWork为true，会包含作品创建信息）
 */
export async function analyzeBookEnhanced(
  content: string,
  autoCreateWork: boolean = false,
  onProgress?: (progress: AnalysisProgress & { workResult?: BookAnalysisResult }) => void,
  settings?: AnalysisSettings
): Promise<string> {
  try {
    
    
    const response = await bookAnalysisClient.requestRaw(
      `/ai/analyze-book?auto_create_work=${autoCreateWork}`,
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          settings: settings || {},
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
    }

    // 处理流式响应 (SSE)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let result = '';
    let buffer = '';
    let workResult: BookAnalysisResult | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码数据块
      buffer += decoder.decode(value, { stream: true });
      
      // 按行分割
      const lines = buffer.split('\n');
      
      // 保留最后一个不完整的行
      buffer = lines.pop() || '';

      for (const line of lines) {
        // 处理 SSE 格式: "data: {...}"
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const msgType = parsed.type;

            switch (msgType) {
              case 'start':
                
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chunk': {
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  result += chunkContent;
                  onProgress?.({ text: chunkContent });
                }
                break;
              }
              
              case 'done':
                
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'work_created':
                
                workResult = parsed.data;
                onProgress?.({ 
                  text: `作品创建成功: ${parsed.data.work_title}`,
                  workResult: parsed.data 
                });
                break;
              
              case 'work_creation_error':
                
                onProgress?.({ error: parsed.message });
                break;
              
              case 'error':
                throw new Error(parsed.message || '分析过程中出错');
              
              default:
                
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              // ignore
            } else {
              throw e;
            }
          }
        }
      }
    }

    if (!result && !workResult) {
      throw new Error('未收到任何分析结果');
    }

    
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    
    onProgress?.({ error: errorMessage });
    throw new Error(errorMessage);
  }
}

/**
 * 逐章渐进式分析接口
 * 逐章分析小说内容，每分析完一章就立即插入到目标作品中
 * 
 * @param content 章节内容（包含多章，会自动分割）
 * @param workId 目标作品ID
 * @param onProgress 进度回调函数
 * @param settings 分析设置
 * @returns Promise<void>
 */
export async function analyzeChaptersIncremental(
  content: string,
  workId: string,
  onProgress?: (progress: AnalysisProgress & { 
    chapterIndex?: number;
    totalChapters?: number;
    insertResult?: {
      characters_processed: number;
      locations_processed: number;
      chapters_created: number;
    };
  }) => void,
  settings?: AnalysisSettings
): Promise<void> {
  try {
    
    
    const response = await bookAnalysisClient.requestRaw(
      `/ai/analyze-chapters-incremental?work_id=${workId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          settings: settings || {},
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
    }

    // 处理流式响应 (SSE)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码数据块
      buffer += decoder.decode(value, { stream: true });
      
      // 按行分割
      const lines = buffer.split('\n');
      
      // 保留最后一个不完整的行
      buffer = lines.pop() || '';

      for (const line of lines) {
        // 处理 SSE 格式: "data: {...}"
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const msgType = parsed.type;

            switch (msgType) {
              case 'start':
                
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chapter_start':
                
                onProgress?.({
                  text: `开始分析第 ${parsed.chapter_index} 章`,
                  chapterIndex: parsed.chapter_index,
                  totalChapters: parsed.total_chapters,
                });
                break;
              
              case 'chunk': {
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  onProgress?.({ text: chunkContent });
                }
                break;
              }
              
              case 'done':
                
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chapter_inserted':
                
                onProgress?.({
                  text: `第 ${parsed.chapter_index} 章分析完成并已插入作品`,
                  chapterIndex: parsed.chapter_index,
                  insertResult: parsed.data,
                });
                break;
              
              case 'chapter_insert_error':
                
                onProgress?.({
                  error: `第 ${parsed.chapter_index} 章插入失败: ${parsed.message}`,
                  chapterIndex: parsed.chapter_index,
                });
                break;
              
              case 'all_chapters_complete':
                
                onProgress?.({
                  text: `所有章节分析完成，共 ${parsed.total_chapters} 章`,
                });
                break;
              
              case 'error':
                throw new Error(parsed.message || '分析过程中出错');
              
              default:
                
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              // ignore
            } else {
              throw e;
            }
          }
        }
      }
    }

    

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    
    onProgress?.({ error: errorMessage });
    throw new Error(errorMessage);
  }
}

/**
 * 基于文件名的单章分析接口
 * 根据文件名分析单章并插入到作品（如果作品不存在则创建）
 * 
 * @param fileName 文件名，用于查找或创建作品
 * @param content 章节内容
 * @param chapterNumber 章节号
 * @param volumeNumber 卷号（可选，默认为1）
 * @param onProgress 进度回调函数
 * @param settings 分析设置
 * @returns Promise<{ work_id: number; work_title: string; chapter_id: number; work_created: boolean }>
 */
export async function analyzeChapterByFile(
  fileName: string,
  content: string,
  chapterNumber: number,
  volumeNumber: number = 1,
  onProgress?: (progress: AnalysisProgress & {
    workCreated?: boolean;
    workId?: string;
    workTitle?: string;
    chapterId?: number;
  }) => void,
  settings?: AnalysisSettings
): Promise<{
  work_id: string;
  work_title: string;
  chapter_id: number;
  chapter_number: number;
  volume_number: number;
  title: string;
  outline?: Record<string, unknown>;
  detailed_outline?: Record<string, unknown>;
  work_created: boolean;
}> {
  try {
    

    const response = await bookAnalysisClient.requestRaw('/ai/analyze-chapter-by-file', {
      method: 'POST',
      body: JSON.stringify({
        file_name: fileName,
        content: content,
        chapter_number: chapterNumber,
        volume_number: volumeNumber,
        settings: settings || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
    }

    // 处理流式响应 (SSE)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const workResult: {
      work_id?: string;
      work_title?: string;
      chapter_id?: number;
      work_created?: boolean;
    } = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码数据块
      buffer += decoder.decode(value, { stream: true });
      
      // 按行分割
      const lines = buffer.split('\n');
      
      // 保留最后一个不完整的行
      buffer = lines.pop() || '';

      for (const line of lines) {
        // 处理 SSE 格式: "data: {...}"
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const msgType = parsed.type;

            switch (msgType) {
              case 'start':
                
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chunk': {
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  onProgress?.({ text: chunkContent });
                }
                break;
              }
              
              case 'done':
                
                // 从 done 消息的 data 中更新 workResult
                if (parsed.data) {
                  if (parsed.data.work_id) {
                    workResult.work_id = parsed.data.work_id;
                  }
                  if (parsed.data.work_title) {
                    workResult.work_title = parsed.data.work_title;
                  }
                  if (parsed.data.chapter_id) {
                    workResult.chapter_id = parsed.data.chapter_id;
                  }
                }
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'work_created':
                
                workResult.work_id = parsed.work_id;
                workResult.work_title = parsed.work_title;
                workResult.work_created = true;
                onProgress?.({
                  text: `作品创建成功: ${parsed.work_title}`,
                  workCreated: true,
                  workId: parsed.work_id,
                  workTitle: parsed.work_title,
                });
                break;
              
              case 'work_found':
                
                workResult.work_id = parsed.work_id;
                workResult.work_title = parsed.work_title;
                workResult.work_created = false;
                onProgress?.({
                  text: `找到已存在作品: ${parsed.work_title}`,
                  workCreated: false,
                  workId: parsed.work_id,
                  workTitle: parsed.work_title,
                });
                break;
              
              case 'chapter_inserted':
                
                workResult.work_id = parsed.work_id || workResult.work_id;
                workResult.work_title = parsed.work_title || workResult.work_title;
                workResult.chapter_id = parsed.chapter_id;
                onProgress?.({
                  text: `章节插入成功: ${parsed.title}`,
                  workId: parsed.work_id,
                  workTitle: parsed.work_title,
                  chapterId: parsed.chapter_id,
                });
                break;
              
              case 'chapter_skipped':
                
                workResult.work_id = parsed.work_id || workResult.work_id;
                workResult.work_title = parsed.work_title || workResult.work_title;
                workResult.chapter_id = parsed.chapter_id;
                onProgress?.({
                  text: `章节 ${parsed.chapter_number} 已存在，跳过创建`,
                  workId: parsed.work_id,
                  workTitle: parsed.work_title,
                  chapterId: parsed.chapter_id,
                });
                break;
              
              case 'error':
                throw new Error(parsed.message || '分析过程中出错');
              
              default:
                
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              // ignore
            } else {
              throw e;
            }
          }
        }
      }
    }

    if (!workResult.work_id || !workResult.chapter_id) {
      throw new Error('未收到完整的分析结果（缺少作品ID或章节ID）');
    }

    
    return {
      work_id: workResult.work_id!,
      work_title: workResult.work_title || fileName,
      chapter_id: workResult.chapter_id!,
      chapter_number: chapterNumber,
      volume_number: volumeNumber,
      title: '',
      work_created: workResult.work_created || false,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    
    onProgress?.({ error: errorMessage });
    throw new Error(errorMessage);
  }
}

/**
 * 从文件直接创建作品和章节（不进行AI分析）
 * 
 * @param fileName 文件名
 * @param chapters 章节数据列表
 * @returns Promise<{ work_id: number; work_title: string; chapters_created: number; ... }>
 */
export async function createWorkFromFile(
  fileName: string,
  chapters: Array<{
    chapter_number: number;
    title: string;
    content: string;
    volume_number?: number;
  }>
): Promise<{
  work_id: string;
  work_title: string;
  work_created: boolean;
  chapters_created: number;
  chapters_skipped: number;
  created_chapters: Array<{
    chapter_id: number;
    chapter_number: number;
    volume_number: number;
    title: string;
  }>;
  skipped_chapters: Array<{
    chapter_id: number;
    chapter_number: number;
    volume_number: number;
    title: string;
  }>;
}> {
    return await bookAnalysisClient.post<{
      work_id: string;
      work_title: string;
      work_created: boolean;
      chapters_created: number;
      chapters_skipped: number;
      created_chapters: Array<{ chapter_id: number; chapter_number: number; volume_number: number; title: string }>;
      skipped_chapters: Array<{ chapter_id: number; chapter_number: number; volume_number: number; title: string }>;
    }>(
      '/ai/create-work-from-file',
      {
        file_name: fileName,
        chapters: chapters.map(ch => ({
          chapter_number: ch.chapter_number,
          title: ch.title,
          content: ch.content,
          volume_number: ch.volume_number || 1
        }))
      }
    );
}

/**
 * 测试 API 连接
 * 连接 memos 后端检查 AI 服务是否可用
 */
/**
 * 分析单个章节，生成大纲和细纲
 * 
 * @param workId 作品ID
 * @param chapterId 章节ID
 * @param onProgress 进度回调函数（可选）
 * @param settings 分析设置（可选）
 * @returns Promise<{ outline: Record<string, unknown>; detailed_outline: Record<string, unknown> }>
 */
export async function analyzeChapter(
  workId: string,
  chapterId: number,
  onProgress?: (progress: { message?: string; status?: string }) => void,
  settings?: AnalysisSettings
): Promise<{
  outline: Record<string, unknown>;
  detailed_outline: Record<string, unknown>;
}> {
  onProgress?.({ message: '开始分析章节...', status: 'start' });

    const data = await bookAnalysisClient.post<{
      success: boolean;
      message?: string;
      results?: Array<{ success: boolean; outline?: unknown; detailed_outline?: unknown }>;
    }>(
      `/ai/generate-chapter-outlines?work_id=${workId}&chapter_ids=${chapterId}`,
      { settings: settings || {} }
    );

    if (!data.success) {
      throw new Error(data.message || '分析失败');
    }

    // 从结果中获取第一个成功的结果
    const successResult = data.results?.find((r: { success: boolean; outline?: unknown; detailed_outline?: unknown }) => r.success);
    if (!successResult) {
      throw new Error('未能获取章节大纲和细纲');
    }

    onProgress?.({ message: data.message || '分析完成', status: 'complete' });

    return {
      outline: (successResult.outline as Record<string, unknown>) || {},
      detailed_outline: (successResult.detailed_outline as Record<string, unknown>) || {},
    };
}

export async function testAPIConnection(): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  try {
    
    
    try {
      const result = await bookAnalysisClient.get<{ data: { status: string; models?: string[] } }>('/ai/health');
      const data = result.data;
      return {
        success: data?.status === 'healthy',
        message: data?.status === 'healthy'
          ? `AI 服务正常运行，可用模型: ${data.models?.length || 0} 个`
          : 'AI 服务不可用',
        models: data?.models,
      };
    } catch (err) {
      
      return {
        success: false,
        message: err instanceof Error ? err.message : '连接失败',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '连接失败';
    
    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * 根据大纲和细纲生成章节内容
 * 
 * @param outline 章节大纲
 * @param detailedOutline 章节细纲
 * @param chapterTitle 章节标题（可选）
 * @param characters 出场人物列表（可选）
 * @param locations 剧情地点列表（可选）
 * @param onProgress 进度回调函数（可选）
 * @param settings 生成设置（可选）
 * @returns Promise<string> 生成的章节内容
 */
/**
 * 生成组件数据
 * 
 * @param workId 作品ID
 * @param componentId 组件ID
 * @param dataKey 组件数据键
 * @param generatePromptId 生成prompt模板ID（可选）
 * @param generatePrompt 生成prompt内容（可选，如果generatePromptId未提供则使用此字段）
 * @param chapterId 章节ID（可选）
 * @param settings 生成设置（可选）
 * @returns Promise<{ component_id: string; data_key: string; generated_data: string }>
 */
export async function generateComponentData(
  workId: string,
  componentId: string,
  dataKey: string,
  generatePromptId?: number,
  generatePrompt?: string,
  chapterId?: number,
  settings?: AnalysisSettings,
  componentType?: string,
  workTemplateId?: number,
  componentData?: Record<string, unknown>,
): Promise<{ component_id: string; data_key: string; generated_data: string }> {
    const body: Record<string, unknown> = {
      work_id: workId,
      component_id: componentId,
      data_key: dataKey,
    };
    if (componentType) {
      body.component_type = componentType;
    }
    if (workTemplateId) {
      body.work_template_id = workTemplateId;
    }
    if (componentData && Object.keys(componentData).length > 0) {
      body.component_data = componentData;
    }

    if (generatePromptId) {
      body.generate_prompt_id = generatePromptId;
    } else if (generatePrompt) {
      body.generate_prompt = generatePrompt;
    }
    // 不提供时由后端通过 work_id + component_id 自动查找 prompt

    if (chapterId) {
      body.chapter_id = chapterId;
    }

    if (settings) {
      body.settings = {
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
      };
    }

    const result = await bookAnalysisClient.post<{
      component_id: string;
      data_key: string;
      generated_data: string;
    }>('/ai/generate-component-data', body);
    return result;
}

/**
 * 生成章节大纲或细纲
 */
export async function generateChapterOutline(
  workId: string,
  chapterTitle: string,
  outlineType: 'outline' | 'detailed_outline',
  options?: {
    chapterId?: number;
    currentOutline?: string;
    characters?: string[];
    locations?: string[];
    settings?: AnalysisSettings;
  }
): Promise<string> {
  const body: Record<string, unknown> = {
    work_id: workId,
    chapter_title: chapterTitle,
    outline_type: outlineType,
  };
  if (options?.chapterId) body.chapter_id = options.chapterId;
  if (options?.currentOutline) body.current_outline = options.currentOutline;
  if (options?.characters?.length) body.characters = options.characters;
  if (options?.locations?.length) body.locations = options.locations;
  if (options?.settings) {
    body.settings = {
      model: options.settings.model,
      temperature: options.settings.temperature,
      max_tokens: options.settings.maxTokens,
    };
  }

  const result = await bookAnalysisClient.post<{ outline_type: string; generated_text: string }>(
    '/ai/generate-chapter-outline',
    body
  );
  return result.generated_text;
}

export async function generateChapterContent(
  outline: string,
  detailedOutline: string,
  chapterTitle?: string,
  characters?: string[],
  locations?: string[],
  onProgress?: (progress: { message?: string; text?: string; status?: string }) => void,
  settings?: AnalysisSettings
): Promise<string> {
  const response = await bookAnalysisClient.requestRaw('/ai/generate-chapter-content', {
    method: 'POST',
    body: JSON.stringify({
      outline,
      detailed_outline: detailedOutline,
      chapter_title: chapterTitle,
      characters: characters || [],
      locations: locations || [],
      settings: settings || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 调用失败: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'start') {
            onProgress?.({ message: '开始生成章节内容...', status: 'start' });
          } else if (data.type === 'chunk') {
            const chunkContent = data.content || '';
            content += chunkContent;
            onProgress?.({ text: chunkContent, status: 'generating' });
          } else if (data.type === 'done') {
            onProgress?.({ message: '章节内容生成完成', status: 'done' });
          } else if (data.type === 'error') {
            throw new Error(data.message || '生成失败');
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (!content) {
    throw new Error('未能生成章节内容');
  }

  return content;
}

