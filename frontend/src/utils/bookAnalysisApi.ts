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
    
    const response = await fetch(`${API_BASE_URL}/ai/analyze-chapter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    
    const response = await fetch(`${API_BASE_URL}/ai/analyze-book?auto_create_work=${autoCreateWork}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 如果需要认证，添加token
        // 'Authorization': `Bearer ${token}`,
      },
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
    
    const response = await fetch(
      `${API_BASE_URL}/ai/analyze-chapters-incremental?work_id=${workId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 如果需要认证，添加token
          // 'Authorization': `Bearer ${token}`,
        },
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
 * 测试 API 连接
 * 连接 memos 后端检查 AI 服务是否可用
 */
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

