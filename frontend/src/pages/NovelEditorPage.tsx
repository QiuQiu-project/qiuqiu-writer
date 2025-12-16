import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Coins, Settings, Undo2, Redo2, Type, Bold, Underline, ToggleLeft, ToggleRight, ChevronDown, Trash2, Sparkles, Loader2, Save } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import SideNav from '../components/editor/SideNav';
import AIAssistant from '../components/editor/AIAssistant';
import TagsManager from '../components/editor/TagsManager';
import ChapterOutline from '../components/editor/ChapterOutline';
import ChapterSettingsModal from '../components/editor/ChapterSettingsModal';
import MapView from '../components/editor/MapView';
import Characters from '../components/editor/Characters';
import Factions from '../components/editor/Factions';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import ThemeSelector from '../components/ThemeSelector';
import { worksApi, type Work } from '../utils/worksApi';
import { chaptersApi, type Chapter } from '../utils/chaptersApi';
import { syncManager } from '../utils/syncManager';
import { localCacheManager } from '../utils/localCacheManager';
import { useIntelligentSync } from '../utils/intelligentSync';
import { analyzeChapter } from '../utils/bookAnalysisApi';

// 计算文本字数（去除HTML标签，只统计中文字符和单词）
function countCharacters(html: string): number {
  if (!html) return 0;
  
  // 创建一个临时DOM元素来解析HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // 获取纯文本内容
  const text = tempDiv.textContent || tempDiv.innerText || '';
  
  // 统计字符数（中文字符按1个字符计算，英文单词按单词数计算）
  // 这里简化处理，直接统计所有字符（包括空格）
  // 如果需要更精确的统计，可以分别处理中文和英文
  return text.length;
}

// 文档类型定义（从 sharedbClient 移过来）
interface ShareDBDocument {
  document_id: string;
  content: any;
  version?: number;
  metadata?: {
    work_id?: number;
    chapter_id?: number;
    chapter_number?: number;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
    outline?: string;
    detailed_outline?: string;
  };
}

interface SyncResponse {
  success: boolean;
  version: number;
  content: string;
  operations: Array<{
    doc_id: string;
    version: number;
    operation: any;
    user_id: number;
    timestamp: string;
  }>;
  error?: string;
  work?: {
    id: number;
    word_count: number;
    [key: string]: any;
  };
  chapter?: {
    id: number;
    word_count: number;
    [key: string]: any;
  };
}

// 文档缓存和同步工具函数（在组件内使用）
const documentCache = {
  // 版本和内容缓存
  currentVersion: new Map<string, number>(),
  currentContent: new Map<string, string>(),
  // 关键修复：保存上次同步的版本和内容，用于三路合并
  lastSyncedVersion: new Map<string, number>(),
  lastSyncedContent: new Map<string, string>(),
  // 请求去重：记录正在进行的请求，避免重复请求
  pendingRequests: new Map<string, Promise<any>>(),
  
  // 获取文档（本地优先，然后从服务器）
  async getDocument(documentId: string): Promise<ShareDBDocument | null> {
    console.log('🔍 [DocumentCache] 获取文档:', documentId);
    
    // 先尝试从服务器获取最新版本
    let serverDoc: ShareDBDocument | null = null;
    
    try {
      const fetchPromise = documentCache.fetchFromServer(documentId);
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => resolve(null), 2000)
      );
      
      serverDoc = await Promise.race([fetchPromise, timeoutPromise]) as ShareDBDocument | null;
      
      if (serverDoc) {
        console.log('✅ [DocumentCache] 从服务器获取到最新文档:', {
          version: serverDoc.version,
          contentLength: typeof serverDoc.content === 'string' ? serverDoc.content.length : 'not string'
        });
        
        const contentStr = typeof serverDoc.content === 'string' ? serverDoc.content : JSON.stringify(serverDoc.content);
        const previousVersion = documentCache.currentVersion.get(documentId);
        const previousContent = documentCache.currentContent.get(documentId);
        
        // 关键修复：如果这是第一次获取文档，保存为 lastSynced 版本
        // 这样下次同步时可以使用它作为 base_content
        if (!previousVersion || previousVersion === 0) {
          documentCache.lastSyncedVersion.set(documentId, serverDoc.version || 1);
          documentCache.lastSyncedContent.set(documentId, contentStr);
        }
        
        documentCache.currentVersion.set(documentId, serverDoc.version || 1);
        documentCache.currentContent.set(documentId, contentStr);
        
        await localCacheManager.set(documentId, serverDoc, (serverDoc.version || 1)).catch(console.error);
        
        return serverDoc;
      } else {
        console.warn('⚠️ [DocumentCache] 从服务器获取文档超时或失败，尝试使用缓存');
      }
    } catch (error) {
      console.warn('⚠️ [DocumentCache] 从服务器获取文档失败，尝试使用缓存:', error);
    }
    
    // 如果服务器获取失败，使用本地缓存
    try {
      const cached = await localCacheManager.get<ShareDBDocument>(documentId);
      if (cached) {
        const contentStr = typeof cached.content === 'string' ? cached.content : JSON.stringify(cached.content);
        documentCache.currentVersion.set(documentId, cached.version || 1);
        documentCache.currentContent.set(documentId, contentStr);
        return cached;
      }
    } catch (error) {
      console.error('从缓存获取文档失败:', error);
    }

    return null;
  },
  
  // 更新文档（保存到本地缓存）
  async updateDocument(
    documentId: string,
    content: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    console.log('💾 [DocumentCache] 更新文档:', {
      documentId,
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
      metadata,
    });
    
    const existing = await localCacheManager.get<ShareDBDocument>(documentId);
    const version = existing?.version || 0;
    
    const updated: ShareDBDocument = {
      document_id: documentId,
      content,
      version: version + 1,
      metadata: metadata || existing?.metadata,
    };

    await localCacheManager.set(documentId, updated, updated.version || 1);
    
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    documentCache.currentVersion.set(documentId, updated.version || 1);
    documentCache.currentContent.set(documentId, contentStr);
    
    console.log('✅ [DocumentCache] 已保存到缓存:', documentId);
  },
  
  // 同步文档状态（保存到本地缓存并同步到服务器）
  // contentJson: 可选的 TipTap JSON 格式内容，用于更精确的段落级合并
  async syncDocumentState(documentId: string, content: string, contentJson?: any): Promise<SyncResponse> {
    const localVersion = documentCache.currentVersion.get(documentId) || 0;
    // 关键修复：直接使用传入的 content 参数（编辑器界面上的实际内容），而不是缓存中的内容
    // 这样可以确保保存的是用户当前编辑的内容，而不是可能过时的缓存内容
    const contentToSave = content;

    console.log('🔄 [DocumentCache] 同步文档到服务器:', {
      documentId,
      localVersion,
      contentLength: contentToSave.length,
      usingEditorContent: true, // 标记使用的是编辑器内容
    });

    try {
      // 先保存到本地缓存（使用编辑器内容）
      const cached = await localCacheManager.get<ShareDBDocument>(documentId);
      if (cached) {
        cached.content = contentToSave; // 使用编辑器内容
        cached.version = (cached.version || 0) + 1;
        await localCacheManager.set(documentId, cached, cached.version);
        documentCache.currentVersion.set(documentId, cached.version);
        documentCache.currentContent.set(documentId, contentToSave); // 更新缓存为编辑器内容
      } else {
        // 如果缓存不存在，创建新的
        const newDoc: ShareDBDocument = {
          document_id: documentId,
          content: contentToSave, // 使用编辑器内容
          version: 1,
        };
        await localCacheManager.set(documentId, newDoc, 1);
        documentCache.currentVersion.set(documentId, 1);
        documentCache.currentContent.set(documentId, contentToSave); // 更新缓存为编辑器内容
      }

      // 关键修复：调用后端 ShareDB 同步接口（使用编辑器内容）
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
      const token = localStorage.getItem('access_token');
      
      try {
        // 关键修复：同时提供 HTML 和 JSON 格式，后端可以使用 JSON 格式进行更精确的段落级合并
        const requestBody: any = {
          doc_id: documentId,
          version: localVersion,
          content: contentToSave, // HTML 格式（用于兼容）
          // 如果提供了 JSON 格式，直接以对象形式发送给后端（不转换为字符串）
          content_json: contentJson || undefined,
          // 关键修复：提供 base_version 和 base_content，用于三路合并
          // 这样可以正确计算差异，避免新内容插入到旧内容前面
          base_version: documentCache.lastSyncedVersion.get(documentId) || undefined,
          base_content: documentCache.lastSyncedContent.get(documentId) || undefined,
          base_content_json: undefined, // 如果 base_content 是 JSON 格式，这里可以传入
          create_version: false,
        };
        
        const syncResponse = await fetch(`${API_BASE_URL}/v1/sharedb/documents/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify(requestBody),
        });

        if (!syncResponse.ok) {
          throw new Error(`同步失败: ${syncResponse.statusText}`);
        }

        const result = await syncResponse.json();
        
        if (result.success) {
          // 关键修复：保存上次同步的版本和内容，用于下次同步时的三路合并
          const previousVersion = documentCache.currentVersion.get(documentId) || 0;
          const previousContent = documentCache.currentContent.get(documentId) || '';
          
          // 更新当前版本和内容
          documentCache.currentVersion.set(documentId, result.version);
          documentCache.currentContent.set(documentId, result.content);
          
          // 保存上次同步的版本和内容（用于三路合并）
          if (previousVersion > 0 && previousContent) {
            documentCache.lastSyncedVersion.set(documentId, previousVersion);
            documentCache.lastSyncedContent.set(documentId, previousContent);
          }
          
          // 更新缓存
          const updatedDoc: ShareDBDocument = {
            document_id: documentId,
            content: result.content,
            version: result.version,
          };
          await localCacheManager.set(documentId, updatedDoc, result.version);
          
          console.log('✅ [DocumentCache] 已同步到服务器:', {
            documentId,
            version: result.version,
            previousVersion,
            hasBaseContent: !!documentCache.lastSyncedContent.get(documentId),
          });

          return {
            success: true,
            version: result.version,
            content: result.content,
            operations: result.operations || [],
            work: result.work,  // 传递作品信息（如果存在）
            chapter: result.chapter,  // 传递章节信息（如果存在）
          };
        } else {
          throw new Error(result.error || '同步失败');
        }
      } catch (syncError) {
        console.warn('⚠️ [DocumentCache] 同步到服务器失败，但已保存到本地缓存:', syncError);
        // 即使服务器同步失败，也返回成功（因为已保存到本地）
        return {
          success: true,
          version: documentCache.currentVersion.get(documentId) || localVersion,
          content: contentToSave, // 返回编辑器内容
          operations: [],
        };
      }
    } catch (error) {
      console.error('❌ [DocumentCache] 保存失败:', error);
      return {
        success: false,
        version: localVersion,
        content: contentToSave, // 返回编辑器内容
        operations: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  },
  
  // 强制从服务器拉取
  async forcePullFromServer(documentId: string): Promise<ShareDBDocument | null> {
    console.log('🔄 [DocumentCache] 强制从服务器拉取最新内容:', documentId);
    
    await localCacheManager.delete(documentId);
    documentCache.currentVersion.delete(documentId);
    documentCache.currentContent.delete(documentId);
    
    return await documentCache.getDocument(documentId);
  },
  
  // 从服务器获取文档（回退到章节 API）
  async fetchFromServer(documentId: string): Promise<ShareDBDocument | null> {
    let chapterId: number | null = null;
    
    if (documentId.startsWith('chapter_')) {
      chapterId = parseInt(documentId.replace('chapter_', ''));
    } else if (documentId.startsWith('work_') && documentId.includes('_chapter_')) {
      const match = documentId.match(/work_\d+_chapter_(\d+)/);
      if (match) {
        chapterId = parseInt(match[1]);
      }
    }
    
    if (!chapterId || isNaN(chapterId)) {
      return null;
    }

    // 请求去重：如果已经有相同章节的请求正在进行，等待该请求完成
    const requestKey = `chapter_doc_${chapterId}`;
    if (documentCache.pendingRequests.has(requestKey)) {
      console.log('⏳ [DocumentCache] 请求已在进行中，等待完成:', requestKey);
      try {
        const existingResult = await documentCache.pendingRequests.get(requestKey);
        // 将结果转换为 ShareDBDocument 格式
        if (existingResult) {
          let content: any = existingResult.content;
          if (typeof content === 'object' && content !== null) {
            if ('content' in content) {
              content = content.content;
            } else {
              content = JSON.stringify(content);
            }
          }
          return {
            document_id: documentId,
            content: content || '',
            version: existingResult.chapter_info?.id || chapterId,
            metadata: {
              work_id: existingResult.chapter_info?.work_id,
              chapter_id: existingResult.chapter_info?.id || chapterId,
              chapter_number: existingResult.chapter_info?.chapter_number,
              outline: existingResult.chapter_info?.metadata?.outline,
              detailed_outline: existingResult.chapter_info?.metadata?.detailed_outline,
            },
          };
        }
      } catch (error) {
        console.warn('等待中的请求失败:', error);
      }
    }

    try {
      // 创建请求并记录
      const requestPromise = chaptersApi.getChapterDocument(chapterId);
      documentCache.pendingRequests.set(requestKey, requestPromise);
      
      const result = await requestPromise;
      
      // 请求完成后移除
      documentCache.pendingRequests.delete(requestKey);
      let content: any = result.content;
      
      if (typeof content === 'object' && content !== null) {
        if ('content' in content) {
          content = content.content;
        } else {
          content = JSON.stringify(content);
        }
      }
      
      return {
        document_id: documentId,
        content: content || '',
        version: result.chapter_info?.id || chapterId,
        metadata: {
          work_id: result.chapter_info?.work_id,
          chapter_id: result.chapter_info?.id || chapterId,
          chapter_number: result.chapter_info?.chapter_number,
          outline: result.chapter_info?.metadata?.outline,
          detailed_outline: result.chapter_info?.metadata?.detailed_outline,
        },
      };
    } catch (error) {
      console.error('❌ [DocumentCache] 从章节 API 获取文档失败:', error);
      return null;
    }
  },
};
import '../components/editor/NovelEditor.css';
import './NovelEditorPage.css';

// 章节完整数据类型
interface ChapterFullData {
  id: string;
  volumeId: string;
  volumeTitle: string;
  title: string;
  chapter_number?: number;  // 章节号
  characters: string[];
  locations: string[];
  outline: string;
  detailOutline: string;
}

export default function NovelEditorPage(){
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get('workId');
  
  const [activeNav, setActiveNav] = useState<'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions'>('work-info');
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [smartCompletion, setSmartCompletion] = useState(false);
  const [syncStatus, setSyncStatus] = useState(syncManager.getStatus());
  
  // 作品数据
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 章节切换加载状态
  const [chapterLoading, setChapterLoading] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  // 分析本书状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  
  // 存储所有章节数据（用于计算章节号）
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  
  // 章节设置弹框状态
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false);
  const [chapterModalMode, setChapterModalMode] = useState<'create' | 'edit'>('create');
  const [currentVolumeId, setCurrentVolumeId] = useState('');
  const [currentVolumeTitle, setCurrentVolumeTitle] = useState('');
  const [currentChapterData, setCurrentChapterData] = useState<ChapterFullData | undefined>();
  
  // 标题下拉菜单状态
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement>(null);

  // 编辑器实例
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
      }),
      UnderlineExtension,
      Placeholder.configure({
        placeholder: '开始写作...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
      }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'novel-editor-content',
      },
    },
    enableInputRules: true,
    enablePasteRules: true,
  });

  // 存储章节数据
  const [chaptersData, setChaptersData] = useState<Record<string, ChapterFullData>>({});
  
  // 草稿数据
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; volumeId?: string; volumeTitle?: string; characters?: string[]; locations?: string[]; outline?: string; detailOutline?: string }>>([]);

  // 卷和章节数据 - 从API获取
  const [volumes, setVolumes] = useState<Array<{ id: string; title: string; chapters: Array<{ id: string; volumeId: string; title: string; characters?: string[]; locations?: string[]; outline?: string; detailOutline?: string }> }>>([]);

  // 角色数据 - 从WorkInfoManager的缓存中获取
  const [availableCharacters, setAvailableCharacters] = useState<Array<{ id: string; name: string; avatar?: string }>>([]);
  const [hasCharacterModule, setHasCharacterModule] = useState(false);
  
  // 地点数据 - 从WorkInfoManager的缓存中获取
  const [availableLocations, setAvailableLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [hasLocationModule, setHasLocationModule] = useState(false);
  
  // 自动保存定时器
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentChapterIdRef = useRef<number | null>(null);
  // 关键修复：防止频闪 - 记录上次设置的内容，避免重复设置相同内容
  const lastSetContentRef = useRef<string>('');
  const updateContentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 关键修复：章节加载状态标记，防止在加载期间其他操作干扰编辑器
  const isChapterLoadingRef = useRef<boolean>(false);
  // 字数统计保存定时器
  const wordCountSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 当前章节字数（用于实时显示）
  const [currentChapterWordCount, setCurrentChapterWordCount] = useState(0);

  // 从WorkInfoManager缓存中提取角色数据
  // 关键修复：使用 useRef 存储上一次的结果，避免重复计算
  const lastCharacterCacheRef = useRef<string>('');
  const lastAllChaptersRef = useRef<Chapter[]>([]);
  
  // 角色数据现在从 WorkInfoManager 缓存中加载（在 loadLocationsFromCache 中处理）
  // 不再需要从 API 加载角色数据

  // 从WorkInfoManager缓存中提取地点数据（基于workId）
  useEffect(() => {
    if (!workId) {
      setHasLocationModule(false);
      setAvailableLocations([]);
      return;
    }

    const loadLocationsFromCache = () => {
      try {
        // 使用 workId 特定的缓存键，确保每个作品的数据是独立的
        const CACHE_KEY = `wawawriter_workinfo_cache_${workId}`;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          const modules = data.modules || [];
          
          // 查找角色设定模块
          const characterModule = modules.find((m: any) => m.id === 'characters');
          if (characterModule) {
            setHasCharacterModule(true);
            
            // 查找角色数据（可能在char-table或character-card组件中）
            // 只从character-card组件收集角色数据
            const findAllCharacterData = (components: any[]): any[] => {
              const allCharacters: any[] = [];
              
              for (const comp of components) {
                // 只检查character-card组件（不再检查table组件）
                if (comp.type === 'character-card' && comp.value) {
                  // 角色卡片数据格式：数组，每个对象有name字段
                  const cardChars = (comp.value as any[]).map((char) => ({
                    id: char.name || String(Date.now() + Math.random()),
                    name: char.name || '',
                    avatar: char.avatar || undefined,
                    gender: char.gender || undefined,
                    description: char.description || '',
                    type: char.type || undefined,
                    source: 'character-card',
                  })).filter(c => c.name);
                  allCharacters.push(...cardChars);
                }
                
                // 检查tabs组件（角色设定可能在tabs中）
                if (comp.type === 'tabs' && comp.config?.tabs) {
                  for (const tab of comp.config.tabs) {
                    if (tab.components) {
                      const found = findAllCharacterData(tab.components);
                      allCharacters.push(...found);
                    }
                  }
                }
              }
              
              return allCharacters;
            };
            
            // 收集所有角色数据
            const allCharacterData = findAllCharacterData(characterModule.components || []);
            
            // 去重：使用name作为唯一标识，保留最完整的数据
            const characterMap = new Map<string, any>();
            for (const char of allCharacterData) {
              const existing = characterMap.get(char.name);
              if (!existing) {
                characterMap.set(char.name, char);
              } else {
                // 合并数据，保留更完整的信息
                const merged = {
                  ...existing,
                  ...char,
                  // 如果新数据有更多字段，则合并
                  avatar: char.avatar || existing.avatar,
                  gender: char.gender || existing.gender,
                  description: char.description || existing.description,
                  type: char.type || existing.type,
                };
                characterMap.set(char.name, merged);
              }
            }
            
            const uniqueCharacters = Array.from(characterMap.values());
            
            // 从章节内容中识别角色名称
            const extractCharactersFromChapters = (): any[] => {
              const extractedNames = new Set<string>();
              
              // 遍历所有章节内容
              for (const chapter of allChapters) {
                if (chapter.content) {
                  // 简单的角色名称识别：查找常见的中文姓名模式
                  // 匹配2-4个中文字符的姓名（排除常见非人名词汇）
                  const namePattern = /[（(]?([\u4e00-\u9fa5]{2,4})[）)]?/g;
                  const excludeWords = new Set([
                    '章节', '内容', '正文', '开始', '结束', '时间', '地点', '人物',
                    '主角', '配角', '反派', '角色', '人物', '主角', '配角',
                    '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八', '第九', '第十',
                    '今天', '明天', '昨天', '上午', '下午', '晚上', '中午', '凌晨',
                    '这里', '那里', '哪里', '什么', '怎么', '为什么', '如何',
                    '但是', '然而', '不过', '虽然', '因为', '所以', '如果', '那么',
                    '可以', '应该', '必须', '需要', '想要', '希望', '觉得', '认为',
                    '看到', '听到', '感到', '想到', '知道', '了解', '明白', '理解',
                    '说话', '说道', '说道', '说道', '说道', '说道', '说道',
                  ]);
                  
                  let match;
                  while ((match = namePattern.exec(chapter.content)) !== null) {
                    const name = match[1];
                    // 排除常见非人名词汇
                    if (!excludeWords.has(name) && name.length >= 2) {
                      // 检查是否在引号或对话中（更可能是人名）
                      const context = chapter.content.substring(
                        Math.max(0, match.index - 10),
                        Math.min(chapter.content.length, match.index + match[0].length + 10)
                      );
                      // 如果出现在"说"、"道"、"想"等动词前，更可能是人名
                      if (/\b(说|道|想|看|听|问|答|喊|叫|称|叫|唤)\b/.test(context)) {
                        extractedNames.add(name);
                    }
                  }
                }
              }
              }
              
              // 转换为角色对象
              return Array.from(extractedNames).map(name => ({
                id: `extracted_${name}`,
                name: name,
                source: 'extracted',
                description: '从章节内容中识别',
              }));
            };
            
            // 合并从章节中提取的角色
            const extractedCharacters = extractCharactersFromChapters();
            for (const char of extractedCharacters) {
              const existing = characterMap.get(char.name);
              if (!existing) {
                // 如果角色表中没有，则添加
                characterMap.set(char.name, char);
              }
            }
            
            const allUniqueCharacters = Array.from(characterMap.values());
            
            // 关键修复：检查缓存和章节是否变化，避免重复计算和更新
            const currentCacheKey = JSON.stringify({
              cache: cached,
              chaptersCount: allChapters.length,
              chaptersIds: allChapters.map(c => c.id).sort().join(',')
            });
            
            // 如果缓存和章节都没有变化，跳过更新
            if (currentCacheKey === lastCharacterCacheRef.current && 
                JSON.stringify(allChapters.map(c => c.id).sort()) === JSON.stringify(lastAllChaptersRef.current.map(c => c.id).sort())) {
              return; // 跳过重复计算
            }
            
            // 更新缓存引用
            lastCharacterCacheRef.current = currentCacheKey;
            lastAllChaptersRef.current = [...allChapters];
            
            setAvailableCharacters(allUniqueCharacters);
            
            console.log('📋 合并后的角色列表:', {
              total: allUniqueCharacters.length,
              fromTable: uniqueCharacters.filter(c => c.source === 'char-table').length,
              fromCard: uniqueCharacters.filter(c => c.source === 'character-card').length,
              extracted: extractedCharacters.length,
            });
          } else {
            setHasCharacterModule(false);
            setAvailableCharacters([]);
          }
          
          // 查找地点数据（可能在world模块的card-list组件中，或者有"地点"关键词的组件）
          const findLocationData = (components: any[]): any[] => {
            for (const comp of components) {
              // 检查card-list组件，且label包含"地点"相关关键词
              if (comp.type === 'card-list' && comp.value) {
                const label = (comp.label || '').toLowerCase();
                if (label.includes('地点') || label.includes('location') || label.includes('场景')) {
                  // 卡片列表数据格式：数组，每个对象有name字段（或第一个字段）
                  return (comp.value as any[]).map((card) => {
                    // 尝试从name字段获取，如果没有则从第一个字段获取
                    const name = card.name || card[Object.keys(card)[0]] || '';
                    return {
                      id: name || String(Date.now() + Math.random()),
                      name: name,
                    };
                  }).filter(loc => loc.name);
                }
              }
              
              // 检查tabs组件（地点可能在tabs中）
              if (comp.type === 'tabs' && comp.config?.tabs) {
                for (const tab of comp.config.tabs) {
                  if (tab.components) {
                    const found = findLocationData(tab.components);
                    if (found.length > 0) return found;
                  }
                }
              }
            }
            return [];
          };
          
          // 查找world模块
          const worldModule = modules.find((m: any) => m.id === 'world');
          if (worldModule) {
            const locationData = findLocationData(worldModule.components || []);
            if (locationData.length > 0) {
              setHasLocationModule(true);
              setAvailableLocations(locationData);
            } else {
              setHasLocationModule(false);
              setAvailableLocations([]);
            }
          } else {
            // 如果没有world模块，尝试在所有模块中查找地点数据
            let foundLocations: any[] = [];
            for (const module of modules) {
              const locationData = findLocationData(module.components || []);
              if (locationData.length > 0) {
                foundLocations = locationData;
                break;
              }
            }
            if (foundLocations.length > 0) {
              setHasLocationModule(true);
              setAvailableLocations(foundLocations);
            } else {
              setHasLocationModule(false);
              setAvailableLocations([]);
            }
          }
        } else {
          setHasLocationModule(false);
          setAvailableLocations([]);
        }
      } catch (err) {
        console.error('加载地点数据失败:', err);
        setHasLocationModule(false);
        setAvailableLocations([]);
      }
    };

    // 初始加载
    loadLocationsFromCache();

    // 监听localStorage变化（当WorkInfoManager更新时）
    const handleStorageChange = (e: StorageEvent) => {
      const workSpecificKey = `wawawriter_workinfo_cache_${workId}`;
      if (e.key === workSpecificKey) {
        loadLocationsFromCache();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // 定期检查缓存变化（因为同窗口内的localStorage变化不会触发storage事件）
    // 关键修复：增加检查间隔到5秒，减少频繁执行
    const interval = setInterval(loadLocationsFromCache, 5000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [workId]);

  // 初始化 ShareDB 连接和同步管理器
  useEffect(() => {
    // 连接 ShareDB
    // 移除 WebSocket 连接，只使用轮询
    // sharedbClient.connect().catch(console.error);

    // 监听同步状态
    const unsubscribe = syncManager.onStatusChange((status) => {
      setSyncStatus(status);
    });

    // 预加载当前作品的章节（智能预测）
    if (workId) {
      const preloadChapters = async () => {
        try {
          const response = await chaptersApi.listChapters({
            work_id: Number(workId),
            page: 1,
            size: 20,
            sort_by: 'chapter_number',
            sort_order: 'asc',
          });
          
          const documentIds = response.chapters.map(ch => `chapter_${ch.id}`);
          await syncManager.preloadDocuments(documentIds);
        } catch (err) {
          console.error('预加载章节失败:', err);
        }
      };
      
      preloadChapters();
    }

    return () => {
      unsubscribe();
      // 移除 WebSocket 断开连接
      // sharedbClient.disconnect();
    };
  }, [workId]);

  // 加载作品详情
  useEffect(() => {
    if (!workId) {
      setError('缺少作品ID');
      setLoading(false);
      return;
    }

    const loadWork = async () => {
      try {
        setLoading(true);
        const workData = await worksApi.getWork(Number(workId), true, true);
        setWork(workData);
        setTitleValue(workData.title);
        setError(null);
      } catch (err) {
        console.error('加载作品失败:', err);
        setError(err instanceof Error ? err.message : '加载作品失败');
      } finally {
        setLoading(false);
      }
    };

    loadWork();
  }, [workId]);

  // 当 work 更新时，同步更新 titleValue
  useEffect(() => {
    if (work) {
      setTitleValue(work.title);
    }
  }, [work]);

  // 当进入编辑模式时，聚焦输入框
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // 点击外部关闭标题下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headingMenuRef.current && !headingMenuRef.current.contains(event.target as Node)) {
        setHeadingMenuOpen(false);
      }
    };

    if (headingMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [headingMenuOpen]);

  // 保存标题
  const handleSaveTitle = async () => {
    if (!work || !workId || !titleValue.trim()) {
      setTitleValue(work?.title || '');
      setIsEditingTitle(false);
      return;
    }

    if (titleValue.trim() === work.title) {
      setIsEditingTitle(false);
      return;
    }

    try {
      const updatedWork = await worksApi.updateWork(Number(workId), {
        title: titleValue.trim(),
      });
      setWork(updatedWork);
      setIsEditingTitle(false);
    } catch (err) {
      console.error('保存标题失败:', err);
      alert(err instanceof Error ? err.message : '保存标题失败');
      setTitleValue(work.title);
      setIsEditingTitle(false);
    }
  };

  // 取消编辑标题
  const handleCancelEditTitle = () => {
    setTitleValue(work?.title || '');
    setIsEditingTitle(false);
  };

  // 处理标题输入框的键盘事件
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditTitle();
    }
  };

  // 删除作品
  const handleDeleteWork = async () => {
    if (!workId || !work) return;
    
    const confirmed = window.confirm(`确定要删除作品《${work.title}》吗？此操作不可恢复！`);
    if (!confirmed) return;
    
    try {
      await worksApi.deleteWork(Number(workId));
      alert('作品删除成功');
      navigate('/works');
    } catch (err) {
      console.error('删除作品失败:', err);
      alert(err instanceof Error ? err.message : '删除作品失败');
    }
  };

  // 分析本书（后台运行，不显示弹窗）
  const handleAnalyzeWork = async () => {
    if (!workId) {
      console.warn('没有选择作品');
      return;
    }
    
    // 后台运行，不显示确认弹窗
    setIsAnalyzing(true);
    
    try {
      // 调用后端接口，后端会自动获取所有章节内容并逐章处理
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
      const token = localStorage.getItem('access_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(
        `${API_BASE_URL}/ai/analyze-work-chapters?work_id=${workId}`,
        {
          method: 'POST',
          headers,
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`分析失败: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      // 处理流式响应（后台处理，不显示进度）
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      let analyzedCount = 0; // 统计分析的章节数
      let totalChapters = 0; // 总章节数
      
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
                // 记录开始信息
                totalChapters = data.total_chapters || 0;
                console.log(`开始分析作品，共 ${totalChapters} 章`);
              } else if (data.type === 'chapter_inserted') {
                // 统计成功分析的章节
                analyzedCount++;
                console.log(`✓ 第 ${data.chapter_index}/${totalChapters} 章分析完成`);
              } else if (data.type === 'all_chapters_complete') {
                // 分析完成，显示结果
                setIsAnalyzing(false);
                console.log(`分析完成！共分析了 ${analyzedCount} 章`);
                // 显示简单的提示信息
                alert(`分析完成！共分析了 ${analyzedCount} 章。`);
                // 静默刷新数据（不刷新整个页面）
                if (workId) {
                  // 重新加载作品和章节数据
                  const workData = await worksApi.getWork(Number(workId));
                  setWork(workData);
                  // 触发章节列表重新加载
                  window.dispatchEvent(new Event('chapters-updated'));
                }
              } else if (data.type === 'error' || data.type === 'chapter_insert_error') {
                console.error('分析错误:', data.message);
                setIsAnalyzing(false);
                alert(`分析失败: ${data.message}`);
              }
            } catch (e) {
              // 忽略解析错误
              console.warn('解析SSE消息失败:', e, line);
            }
          }
        }
      }
    } catch (err) {
      console.error('分析失败:', err);
      setIsAnalyzing(false);
      alert(err instanceof Error ? err.message : '分析失败');
    }
  };

  // 加载章节列表
  useEffect(() => {
    if (!workId) return;

    const loadChapters = async () => {
      try {
        // 分页获取所有章节
        const allChapters: Chapter[] = [];
        let page = 1;
        const pageSize = 100;
        let hasMore = true;

        while (hasMore) {
          const response = await chaptersApi.listChapters({
            work_id: Number(workId),
            page: page,
            size: pageSize,
            sort_by: 'chapter_number',
            sort_order: 'asc',
          });
          
          allChapters.push(...response.chapters);
          hasMore = response.chapters.length === pageSize;
          page++;
        }

        // 保存所有章节数据
        setAllChapters(allChapters);
        
        // 根据作品类型处理分卷逻辑
        // 长篇作品：按卷分组；短篇作品：所有章节归入"未分卷"
        const volumesMap = new Map<number, Array<Chapter>>();
        
        if (work?.work_type === 'short') {
          // 短篇作品：所有章节归入 volume_number = 0（未分卷）
          allChapters.forEach((chapter) => {
            const volNum = 0; // 短篇强制使用未分卷
            if (!volumesMap.has(volNum)) {
              volumesMap.set(volNum, []);
            }
            volumesMap.get(volNum)!.push(chapter);
          });
        } else {
          // 长篇作品：按原有卷号分组
        allChapters.forEach((chapter) => {
          const volNum = chapter.volume_number || 0;
          if (!volumesMap.has(volNum)) {
            volumesMap.set(volNum, []);
          }
          volumesMap.get(volNum)!.push(chapter);
        });
        }

        // 转换为编辑页面需要的格式
        const volumesData = Array.from(volumesMap.entries()).map(([volNum, chapters]) => ({
          id: `vol${volNum}`,
          title: volNum === 0 ? '未分卷' : `第${volNum}卷`,
          chapters: chapters.map((chapter) => ({
            id: String(chapter.id),
            volumeId: `vol${volNum}`,
            title: chapter.title,
            chapter_number: chapter.chapter_number,  // 保留章节号
            characters: [],
            locations: [],
            outline: chapter.metadata?.outline || '',
            detailOutline: chapter.metadata?.detailed_outline || '',
          })),
        }));

        // 如果短篇作品没有章节，确保至少有一个"未分卷"卷
        if (work?.work_type === 'short' && volumesData.length === 0) {
          volumesData.push({
            id: 'vol0',
            title: '未分卷',
            chapters: [],
          });
        }

        setVolumes(volumesData);

        // 更新章节数据映射
        const chaptersDataMap: Record<string, ChapterFullData> = {};
        allChapters.forEach((chapter) => {
          const volNum = chapter.volume_number || 0;
          chaptersDataMap[String(chapter.id)] = {
            id: String(chapter.id),
            volumeId: `vol${volNum}`,
            volumeTitle: volNum === 0 ? '未分卷' : `第${volNum}卷`,
            title: chapter.title,
            chapter_number: chapter.chapter_number,  // 保留章节号
            characters: [],
            locations: [],
            outline: chapter.metadata?.outline || '',
            detailOutline: chapter.metadata?.detailed_outline || '',
          };
        });
        setChaptersData(chaptersDataMap);
        
        // 如果没有选中章节，自动选中第一个章节
        if (allChapters.length > 0) {
          setSelectedChapter(prev => {
            if (!prev) {
              const firstChapter = allChapters[0];
              console.log('📖 自动选中第一个章节:', firstChapter.id, firstChapter.title);
              return String(firstChapter.id);
            }
            return prev;
          });
        }
      } catch (err) {
        console.error('加载章节列表失败:', err);
      }
    };

    loadChapters();
  }, [workId]);

  // 加载章节内容（使用本地缓存和 ShareDB）
  useEffect(() => {
    if (!selectedChapter || !editor) return;

    const chapterId = parseInt(selectedChapter);
    
    // 关键修复：切换章节时清除上次设置的内容记录，避免影响新章节
    // 同时清除加载状态标记（如果之前有残留）
    if (!isNaN(chapterId) && currentChapterIdRef.current !== chapterId) {
      lastSetContentRef.current = ''; // 清除记录，允许新章节设置内容
      isChapterLoadingRef.current = false; // 清除可能残留的加载状态
      console.log('🔄 [切换章节] 清除上次章节的内容记录和加载状态');
    }
    if (isNaN(chapterId)) {
      // 如果是草稿或其他非数字ID，不加载
      editor.commands.setContent('<p></p>');
      currentChapterIdRef.current = null;
      return;
    }

    const loadChapterContent = async () => {
      // 显示加载弹窗
      setChapterLoading(true);
      // 关键修复：设置加载状态标记，防止其他操作干扰
      isChapterLoadingRef.current = true;
      
      // 关键修复：在开始加载新章节前，立即停止智能同步的所有操作
      // 这样可以防止轮询、同步检查等在章节切换时干扰编辑器内容
      if (typeof stopSync === 'function') {
        console.log('🛑 [切换章节] 停止智能同步，防止干扰章节加载');
        stopSync();
      }
      
      try {
        // 关键修复：在加载新章节前，先保存当前章节的内容
        const previousChapterId = currentChapterIdRef.current;
        if (previousChapterId && previousChapterId !== chapterId && workId) {
        try {
          // 关键修复：立即清除所有待保存的定时器，避免保存到错误的章节
          // 这样可以防止自动保存在新章节加载后保存到前一个章节
          const saveTimeoutRef = (window as any).__chapterSaveTimeout;
          if (saveTimeoutRef?.current) {
            clearTimeout(saveTimeoutRef.current);
            console.log('🛑 [切换章节] 已清除待保存的定时器，避免保存到错误章节');
          }
          
          // 关键修复：清除自动拉取定时器，避免拉取其他章节的内容
          const pullTimer = (window as any).__chapterPullTimer;
          if (pullTimer) {
            clearTimeout(pullTimer);
            console.log('🛑 [切换章节] 已清除自动拉取定时器，避免拉取错误章节');
            delete (window as any).__chapterPullTimer;
          }
          
          // 等待一小段时间，确保所有异步保存操作完成
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // 关键修复：在清空编辑器前，立即获取并保存当前章节内容
          // 此时编辑器还显示前一个章节的内容
          const currentContent = editor.getHTML();
          const previousDocumentId = `work_${workId}_chapter_${previousChapterId}`;
          
          console.log('💾 [切换章节] 保存前一个章节内容:', {
            previousChapterId,
            newChapterId: chapterId,
            previousDocumentId,
            contentLength: currentContent.length,
            contentPreview: currentContent.substring(0, 100),
            editorContent: editor.getHTML().substring(0, 100), // 验证编辑器内容
          });
          
          // 关键修复：验证编辑器内容确实属于前一个章节
          // 如果编辑器内容已经被清空或改变，说明可能已经切换了，不应该保存
          if (currentContent && currentContent.trim() !== '<p></p>' && currentContent.trim() !== '') {
            console.log('💾 [切换章节] 正在保存当前章节内容...');
            // 立即保存前一个章节的内容，使用同步方式确保保存完成
            // 先保存到本地缓存
            await documentCache.updateDocument(previousDocumentId, currentContent, {
              work_id: Number(workId),
              chapter_id: previousChapterId,
              updated_at: new Date().toISOString(),
            });
            
            // 然后同步到服务器，确保数据持久化
            try {
              await documentCache.syncDocumentState(previousDocumentId, currentContent);
              console.log('✅ [切换章节] 当前章节内容已保存到服务器');
            } catch (syncErr) {
              console.warn('⚠️ [切换章节] 同步到服务器失败，但已保存到本地缓存:', syncErr);
            }
            
            // 验证保存是否成功
            const savedDoc = await documentCache.getDocument(previousDocumentId);
            if (savedDoc && typeof savedDoc.content === 'string') {
              if (savedDoc.content === currentContent) {
                console.log('✅ [切换章节] 前一个章节内容已保存并验证成功');
              } else {
                console.warn('⚠️ [切换章节] 保存的内容与原始内容不匹配，可能存在问题', {
                  savedLength: savedDoc.content.length,
                  originalLength: currentContent.length,
                });
              }
            }
            
            console.log('✅ [切换章节] 前一个章节内容已保存');
          } else {
            console.warn('⚠️ [切换章节] 编辑器内容为空，跳过保存');
          }
        } catch (err) {
          console.error('❌ [切换章节] 保存前一个章节内容失败:', err);
        }
      }
      
      // 关键修复：在加载新章节前，先清空编辑器内容，避免显示旧内容
      // 注意：不要提前更新 currentChapterIdRef，因为自动保存还在使用它来验证章节ID
      console.log('🔄 [切换章节] 清空编辑器，准备加载新章节内容');
      // 清空编辑器时使用 emitUpdate: false，不触发更新事件，同时清除历史
      editor.commands.setContent('<p></p>', { emitUpdate: false });
      
      // 等待编辑器清空完成
      await new Promise(resolve => setTimeout(resolve, 50));
      
      try {
        // 使用 workId 和 chapterId 生成唯一的缓存键（统一使用新格式）
        if (!workId) {
          console.error('❌ [章节加载] workId 不存在，无法加载章节内容');
          setChapterLoading(false);
          return;
        }
        const documentId = `work_${workId}_chapter_${chapterId}`;
        
        console.log('📖 [切换章节] 开始加载新章节内容:', {
          workId,
          chapterId,
          documentId,
        });
        
        let content: string | null = null;
        
        // 关键修复：先从服务器强制拉取最新版本，确保获取的是最新内容
        console.log('🔄 [切换章节] 从服务器强制拉取最新版本...');
        try {
          const serverDoc = await documentCache.forcePullFromServer(documentId);
          if (serverDoc && serverDoc.content) {
            const serverContent = typeof serverDoc.content === 'string' 
              ? serverDoc.content 
              : JSON.stringify(serverDoc.content);
            
            if (serverContent && serverContent.trim().length > 0) {
              content = serverContent;
              console.log('✅ [切换章节] 从服务器获取到最新内容，长度:', content.length);
              
              // 更新本地缓存
              await documentCache.updateDocument(documentId, content, {
                work_id: Number(workId),
                chapter_id: chapterId,
                updated_at: new Date().toISOString(),
              });
            }
          }
        } catch (pullErr) {
          console.warn('⚠️ [切换章节] 从服务器拉取失败，将使用本地缓存:', pullErr);
        }
        
        // 1. 如果服务器拉取失败，从本地缓存获取（即时响应）- 优先新格式，兼容旧格式
        try {
          // 关键修复：确保使用正确的文档ID，避免缓存键冲突
          console.log('🔍 [缓存检查] 开始获取缓存，文档ID:', {
            documentId,
            chapterId,
            workId,
          });
          
          // 先尝试新格式
          let cachedDoc = await documentCache.getDocument(documentId);
          
          // 验证缓存内容是否属于当前章节
          if (cachedDoc) {
            const cachedChapterId = cachedDoc.metadata?.chapter_id;
            if (cachedChapterId && cachedChapterId !== chapterId) {
              console.warn('⚠️ [缓存检查] 缓存内容属于其他章节，清除缓存:', {
                cachedChapterId,
                expectedChapterId: chapterId,
                documentId,
              });
              // 清除错误的缓存
              await localCacheManager.delete(documentId);
              cachedDoc = null;
            } else {
              console.log('✅ [缓存检查] 缓存内容验证通过，属于当前章节');
            }
          }
          
          // 打印完整的缓存对象用于调试
          if (cachedDoc) {
            console.log('💾 缓存完整对象:', JSON.stringify(cachedDoc, null, 2));
          }
          
          console.log('💾 缓存数据:', {
            documentId,
            cached: !!cachedDoc,
            cachedDoc,
            contentType: cachedDoc?.content ? typeof cachedDoc.content : 'null',
            contentPreview: cachedDoc?.content 
              ? (typeof cachedDoc.content === 'string' 
                  ? cachedDoc.content.substring(0, 100) 
                  : JSON.stringify(cachedDoc.content).substring(0, 200))
              : 'null',
          });
          
          if (cachedDoc) {
            // 处理不同的内容格式
            if (typeof cachedDoc.content === 'string') {
              if (cachedDoc.content.trim().length > 0) {
                content = cachedDoc.content;
                console.log('✅ 从缓存获取到字符串内容，长度:', content.length);
              } else {
                console.log('⚠️ 缓存内容是空字符串，将从服务器获取');
              }
            } else if (cachedDoc.content && typeof cachedDoc.content === 'object') {
              // 如果内容是对象，尝试提取 content 字段
              if ('content' in cachedDoc.content) {
                const innerContent = cachedDoc.content.content;
                if (typeof innerContent === 'string' && innerContent.trim().length > 0) {
                  content = innerContent;
                  console.log('✅ 从缓存对象中提取内容，长度:', content.length);
                } else {
                  console.log('⚠️ 缓存对象中的 content 字段是空字符串，将从服务器获取');
                }
              } else {
                // 尝试序列化为字符串
                content = JSON.stringify(cachedDoc.content);
                console.log('⚠️ 缓存内容是对象，已序列化，长度:', content.length);
              }
            }
            
            // 从缓存中读取 outline 和 detailed_outline（如果存在）
            if (cachedDoc.metadata?.outline || cachedDoc.metadata?.detailed_outline) {
              const chapterIdStr = String(chapterId);
              const cachedOutline = cachedDoc.metadata.outline || '';
              const cachedDetailedOutline = cachedDoc.metadata.detailed_outline || '';
              
              console.log('📝 从缓存读取章节大纲和细纲:', {
                chapterId: chapterIdStr,
                hasOutline: !!cachedOutline,
                hasDetailedOutline: !!cachedDetailedOutline,
              });
              
              // 更新 chaptersData 中的章节数据
              setChaptersData(prev => {
                const updated = { ...prev };
                if (updated[chapterIdStr]) {
                  updated[chapterIdStr] = {
                    ...updated[chapterIdStr],
                    outline: cachedOutline,
                    detailOutline: cachedDetailedOutline,
                  };
                }
                return updated;
              });
              
              // 如果当前选中的章节就是这个章节，也更新 currentChapterData
              if (selectedChapter === chapterIdStr) {
                setCurrentChapterData(prev => {
                  if (prev && prev.id === chapterIdStr) {
                    return {
                      ...prev,
                      outline: cachedOutline,
                      detailOutline: cachedDetailedOutline,
                    };
                  }
                  return prev;
                });
              }
            }
          } else {
            console.log('❌ 缓存中没有找到文档（新格式和旧格式都未找到）');
          }
        } catch (cacheErr) {
          console.warn('⚠️ 从缓存加载失败，将从服务器获取:', cacheErr);
        }
        
        // 2. 只有当 chaptersData 中没有大纲和细纲时，才从服务器获取章节信息
        // 避免频繁请求，优先使用已缓存的数据
        let docResult: any = null;
        const chapterIdStr = String(chapterId);
        const hasOutlineInCache = chaptersData[chapterIdStr]?.outline && chaptersData[chapterIdStr].outline.trim().length > 0;
        const hasDetailOutlineInCache = chaptersData[chapterIdStr]?.detailOutline && chaptersData[chapterIdStr].detailOutline.trim().length > 0;
        
        // 只有当缓存中没有大纲或细纲时，才从服务器获取
        if (!hasOutlineInCache || !hasDetailOutlineInCache) {
          try {
            console.log('📥 获取章节文档信息（用于更新大纲和细纲）...', {
              hasOutlineInCache,
              hasDetailOutlineInCache,
            });
            docResult = await chaptersApi.getChapterDocument(chapterId);
          console.log('📥 从 ShareDB 文档 API 获取:', {
            hasContent: !!docResult.content,
            contentType: typeof docResult.content,
            contentKeys: docResult.content && typeof docResult.content === 'object' 
              ? Object.keys(docResult.content) 
              : 'not object',
            hasChapterInfo: !!docResult.chapter_info,
            hasMetadata: !!docResult.chapter_info?.metadata,
          });
          
          // 打印完整的文档对象用于调试
          console.log('📦 ShareDB 完整文档对象:', JSON.stringify(docResult, null, 2));
          
          // 更新章节的 outline 和 detailed_outline 到设置中
          if (docResult.chapter_info?.metadata) {
              const chapterIdStr = String(docResult.chapter_info.id);
              
              // 将对象格式的 outline 转换为字符串
              let outline = '';
              if (docResult.chapter_info.metadata.outline) {
                const outlineObj = docResult.chapter_info.metadata.outline as any;
                if (typeof outlineObj === 'object' && outlineObj !== null) {
                  // 格式化大纲对象为可读字符串
                  const parts: string[] = [];
                  if (outlineObj.core_function) {
                    parts.push(`核心功能：${outlineObj.core_function}`);
                  }
                  if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
                    parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
                  }
                  if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
                    parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
                  }
                  if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
                    parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
                  }
                  if (outlineObj.hook) {
                    parts.push(`结尾钩子：${outlineObj.hook}`);
                  }
                  outline = parts.join('\n\n');
                } else if (typeof outlineObj === 'string') {
                  outline = outlineObj;
                }
              }
              
              // 将对象格式的 detailed_outline 转换为字符串
              let detailedOutline = '';
              if (docResult.chapter_info.metadata.detailed_outline) {
                const detailedObj = docResult.chapter_info.metadata.detailed_outline as any;
                if (typeof detailedObj === 'object' && detailedObj !== null) {
                  // 格式化细纲对象为可读字符串
                  if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
                    detailedOutline = detailedObj.sections.map((section: any) => {
                      const sectionNum = section.section_number || '';
                      const sectionTitle = section.title || '';
                      const sectionContent = section.content || '';
                      return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
                    }).join('\n\n');
                  } else {
                    detailedOutline = JSON.stringify(detailedObj, null, 2);
                  }
                } else if (typeof detailedObj === 'string') {
                  detailedOutline = detailedObj;
                }
              }
              
              console.log('📝 更新章节大纲和细纲:', {
                chapterId: chapterIdStr,
                hasOutline: !!outline,
                hasDetailedOutline: !!detailedOutline,
                outlineLength: outline.length,
                detailedOutlineLength: detailedOutline.length,
              });
              
              // 更新 chaptersData 中的章节数据
              setChaptersData(prev => {
                const updated = { ...prev };
                if (updated[chapterIdStr]) {
                  updated[chapterIdStr] = {
                    ...updated[chapterIdStr],
                    outline,
                    detailOutline: detailedOutline,
                  };
                } else {
                  // 如果章节数据不存在，创建新的数据
                  const volNum = docResult.chapter_info.volume_number || 0;
                  updated[chapterIdStr] = {
                    id: chapterIdStr,
                    volumeId: `vol${volNum}`,
                    volumeTitle: volNum === 0 ? '未分卷' : `第${volNum}卷`,
                    title: docResult.chapter_info.title,
                    chapter_number: docResult.chapter_info.chapter_number,
                    characters: [],
                    locations: [],
                    outline,
                    detailOutline: detailedOutline,
                  };
                }
                return updated;
              });
              
              // 如果当前选中的章节就是这个章节，也更新 currentChapterData
              if (selectedChapter === chapterIdStr) {
                setCurrentChapterData(prev => {
                  if (prev && prev.id === chapterIdStr) {
                    return {
                      ...prev,
                      outline,
                      detailOutline: detailedOutline,
                    };
                  }
                  return prev;
                });
              }
            }
            
            // 3. 如果缓存中没有内容，从 docResult 中提取内容
            if (!content && docResult.content) {
              console.log('🌐 缓存中没有内容，从 docResult 中提取...');
              console.log('📦 ShareDB 文档结构:', {
                isString: typeof docResult.content === 'string',
                isObject: typeof docResult.content === 'object',
                keys: typeof docResult.content === 'object' ? Object.keys(docResult.content) : 'N/A',
                contentValue: typeof docResult.content === 'object' && 'content' in docResult.content
                  ? (typeof docResult.content.content === 'string' 
                      ? docResult.content.content.substring(0, 200) 
                      : JSON.stringify(docResult.content.content).substring(0, 200))
                  : 'N/A',
              });
              
              // 处理不同的内容格式
              if (typeof docResult.content === 'string') {
                // 直接是字符串内容
                content = docResult.content;
                console.log('✅ 获取到字符串内容，长度:', content?.length || 0);
              } else if (docResult.content && typeof docResult.content === 'object') {
                // ShareDB 文档对象格式：{ id, content, title, metadata, ... }
                // 实际内容在 content 字段中
                console.log('🔍 检查文档对象的 content 字段:', {
                  hasContentKey: 'content' in docResult.content,
                  contentValue: docResult.content.content,
                  contentType: typeof docResult.content.content,
                  contentLength: typeof docResult.content.content === 'string' 
                    ? docResult.content.content.length 
                    : 'not string',
                });
                
                if ('content' in docResult.content) {
                  const innerContent = docResult.content.content;
                  
                  if (typeof innerContent === 'string') {
                    // 字符串内容
                    if (innerContent.trim().length > 0) {
                      content = innerContent;
                      console.log('✅ 从 ShareDB 文档对象中提取字符串内容，长度:', content.length);
                    } else {
                      console.warn('⚠️ ShareDB 中 content 字段是空字符串，可能内容未保存');
                      // 即使 ShareDB 为空，也设置空内容，让用户可以编辑
                      content = '';
                    }
                  } else if (innerContent === null || innerContent === undefined) {
                    console.warn('⚠️ content 字段是 null 或 undefined');
                    content = null;
                  } else if (innerContent && typeof innerContent === 'object') {
                    // 如果 content 还是对象，可能是 TipTap 格式或其他格式
                    console.log('📝 content 是对象，结构:', {
                      keys: Object.keys(innerContent),
                      type: (innerContent as any).type,
                    });
                    
                    if ('type' in innerContent && innerContent.type === 'doc') {
                      // TipTap 文档格式，需要转换为 HTML
                      console.log('📝 检测到 TipTap 格式，需要转换');
                      // 这里可以添加 TipTap 到 HTML 的转换逻辑
                      // 暂时序列化
                      content = JSON.stringify(innerContent);
                    } else {
                      // 尝试查找可能的文本内容
                      const textContent = (innerContent as any).text || 
                                        (innerContent as any).html ||
                                        (innerContent as any).body;
                      if (textContent && typeof textContent === 'string') {
                        content = textContent;
                        console.log('✅ 从对象中提取文本内容，长度:', content.length);
                      } else {
                        content = JSON.stringify(innerContent);
                        console.log('⚠️ content 是对象，已序列化，长度:', content.length);
                      }
                    }
                  } else {
                    console.warn('⚠️ content 字段格式未知:', typeof innerContent, innerContent);
                    content = null;
                  }
                } else {
                  // 尝试查找可能的 content 字段
                  console.log('🔍 尝试查找其他可能的内容字段...');
                  const possibleContent = (docResult.content as any).html ||
                                         (docResult.content as any).text ||
                                         (docResult.content as any).body ||
                                         (docResult.content as any).data;
                  if (possibleContent && typeof possibleContent === 'string' && possibleContent.trim().length > 0) {
                    content = possibleContent;
                    console.log('✅ 找到其他内容字段，长度:', content.length);
                  } else {
                    // 打印所有键值对用于调试
                    console.warn('⚠️ 无法提取内容，文档对象的所有键值:', 
                      Object.keys(docResult.content).reduce((acc, key) => {
                        acc[key] = typeof (docResult.content as any)[key];
                        return acc;
                      }, {} as Record<string, string>)
                    );
                    content = null; // 不设置无效内容
                  }
                }
              }
              
              // 如果成功获取内容，保存到缓存（包含 outline 和 detailed_outline）
              if (content) {
                if (!workId) {
                  console.error('❌ [缓存] workId 不存在，无法保存到缓存');
                  return;
                }
                const cacheKey = `work_${workId}_chapter_${chapterId}`;
                
                // 提取 outline 和 detailed_outline（如果存在）
                let outline = '';
                let detailedOutline = '';
                if (docResult.chapter_info?.metadata) {
                  // 将对象格式的 outline 转换为字符串
                  if (docResult.chapter_info.metadata.outline) {
                    const outlineObj = docResult.chapter_info.metadata.outline as any;
                    if (typeof outlineObj === 'object' && outlineObj !== null) {
                      const parts: string[] = [];
                      if (outlineObj.core_function) {
                        parts.push(`核心功能：${outlineObj.core_function}`);
                      }
                      if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
                        parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
                      }
                      if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
                        parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
                      }
                      if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
                        parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
                      }
                      if (outlineObj.hook) {
                        parts.push(`结尾钩子：${outlineObj.hook}`);
                      }
                      outline = parts.join('\n\n');
                    } else if (typeof outlineObj === 'string') {
                      outline = outlineObj;
                    }
                  }
                  
                  // 将对象格式的 detailed_outline 转换为字符串
                  if (docResult.chapter_info.metadata.detailed_outline) {
                    const detailedObj = docResult.chapter_info.metadata.detailed_outline as any;
                    if (typeof detailedObj === 'object' && detailedObj !== null) {
                      if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
                        detailedOutline = detailedObj.sections.map((section: any) => {
                          const sectionNum = section.section_number || '';
                          const sectionTitle = section.title || '';
                          const sectionContent = section.content || '';
                          return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
                        }).join('\n\n');
                      } else {
                        detailedOutline = JSON.stringify(detailedObj, null, 2);
                      }
                    } else if (typeof detailedObj === 'string') {
                      detailedOutline = detailedObj;
                    }
                  }
                }
                
                console.log('💾 保存到缓存（包含大纲和细纲）:', {
                  cacheKey,
                  contentLength: content.length,
                  hasOutline: !!outline,
                  hasDetailedOutline: !!detailedOutline,
                });
                
                documentCache.updateDocument(cacheKey, content, {
                  work_id: docResult.chapter_info.work_id,
                  chapter_id: docResult.chapter_info.id,
                  chapter_number: docResult.chapter_info.chapter_number,
                  outline: outline || undefined,
                  detailed_outline: detailedOutline || undefined,
                }).then(() => {
                  console.log('✅ 已保存到缓存（包含大纲和细纲）:', cacheKey);
                }).catch(err => {
                  console.error('❌ 保存到缓存失败:', err);
                });
              }
            } else {
              console.warn('⚠️ ShareDB 文档中没有内容');
            }
          } catch (docErr) {
            console.error('❌ 从 ShareDB 文档 API 获取失败:', docErr);
            
            // 如果 ShareDB 失败，尝试从普通章节 API 获取（作为后备）
            // 注意：这个 API 不包含大纲和细纲，只用于获取内容
            if (!content) {
              try {
                const chapter = await chaptersApi.getChapter(chapterId);
                console.log('📥 从章节 API 获取（后备）:', {
                  chapterId: chapter.id,
                  hasContent: !!chapter.content,
                  contentLength: chapter.content?.length || 0,
                });
                
                if (chapter.content) {
                  content = chapter.content;
                  if (!workId) {
                    console.error('❌ [缓存] workId 不存在，无法保存到缓存');
                    return;
                  }
                  const cacheKey = `work_${workId}_chapter_${chapterId}`;
                  
                  documentCache.updateDocument(cacheKey, chapter.content, {
                    work_id: chapter.work_id,
                    chapter_id: chapter.id,
                    chapter_number: chapter.chapter_number,
                  }).catch(err => console.error('保存到缓存失败:', err));
                }
              } catch (err) {
                console.error('❌ 从章节 API 获取也失败:', err);
              }
            }
          }
        } else {
          console.log('📝 [loadChapterContent] 缓存中已有大纲和细纲，跳过服务器请求');
        }
        
        // 3. 设置编辑器内容（即使为空也设置，让用户可以编辑）
        console.log('✏️ 设置编辑器内容:', {
          hasContent: !!content,
          contentLength: content?.length || 0,
          contentPreview: content?.substring(0, 100) || 'null',
        });
        
        // 即使内容为空，也设置编辑器（允许用户开始编辑）
        if (content !== null) {
          // content 可能是空字符串，这是正常的（新章节）
          // 关键修复：验证内容确实属于当前章节
          if (!workId) {
            console.error('❌ [章节加载] workId 不存在');
            setChapterLoading(false);
            return;
          }
          const expectedDocumentId = `work_${workId}_chapter_${chapterId}`;
          
          console.log('✏️ [设置编辑器] 验证内容来源:', {
            expectedDocumentId,
            chapterId,
            contentLength: content?.length || 0,
            contentPreview: content?.substring(0, 100) || 'empty',
          });
          
          // 关键修复：防止频闪 - 检查是否与上次设置的内容相同
          // 但在章节切换时，即使内容相同也要设置，因为这是新章节的内容
          const normalizedContent = content || '<p></p>';
          const shouldSetContent = lastSetContentRef.current !== normalizedContent || 
                                   (currentChapterIdRef.current !== chapterId);
          
          if (shouldSetContent) {
            // 关键修复：清除撤销/重做历史，确保每个章节的撤销历史独立
            // 这样撤销操作只会影响当前章节，不会撤回到之前章节的内容
            // TipTap 的 History 扩展没有直接的 clearHistory 方法
            // 我们通过先设置空内容再设置实际内容来重置历史
            // 这样可以确保历史记录从新章节的内容开始
            editor.commands.setContent('<p></p>', { emitUpdate: false });
            // 使用 setTimeout 确保历史被清除后再设置实际内容
            setTimeout(() => {
              editor.commands.setContent(normalizedContent, { emitUpdate: false });
              // 更新字数显示
              const wordCount = countCharacters(normalizedContent);
              setCurrentChapterWordCount(wordCount);
            }, 0);
            lastSetContentRef.current = normalizedContent; // 记录已设置的内容
            
            console.log('✅ [设置编辑器] 内容已设置并清除撤销历史，章节ID:', chapterId);
            
            // 验证设置后的内容
            const setContent = editor.getHTML();
            if (setContent === normalizedContent) {
              console.log('✅ [设置编辑器] 内容已正确设置，长度:', setContent.length);
            } else {
              console.warn('⚠️ [设置编辑器] 内容设置后不匹配，可能存在缓存问题', {
                expected: normalizedContent.substring(0, 50),
                actual: setContent.substring(0, 50)
              });
            }
          } else {
            console.log('✅ [设置编辑器] 内容与上次设置相同，跳过更新，避免频闪');
          }
        } else {
          // 如果 content 是 null（获取失败），设置空编辑器
          console.warn('⚠️ 内容获取失败，设置空编辑器');
          editor.commands.setContent('<p></p>');
          setCurrentChapterWordCount(0);
        }
        
        // 在内容加载完成后，更新 currentChapterIdRef
        // 这样下次切换章节时能正确保存当前章节
        currentChapterIdRef.current = chapterId;
        
        console.log('✅ [章节加载完成] currentChapterIdRef 已更新为:', chapterId);
        
        // 关键修复：章节内容加载完成后，清除加载状态标记
        // 注意：这里不立即重新启动智能同步，因为 useIntelligentSync 的 useEffect 会在 documentId 变化时自动重新启动
        isChapterLoadingRef.current = false;

        // 关键修复：章节切换后延迟从服务器拉取最新更新
        // 延迟执行，避免与轮询冲突，减少频繁请求
        // 轮询会在10秒后自动检查更新，这里延迟5秒，给轮询留出时间
        // 使用一个标记来跟踪这个定时器，方便在切换章节时清除
        const pullTimer = setTimeout(async () => {
          try {
            // 关键修复：再次验证章节ID，确保没有切换章节
            const currentChapterIdCheck = currentChapterIdRef.current;
            if (currentChapterIdCheck !== chapterId) {
              console.warn('⚠️ [自动拉取] 章节已切换，跳过拉取:', {
                currentChapterIdRef: currentChapterIdCheck,
                expectedChapterId: chapterId,
              });
              return;
            }
            
            console.log('🔄 [自动拉取] 章节切换后自动从服务器拉取最新更新:', documentId);
            const serverDoc = await documentCache.forcePullFromServer(documentId);
            
            // 再次验证章节ID（可能在异步操作期间切换了）
            const currentChapterIdCheck2 = currentChapterIdRef.current;
            if (currentChapterIdCheck2 !== chapterId) {
              console.warn('⚠️ [自动拉取] 章节在拉取期间已切换，跳过更新:', {
                currentChapterIdRef: currentChapterIdCheck2,
                expectedChapterId: chapterId,
              });
              return;
            }
            
            if (serverDoc && serverDoc.content) {
              const serverContent = typeof serverDoc.content === 'string' 
                ? serverDoc.content 
                : JSON.stringify(serverDoc.content);
              
              // 关键修复：验证服务器内容确实属于当前章节
              const serverChapterId = serverDoc.metadata?.chapter_id;
              if (serverChapterId && serverChapterId !== chapterId) {
                console.error('❌ [自动拉取] 严重错误：服务器内容属于其他章节！', {
                  serverChapterId,
                  expectedChapterId: chapterId,
                  documentId,
                });
                return; // 不更新，避免覆盖错误的内容
              }
              
              // 关键修复：如果正在加载章节，不更新内容，避免干扰章节加载
              if (isChapterLoadingRef.current) {
                console.log('⏸️ [自动拉取] 章节正在加载中，跳过更新，避免干扰');
                return;
              }
              
              // 关键修复：防止频闪 - 检查是否与上次设置的内容相同
              if (lastSetContentRef.current === serverContent) {
                console.log('✅ [自动拉取] 内容与上次设置相同，跳过更新，避免频闪');
                return;
              }
              
              // 如果服务器内容与当前编辑器内容不同，更新编辑器
              const currentContent = editor.getHTML();
              
              // 关键修复：更严格的内容比较
              const normalizeContent = (content: string) => {
                return content.trim().replace(/\s+/g, ' ');
              };
              
              const normalizedCurrent = normalizeContent(currentContent);
              const normalizedServer = normalizeContent(serverContent);
              
              if (normalizedCurrent !== normalizedServer) {
                console.log('✅ [自动拉取] 检测到服务器有新内容，更新编辑器:', {
                  serverVersion: serverDoc.version,
                  serverContentLength: serverContent.length,
                  currentContentLength: currentContent.length
                });
                // 关键修复：从服务器拉取内容时，先清除历史再设置内容
                // 这样可以避免撤销到旧内容
                editor.commands.setContent('<p></p>', { emitUpdate: false });
                setTimeout(() => {
                  editor.commands.setContent(serverContent, { emitUpdate: false });
                }, 0);
                lastSetContentRef.current = serverContent; // 记录已设置的内容
              } else {
                console.log('✅ [自动拉取] 服务器内容与当前内容一致，无需更新');
                lastSetContentRef.current = serverContent; // 更新记录，避免下次重复检查
              }
            }
          } catch (pullErr) {
            // 拉取失败不影响编辑器使用，只记录错误
            console.warn('⚠️ [自动拉取] 从服务器拉取更新失败（不影响使用）:', pullErr);
          }
        }, 5000); // 延迟5秒，避免与轮询冲突
        
        // 将定时器存储到 ref 中，方便在切换章节时清除
        (window as any).__chapterPullTimer = pullTimer;
        
        // 隐藏加载动画
        setChapterLoading(false);
        // 关键修复：确保在加载完成或失败时都清除加载状态标记
        isChapterLoadingRef.current = false;
      } catch (err) {
        console.error('加载章节内容失败（内层）:', err);
        // 即使所有方法都失败，也显示空内容，保证编辑器可用
        editor.commands.setContent('<p></p>');
        // 隐藏加载动画
        setChapterLoading(false);
        // 关键修复：确保在加载失败时也清除加载状态标记
        isChapterLoadingRef.current = false;
      }
      } catch (err) {
        console.error('加载章节内容失败（外层）:', err);
        // 即使所有方法都失败，也显示空内容，保证编辑器可用
        editor.commands.setContent('<p></p>');
        // 隐藏加载动画
        setChapterLoading(false);
        // 关键修复：确保在加载失败时也清除加载状态标记
        isChapterLoadingRef.current = false;
      }
    };

    loadChapterContent();
  }, [selectedChapter, editor]);

  // 手动保存函数（用于主动保存当前章节内容）
  const handleManualSave = async () => {
    if (!editor || !selectedChapter || !workId) {
      console.warn('⚠️ [手动保存] 编辑器、章节或作品ID不存在');
      return;
    }

    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) {
      console.warn('⚠️ [手动保存] 章节ID无效');
      return;
    }

    // 关键修复：使用编辑器中的实际内容，而不是缓存内容
    const editorContent = editor.getHTML();
    const documentId = `work_${workId}_chapter_${chapterId}`;

    console.log('💾 [手动保存] 开始保存:', {
      chapterId,
      documentId,
      contentLength: editorContent.length,
    });

    try {
      // 显示保存状态
      const saveButton = document.querySelector('.manual-save-btn') as HTMLButtonElement;
      if (saveButton) {
        saveButton.disabled = true;
        if (saveButton.querySelector('span')) {
          saveButton.querySelector('span')!.textContent = '保存中...';
        }
      }

      // 1. 保存到本地缓存
      await documentCache.updateDocument(documentId, editorContent, {
        work_id: Number(workId),
        chapter_id: chapterId,
        updated_at: new Date().toISOString(),
      });

      // 2. 同步到服务器
      const result = await documentCache.syncDocumentState(documentId, editorContent);

      if (result.success) {
        console.log('✅ [手动保存] 保存成功:', {
          version: result.version,
          contentLength: result.content.length,
        });
        
        // 显示成功提示（可选）
        if (saveButton && saveButton.querySelector('span')) {
          saveButton.querySelector('span')!.textContent = '已保存';
          setTimeout(() => {
            if (saveButton && saveButton.querySelector('span')) {
              saveButton.querySelector('span')!.textContent = '保存';
            }
            if (saveButton) {
              saveButton.disabled = false;
            }
          }, 1000);
        }
      } else {
        throw new Error(result.error || '保存失败');
      }
    } catch (err) {
      console.error('❌ [手动保存] 保存失败:', err);
      alert('保存失败: ' + (err instanceof Error ? err.message : String(err)));
      
      // 恢复按钮状态
      const saveButton = document.querySelector('.manual-save-btn') as HTMLButtonElement;
      if (saveButton) {
        saveButton.disabled = false;
        if (saveButton.querySelector('span')) {
          saveButton.querySelector('span')!.textContent = '保存';
        }
      }
    }
  };

  // 智能同步 Hook - 使用 useIntelligentSync 替代原有的同步逻辑
  const getCurrentContent = () => {
    if (!editor || !selectedChapter || !workId) return '';
    return editor.getHTML();
  };

  const updateContent = async (newContent: string) => {
    if (!editor || !selectedChapter || !workId) return;
    
    // 关键修复：如果正在加载章节，不更新内容，避免干扰章节加载
    if (isChapterLoadingRef.current) {
      console.log('⏸️ [智能同步] 章节正在加载中，跳过更新，避免干扰');
      return;
    }
    
    // 关键修复：验证章节ID，确保更新的是当前章节的内容
    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) {
      console.warn('⚠️ [智能同步] 章节ID无效，跳过更新');
      return;
    }
    
    const currentChapterIdCheck = currentChapterIdRef.current;
    if (currentChapterIdCheck !== chapterId) {
      console.warn('⚠️ [智能同步] 章节已切换，跳过更新:', {
        currentChapterIdRef: currentChapterIdCheck,
        expectedChapterId: chapterId,
      });
      return;
    }
    
    // 关键修复：防止频闪 - 检查是否与上次设置的内容相同
    if (lastSetContentRef.current === newContent) {
      // 内容相同，不需要更新，避免频闪
      return;
    }
    
    // 更新编辑器内容（仅在内容真正不同时）
    const currentContent = editor.getHTML();
    
    // 关键修复：更严格的内容比较，避免微小差异导致的频繁更新
    // 去除空白字符后比较，或者使用更智能的比较逻辑
    const normalizeContent = (content: string) => {
      // 移除多余的空白字符，但保留基本结构
      return content.trim().replace(/\s+/g, ' ');
    };
    
    const normalizedCurrent = normalizeContent(currentContent);
    const normalizedNew = normalizeContent(newContent);
    
    if (normalizedCurrent === normalizedNew) {
      // 内容实质相同，不需要更新
      lastSetContentRef.current = newContent; // 更新记录
      return;
    }
    
    // 关键修复：防抖更新，避免频繁设置内容导致频闪
    if (updateContentTimeoutRef.current) {
      clearTimeout(updateContentTimeoutRef.current);
    }
    
    updateContentTimeoutRef.current = setTimeout(() => {
      // 再次验证章节ID（可能在防抖期间切换了）
      const currentChapterIdCheck2 = currentChapterIdRef.current;
      if (currentChapterIdCheck2 !== chapterId) {
        console.warn('⚠️ [智能同步] 章节在更新期间已切换，跳过更新');
        return;
      }
      
      // 再次检查内容是否仍然不同（可能在防抖期间用户已编辑）
      const currentContentCheck = editor.getHTML();
      if (normalizeContent(currentContentCheck) === normalizedNew) {
        // 内容已经相同，不需要更新
        lastSetContentRef.current = newContent;
        return;
      }
      
      // 安全更新编辑器内容
      // 关键修复：从智能同步更新内容时，先清除历史再设置内容
      // 这样可以避免撤销到旧内容
      editor.commands.setContent('<p></p>', { emitUpdate: false });
      setTimeout(() => {
        editor.commands.setContent(newContent, { emitUpdate: false });
      }, 0);
      lastSetContentRef.current = newContent; // 记录已设置的内容
      console.log('✅ [智能同步] 已更新编辑器内容并清除撤销历史，章节ID:', chapterId);
    }, 100); // 100ms 防抖，减少频闪
  };

  // 只在有章节选中时启用智能同步
  const documentId = selectedChapter && workId 
    ? `work_${workId}_chapter_${parseInt(selectedChapter)}`
    : '';

  const {
    performSync,
    forceSync,
    stop: stopSync,
    getStatus: getSyncStatus,
  } = useIntelligentSync(
    documentId,
    getCurrentContent,
    updateContent,
    {
      syncDebounceDelay: 1000,      // 同步防抖延迟 1 秒
      pollInterval: 30000,          // 每 30 秒轮询一次（降低频率，减少请求）
      userInputWindow: 5000,        // 5 秒内有输入视为用户正在编辑
      syncCheckInterval: 5000,      // 每 5 秒检查一次是否需要同步（降低频率）
      enablePolling: true,          // 始终启用轮询（内部会根据 documentId 判断）
      onSyncSuccess: (content, version) => {
        console.log('✅ [智能同步] 同步成功:', { version, contentLength: content.length });
        // 更新同步状态
        setSyncStatus(syncManager.getStatus());
      },
      onSyncError: (error) => {
        console.error('❌ [智能同步] 同步失败:', error);
        setSyncStatus(syncManager.getStatus());
      },
      onCollaborativeUpdate: (hasUpdates) => {
        if (hasUpdates) {
          console.log('👥 [智能同步] 检测到协作更新');
          // 可以在这里显示通知
        }
      },
      onContentChange: (synced) => {
        console.log('📝 [智能同步] 内容变化，已同步:', synced);
        setSyncStatus(syncManager.getStatus());
      },
    }
  );


  // 自动保存章节内容（本地优先策略 + 智能同步）
  useEffect(() => {
    if (!editor || !selectedChapter || !workId) {
      console.log('⚠️ 自动保存未启动:', {
        hasEditor: !!editor,
        selectedChapter,
        workId,
      });
      return;
    }

    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) {
      console.warn('⚠️ 自动保存未启动：章节ID无效', selectedChapter);
      return;
    }

    console.log('✅ 自动保存已启动，章节ID:', chapterId);

    const handleUpdate = () => {
      // 实时更新字数显示
      if (editor) {
        const wordCount = countCharacters(editor.getHTML());
        setCurrentChapterWordCount(wordCount);
      }
      
      // 关键修复：如果正在加载章节，不触发保存，避免干扰章节加载
      if (isChapterLoadingRef.current) {
        console.log('⏸️ [自动保存] 章节正在加载中，跳过保存，避免干扰');
        return;
      }
      
      // 关键修复：在触发保存前，先检查章节是否已经切换
      const currentChapterIdCheck = currentChapterIdRef.current;
      if (currentChapterIdCheck !== chapterId) {
        console.warn('⚠️ [自动保存] 章节已切换，跳过保存:', {
          currentChapterIdRef: currentChapterIdCheck,
          expectedChapterId: chapterId,
        });
        return;
      }
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // 更新全局引用，方便在切换章节时清除
      (window as any).__chapterSaveTimeout = { current: null };

      saveTimeoutRef.current = setTimeout(async () => {
        // 再次检查，确保章节没有切换（双重验证）
        const currentChapterIdCheck2 = currentChapterIdRef.current;
        if (selectedChapter !== String(chapterId) || !workId || currentChapterIdCheck2 !== chapterId) {
          console.warn('⚠️ [自动保存] 跳过：章节已切换或作品ID缺失', {
            currentSelected: selectedChapter,
            expectedChapter: chapterId,
            currentChapterIdRef: currentChapterIdCheck2,
            workId,
          });
          return;
        }

        try {
          // 关键修复：再次验证章节ID，确保保存到正确的章节
          const currentChapterIdCheck = currentChapterIdRef.current;
          if (currentChapterIdCheck !== chapterId) {
            console.warn('⚠️ [自动保存] 章节ID不匹配，跳过保存:', {
              currentChapterIdRef: currentChapterIdCheck,
              expectedChapterId: chapterId,
            });
            return;
          }
          
          // 关键修复：直接使用编辑器中的实际内容，确保保存的是用户当前看到的内容
          // 从编辑器获取最新内容（而不是使用可能过时的变量）
          const editorContent = editor.getHTML();
          // 关键修复：同时获取 JSON 格式，用于更精确的段落级合并
          const editorContentJson = editor.getJSON();
          // 使用 workId 和 chapterId 生成唯一的缓存键
          const documentId = `work_${workId}_chapter_${chapterId}`;
          
          console.log('💾 [自动保存] 开始保存:', {
            workId,
            chapterId,
            documentId,
            contentLength: editorContent.length,
            contentPreview: editorContent.substring(0, 100),
            hasJson: !!editorContentJson,
            currentChapterIdRef: currentChapterIdRef.current, // 验证章节ID
            usingEditorContent: true, // 标记使用的是编辑器内容
          });
          
          // 关键修复：验证内容不为空且确实属于当前章节
          // 注意：即使内容为空（用户删除了所有内容），也应该保存，因为这是用户的意图
          // 但如果是初始空内容，可以跳过
          if (!editorContent || (editorContent.trim() === '<p></p>' && editorContent.length <= 7)) {
            // 检查是否是真正的空内容（只有默认的空段落）
            console.log('ℹ️ [自动保存] 内容为空，但仍保存以反映用户的删除操作');
          }
          
          console.log('💾 [自动保存] 使用编辑器内容:', {
            contentLength: editorContent.length,
            contentPreview: editorContent.substring(0, 100),
            hasJson: !!editorContentJson,
          });
          
          // 1. 立即保存到本地缓存（用户操作即时响应）
          await documentCache.updateDocument(documentId, editorContent, {
            work_id: Number(workId),
            chapter_id: chapterId,
            updated_at: new Date().toISOString(),
          });
          
          // 2. 关键修复：立即同步到服务器，确保数据持久化
          // 使用编辑器中的实际内容，同时提供 JSON 格式用于更精确的合并
          try {
            const syncResult = await documentCache.syncDocumentState(documentId, editorContent, editorContentJson);
            console.log('✅ [自动保存] 已同步到服务器:', {
              documentId,
              contentLength: editorContent.length,
            });
            
            // 如果 sync 接口返回了更新后的作品和章节信息，更新本地状态
            if (syncResult.work || syncResult.chapter) {
              // 如果返回了更新后的作品信息，更新本地状态
              if (syncResult.work) {
                setWork(prevWork => 
                  prevWork ? { ...prevWork, word_count: syncResult.work!.word_count } : null
                );
                
                console.log('✅ [字数统计] 作品总字数已更新（从 sync 接口返回）:', {
                  workId,
                  totalWordCount: syncResult.work.word_count,
                });
              }
              
              // 如果返回了更新后的章节信息，更新本地章节数据
              if (syncResult.chapter) {
                setAllChapters(prevChapters => 
                  prevChapters.map(ch => 
                    ch.id === chapterId ? { ...ch, word_count: syncResult.chapter!.word_count } : ch
                  )
                );
                
                console.log('✅ [字数统计] 章节字数已更新（从 sync 接口返回）:', {
                  chapterId,
                  wordCount: syncResult.chapter.word_count,
                });
              }
            }
          } catch (syncErr) {
            console.warn('⚠️ [自动保存] 同步到服务器失败，但已保存到本地缓存:', syncErr);
          }
          
          // 关键修复：保存后验证内容确实保存到了正确的章节
          const savedDoc = await documentCache.getDocument(documentId);
          if (savedDoc) {
            const savedChapterId = savedDoc.metadata?.chapter_id;
            if (savedChapterId && savedChapterId !== chapterId) {
              console.error('❌ [自动保存] 严重错误：内容被保存到了错误的章节！', {
                savedChapterId,
                expectedChapterId: chapterId,
                documentId,
              });
              // 尝试修复：删除错误的缓存，重新保存
              await localCacheManager.delete(documentId);
              await documentCache.updateDocument(documentId, editorContent, {
                work_id: Number(workId),
                chapter_id: chapterId,
                updated_at: new Date().toISOString(),
              });
              // 重新同步到服务器
              try {
                await documentCache.syncDocumentState(documentId, editorContent);
              } catch (retryErr) {
                console.warn('⚠️ [自动保存] 重试同步失败:', retryErr);
              }
            }
          }
          
          console.log('✅ [自动保存] 已保存到本地缓存和服务器:', documentId);
          
          // 验证保存
          const saved = await localCacheManager.get(documentId);
          if (saved) {
            console.log('✅ [自动保存] 验证成功，缓存中存在');
            // 进一步验证内容是否正确保存
            const savedDoc = saved as any;
            if (savedDoc && savedDoc.content === editorContent) {
              console.log('✅ [自动保存] 内容验证成功，内容匹配');
            } else {
              console.warn('⚠️ [自动保存] 内容验证失败，内容不匹配', {
                savedContentLength: savedDoc?.content?.length || 0,
                expectedContentLength: editorContent.length,
              });
            }
          } else {
            console.error('❌ [自动保存] 验证失败，缓存中不存在');
          }
          
          console.log('✅ [自动保存] 内容已保存并同步到服务器');
          // 字数统计已在 sync 接口中处理，不需要单独更新
        } catch (err) {
          console.error('❌ [自动保存] 保存到本地缓存失败:', err);
        }
      }, 2000); // 2秒后保存到本地
    };

    editor.on('update', handleUpdate);
    console.log('✅ 编辑器 update 事件监听器已注册，章节ID:', chapterId);

    return () => {
      editor.off('update', handleUpdate);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // 清除更新内容的防抖定时器
      if (updateContentTimeoutRef.current) {
        clearTimeout(updateContentTimeoutRef.current);
      }
      // 清除字数统计保存定时器
      if (wordCountSaveTimeoutRef.current) {
        clearTimeout(wordCountSaveTimeoutRef.current);
      }
      // 清除全局引用
      if ((window as any).__chapterSaveTimeout) {
        (window as any).__chapterSaveTimeout.current = null;
      }
      // 停止智能同步
      stopSync();
      console.log('🔄 自动保存监听器已清理，章节ID:', chapterId);
    };
  }, [editor, workId, selectedChapter, stopSync]);

  // 打开章节弹框
  const handleOpenChapterModal = (
    mode: 'create' | 'edit',
    volumeId: string,
    volumeTitle: string,
    chapterData?: ChapterFullData
  ) => {
    console.log('📝 [handleOpenChapterModal] 打开弹窗，传递数据:', {
      mode,
      volumeId,
      volumeTitle,
      hasChapterData: !!chapterData,
      chapterId: chapterData?.id,
      title: chapterData?.title,
      outline: chapterData?.outline,
      detailOutline: chapterData?.detailOutline,
      outlineLength: chapterData?.outline?.length || 0,
      detailOutlineLength: chapterData?.detailOutline?.length || 0,
    });
    setChapterModalMode(mode);
    setCurrentVolumeId(volumeId);
    setCurrentVolumeTitle(volumeTitle);
    setCurrentChapterData(chapterData);
    setIsChapterModalOpen(true);
  };

  // 保存章节/草稿数据
  const handleSaveChapter = async (data: {
    id?: string;
    title: string;
    volumeId: string;
    volumeTitle: string;
    characters: string[];
    locations: string[];
    outline: string;
    detailOutline: string;
  }) => {
    if (!workId) return;

    try {
      // 如果是草稿，只更新本地状态
      // TODO 这里也应该是线上同步的
      if (data.volumeId === 'draft') {
        const chapterId = data.id || `draft-${Date.now()}`;
        setChaptersData(prev => ({
          ...prev,
          [chapterId]: {
            ...data,
            id: chapterId,
          },
        }));
        
        setDrafts(prev => {
          const existingIndex = prev.findIndex(d => d.id === chapterId);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = {
              id: chapterId,
              title: data.title,
              volumeId: data.volumeId,
              volumeTitle: data.volumeTitle,
              characters: data.characters,
              locations: data.locations,
              outline: data.outline,
              detailOutline: data.detailOutline,
            };
            return updated;
          } else {
            return [...prev, {
              id: chapterId,
              title: data.title,
              volumeId: data.volumeId,
              volumeTitle: data.volumeTitle,
              characters: data.characters,
              locations: data.locations,
              outline: data.outline,
              detailOutline: data.detailOutline,
            }];
          }
        });
        return;
      }

      // 如果是编辑现有章节
      if (data.id && !isNaN(parseInt(data.id))) {
        
        // 更新本地状态
        setChaptersData(prev => ({
          ...prev,
          [data.id!]: {
            ...data,
            id: data.id!,
          },
        }));

        // 更新 volumes 中的章节信息
        setVolumes(prev => prev.map(vol => {
          if (vol.id === data.volumeId) {
            return {
              ...vol,
              chapters: vol.chapters.map(chap =>
                chap.id === data.id ? { 
                  ...chap, 
                  title: data.title,
                  outline: data.outline || '',
                  detailOutline: data.detailOutline || '',
                } : chap
              ),
            };
          }
          return vol;
        }));
      } else {
        // 创建新章节
        // 短篇作品强制使用 volume_number = 0（未分卷）
        let volNum = data.volumeId === 'draft' ? 0 : parseInt(data.volumeId.replace('vol', '')) || 0;
        if (work?.work_type === 'short') {
          volNum = 0; // 短篇强制未分卷
        }
        
        // 计算章节号
        let maxChapterNumber = 0;
        if (work?.work_type === 'short') {
          // 短篇作品：计算所有章节的最大章节号（不考虑卷号）
          maxChapterNumber = allChapters.length > 0
            ? Math.max(...allChapters.map(c => c.chapter_number || 0))
            : 0;
        } else {
          // 长篇作品：计算该卷的最大章节号
        const volumeChapters = allChapters.filter(c => (c.volume_number || 0) === volNum);
          maxChapterNumber = volumeChapters.length > 0
          ? Math.max(...volumeChapters.map(c => c.chapter_number || 0))
          : 0;
        }
        
        const newChapter = await chaptersApi.createChapter({
          work_id: Number(workId),
          title: data.title,
          chapter_number: maxChapterNumber + 1,
          // 短篇作品：volume_number 设为 0 或 undefined（后端会处理）
          // 长篇作品：如果 volNum > 0 则设置，否则为 undefined
          volume_number: work?.work_type === 'short' ? 0 : (volNum > 0 ? volNum : undefined),
        });

        const chapterId = String(newChapter.id);
        const newChapterNumber = maxChapterNumber + 1;
        
        // 如果创建章节时有大纲或细纲，立即更新保存
        if (data.outline || data.detailOutline) {
          await chaptersApi.updateChapter(newChapter.id, {
            chapter_metadata: {
              outline: data.outline || '',
              detailed_outline: data.detailOutline || '',
            },
          });
        }
        
        // 更新 allChapters，添加新创建的章节
        setAllChapters(prev => [...prev, {
          ...newChapter,
          chapter_number: newChapterNumber,
        }]);
        
        setChaptersData(prev => ({
          ...prev,
          [chapterId]: {
            ...data,
            id: chapterId,
            chapter_number: newChapterNumber,  // 保存章节号
          },
        }));

        // 更新 volumes
        setVolumes(prev => prev.map(vol => {
          if (vol.id === data.volumeId) {
            return {
              ...vol,
              chapters: [...vol.chapters, {
                id: chapterId,
                volumeId: data.volumeId,
                title: data.title,
                chapter_number: newChapterNumber,  // 保存章节号
                characters: data.characters,
                locations: data.locations,
                outline: data.outline,
                detailOutline: data.detailOutline,
              }],
            };
          }
          return vol;
        }));
      }
    } catch (err) {
      console.error('保存章节失败:', err);
      alert(err instanceof Error ? err.message : '保存章节失败');
    }
  };

  // 删除章节
  // 分析章节（生成大纲和细纲）
  const handleAnalyzeChapter = async (chapterId: string) => {
    if (!workId) {
      alert('没有选择作品');
      return;
    }

    // 检查章节ID是否为数字（真实章节），草稿章节不能分析
    const chapterIdNum = parseInt(chapterId);
    if (isNaN(chapterIdNum)) {
      alert('草稿章节无法分析，请先保存为正式章节');
      return;
    }

    try {
      console.log(`开始分析章节 ${chapterId}...`);
      
      // 调用分析API
      const result = await analyzeChapter(
        Number(workId),
        chapterIdNum,
        (progress) => {
          console.log('分析进度:', progress);
        }
      );

      console.log('分析结果:', result);

      // 将结果保存到章节的 metadata 中
      const updateData: any = {
        chapter_metadata: {
          outline: result.outline,
          detailed_outline: result.detailed_outline,
        }
      };

      // 如果 outline 是对象，转换为字符串格式
      if (result.outline && typeof result.outline === 'object') {
        const outlineObj = result.outline as any;
        const parts: string[] = [];
        if (outlineObj.core_function) {
          parts.push(`核心功能：${outlineObj.core_function}`);
        }
        if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
          parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
        }
        if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
          parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
        }
        if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
          parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
        }
        if (outlineObj.hook) {
          parts.push(`结尾钩子：${outlineObj.hook}`);
        }
        updateData.chapter_metadata.outline = parts.join('\n\n');
      }

      // 如果 detailed_outline 是对象，转换为字符串格式
      if (result.detailed_outline && typeof result.detailed_outline === 'object') {
        const detailedObj = result.detailed_outline as any;
        if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
          updateData.chapter_metadata.detailed_outline = detailedObj.sections.map((section: any) => {
            const sectionNum = section.section_number || '';
            const sectionTitle = section.title || '';
            const sectionContent = section.content || '';
            return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
          }).join('\n\n');
        } else {
          updateData.chapter_metadata.detailed_outline = JSON.stringify(detailedObj, null, 2);
        }
      }

      // 更新章节
      await chaptersApi.updateChapter(chapterIdNum, updateData);

      // 更新本地状态
      const chapterData = chaptersData[chapterId];
      if (chapterData) {
        setChaptersData({
          ...chaptersData,
          [chapterId]: {
            ...chapterData,
            outline: updateData.chapter_metadata?.outline || chapterData.outline || '',
            detailOutline: updateData.chapter_metadata.detailed_outline || '',
          }
        });
      }

      alert('章节分析完成！大纲和细纲已保存到章节信息中。');
    } catch (error) {
      console.error('分析章节失败:', error);
      alert(error instanceof Error ? error.message : '分析章节失败');
      throw error;
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!workId) return;

    try {
      // 如果是草稿，只从本地状态删除
      if (chapterId.startsWith('draft-')) {
        setDrafts(prev => prev.filter(d => d.id !== chapterId));
        setChaptersData(prev => {
          const newData = { ...prev };
          delete newData[chapterId];
          return newData;
        });
        // 如果删除的是当前选中的章节，清除选中状态
        if (selectedChapter === chapterId) {
          setSelectedChapter(null);
        }
        return;
      }

      // 如果是真实章节，调用API删除
      const chapterIdNum = parseInt(chapterId);
      if (isNaN(chapterIdNum)) {
        console.error('无效的章节ID:', chapterId);
        return;
      }

      await chaptersApi.deleteChapter(chapterIdNum);

      // 从 allChapters 中删除
      setAllChapters(prev => prev.filter(c => c.id !== chapterIdNum));

      // 从 chaptersData 中删除
      setChaptersData(prev => {
        const newData = { ...prev };
        delete newData[chapterId];
        return newData;
      });

      // 从 volumes 中删除
      setVolumes(prev => prev.map(vol => ({
        ...vol,
        chapters: vol.chapters.filter(c => c.id !== chapterId),
      })));

      // 如果删除的是当前选中的章节，清除选中状态
      if (selectedChapter === chapterId) {
        setSelectedChapter(null);
      }
    } catch (err) {
      console.error('删除章节失败:', err);
      alert(err instanceof Error ? err.message : '删除章节失败');
    }
  };

  // 获取当前章节/草稿标题
  const getCurrentChapterTitle = () => {
    if (!selectedChapter) return '';
    const data = chaptersData[selectedChapter];
    if (data) {
      // 如果是草稿，只显示标题
      if (data.volumeId === 'draft') {
        return data.title;
      }
      // 构建标题：卷名 + 章节号 + 标题
      let titleParts: string[] = [];
      
      // 添加卷名（如果有）
      if (data.volumeTitle && data.volumeTitle !== '未分卷') {
        titleParts.push(data.volumeTitle);
      }
      
      // 添加章节号（如果有）
      if (data.chapter_number !== undefined && data.chapter_number !== null) {
        titleParts.push(`第${data.chapter_number}章`);
      }
      
      // 添加章节标题
      titleParts.push(data.title);
      
      return titleParts.join(' · ');
    }
    // 从 ID 生成默认标题
    const parts = selectedChapter.split('-');
    if (parts.length >= 2) {
      if (parts[0] === 'draft') {
        return parts[1] || selectedChapter;
      }
      const volNum = parts[0].replace('vol', '');
      const chapNum = parts[1].replace('chap', '');
      return `第${volNum}卷 · 第${chapNum}章`;
    }
    return selectedChapter;
  };

  // 打开当前章节/草稿的编辑弹框
  const handleEditCurrentChapter = async () => {
    if (!selectedChapter) return;
    
    // 先从 chaptersData 获取数据
    let data = chaptersData[selectedChapter];
    
    
    // 如果是真实章节（不是草稿），尝试从服务器 API 获取最新的大纲和细纲
    const condition1 = !!data;
    const condition2 = !data?.id?.startsWith('draft-');
    const condition3 = !isNaN(parseInt(selectedChapter));
    const allConditions = condition1 && condition2 && condition3;
    
    if (allConditions) {
      const chapterId = parseInt(selectedChapter);
      const needsOutline = !data.outline || data.outline.trim().length === 0;
      const needsDetailOutline = !data.detailOutline || data.detailOutline.trim().length === 0;
      
      // 只有当 chaptersData 中没有大纲和细纲时，才从服务器获取
      // 避免频繁请求，优先使用已缓存的数据
      if (needsOutline || needsDetailOutline) {

          
          // 直接从服务器 API 获取最新的大纲和细纲
          const docResult = await chaptersApi.getChapterDocument(chapterId);

          if (docResult?.chapter_info?.metadata) {
            // 解析 outline（可能是对象格式）
            let outline = data.outline || '';
            if (needsOutline && docResult.chapter_info.metadata.outline) {
              const outlineObj = docResult.chapter_info.metadata.outline as any;
              if (typeof outlineObj === 'object' && outlineObj !== null) {
                // 格式化大纲对象为可读字符串
                const parts: string[] = [];
                if (outlineObj.core_function) {
                  parts.push(`核心功能：${outlineObj.core_function}`);
                }
                if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
                  parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
                }
                if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
                  parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
                }
                if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
                  parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
                }
                if (outlineObj.hook) {
                  parts.push(`结尾钩子：${outlineObj.hook}`);
                }
                outline = parts.join('\n\n');
              } else if (typeof outlineObj === 'string') {
                outline = outlineObj;
              }
            }
            
            // 解析 detailed_outline（可能是对象格式）
            let detailedOutline = data.detailOutline || '';
            if (needsDetailOutline && docResult.chapter_info.metadata.detailed_outline) {
              const detailedObj = docResult.chapter_info.metadata.detailed_outline as any;
              if (typeof detailedObj === 'object' && detailedObj !== null) {
                // 格式化细纲对象为可读字符串
                if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
                  detailedOutline = detailedObj.sections.map((section: any) => {
                    const sectionNum = section.section_number || '';
                    const sectionTitle = section.title || '';
                    const sectionContent = section.content || '';
                    return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
                  }).join('\n\n');
                } else {
                  detailedOutline = JSON.stringify(detailedObj, null, 2);
                }
              } else if (typeof detailedObj === 'string') {
                detailedOutline = detailedObj;
              }
            }
            
            // 更新数据，包含从服务器获取的大纲和细纲
            data = {
              ...data,
              outline: outline || data.outline || '',
              detailOutline: detailedOutline || data.detailOutline || '',
            };
            
          } else {
            console.warn('⚠️ [handleEditCurrentChapter] 服务器文档没有 metadata');
          }
    }
    
    if (data) {
      handleOpenChapterModal('edit', data.volumeId, data.volumeTitle, data);
    } else {
      // 如果没有数据，从 ID 推断
      const parts = selectedChapter.split('-');
      const volumeId = parts[0];
      
      // 如果是草稿
      if (volumeId === 'draft') {
        handleOpenChapterModal('edit', 'draft', '草稿箱', {
          id: selectedChapter,
          volumeId: 'draft',
          volumeTitle: '草稿箱',
          title: parts[1] ? `草稿 ${parts[1].replace('draft', '')}` : '草稿',
          characters: [],
          locations: [],
          outline: '',
          detailOutline: '',
        });
        return;
      }
      
      // 如果是章节
      const volNum = volumeId.replace('vol', '');
      const chapNum = parts[1]?.replace('chap', '') || '1';
      const volumeTitle = `第${['一', '二', '三', '四', '五'][parseInt(volNum) - 1] || volNum}卷`;
      handleOpenChapterModal('edit', volumeId, volumeTitle, {
        id: selectedChapter,
        volumeId,
        volumeTitle,
        title: `第${chapNum}章`,
        characters: [],
        locations: [],
        outline: '',
        detailOutline: '',
      });
    }
  };

  if (loading) {
    return (
      <div className="novel-editor-page">
        <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>
      </div>
    );
  }

  if (error || !work) {
    return (
      <div className="novel-editor-page">
        <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
          {error || '作品不存在'}
          <button onClick={() => navigate('/works')} style={{ marginTop: '16px', padding: '8px 16px' }}>
            返回作品列表
          </button>
        </div>
      </div>
    );
  }
}
  return (
    <div className="novel-editor-page">
      {/* 顶部工具栏 */}
      <header className="novel-editor-header">
        <div className="header-left">
          <button className="exit-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>退出</span>
          </button>
          <div className="work-info">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="work-title-input"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={handleTitleKeyDown}
                placeholder="请输入作品标题"
              />
            ) : (
              <h1 
                className="work-title"
                onClick={() => setIsEditingTitle(true)}
                title="点击编辑标题"
              >
                {work?.title || ''}
              </h1>
            )}
            <div className="work-tags">
              {work?.work_type && (
                <span className="tag">
                  {work.work_type === 'long' ? '长篇' : work.work_type === 'short' ? '短篇' : work.work_type}
                </span>
              )}
              {work?.category && <span className="tag">{work.category}</span>}
              {work?.genre && <span className="tag">{work.genre}</span>}
              <span className={`status-tag ${syncStatus.isOnline ? 'online' : 'offline'}`}>
                {syncStatus.isOnline 
                  ? (syncStatus.pendingCount > 0 
                      ? `同步中 (${syncStatus.pendingCount})` 
                      : '已同步')
                  : '离线模式'}
              </span>
            </div>
          </div>
        </div>
        <div className="header-center">
          <div className="word-count">
            <span>本章字数: {currentChapterWordCount}</span>
            <span>总字数: {work?.word_count || 0}</span>
            <Info size={14} />
          </div>
        </div>
        <div className="header-right">
          <div className="header-actions">
            <ThemeSelector />
            <button 
              className="action-btn analyze-work-btn" 
              onClick={handleAnalyzeWork}
              disabled={isAnalyzing || !workId}
              title="分析本书的所有章节"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  <span>分析中...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>分析本书</span>
                </>
              )}
            </button>
            <button 
              className="action-btn delete-work-btn" 
              onClick={handleDeleteWork}
              title="删除作品"
            >
              <Trash2 size={16} />
              <span>删除</span>
            </button>
            <button className="action-btn">替换</button>
            <button className="action-btn">回收站</button>
            <button className="action-btn">分享</button>
          </div>
          <div className="coin-section">
            <div className="coin-display">
              <Coins size={16} />
              <span>494+</span>
            </div>
            <button className="member-btn">开会员得蛙币</button>
          </div>
        </div>
        {/* 分析进度已移除，改为后台运行，不显示弹窗 */}
      </header>

      <div className="novel-editor-body">
        {/* 左侧边栏 */}
        <SideNav
          activeNav={activeNav}
          onNavChange={setActiveNav}
          selectedChapter={selectedChapter}
          onChapterSelect={(chapterId) => {
            setSelectedChapter(chapterId);
            // 选择章节时，清除 activeNav，让编辑器显示
            setActiveNav('work-info');
          }}
          onOpenChapterModal={handleOpenChapterModal}
          onChapterDelete={handleDeleteChapter}
          onChapterAnalyze={handleAnalyzeChapter}
          drafts={drafts}
          onDraftsChange={setDrafts}
          volumes={volumes}
          onVolumesChange={setVolumes}
          workType={work?.work_type}
          workId={workId}
        />

        {/* 主编辑区 */}
        <div className="novel-editor-main">

          {/* 根据导航项显示不同内容 */}
          {activeNav === 'work-info' && selectedChapter === null && <WorkInfoManager workId={workId} />}
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'outline' && <ChapterOutline />}
          {activeNav === 'map' && <MapView />}
          {activeNav === 'characters' && <Characters availableCharacters={availableCharacters} />}
          {activeNav === 'factions' && <Factions />}
          {activeNav === 'settings' && (
            <div className="placeholder-content">
              <h2>设置</h2>
              <p>功能开发中...</p>
            </div>
          )}
          {/* 文本编辑器（当选择了章节时显示） */}
          {selectedChapter !== null && !['tags', 'outline', 'map', 'characters', 'settings', 'factions'].includes(activeNav) && (
            <div className="chapter-editor-container">
              {/* 标题和工具栏合并在一起 */}
              <div className="chapter-header-toolbar">
                {/* 左侧工具栏 */}
                <div className="novel-editor-toolbar">
                  <div className="toolbar-group">
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().undo().run()}
                      disabled={!editor?.can().undo()}
                      title="撤销"
                    >
                      <Undo2 size={16} />
                    </button>
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().redo().run()}
                      disabled={!editor?.can().redo()}
                      title="重做"
                    >
                      <Redo2 size={16} />
                    </button>
                  </div>
                  <div className="toolbar-divider" />
                  <div className="toolbar-group">
                    <button
                      className="toolbar-btn manual-save-btn"
                      onClick={handleManualSave}
                      title="手动保存当前章节内容"
                    >
                      <Save size={16} />
                      <span>保存</span>
                    </button>
                  </div>
                  <div className="toolbar-divider" />
                  <div className="toolbar-group">
                    {/* 标题下拉菜单 */}
                    <div className="toolbar-dropdown" ref={headingMenuRef}>
                    <button
                      className="toolbar-btn"
                        onClick={() => setHeadingMenuOpen(!headingMenuOpen)}
                        title="标题样式"
                    >
                      <Type size={16} />
                        <span>标题</span>
                        <ChevronDown size={14} style={{ marginLeft: '4px' }} />
                    </button>
                      {headingMenuOpen && (
                        <div className="toolbar-dropdown-menu">
                          <button
                            className="toolbar-dropdown-item"
                            onClick={() => {
                              editor?.chain().focus().toggleHeading({ level: 1 }).run();
                              setHeadingMenuOpen(false);
                            }}
                            title="一级标题 (Markdown: # 标题)"
                          >
                            <span className="heading-label">H1</span>
                            <span className="heading-preview">一级标题</span>
                          </button>
                          <button
                            className="toolbar-dropdown-item"
                            onClick={() => {
                              editor?.chain().focus().toggleHeading({ level: 2 }).run();
                              setHeadingMenuOpen(false);
                            }}
                            title="二级标题 (Markdown: ## 标题)"
                          >
                            <span className="heading-label">H2</span>
                            <span className="heading-preview">二级标题</span>
                          </button>
                          <button
                            className="toolbar-dropdown-item"
                            onClick={() => {
                              editor?.chain().focus().toggleHeading({ level: 3 }).run();
                              setHeadingMenuOpen(false);
                            }}
                            title="三级标题 (Markdown: ### 标题)"
                          >
                            <span className="heading-label">H3</span>
                            <span className="heading-preview">三级标题</span>
                          </button>
                          <button
                            className="toolbar-dropdown-item"
                            onClick={() => {
                              editor?.chain().focus().toggleHeading({ level: 4 }).run();
                              setHeadingMenuOpen(false);
                            }}
                            title="四级标题 (Markdown: #### 标题)"
                          >
                            <span className="heading-label">H4</span>
                            <span className="heading-preview">四级标题</span>
                          </button>
                          <button
                            className="toolbar-dropdown-item"
                            onClick={() => {
                              editor?.chain().focus().toggleHeading({ level: 5 }).run();
                              setHeadingMenuOpen(false);
                            }}
                            title="五级标题 (Markdown: ##### 标题)"
                          >
                            <span className="heading-label">H5</span>
                            <span className="heading-preview">五级标题</span>
                          </button>
                          <button
                            className="toolbar-dropdown-item"
                            onClick={() => {
                              editor?.chain().focus().toggleHeading({ level: 6 }).run();
                              setHeadingMenuOpen(false);
                            }}
                            title="六级标题 (Markdown: ###### 标题)"
                          >
                            <span className="heading-label">H6</span>
                            <span className="heading-preview">六级标题</span>
                          </button>
                          <div className="toolbar-dropdown-divider" />
                          <button
                            className="toolbar-dropdown-item"
                            onClick={() => {
                              editor?.chain().focus().setParagraph().run();
                              setHeadingMenuOpen(false);
                            }}
                            title="普通段落"
                          >
                            <span className="heading-label">P</span>
                            <span className="heading-preview">普通段落</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().toggleBold().run()}
                      title="粗体 (Markdown: **文本**)"
                    >
                      <Bold size={16} />
                    </button>
                    <button
                      className="toolbar-btn"
                      onClick={() => editor?.chain().focus().toggleUnderline().run()}
                      title="下划线"
                    >
                      <Underline size={16} />
                    </button>
                  </div>
                </div>
                
                {/* 中间标题 */}
                <div className="chapter-title-center">
                  <h2 className="chapter-title-centered">{getCurrentChapterTitle()}</h2>
                </div>
                
                {/* 右侧设置栏 */}
                <div className="editor-settings">
                  <button 
                    className="chapter-settings-btn"
                    onClick={handleEditCurrentChapter}
                    title="章节设置"
                  >
                    <Settings size={18} />
                  </button>
                  {/* <div className="setting-item">
                    <span>智能补全</span>
                    <button
                      className="toggle-btn"
                      onClick={() => setSmartCompletion(!smartCompletion)}
                      title={smartCompletion ? '关闭智能补全' : '开启智能补全'}
                      data-active={smartCompletion}
                      aria-label={smartCompletion ? '关闭智能补全' : '开启智能补全'}
                      role="switch"
                      aria-checked={smartCompletion}
                    />
                  </div> */}
                </div>
              </div>
              {/* 文本编辑区域 */}
              <div className="novel-editor-wrapper">
                <EditorContent editor={editor} />
                {/* 章节加载弹窗 */}
                {chapterLoading && (
                  <div className="chapter-loading-overlay">
                    <div className="chapter-loading-spinner">
                      <div className="spinner-ring"></div>
                      <p style={{ marginTop: '16px', color: 'var(--text-primary)' }}>
                        正在切换章节...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右侧边栏 */}
        <AIAssistant />
      </div>

      {/* 章节设置弹框 */}
      <ChapterSettingsModal
        isOpen={isChapterModalOpen}
        mode={chapterModalMode}
        volumeId={currentVolumeId}
        volumeTitle={currentVolumeTitle}
        initialData={currentChapterData}
        availableCharacters={hasCharacterModule ? availableCharacters : []}
        availableLocations={hasLocationModule ? availableLocations : []}
        onClose={() => setIsChapterModalOpen(false)}
        onSave={handleSaveChapter}
        onGenerateContent={async (content: string) => {
          // 将生成的内容填充到编辑器中
          if (editor) {
            // 将纯文本转换为HTML格式
            const htmlContent = content
              .split('\n\n')
              .map(para => para.trim())
              .filter(para => para.length > 0)
              .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
              .join('');
            
            editor.commands.setContent(htmlContent || '<p></p>');
            console.log('✅ 章节内容已填充到编辑器');
          } else {
            console.warn('编辑器未初始化，无法填充内容');
          }
        }}
      />
    </div>
  );
}

