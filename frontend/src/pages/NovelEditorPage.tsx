import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Coins, Settings, Undo2, Redo2, Type, Bold, Underline, ToggleLeft, ToggleRight, ChevronDown, Trash2, Sparkles, Loader2 } from 'lucide-react';
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
import { charactersApi, type Character } from '../utils/charactersApi';
import { sharedbClient } from '../utils/sharedbClient';
import { syncManager } from '../utils/syncManager';
import { localCacheManager } from '../utils/localCacheManager';
import { useIntelligentSync } from '../utils/intelligentSync';
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

export default function NovelEditorPage() {
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

  // 从WorkInfoManager缓存中提取角色数据
  // 关键修复：使用 useRef 存储上一次的结果，避免重复计算
  const lastCharacterCacheRef = useRef<string>('');
  const lastAllChaptersRef = useRef<Chapter[]>([]);
  
  useEffect(() => {
    if (!workId) {
      setHasCharacterModule(false);
      setAvailableCharacters([]);
      return;
    }

    const loadCharactersFromAPI = async () => {
      try {
        const response = await charactersApi.listCharacters(Number(workId));
        const characters = response.characters || [];
        
        // 转换为前端需要的格式
        const formattedCharacters = characters.map((char: Character) => ({
          id: String(char.id),
          name: char.name || '',
          avatar: char.avatar_url || undefined,
          gender: char.gender || undefined,
          description: char.description || '',
          type: char.is_main_character ? '主要角色' : '次要角色',
          source: 'api',
        }));
        
        setAvailableCharacters(formattedCharacters);
        setHasCharacterModule(formattedCharacters.length > 0);
        
        console.log('📋 从API获取角色列表:', {
          total: formattedCharacters.length,
          characters: formattedCharacters,
        });
      } catch (err) {
        console.error('从API加载角色数据失败:', err);
        setHasCharacterModule(false);
        setAvailableCharacters([]);
      }
    };

    loadCharactersFromAPI();
  }, [workId]);

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

  // 分析本书
  const handleAnalyzeWork = async () => {
    if (!workId || !allChapters || allChapters.length === 0) {
      alert('没有可分析的章节');
      return;
    }
    
    const confirmed = window.confirm(`确定要分析作品《${work?.title}》的所有章节吗？这将使用AI分析所有章节内容。`);
    if (!confirmed) return;
    
    setIsAnalyzing(true);
    setAnalysisProgress('准备分析...');
    
    try {
      // 收集所有章节的内容
      const chaptersContent: string[] = [];
      for (const chapter of allChapters) {
        try {
          // 从 ShareDB 获取章节内容
          const documentId = `work_${workId}_chapter_${chapter.id}`;
          const doc = await sharedbClient.getDocument(documentId);
          if (doc && doc.content) {
            const content = typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content);
            chaptersContent.push(content);
          } else {
            // 如果 ShareDB 没有，尝试从章节 API 获取
            const chapterData = await chaptersApi.getChapter(chapter.id);
            if (chapterData.content) {
              chaptersContent.push(chapterData.content);
            }
          }
        } catch (err) {
          console.warn(`获取章节 ${chapter.id} 内容失败:`, err);
        }
      }
      
      if (chaptersContent.length === 0) {
        alert('没有找到可分析的章节内容');
        setIsAnalyzing(false);
        return;
      }
      
      // 合并所有章节内容（用分隔符分开）
      const combinedContent = chaptersContent.join('\n\n---章节分隔符---\n\n');
      
      setAnalysisProgress(`开始分析 ${chaptersContent.length} 个章节...`);
      
      // 调用渐进式分析接口
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
      const token = localStorage.getItem('access_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(
        `${API_BASE_URL}/api/v1/ai/analyze-chapters-incremental?work_id=${workId}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content: combinedContent,
            settings: {},
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error(`分析失败: ${response.status} ${response.statusText}`);
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
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
              if (data.type === 'chunk' && data.content) {
                setAnalysisProgress(data.content.substring(0, 100));
              } else if (data.type === 'chapter_inserted') {
                setAnalysisProgress(`第 ${data.chapter_index + 1} 章分析完成并已插入作品`);
              } else if (data.type === 'all_chapters_complete') {
                setAnalysisProgress('所有章节分析完成！');
                setTimeout(() => {
                  setIsAnalyzing(false);
                  setAnalysisProgress('');
                  alert('分析完成！角色、地点和章节信息已更新。');
                  // 重新加载作品数据
                  window.location.reload();
                }, 1000);
              } else if (data.type === 'error' || data.type === 'chapter_insert_error') {
                console.error('分析错误:', data.message);
                setAnalysisProgress(`错误: ${data.message}`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (err) {
      console.error('分析失败:', err);
      alert(err instanceof Error ? err.message : '分析失败');
      setIsAnalyzing(false);
      setAnalysisProgress('');
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
    if (!isNaN(chapterId) && currentChapterIdRef.current !== chapterId) {
      lastSetContentRef.current = ''; // 清除记录，允许新章节设置内容
    }
    if (isNaN(chapterId)) {
      // 如果是草稿或其他非数字ID，不加载
      editor.commands.setContent('<p></p>');
      currentChapterIdRef.current = null;
      return;
    }

    const loadChapterContent = async () => {
      // 显示加载动画
      setChapterLoading(true);
      
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
            // 立即保存前一个章节的内容，使用同步方式确保保存完成
            await sharedbClient.updateDocument(previousDocumentId, currentContent, {
              work_id: Number(workId),
              chapter_id: previousChapterId,
              updated_at: new Date().toISOString(),
            });
            
            // 验证保存是否成功
            const savedDoc = await sharedbClient.getDocument(previousDocumentId);
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
      editor.commands.setContent('<p></p>');
      
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
        
        console.log('📖 加载章节内容:', {
          workId,
          chapterId,
          documentId,
        });
        
        let content: string | null = null;
        
        // 1. 先从本地缓存获取（即时响应）- 优先新格式，兼容旧格式
        try {
          // 关键修复：确保使用正确的文档ID，避免缓存键冲突
          console.log('🔍 [缓存检查] 开始获取缓存，文档ID:', {
            documentId,
            chapterId,
            workId,
          });
          
          // 先尝试新格式
          let cachedDoc = await sharedbClient.getDocument(documentId);
          
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
          } else {
            console.log('❌ 缓存中没有找到文档（新格式和旧格式都未找到）');
          }
        } catch (cacheErr) {
          console.warn('⚠️ 从缓存加载失败，将从服务器获取:', cacheErr);
        }
        
        // 2. 如果缓存中没有内容，从服务器获取
        if (!content) {
          console.log('🌐 缓存中没有内容，从服务器获取...');
          
          // 优先从 ShareDB 文档 API 获取（因为内容存储在 ShareDB 中）
          try {
            const docResult = await chaptersApi.getChapterDocument(chapterId);
            console.log('📥 从 ShareDB 文档 API 获取:', {
              hasContent: !!docResult.content,
              contentType: typeof docResult.content,
              contentKeys: docResult.content && typeof docResult.content === 'object' 
                ? Object.keys(docResult.content) 
                : 'not object',
            });
            
            // 打印完整的文档对象用于调试
            console.log('📦 ShareDB 完整文档对象:', JSON.stringify(docResult, null, 2));
            
            if (docResult.content) {
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
                console.log('✅ 获取到字符串内容，长度:', content.length);
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
              
              // 如果成功获取内容，保存到缓存
              if (content) {
                if (!workId) {
                  console.error('❌ [缓存] workId 不存在，无法保存到缓存');
                  return;
                }
                const cacheKey = `work_${workId}_chapter_${chapterId}`;
                
                console.log('💾 保存到缓存:', {
                  cacheKey,
                  contentLength: content.length,
                });
                
                sharedbClient.updateDocument(cacheKey, content, {
                  work_id: docResult.chapter_info.work_id,
                  chapter_id: docResult.chapter_info.id,
                  chapter_number: docResult.chapter_info.chapter_number,
                }).then(() => {
                  console.log('✅ 已保存到缓存:', cacheKey);
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
                
                sharedbClient.updateDocument(cacheKey, chapter.content, {
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
          if (lastSetContentRef.current !== content) {
            editor.commands.setContent(content || '<p></p>');
            lastSetContentRef.current = content || '<p></p>'; // 记录已设置的内容
            
            // 验证设置后的内容
            const setContent = editor.getHTML();
            if (setContent === (content || '<p></p>')) {
              console.log('✅ [设置编辑器] 内容已正确设置，长度:', setContent.length);
            } else {
              console.warn('⚠️ [设置编辑器] 内容设置后不匹配，可能存在缓存问题');
            }
          } else {
            console.log('✅ [设置编辑器] 内容与上次设置相同，跳过更新，避免频闪');
          }
        } else {
          // 如果 content 是 null（获取失败），设置空编辑器
          console.warn('⚠️ 内容获取失败，设置空编辑器');
          editor.commands.setContent('<p></p>');
        }
        
        // 在内容加载完成后，更新 currentChapterIdRef
        // 这样下次切换章节时能正确保存当前章节
        currentChapterIdRef.current = chapterId;
        
        console.log('✅ [章节加载完成] currentChapterIdRef 已更新为:', chapterId);

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
            const serverDoc = await sharedbClient.forcePullFromServer(documentId);
            
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
                editor.commands.setContent(serverContent);
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
      } catch (innerErr) {
        console.error('加载章节内容失败:', innerErr);
        // 即使所有方法都失败，也显示空内容，保证编辑器可用
        editor.commands.setContent('<p></p>');
        // 隐藏加载动画
        setChapterLoading(false);
      }
      } catch (err) {
        console.error('加载章节内容失败（外层）:', err);
        // 即使所有方法都失败，也显示空内容，保证编辑器可用
        editor.commands.setContent('<p></p>');
        // 隐藏加载动画
        setChapterLoading(false);
      }
    };

    loadChapterContent();
  }, [selectedChapter, editor]);

  // 手动保存函数（用于调试和手动触发）
  // 智能同步 Hook - 使用 useIntelligentSync 替代原有的同步逻辑
  // 注意：这个 Hook 需要在 handleManualSave 之前定义，以便在手动保存时使用
  const getCurrentContent = () => {
    if (!editor || !selectedChapter || !workId) return '';
    return editor.getHTML();
  };

  const updateContent = async (newContent: string) => {
    if (!editor || !selectedChapter || !workId) return;
    
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
      editor.commands.setContent(newContent);
      lastSetContentRef.current = newContent; // 记录已设置的内容
      console.log('✅ [智能同步] 已更新编辑器内容，章节ID:', chapterId);
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
      pollInterval: 10000,          // 每 10 秒轮询一次
      userInputWindow: 5000,        // 5 秒内有输入视为用户正在编辑
      syncCheckInterval: 3000,      // 每 3 秒检查一次是否需要同步
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
          
          const content = editor.getHTML();
          // 使用 workId 和 chapterId 生成唯一的缓存键
          const documentId = `work_${workId}_chapter_${chapterId}`;
          
          console.log('💾 [自动保存] 开始保存:', {
            workId,
            chapterId,
            documentId,
            contentLength: content.length,
            contentPreview: content.substring(0, 100),
            currentChapterIdRef: currentChapterIdRef.current, // 验证章节ID
          });
          
          // 关键修复：验证内容不为空且确实属于当前章节
          if (!content || content.trim() === '<p></p>' || content.trim() === '') {
            console.warn('⚠️ [自动保存] 内容为空，跳过保存');
            return;
          }
          
          // 1. 立即保存到本地缓存（用户操作即时响应）
          await sharedbClient.updateDocument(documentId, content, {
            work_id: Number(workId),
            chapter_id: chapterId,
            updated_at: new Date().toISOString(),
          });
          
          // 关键修复：保存后验证内容确实保存到了正确的章节
          const savedDoc = await sharedbClient.getDocument(documentId);
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
              await sharedbClient.updateDocument(documentId, content, {
                work_id: Number(workId),
                chapter_id: chapterId,
                updated_at: new Date().toISOString(),
              });
            }
          }
          
          console.log('✅ [自动保存] 已保存到本地缓存:', documentId);
          
          // 验证保存
          const saved = await localCacheManager.get(documentId);
          if (saved) {
            console.log('✅ [自动保存] 验证成功，缓存中存在');
            // 进一步验证内容是否正确保存
            const savedDoc = saved as any;
            if (savedDoc && savedDoc.content === content) {
              console.log('✅ [自动保存] 内容验证成功，内容匹配');
            } else {
              console.warn('⚠️ [自动保存] 内容验证失败，内容不匹配', {
                savedContentLength: savedDoc?.content?.length || 0,
                expectedContentLength: content.length,
              });
            }
          } else {
            console.error('❌ [自动保存] 验证失败，缓存中不存在');
          }
          
          // 2. 使用智能同步（会自动处理防抖和冲突检测）
          // 智能同步会在用户停止编辑后自动触发，这里只是确保内容已保存到本地
          console.log('✅ [自动保存] 内容已保存，智能同步将在适当时机自动触发');
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
        const chapterId = parseInt(data.id);
        await chaptersApi.updateChapter(chapterId, {
          title: data.title,
          chapter_metadata: {
            outline: data.outline || '',
            detailed_outline: data.detailOutline || '',
          },
        });
        
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
  const handleEditCurrentChapter = () => {
    if (!selectedChapter) return;
    const data = chaptersData[selectedChapter];
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
                {work.title}
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
            <span>本章字数: {editor ? editor.storage.characterCount?.characters() || 0 : 0}</span>
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
              disabled={isAnalyzing || !allChapters || allChapters.length === 0}
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
        {isAnalyzing && analysisProgress && (
          <div className="analysis-progress-overlay">
            <div className="analysis-progress-content">
              <Loader2 size={24} className="spinner" />
              <p>{analysisProgress}</p>
            </div>
          </div>
        )}
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
          drafts={drafts}
          onDraftsChange={setDrafts}
          volumes={volumes}
          onVolumesChange={setVolumes}
          workType={work?.work_type}
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
      />
    </div>
  );
}
