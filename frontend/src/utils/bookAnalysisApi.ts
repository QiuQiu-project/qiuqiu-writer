/**
 * 拆书分析 API 服务层
 * 基于 SmartReads 的分析逻辑，预留从 memos 后端获取模型服务的接口
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface BookAnalysisResult {
  work_id?: number;
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
    const response = await fetch(`${API_BASE_URL}/api/v1/prompt-templates/type/${templateType}/default`);
    if (response.ok) {
      const result = await response.json();
      return result.prompt_content || '';
    }
  } catch (error) {
    console.warn('获取后端prompt模板失败，使用默认模板:', error);
  }
  
  // 如果后端获取失败，返回默认的prompt（向后兼容）
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
 * 调用 memos 后端的章节分析 API
 * 
 * @param content 章节内容
 * @param onProgress 进度回调函数
 * @param settings 分析设置
 * @returns 分析结果
 */
export async function analyzeChapterContent(
  content: string,
  onProgress?: (progress: AnalysisProgress) => void,
  settings?: AnalysisSettings
): Promise<string> {
  try {
    console.log('📡 调用后端 AI 分析接口...');
    
    // 获取认证token
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/ai/analyze-chapter`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        content,
        // prompt 由后端从数据库获取，不在这里传递
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
    let result = '';
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
                console.log('✅', parsed.message);
                // 传递开始时的元数据
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chunk':
                // 累积内容
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  result += chunkContent;
                  onProgress?.({ text: chunkContent });
                  // 调试：每100个字符打印一次
                  if (result.length % 500 === 0) {
                    console.log(`📝 已累积 ${result.length} 字符`);
                  }
                }
                break;
              
              case 'done':
                console.log('✅', parsed.message);
                console.log(`📊 最终内容长度: ${result.length} 字符`);
                // 传递完成时的元数据
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'error':
                throw new Error(parsed.message || '分析过程中出错');
              
              default:
                console.warn('未知的消息类型:', msgType, parsed);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              console.warn('解析 SSE 消息失败:', e, 'Line:', data);
            } else {
              throw e;
            }
          }
        }
      }
    }

    if (!result) {
      throw new Error('未收到任何分析结果');
    }

    console.log('✅ 章节分析完成');
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    console.error('❌ 分析失败:', errorMessage);
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
    console.log('📡 调用后端增强拆书分析接口...');
    
    // 获取认证token
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/ai/analyze-book?auto_create_work=${autoCreateWork}`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        content,
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
                console.log('✅', parsed.message);
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chunk':
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  result += chunkContent;
                  onProgress?.({ text: chunkContent });
                }
                break;
              
              case 'done':
                console.log('✅', parsed.message);
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'work_created':
                console.log('✅ 作品创建成功:', parsed.data);
                workResult = parsed.data;
                onProgress?.({ 
                  text: `作品创建成功: ${parsed.data.work_title}`,
                  workResult: parsed.data 
                });
                break;
              
              case 'work_creation_error':
                console.error('❌ 作品创建失败:', parsed.message);
                onProgress?.({ error: parsed.message });
                break;
              
              case 'error':
                throw new Error(parsed.message || '分析过程中出错');
              
              default:
                console.warn('未知的消息类型:', msgType, parsed);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              console.warn('解析 SSE 消息失败:', e, 'Line:', data);
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

    console.log('✅ 增强拆书分析完成');
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    console.error('❌ 分析失败:', errorMessage);
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
  workId: number,
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
    console.log('📡 调用后端逐章渐进式分析接口...');
    
    // 获取认证token
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(
      `${API_BASE_URL}/ai/analyze-chapters-incremental?work_id=${workId}`,
      {
        method: 'POST',
        headers: headers,
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
                console.log('✅', parsed.message);
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chapter_start':
                console.log(`📖 开始分析第 ${parsed.chapter_index} 章`);
                onProgress?.({
                  text: `开始分析第 ${parsed.chapter_index} 章`,
                  chapterIndex: parsed.chapter_index,
                  totalChapters: parsed.total_chapters,
                });
                break;
              
              case 'chunk':
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  onProgress?.({ text: chunkContent });
                }
                break;
              
              case 'done':
                console.log('✅', parsed.message);
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chapter_inserted':
                console.log(`✅ 第 ${parsed.chapter_index} 章已插入作品`);
                onProgress?.({
                  text: `第 ${parsed.chapter_index} 章分析完成并已插入作品`,
                  chapterIndex: parsed.chapter_index,
                  insertResult: parsed.data,
                });
                break;
              
              case 'chapter_insert_error':
                console.error(`❌ 第 ${parsed.chapter_index} 章插入失败:`, parsed.message);
                onProgress?.({
                  error: `第 ${parsed.chapter_index} 章插入失败: ${parsed.message}`,
                  chapterIndex: parsed.chapter_index,
                });
                break;
              
              case 'all_chapters_complete':
                console.log('✅ 所有章节分析完成');
                onProgress?.({
                  text: `所有章节分析完成，共 ${parsed.total_chapters} 章`,
                });
                break;
              
              case 'error':
                throw new Error(parsed.message || '分析过程中出错');
              
              default:
                console.warn('未知的消息类型:', msgType, parsed);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              console.warn('解析 SSE 消息失败:', e, 'Line:', data);
            } else {
              throw e;
            }
          }
        }
      }
    }

    console.log('✅ 逐章渐进式分析完成');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    console.error('❌ 分析失败:', errorMessage);
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
    workId?: number;
    workTitle?: string;
    chapterId?: number;
  }) => void,
  settings?: AnalysisSettings
): Promise<{
  work_id: number;
  work_title: string;
  chapter_id: number;
  chapter_number: number;
  volume_number: number;
  title: string;
  outline?: any;
  detailed_outline?: any;
  work_created: boolean;
}> {
  try {
    console.log('📡 调用后端基于文件名的章节分析接口...');
    
    // 获取认证token
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/ai/analyze-chapter-by-file`, {
      method: 'POST',
      headers: headers,
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
    let result = '';
    let buffer = '';
    let workResult: {
      work_id?: number;
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
                console.log('✅', parsed.message);
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chunk':
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  result += chunkContent;
                  onProgress?.({ text: chunkContent });
                }
                break;
              
              case 'done':
                console.log('✅', parsed.message);
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
                console.log('✅ 作品创建成功:', parsed);
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
                console.log('✅ 找到已存在作品:', parsed);
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
                console.log('✅ 章节插入成功:', parsed);
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
                console.log('⚠️ 章节已存在，跳过创建:', parsed);
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
                console.warn('未知的消息类型:', msgType, parsed);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              console.warn('解析 SSE 消息失败:', e, 'Line:', data);
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

    console.log('✅ 基于文件名的章节分析完成');
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
    console.error('❌ 分析失败:', errorMessage);
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
  work_id: number;
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
  try {
    console.log('📡 调用后端创建作品和章节接口...');
    
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/ai/create-work-from-file`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        file_name: fileName,
        chapters: chapters.map(ch => ({
          chapter_number: ch.chapter_number,
          title: ch.title,
          content: ch.content,
          volume_number: ch.volume_number || 1
        }))
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || errorData.message || `API request failed: ${response.statusText}`
      );
    }

    const result = await response.json();
    console.log('✅ 作品和章节创建成功:', result);
    return result;
  } catch (error) {
    console.error('❌ 创建作品和章节失败:', error);
    throw error;
  }
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
 * @returns Promise<{ outline: any; detailed_outline: any }>
 */
export async function analyzeChapter(
  workId: number,
  chapterId: number,
  onProgress?: (progress: { message?: string; status?: string }) => void,
  settings?: AnalysisSettings
): Promise<{
  outline: any;
  detailed_outline: any;
}> {
  try {
    console.log(`📡 分析章节 ${chapterId}...`);
    
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(
      `${API_BASE_URL}/ai/generate-chapter-outlines?work_id=${workId}&chapter_ids=${chapterId}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          settings: settings || {},
        }),
      }
    );

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
    let outline: any = null;
    let detailed_outline: any = null;

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
              onProgress?.({ message: '开始分析章节...', status: 'start' });
            } else if (data.type === 'chapter_complete') {
              // 章节分析完成，获取大纲和细纲
              outline = data.outline;
              detailed_outline = data.detailed_outline;
              onProgress?.({ message: '章节分析完成', status: 'complete' });
            } else if (data.type === 'done') {
              // 所有章节分析完成
              onProgress?.({ message: '分析完成', status: 'done' });
            } else if (data.type === 'error' || data.type === 'chapter_error') {
              throw new Error(data.message || '分析失败');
            }
          } catch (e) {
            console.warn('解析SSE消息失败:', e, line);
          }
        }
      }
    }

    if (!outline || !detailed_outline) {
      throw new Error('未能获取章节大纲和细纲');
    }

    return { outline, detailed_outline };
  } catch (error) {
    console.error('分析章节失败:', error);
    throw error;
  }
}

export async function testAPIConnection(): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  try {
    console.log('🔍 测试 AI 服务连接...');
    
    const response = await fetch(`${API_BASE_URL}/ai/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const result = await response.json();
      const data = result.data;
      
      console.log('✅ AI 服务连接成功', data);
      
      return {
        success: data.status === 'healthy',
        message: data.status === 'healthy' 
          ? `AI 服务正常运行，可用模型: ${data.models?.length || 0} 个` 
          : 'AI 服务不可用',
        models: data.models,
      };
    } else {
      const errorText = await response.text();
      console.error('❌ 连接失败:', response.status, errorText);
      return {
        success: false,
        message: `连接失败: ${response.status} ${response.statusText}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '连接失败';
    console.error('❌ API 连接错误:', errorMessage);
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
export async function generateChapterContent(
  outline: string,
  detailedOutline: string,
  chapterTitle?: string,
  characters?: string[],
  locations?: string[],
  onProgress?: (progress: { message?: string; text?: string; status?: string }) => void,
  settings?: AnalysisSettings
): Promise<string> {
  try {
    console.log(`📡 根据大纲和细纲生成章节内容...`);
    
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(
      `${API_BASE_URL}/ai/generate-chapter-content`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          outline,
          detailed_outline: detailedOutline,
          chapter_title: chapterTitle,
          characters: characters || [],
          locations: locations || [],
          settings: settings || {},
        }),
      }
    );

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
          } catch (e) {
            console.warn('解析SSE消息失败:', e, line);
          }
        }
      }
    }

    if (!content) {
      throw new Error('未能生成章节内容');
    }

    return content;
  } catch (error) {
    console.error('生成章节内容失败:', error);
    throw error;
  }
}

