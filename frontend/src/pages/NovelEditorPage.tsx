import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Sparkles, Loader2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
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
import ChapterEditorToolbar from '../components/editor/ChapterEditorToolbar';
import { useWorkInfoCache } from '../hooks/useWorkInfoCache';
import { useChapterAutoSave } from '../hooks/useChapterAutoSave';
import { worksApi, type Work } from '../utils/worksApi';
import { chaptersApi, type Chapter } from '../utils/chaptersApi';
import { syncManager } from '../utils/syncManager';
import { useIntelligentSync } from '../utils/intelligentSync';
import { analyzeChapter } from '../utils/bookAnalysisApi';
import { documentCache } from '../utils/documentCache';
import { loadChapterContent } from '../utils/loadCapture';
import type { ChapterFullData } from '../types/document';

import '../components/editor/NovelEditor.css';
import './NovelEditorPage.css';



export default function NovelEditorPage(){
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get('workId');
  
  const [activeNav, setActiveNav] = useState<'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions'>('work-info');
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  // 同步状态（保留用于内部逻辑，不显示在UI上）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const [showWordCountTooltip, setShowWordCountTooltip] = useState(false);
  // 章节名编辑状态
  const chapterNameInputRef = useRef<HTMLDivElement>(null);
  // 分析本书状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
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
  
  // 替换功能状态（VSCode风格）
  const [isReplacePanelOpen, setIsReplacePanelOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [matches, setMatches] = useState<Array<{ start: number; end: number }>>([]);
  
  // 侧边栏折叠状态
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  // 关键修复：为每个章节维护独立的编辑器实例
  // 通过 editorKey 来强制重新创建编辑器实例
  const [editorKey, setEditorKey] = useState(0);

  // 为当前章节创建或获取编辑器实例
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
  }, [editorKey]); // 关键修复：当 editorKey 变化时，重新创建编辑器

  // 存储章节数据
  const [chaptersData, setChaptersData] = useState<Record<string, ChapterFullData>>({});
  
  // 草稿数据
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; volumeId?: string; volumeTitle?: string; characters?: string[]; locations?: string[]; outline?: string; detailOutline?: string }>>([]);

  // 卷和章节数据 - 从API获取
  const [volumes, setVolumes] = useState<Array<{ id: string; title: string; chapters: Array<{ id: string; volumeId: string; title: string; characters?: string[]; locations?: string[]; outline?: string; detailOutline?: string }> }>>([]);

  // 角色和地点数据 - 从WorkInfoManager的缓存中获取
  const {
    availableCharacters,
    hasCharacterModule,
    availableLocations,
    hasLocationModule,
  } = useWorkInfoCache(workId);
  
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
  // 存储 stopSync 函数的 ref，用于在 loadChapterContent 中调用
  const stopSyncRef = useRef<(() => void) | null>(null);
  // 使用 ref 存储 chaptersData 和 allChapters，避免在 useEffect 依赖中导致无限循环
  const chaptersDataRef = useRef<Record<string, ChapterFullData>>({});
  const allChaptersRef = useRef<Chapter[]>([]);
  
  // 同步 chaptersData 到 ref
  useEffect(() => {
    chaptersDataRef.current = chaptersData;
  }, [chaptersData]);
  
  // 同步 allChapters 到 ref
  useEffect(() => {
    allChaptersRef.current = allChapters;
  }, [allChapters]);



  // 初始化 ShareDB 连接和同步管理器
  useEffect(() => {
    // 连接 ShareDB
    // 移除 WebSocket 连接，只使用轮询
    // sharedbClient.connect().catch(console.error);

    // 监听同步状态
    const unsubscribe = syncManager.onStatusChange((status) => {
      setSyncStatus(status);
    });

    // 关键修复：取消预加载章节机制，只在用户点击章节时才加载内容
    // 这样可以减少初始加载时的网络请求，提升性能

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

  // 同步章节名内容（当章节切换或章节名更新时）
  useEffect(() => {
    if (selectedChapter && chaptersData[selectedChapter] && chapterNameInputRef.current) {
      // 只有当元素不在焦点时（不在编辑状态）才更新内容
      if (document.activeElement !== chapterNameInputRef.current) {
        const currentTitle = chaptersData[selectedChapter].title || '未命名章节';
        if (chapterNameInputRef.current.textContent !== currentTitle) {
          chapterNameInputRef.current.textContent = currentTitle;
        }
      }
    }
  }, [selectedChapter, chaptersData]);


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
      console.log('✅ 标题已更新（本地状态）:', titleValue.trim());
    } catch (err) {
      console.error('更新标题失败:', err);
      alert(err instanceof Error ? err.message : '更新标题失败');
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


  // 保存章节名
  const handleSaveChapterName = async (e: React.FocusEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if (!selectedChapter || !chaptersData[selectedChapter]) {
      return;
    }

    const chapterId = parseInt(selectedChapter);
    const currentTitle = chaptersData[selectedChapter].title || '';
    // 从contentEditable元素获取文本内容
    const newTitle = (e.currentTarget.textContent || '').trim();

    // 如果没有变化，直接返回
    if (newTitle === currentTitle) {
      return;
    }

    // 如果新标题为空，恢复原值
    if (!newTitle) {
      e.currentTarget.textContent = currentTitle;
      return;
    }

    try {
      // 调用 API 更新章节名
      await chaptersApi.updateChapter(chapterId, {
        title: newTitle,
      });

      // 更新本地状态
      setChaptersData({
        ...chaptersData,
        [selectedChapter]: {
          ...chaptersData[selectedChapter],
          title: newTitle,
        },
      });

      // 同步更新 volumes 数据，使侧边栏立即更新
      setVolumes(prev => prev.map(vol => ({
        ...vol,
        chapters: vol.chapters.map(chap =>
          chap.id === selectedChapter
            ? { ...chap, title: newTitle }
            : chap
        ),
      })));

      console.log('✅ 章节名已更新:', newTitle);
    } catch (err) {
      console.error('更新章节名失败:', err);
      alert(err instanceof Error ? err.message : '更新章节名失败');
      // 恢复原值
      e.currentTarget.textContent = currentTitle;
    }
  };

  // 取消编辑章节名

  // 处理章节名输入框的键盘事件
  const handleChapterNameKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur(); // 触发onBlur，从而保存
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // 恢复原值
      if (selectedChapter && chaptersData[selectedChapter]) {
        const currentTitle = chaptersData[selectedChapter].title || '未命名章节';
        e.currentTarget.textContent = currentTitle;
        e.currentTarget.blur();
      }
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

  // 处理替换功能（打开/关闭面板）
  const handleReplace = () => {
    setIsReplacePanelOpen(!isReplacePanelOpen);
    if (!isReplacePanelOpen && editor) {
      // 打开时聚焦到查找输入框
      setTimeout(() => {
        const findInput = document.querySelector('.find-replace-panel .find-input') as HTMLInputElement;
        findInput?.focus();
      }, 0);
    }
  };

  // 查找匹配项
  const findMatches = () => {
    if (!editor || !findText.trim()) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    try {
      const content = editor.getText();
      let regex: RegExp;
      
      if (wholeWord) {
        // 全字匹配
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = matchCase 
          ? new RegExp(`\\b${escaped}\\b`, 'g')
          : new RegExp(`\\b${escaped}\\b`, 'gi');
      } else {
        // 普通匹配
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = matchCase 
          ? new RegExp(escaped, 'g')
          : new RegExp(escaped, 'gi');
      }

      const foundMatches: Array<{ start: number; end: number }> = [];
      let match;
      const textContent = content;
      
      while ((match = regex.exec(textContent)) !== null) {
        foundMatches.push({
          start: match.index,
          end: match.index + match[0].length,
        });
      }

      setMatches(foundMatches);
      if (foundMatches.length > 0) {
        setCurrentMatchIndex(0);
        scrollToMatch(foundMatches[0]);
      } else {
        setCurrentMatchIndex(-1);
      }
    } catch (err) {
      console.error('查找失败:', err);
      setMatches([]);
      setCurrentMatchIndex(-1);
    }
  };

  // 滚动到匹配项
  const scrollToMatch = (match: { start: number; end: number }) => {
    if (!editor) return;
    
    // 使用 Tiptap 的 setTextSelection 来定位
    editor.commands.setTextSelection({ from: match.start, to: match.end });
    editor.commands.focus();
    
    // 滚动到视图
    try {
      const editorElement = editor.view.dom;
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const editorRect = editorElement.getBoundingClientRect();
        
        // 如果匹配项不在视图中，滚动到它
        if (rect.top < editorRect.top || rect.bottom > editorRect.bottom) {
          range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } catch (err) {
      // 忽略滚动错误
      console.warn('滚动到匹配项失败:', err);
    }
  };

  // 查找下一个
  const findNext = () => {
    if (matches.length === 0) {
      findMatches();
      return;
    }
    
    const nextIndex = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIndex);
    scrollToMatch(matches[nextIndex]);
  };

  // 查找上一个
  const findPrevious = () => {
    if (matches.length === 0) {
      findMatches();
      return;
    }
    
    const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);
    scrollToMatch(matches[prevIndex]);
  };

  // 替换当前匹配项
  const replaceCurrent = () => {
    if (!editor || matches.length === 0 || currentMatchIndex < 0) return;

    try {
      const match = matches[currentMatchIndex];
      const htmlContent = editor.getHTML();
      
      // 在 HTML 中找到对应的位置并替换（简化处理）
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      const textNodes: Array<{ node: Node; start: number; end: number }> = [];
      
      const walker = document.createTreeWalker(
        tempDiv,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      let currentTextPos = 0;
      let node;
      while ((node = walker.nextNode())) {
        const nodeText = node.textContent || '';
        const nodeStart = currentTextPos;
        const nodeEnd = currentTextPos + nodeText.length;
        textNodes.push({ node, start: nodeStart, end: nodeEnd });
        currentTextPos = nodeEnd;
      }
      
      // 找到包含匹配项的文本节点并替换
      for (const textNode of textNodes) {
        if (match.start >= textNode.start && match.start < textNode.end) {
          const offset = match.start - textNode.start;
          const nodeText = textNode.node.textContent || '';
          const beforeMatch = nodeText.substring(0, offset);
          const afterMatch = nodeText.substring(offset + (match.end - match.start));
          
          textNode.node.textContent = beforeMatch + replaceText + afterMatch;
          break;
        }
      }
      
      editor.commands.setContent(tempDiv.innerHTML);
      
      // 重新查找匹配项
      setTimeout(() => {
        findMatches();
      }, 100);
    } catch (err) {
      console.error('替换失败:', err);
    }
  };

  // 替换全部
  const replaceAllMatches = () => {
    if (!editor || !findText.trim() || matches.length === 0) return;

    try {
      const htmlContent = editor.getHTML();
      let regex: RegExp;
      
      if (wholeWord) {
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = matchCase 
          ? new RegExp(`\\b${escaped}\\b`, 'g')
          : new RegExp(`\\b${escaped}\\b`, 'gi');
      } else {
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = matchCase 
          ? new RegExp(escaped, 'g')
          : new RegExp(escaped, 'gi');
      }

      // 简单处理：直接替换 HTML 中的文本（保持格式）
      const newHtmlContent = htmlContent.replace(regex, replaceText);
      editor.commands.setContent(newHtmlContent);
      
      alert(`已替换 ${matches.length} 处"${findText}"为"${replaceText}"`);
      setMatches([]);
      setCurrentMatchIndex(-1);
      setFindText('');
    } catch (err) {
      console.error('替换失败:', err);
      alert('替换失败，请重试');
    }
  };

  // 监听查找文本变化
  useEffect(() => {
    if (isReplacePanelOpen && findText && editor) {
      const timeoutId = setTimeout(() => {
        findMatches();
      }, 300); // 防抖
      return () => clearTimeout(timeoutId);
    } else {
      setMatches([]);
      setCurrentMatchIndex(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findText, matchCase, wholeWord, isReplacePanelOpen, editor]);

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
                // 记录开始信息（如果需要可以在这里处理）
              } else if (data.type === 'chapter_inserted') {
                // 统计成功分析的章节
                analyzedCount++;
                
              } else if (data.type === 'all_chapters_complete') {
                // 分析完成，显示结果
                setIsAnalyzing(false);
                
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

  // 关键修复：章节切换时，重新创建编辑器实例，确保每个章节有独立的状态
  useEffect(() => {
    if (!selectedChapter) return;
    
    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) return;
    
    // 如果切换到新章节，销毁旧编辑器并创建新编辑器
    if (currentChapterIdRef.current !== chapterId && currentChapterIdRef.current !== null) {
      // 销毁旧编辑器
      if (editor) {
        editor.destroy();
      }
      // 通过改变 key 来强制重新创建编辑器
      // 注意：editor 会在下一个渲染周期重新创建
      setEditorKey(prev => prev + 1);
      // 清除内容记录，等待新编辑器创建后再加载内容
      lastSetContentRef.current = '';
      // 更新当前章节ID，这样内容加载逻辑可以正确执行
      currentChapterIdRef.current = chapterId;
    } else if (currentChapterIdRef.current === null) {
      // 首次选择章节时，也要更新 currentChapterIdRef
      currentChapterIdRef.current = chapterId;
    }
  }, [selectedChapter, editor]);

  // 加载章节内容（使用本地缓存和 ShareDB）
  useEffect(() => {
    if (!selectedChapter || !editor) return;

    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) {
      // 如果是草稿或其他非数字ID，不加载
      editor.commands.setContent('<p></p>');
      currentChapterIdRef.current = null;
      return;
    }
    
    // 关键修复：确保编辑器已经创建完成（不是被销毁的状态）
    // 当 editorKey 变化时，编辑器会重新创建，需要等待创建完成
    if (editor.isDestroyed) {
      // 编辑器正在被销毁或已销毁，等待重新创建
      return;
    }
    
    // 关键修复：切换章节时清除上次设置的内容记录，避免影响新章节
    // 同时清除加载状态标记（如果之前有残留）
    if (currentChapterIdRef.current !== chapterId) {
      lastSetContentRef.current = ''; // 清除记录，允许新章节设置内容
      isChapterLoadingRef.current = false; // 清除可能残留的加载状态
    }

    // 关键修复：防止重复加载 - 如果正在加载或章节ID相同且内容已设置，跳过
    if (isChapterLoadingRef.current) {
      return;
    }
    
    // 如果当前章节ID相同且已经设置过内容，检查是否需要重新加载
    if (currentChapterIdRef.current === chapterId && lastSetContentRef.current) {
      // 只有在编辑器内容为空时才重新加载
      const currentContent = editor.getHTML();
      if (currentContent && currentContent.trim() !== '<p></p>' && currentContent.trim() !== '') {
        return; // 内容已存在，不需要重新加载
      }
    }

    // 使用 ref 中存储的 stopSync 函数，如果还没有初始化则使用空函数
    const stopSync = stopSyncRef.current || (() => {});

    loadChapterContent({
      chapterId,
      workId,
      selectedChapter,
      editor,
      setChapterLoading,
      setChaptersData,
      setCurrentChapterData,
      setCurrentChapterWordCount,
      chaptersData: chaptersDataRef.current, // 使用 ref 中的值，避免依赖变化
      allChapters: allChaptersRef.current, // 使用 ref 中的值，避免依赖变化
      isChapterLoadingRef,
      currentChapterIdRef,
      lastSetContentRef,
      stopSync,
    });
  }, [selectedChapter, editor, editorKey, workId]); // 关键修复：移除 chaptersData 和 allChapters 依赖，使用 ref 避免无限循环

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

    // 检查是否离线
    const isOffline = !navigator.onLine || !syncStatus.isOnline;

    console.log('💾 [手动保存] 开始保存:', {
      chapterId,
      documentId,
      contentLength: editorContent.length,
      isOffline,
    });

    try {
      // 显示保存状态
      const saveButton = document.querySelector('.manual-save-btn') as HTMLButtonElement;
      if (saveButton) {
        saveButton.disabled = true;
        if (saveButton.querySelector('span')) {
          saveButton.querySelector('span')!.textContent = isOffline ? '保存到缓存中...' : '保存中...';
        }
      }

      // 1. 保存到本地缓存
      // 关键修复：从 chaptersData 或 allChapters 中获取正确的章节号和标题
      const chapterIdStr = String(chapterId);
      const chapterData = chaptersData[chapterIdStr];
      const chapter = allChapters.find(c => String(c.id) === chapterIdStr);
      const chapterNumber = chapterData?.chapter_number 
        || chapter?.chapter_number 
        || undefined;
      const chapterTitle = chapterData?.title 
        || chapter?.title 
        || undefined;
      
      // 关键修复：构建包含 title 的 metadata
      const metadata = {
        work_id: Number(workId),
        chapter_id: chapterId,
        chapter_number: chapterNumber, // 关键修复：保存正确的章节号
        title: chapterTitle, // 关键修复：保存章节标题
        updated_at: new Date().toISOString(),
      };
      
      // 关键修复：无论在线还是离线，都先保存到本地缓存
      // syncDocumentState 内部会先调用 updateDocument 进行缓存更新
      // 关键修复：添加验证函数，确保只有当前章节才会同步
      const result = await documentCache.syncDocumentState(
        documentId, 
        editorContent, 
        undefined, 
        metadata,
        (docId: string) => {
          // 验证是否是当前章节
          const currentChapterIdCheck = currentChapterIdRef.current;
          if (currentChapterIdCheck !== chapterId) {
            return false;
          }
          // 从 documentId 中提取章节ID
          const match = docId.match(/work_\d+_chapter_(\d+)/);
          if (match) {
            const docChapterId = parseInt(match[1]);
            return docChapterId === chapterId;
          }
          return false;
        }
      );

      if (result.success) {
        console.log('✅ [手动保存] 保存成功:', {
          version: result.version,
          contentLength: result.content.length,
          isOffline,
        });
        
        // 显示成功提示（根据在线/离线状态显示不同提示）
        if (saveButton && saveButton.querySelector('span')) {
          if (isOffline) {
            saveButton.querySelector('span')!.textContent = '已保存到缓存';
          } else {
            saveButton.querySelector('span')!.textContent = '已保存';
          }
          setTimeout(() => {
            if (saveButton && saveButton.querySelector('span')) {
              saveButton.querySelector('span')!.textContent = '保存';
            }
            if (saveButton) {
              saveButton.disabled = false;
            }
          }, 1500);
        }
      } else {
        throw new Error(result.error || '保存失败');
      }
    } catch (err) {
      console.error('❌ [手动保存] 保存失败:', err);
      
      // 关键修复：即使保存失败，也尝试保存到本地缓存（作为最后的备份）
      try {
        await documentCache.updateDocument(documentId, editorContent, {
          work_id: Number(workId),
          chapter_id: chapterId,
          updated_at: new Date().toISOString(),
        });
        console.log('✅ [手动保存] 已保存到本地缓存（作为备份）');
        
        // 显示提示：已保存到缓存，但服务器同步失败
        if (isOffline) {
          alert('已保存到本地缓存（离线模式）');
        } else {
          alert('已保存到本地缓存，但服务器同步失败。网络恢复后将自动同步。');
        }
      } catch (cacheErr) {
        console.error('❌ [手动保存] 保存到缓存也失败:', cacheErr);
        alert('保存失败: ' + (err instanceof Error ? err.message : String(err)));
      }
      
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
      
      // 🔍 [调试] 智能同步更新编辑器内容
      console.log('🔍 [智能同步-updateContent] 准备更新编辑器内容:', {
        chapterId,
        newContentLength: newContent.length,
        newContentPreview: newContent.substring(0, 100),
        currentContentLength: currentContentCheck.length,
        currentContentPreview: currentContentCheck.substring(0, 100),
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n'),
      });
      
      // 关键修复：检查新内容是否为空
      if (!newContent || newContent.trim() === '' || newContent.trim() === '<p></p>') {
        console.warn('⚠️ [智能同步-updateContent] 新内容为空，跳过更新:', {
          chapterId,
          newContent,
          timestamp: new Date().toISOString(),
        });
        return; // 不更新，避免清空编辑器
      }
      
      // 安全更新编辑器内容
      // 关键修复：从智能同步更新内容时，先清除历史再设置内容
      // 这样可以避免撤销到旧内容
      editor.commands.setContent('<p></p>', { emitUpdate: false });
      setTimeout(() => {
        // 🔍 [调试] 设置新内容
        console.log('🔍 [智能同步-updateContent] 设置新内容到编辑器:', {
          chapterId,
          newContentLength: newContent.length,
          newContentPreview: newContent.substring(0, 100),
          timestamp: new Date().toISOString(),
        });
        
        editor.commands.setContent(newContent, { emitUpdate: false });
        
        // 🔍 [调试] 验证设置后的内容
        setTimeout(() => {
          const editorContentAfterUpdate = editor.getHTML();
          console.log('🔍 [智能同步-updateContent] 设置后的编辑器内容:', {
            chapterId,
            editorContentLength: editorContentAfterUpdate.length,
            editorContentPreview: editorContentAfterUpdate.substring(0, 100),
            newContentLength: newContent.length,
            isContentEmpty: editorContentAfterUpdate.trim() === '<p></p>' || editorContentAfterUpdate.trim() === '',
            timestamp: new Date().toISOString(),
          });
          
          if (editorContentAfterUpdate.trim() === '<p></p>' || editorContentAfterUpdate.trim() === '') {
            console.error('❌ [智能同步-updateContent] 设置后编辑器内容为空！', {
              chapterId,
              newContentLength: newContent.length,
              newContentPreview: newContent.substring(0, 200),
              timestamp: new Date().toISOString(),
            });
          }
        }, 100);
      }, 0);
      lastSetContentRef.current = newContent; // 记录已设置的内容
      
    }, 100); // 100ms 防抖，减少频闪
  };

  // 只在有章节选中时启用智能同步
  const documentId = selectedChapter && workId 
    ? `work_${workId}_chapter_${parseInt(selectedChapter)}`
    : '';

  const {
    stop: stopSync,
  } = useIntelligentSync(
    documentId,
    getCurrentContent,
    updateContent,
    {
      pollInterval: 10000,          // 每 10 秒轮询一次
      userInputWindow: 5000,        // 5 秒内有输入视为用户正在编辑
      syncCheckInterval: 5000,      // 每 5 秒检查一次是否需要同步（降低频率）
      enablePolling: true,          // 始终启用轮询（内部会根据 documentId 判断）
      onSyncSuccess: () => {
        // 更新同步状态
        setSyncStatus(syncManager.getStatus());
      },
      onSyncError: (error) => {
        console.error('❌ [智能同步] 同步失败:', error);
        setSyncStatus(syncManager.getStatus());
      },
      onCollaborativeUpdate: (hasUpdates) => {
        if (hasUpdates) {
          
          // 可以在这里显示通知
        }
      },
      onContentChange: () => {
        setSyncStatus(syncManager.getStatus());
      },
    }
  );

  // 将 stopSync 存储到 ref 中，供 loadChapterContent 使用
  useEffect(() => {
    stopSyncRef.current = stopSync;
  }, [stopSync]);


  // 自动保存章节内容（本地优先策略 + 智能同步）
  useChapterAutoSave({
    editor,
    selectedChapter,
    workId,
    chaptersData,
    allChapters,
    work,
    setWork,
    setAllChapters,
    setCurrentChapterWordCount,
    stopSync,
    isChapterLoadingRef,
    currentChapterIdRef,
    saveTimeoutRef,
    updateContentTimeoutRef,
    wordCountSaveTimeoutRef,
  });

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
        const chapterId = parseInt(data.id);
        
        // 准备更新数据
        const updateData: any = {
          title: data.title,
        };

        // 如果有大纲或细纲，添加到更新数据中
        if (data.outline || data.detailOutline) {
          updateData.chapter_metadata = {
            outline: data.outline || '',
            detailed_outline: data.detailOutline || '',
          };
        }

        // 调用 API 更新章节到数据库
        await chaptersApi.updateChapter(chapterId, updateData);
        
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

    // 显示开始分析提示
    const chapterTitle = chaptersData[chapterId]?.title || `第${chapterIdNum}章`;
    alert(`开始分析章节：${chapterTitle}\n正在生成大纲和细纲，请稍候...`);

    try {
      // 调用分析API
      const result = await analyzeChapter(
        Number(workId),
        chapterIdNum,
        (progress) => {
          // 可以在这里显示进度信息（如果需要）
          if (progress.message) {
            console.log('分析进度:', progress.message);
          }
        }
      );

      

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

      alert(`章节分析完成！\n章节：${chapterTitle}\n大纲和细纲已保存到章节信息中。`);
    } catch (error) {
      console.error('分析章节失败:', error);
      const errorMessage = error instanceof Error ? error.message : '分析章节失败';
      alert(`分析失败：${errorMessage}\n请检查网络连接或稍后重试。`);
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

  // 获取当前章节/草稿标题（保留以备将来使用）
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
              <span 
                className="word-count-tooltip-wrapper"
                onMouseEnter={() => setShowWordCountTooltip(true)}
                onMouseLeave={() => setShowWordCountTooltip(false)}
              >
                <Info size={14} />
                {showWordCountTooltip && (
                  <div className="word-count-tooltip">
                    总字数: {work?.word_count || 0}
                  </div>
                )}
              </span>
            </div>
            <div className="work-tags">
              {work?.category && <span className="tag">{work.category}</span>}
              {work?.genre && <span className="tag">{work.genre}</span>}
            </div>
          </div>
        </div>
        <div className="header-center">
        </div>
        <div className="header-right">
          <div className="header-actions">
            {/* 同步状态 */}
            <span className={`status-tag-header ${syncStatus.isOnline ? 'online' : 'offline'}`}>
              {syncStatus.isOnline 
                ? (syncStatus.pendingCount > 0 
                    ? `同步中 (${syncStatus.pendingCount})` 
                    : '已同步')
                : '离线模式'}
            </span>
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
            <button 
              className="action-btn" 
              onClick={handleReplace}
              title="查找和替换文字"
            >
              <span>替换</span>
            </button>
          </div>
          {/* 侧边栏折叠按钮组 */}
          <div className="sidebar-toggle-buttons">
            <button
              className={`sidebar-toggle-btn-header left-toggle-header ${leftSidebarCollapsed ? 'collapsed' : ''}`}
              onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
              title={leftSidebarCollapsed ? '展开左侧边栏' : '折叠左侧边栏'}
            >
              {leftSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <button
              className={`sidebar-toggle-btn-header right-toggle-header ${rightSidebarCollapsed ? 'collapsed' : ''}`}
              onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
              title={rightSidebarCollapsed ? '展开右侧边栏' : '折叠右侧边栏'}
            >
              {rightSidebarCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>
        {/* 分析进度已移除，改为后台运行，不显示弹窗 */}
      </header>

      {/* 第二行工具栏 - 编辑器工具 */}
      {selectedChapter !== null && (
        <div className="editor-toolbar-row">
          <ChapterEditorToolbar
            editor={editor}
            onManualSave={handleManualSave}
            onEditChapter={handleEditCurrentChapter}
            headingMenuOpen={headingMenuOpen}
            setHeadingMenuOpen={setHeadingMenuOpen}
          />
        </div>
      )}

      <div className={`novel-editor-body ${leftSidebarCollapsed ? 'left-collapsed' : ''} ${rightSidebarCollapsed ? 'right-collapsed' : ''}`}>
        {/* 左侧边栏 */}
        <div className={`sidebar-wrapper left-sidebar-wrapper ${leftSidebarCollapsed ? 'collapsed' : ''}`}>
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
        </div>

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
              {/* 文本编辑区域 */}
              <div className="novel-editor-wrapper">
                <div className="chapter-content-wrapper" style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
                  {/* 编辑器内容 - 包含章节头部 */}
                  <div className="editor-with-header">
                    {/* 章节头部信息 - 作为编辑器的一部分 */}
                    {selectedChapter && chaptersData[selectedChapter] && (
                      <div className="chapter-header-info">
                        <div className="chapter-number">
                          {chaptersData[selectedChapter].chapter_number !== undefined 
                            ? `第${chaptersData[selectedChapter].chapter_number}章`
                            : chaptersData[selectedChapter].volumeTitle || ''}
                        </div>
                        <div className="chapter-name">
                          <div
                            ref={chapterNameInputRef}
                            className="chapter-name-editable"
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={handleSaveChapterName}
                            onKeyDown={handleChapterNameKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            title="点击编辑章节名"
                          >
                            {chaptersData[selectedChapter].title || '未命名章节'}
                          </div>
                        </div>
                        <div className="chapter-stats">
                          <span>{currentChapterWordCount.toLocaleString()} 字</span>
                          <span>•</span>
                          <span>预计阅读 {Math.ceil(currentChapterWordCount / 500)} 分钟</span>
                        </div>
                      </div>
                    )}
                    
                    {/* 编辑器内容 */}
                    <EditorContent editor={editor} />
                  </div>
                </div>
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
        <div className={`sidebar-wrapper right-sidebar-wrapper ${rightSidebarCollapsed ? 'collapsed' : ''}`}>
          <AIAssistant workId={workId} />
        </div>
      </div>

      {/* VSCode风格的查找替换面板 */}
      {isReplacePanelOpen && (
        <div className="find-replace-panel">
          <div className="find-replace-content">
            <div className="find-replace-row">
              <div className="find-input-wrapper">
                <input
                  type="text"
                  className="find-input"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="查找"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.shiftKey) {
                      e.preventDefault();
                      findPrevious();
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      findNext();
                    } else if (e.key === 'Escape') {
                      setIsReplacePanelOpen(false);
                    }
                  }}
                />
                <div className="find-actions">
                  <button
                    className="find-action-btn"
                    onClick={findPrevious}
                    title="上一个 (Shift+Enter)"
                    disabled={matches.length === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="find-action-btn"
                    onClick={findNext}
                    title="下一个 (Enter)"
                    disabled={matches.length === 0}
                  >
                    ↓
                  </button>
                </div>
                {matches.length > 0 && (
                  <span className="match-count">
                    {currentMatchIndex + 1} / {matches.length}
                  </span>
                )}
              </div>
              <div className="replace-input-wrapper">
                <input
                  type="text"
                  className="replace-input"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="替换"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      replaceCurrent();
                    } else if (e.key === 'Escape') {
                      setIsReplacePanelOpen(false);
                    }
                  }}
                />
                <div className="replace-actions">
                  <button
                    className="replace-action-btn"
                    onClick={replaceCurrent}
                    title="替换"
                    disabled={matches.length === 0 || currentMatchIndex < 0}
                  >
                    替换
                  </button>
                  <button
                    className="replace-action-btn replace-all-btn"
                    onClick={replaceAllMatches}
                    title="全部替换"
                    disabled={matches.length === 0}
                  >
                    全部替换
                  </button>
                </div>
              </div>
            </div>
            <div className="find-replace-options">
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={matchCase}
                  onChange={(e) => setMatchCase(e.target.checked)}
                />
                <span>区分大小写</span>
              </label>
              <label className="option-checkbox">
                <input
                  type="checkbox"
                  checked={wholeWord}
                  onChange={(e) => setWholeWord(e.target.checked)}
                />
                <span>全字匹配</span>
              </label>
              <button
                className="close-panel-btn"
                onClick={() => setIsReplacePanelOpen(false)}
                title="关闭 (Esc)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

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
        onGenerateContent={async (content: string, isFinal?: boolean) => {
          // 将生成的内容（流式累积的纯文本）填充到编辑器中
          if (editor) {
            // 将纯文本转换为简单的段落 HTML
            const htmlContent = content
              .split('\n\n')
              .map(para => para.trim())
              .filter(para => para.length > 0)
              .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
              .join('');

            // 流式更新编辑器内容，用户可以实时看到生成进度
            editor.commands.setContent(htmlContent || '<p></p>');

            // 结束时，自动保存会基于编辑器内容触发，不需要额外手动保存
            // 如果以后需要在结束时做额外提示或操作，可以利用 isFinal === true 分支
            if (isFinal) {
              console.log('✅ 章节内容生成完成（最终内容已写入编辑器，自动保存将继续处理）');
            }
          } else {
            console.warn('编辑器未初始化，无法填充内容');
          }
        }}
      />
    </div>
  );
}

