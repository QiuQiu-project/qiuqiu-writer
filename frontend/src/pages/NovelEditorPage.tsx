/**
 * 小说编辑器页面
 * 模块化重构版本 - 控制在1000行以内
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Menu, X, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, MessageCircleQuestion } from 'lucide-react';
import { EditorContent } from '@tiptap/react';

// 组件
import SideNav from '../components/editor/SideNav';
import AIAssistant from '../components/editor/AIAssistant';
import { formatOutlineForEditor, formatDetailedOutlineForEditor } from '../utils/outlineFormat';
import TagsManager from '../components/editor/TagsManager';
import ChapterOutline from '../components/editor/ChapterOutline';
import ChapterSettingsModal from '../components/editor/ChapterSettingsModal';
import VolumeSettingsModal from '../components/editor/VolumeSettingsModal';
import ChapterHistoryModal from '../components/editor/ChapterHistoryModal';
import MessageModal from '../components/common/MessageModal';
import MapView from '../components/editor/MapView';
import Characters from '../components/editor/Characters';
import Factions from '../components/editor/Factions';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import ChapterEditorToolbar from '../components/editor/ChapterEditorToolbar';
import EditorSelectionPopup from '../components/editor/EditorSelectionPopup';
import OnboardingGuide from '../components/common/OnboardingGuide';
import HeaderSettingsMenu from '../components/editor/HeaderSettingsMenu';
import FeedbackModal from '../components/common/FeedbackModal';

// Hooks
import { useYjsEditor } from '../hooks/useYjsEditor';
import { useChapterManagement } from '../hooks/useChapterManagement';
import { useVolumeManagement } from '../hooks/useVolumeManagement';
import { useTitleEditing } from '../hooks/useTitleEditing';
import { useFindReplace } from '../hooks/useFindReplace';
import { useChapterOperations, type ChapterSaveData } from '../hooks/useChapterOperations';
import { useModalState } from '../hooks/useModalState';
import { useUIState } from '../hooks/useUIState';
import { useIsMobile } from '../hooks/useMediaQuery';
import type { ChapterFullData } from '../types/document';

// API和工具
import { worksApi, type Work } from '../utils/worksApi';
import { authApi } from '../utils/authApi';
import { documentCache } from '../utils/documentCache';
import { syncManager } from '../utils/syncManager';
import { countCharacters } from '../utils/textUtils';
import { generateChapterContent } from '../utils/bookAnalysisApi';
import { chaptersApi } from '../utils/chaptersApi';
import { createYjsSnapshotFromEditor, restoreYjsSnapshotToEditor, getTextFromProsemirrorJSON } from '../utils/yjsSnapshot';
import { sendChatMessage } from '../utils/chatApi';

// 样式
import '../components/editor/NovelEditor.css';
import './NovelEditorPage.css';

export default function NovelEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get('workId');
  const isMobile = useIsMobile();
  
  // ===== 基础状态 =====
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [syncStatus, setSyncStatus] = useState(syncManager.getStatus());
  const [currentChapterWordCount, setCurrentChapterWordCount] = useState(0);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  /** 选中文本浮动菜单（含章节内字数范围：第 X 字到第 Y 字） */
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    top: number;
    left: number;
    text: string;
    startChar: number;
    endChar: number;
  }>({
    visible: false,
    top: 0,
    left: 0,
    text: '',
    startChar: 0,
    endChar: 0,
  });
  const [selectionOptimizing, setSelectionOptimizing] = useState(false);
  /** 从编辑器选中发起 AI 对话时，只传章节引用（对话框里显示徽章 @chapter:x第n字-第m字，不显示选中正文） */
  const [initialSelectionRef, setInitialSelectionRef] = useState<{ chapterId: string; startChar: number; endChar: number } | null>(null);
  
  // ===== 功能引导状态 =====
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    const checkTipsEnabled = () => {
      const enabled = localStorage.getItem('wawawriter_guide_tips_enabled');
      setTipsEnabled(enabled === null || enabled === 'true');
    };
    checkTipsEnabled();
    
    const handleUpdate = () => checkTipsEnabled();
    window.addEventListener('wawawriter_guide_tips_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('wawawriter_guide_tips_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const toggleTips = () => {
    const newState = !tipsEnabled;
    localStorage.setItem('wawawriter_guide_tips_enabled', String(newState));
    
    // 如果是开启功能引导，重置所有已看过的提示状态，确保用户能重新看到引导
    if (newState) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wawawriter_guide_tip_seen_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    setTipsEnabled(newState);
    window.dispatchEvent(new Event('wawawriter_guide_tips_updated'));
    showMessage(
      newState ? '已开启功能引导（已重置提示状态）' : '已关闭功能引导', 
      'info', 
      undefined, 
      undefined, 
      { toast: true, autoCloseMs: 2000 }
    );
  };
  
  // ===== UI状态管理 =====
  const {
    activeNav,
    setActiveNav,
    leftSidebarCollapsed,
    rightSidebarCollapsed,
    toggleLeftSidebar,
    toggleRightSidebar,
    mobileMenuOpen,
    mobileChatOpen,
    setMobileMenuOpen,
    setMobileChatOpen,
    showWordCountTooltip,
    setShowWordCountTooltip,
    headingMenuOpen,
    setHeadingMenuOpen,
  } = useUIState();
  
  // ===== 模态框状态 =====
  const {
    isChapterModalOpen,
    chapterModalMode,
    currentVolumeId,
    currentVolumeTitle,
    currentChapterData,
    openChapterModal,
    closeChapterModal,
    messageState,
    showMessage,
    closeMessage,
  } = useModalState();
  
  // ===== 章节管理 =====
  const {
    selectedChapter,
    chaptersData,
    volumes,
    setSelectedChapter,
    setVolumes,
    updateChapterTitle,
    updateChapterNumber,
    updateChapterLocally,
    removeChapterLocally,
    deletedChapters,
    loadDeletedChapters,
  } = useChapterManagement({
    workId,
    updateTrigger,
  });

  // ===== 章节切换处理 =====
  const handleChapterSelect = async (chapterId: string | null) => {
    // 如果已经在该章节，不需要切换
    if (selectedChapter === chapterId) return;

    // 切换章节前，强制同步当前作品的 Yjs 状态到数据库
    // 这样新章节加载时，从数据库拉取的内容就是最新的
    if (workId) {
      
      try {
        await syncToServer();
      } catch {
        // ignore
      }
    }

    setSelectedChapter(chapterId);
    
    // 移动端切换后自动关闭菜单
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };
  
  // ===== 章节操作 =====
  const {
    saveChapterSettings,
    deleteChapter,
    restoreChapter,
  } = useChapterOperations({
    workId,
    onSuccess: (msg: string) => showMessage(msg, 'success', undefined, undefined, { toast: true, autoCloseMs: 2000 }),
    onError: (msg: string) => showMessage(msg, 'error'),
    onUpdateTrigger: () => setUpdateTrigger(prev => prev + 1),
    onSuccessEdit: (data) => {
      if (data.id) updateChapterLocally(String(data.id), data);
    },
  });

  // ===== 卷管理 =====
  const {
    isVolumePopupOpen,
    currentEditingVolume,
    isCreatingNewVolume,
    editingVolumeTitle,
    editingVolumeOutline,
    editingVolumeDetailOutline,
    openNewVolumePopup,
    openEditVolumePopup,
    closeVolumePopup,
    handleSaveVolume,
    handleDeleteVolume,
  } = useVolumeManagement({
    workId,
    volumes,
    setVolumes,
    onError: (msg: string) => showMessage(msg, 'error'),
  });
  
  // ===== 编辑器 =====
  const documentId = selectedChapter && workId 
    ? `work_${workId}_chapter_${selectedChapter}` 
    : '';
  
  const hasUserEdited = useRef(false);

  const { editor, provider, syncToServer } = useYjsEditor({
    documentId,
    fetchInitialContent: async (docId) => {
      // 优先从本地缓存获取，确保离线编辑的内容不会丢失
      try {
        const cached = await documentCache.getDocument(docId);
        if (cached && cached.content && cached.content.trim().length > 0) {
          
          return cached.content;
        }
      } catch {
        // ignore
      }

      // 本地没有，再从服务器拉取
      const m = docId.match(/^work_(.+?)_chapter_(.+)$/);
      if (!m) return null;
      const chapterId = parseInt(m[2], 10);
      if (Number.isNaN(chapterId)) return null;
      try {
        const res = await chaptersApi.getChapterDocument(chapterId);
        // 注意：这里的 res.content 可能是 Yjs 的 XML 字符串
        return res?.content || null;
      } catch {
        // ignore
        return null;
      }
    },
    placeholder: '开始写作...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
    editable: true,
    onUpdate: (content) => {
      hasUserEdited.current = true;
      const wordCount = countCharacters(content);
      setCurrentChapterWordCount(wordCount);
      
      // 更新本地缓存
      // 关键修复：既然正在使用 Yjs 进行实时同步，我们将本地缓存标记为“已同步”
      // 这样可以避免 SyncManager 触发冗余的 ShareDB 同步请求，从而减少冲突
      if (documentId) {
        documentCache.updateDocument(documentId, content, undefined, true).catch(() => {
          // ignore
        });
      }
    },
    onSyncSuccess: () => {
      
      setSyncStatus(syncManager.getStatus());
    },
    onSyncError: () => {
      
    },
  });

  // ===== 冲突检测与版本控制 =====
   // 当编辑器加载完成并同步后，检查本地缓存与线上是否存在冲突
   useEffect(() => {
     if (!editor || !documentId || !selectedChapter) return;
 
     // 延迟 2 秒检查，确保 Yjs 完成初始同步且用户尚未开始大量编辑
     const checkConflict = async () => {
       if (hasUserEdited.current) {
         
         return;
       }

       try {
         const m = documentId.match(/^work_(.+?)_chapter_(.+)$/);
         if (!m) return;
         const chapterId = parseInt(m[2], 10);
 
         // 1. 并行获取线上最新内容和本地缓存
         const [onlineRes, cached] = await Promise.all([
           chaptersApi.getChapterDocument(chapterId),
           documentCache.getDocument(documentId)
         ]);
 
         const onlineContent = onlineRes?.content;
         const localContent = cached?.content;
 
         // 2. 如果本地有缓存且与线上不一致
         if (localContent && onlineContent && localContent !== onlineContent) {
           // 获取当前编辑器内容
           const currentEditorContent = editor.getHTML();
           
           // 如果当前编辑器内容不等于线上最新内容（说明 Yjs 还没同步到线上新内容，或者同步后本地旧内容占了上风）
           if (currentEditorContent !== onlineContent) {
             // 额外检查：如果房间里还有其他用户，我们不应该强行 setContent，因为会破坏他们的编辑
             // 如果 provider 还没准备好，我们也跳过
             const awareness = provider?.awareness;
             const otherUsers = awareness ? awareness.getStates().size - 1 : 0;
             
             if (otherUsers > 0) {
               
               return;
             }

             
             
             // A. 保存本地版本为历史记录 (使用 Yjs 快照)
             try {
              const base64 = createYjsSnapshotFromEditor(editor);
              await chaptersApi.createYjsSnapshot(chapterId, base64, '冲突自动保存');
              
            } catch {
              // ignore
            }

            // B. 强制覆盖为线上最新版本 (仅在没有其他用户时安全)
             editor.commands.setContent(onlineContent);
             
             // C. 更新本地缓存
             await documentCache.updateDocument(documentId, onlineContent);
             
             showMessage('检测到本地版本与线上不一致，已将本地保存为历史记录并拉取最新版本', 'info');
          }
        }
      } catch {
        // ignore
      }
    };
 
     // 增加延迟到 2 秒
     const timer = setTimeout(checkConflict, 2000);
     return () => clearTimeout(timer);
   }, [editor, documentId, selectedChapter]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // ===== 标题编辑 =====
  const {
    titleEditableRef,
    chapterNameInputRef,
    chapterNumberInputRef,
    handleSaveTitle,
    handleTitleKeyDown,
    handleSaveChapterName,
    handleChapterNameKeyDown,
    handleSaveChapterNumber,
    handleChapterNumberKeyDown,
    getChapterNumberDisplayText,
  } = useTitleEditing({
    work,
    workId,
    selectedChapter,
    chaptersData,
    onWorkUpdate: setWork,
    onChapterTitleUpdate: updateChapterTitle,
    onChapterNumberUpdate: updateChapterNumber,
    onError: (msg: string) => showMessage(msg, 'error'),
  });
  
  // ===== 查找替换 =====
  const {
    isReplacePanelOpen,
    findText,
    replaceText,
    matchCase,
    currentMatchIndex,
    matches,
    setIsReplacePanelOpen,
    setFindText,
    setReplaceText,
    setMatchCase,
    findNext,
    findPrevious,
    replaceCurrent,
    replaceAllMatches,
  } = useFindReplace({
    editor,
    onMessage: (msg: string, type: 'success' | 'error', options?: { toast?: boolean; autoCloseMs?: number }) =>
      showMessage(msg, type, undefined, undefined, options),
  });
  
  // ===== 可用角色列表 =====
  const availableCharacters = useMemo(() => {
    const charSet = new Set<string>();
    Object.values(chaptersData).forEach((chap: ChapterFullData) => {
      chap.characters?.forEach((char: string) => charSet.add(char));
    });
    return Array.from(charSet);
  }, [chaptersData]);

  // 传给章节弹窗的角色列表保持引用稳定，避免弹窗内 useEffect 因依赖变化反复重置选中状态
  const chapterModalAvailableCharacters = useMemo(
    () => availableCharacters.map((char, index) => ({ id: String(index), name: char })),
    [availableCharacters]
  );
  
  // ===== 切换章节时设置活动文档 ID =====
  useEffect(() => {
    if (documentId) {
      syncManager.setActiveDocumentId(documentId);
    }
    return () => {
      syncManager.setActiveDocumentId(null);
    };
  }, [documentId]);

  // ===== 加载作品详情 =====
  useEffect(() => {
    if (!workId) {
      setError('缺少作品ID');
      setLoading(false);
      return;
    }

    const loadWork = async () => {
      try {
        setLoading(true);
        const workData = await worksApi.getWork(workId, true, true);
        setWork(workData);
        
        if ((workData as { _fromCache?: boolean })._fromCache) {
          setError('使用缓存数据（数据库不可用）');
        } else {
          setError(null);
        }
      } catch (err) {
        
        setError(err instanceof Error ? err.message : '加载作品失败');
      } finally {
        setLoading(false);
      }
    };

    loadWork();
  }, [workId]);
  
  // ===== 监听同步状态 =====
  useEffect(() => {
    const unsubscribe = syncManager.onStatusChange((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);
  
  // ===== 同步标题内容 =====
  useEffect(() => {
    if (work && titleEditableRef.current && document.activeElement !== titleEditableRef.current) {
      const currentTitle = work.title || '';
      if (titleEditableRef.current.textContent !== currentTitle) {
        titleEditableRef.current.textContent = currentTitle;
      }
    }
  }, [work, titleEditableRef]);
  
  // ===== 同步章节名内容 =====
  useEffect(() => {
    if (selectedChapter && chaptersData[selectedChapter] && chapterNameInputRef.current) {
      if (document.activeElement !== chapterNameInputRef.current) {
        const currentTitle = chaptersData[selectedChapter].title || '未命名章节';
        if (chapterNameInputRef.current.textContent !== currentTitle) {
          chapterNameInputRef.current.textContent = currentTitle;
        }
      }
    }
  }, [selectedChapter, chaptersData, chapterNameInputRef]);

  // ===== 章节切换时立即更新字数统计 =====
  useEffect(() => {
    if (editor && selectedChapter) {
      // 延迟一小段时间，确保编辑器内容已加载（Yjs 同步可能需要时间）
      const timer = setTimeout(() => {
        const content = editor.getHTML();
        const wordCount = countCharacters(content);
        setCurrentChapterWordCount(wordCount);
      }, 100);
      return () => clearTimeout(timer);
    } else if (!selectedChapter) {
      // 没有选中章节时，重置字数
      setCurrentChapterWordCount(0);
    }
  }, [selectedChapter, editor]);
  
  // ===== 移动端点击外部关闭 tooltip =====
  useEffect(() => {
    if (!isMobile || !showWordCountTooltip) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const wrapper = document.querySelector('.word-count-tooltip-wrapper');
      const tooltip = document.querySelector('.word-count-tooltip');
      
      if (wrapper && !wrapper.contains(target) && tooltip && !tooltip.contains(target)) {
        setShowWordCountTooltip(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMobile, showWordCountTooltip, setShowWordCountTooltip]);

  // ===== 选中文本浮动菜单（AI 对话 / 在编辑器中优化句子） =====
  useEffect(() => {
    if (!editor) return;

    let isMouseDown = false;

    const showPopupForSelection = () => {
      const { from, to } = editor.state.selection;
      const doc = editor.state.doc;
      if (from === to) {
        setSelectionPopup((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const text = doc.textBetween(from, to, '\n');
      if (!text.trim()) {
        setSelectionPopup((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0) return;
      const range = domSel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const textBeforeFrom = doc.textBetween(0, from, '');
      const textBeforeTo = doc.textBetween(0, to, '');
      const startChar = textBeforeFrom.length + 1;
      const endChar = textBeforeTo.length;
      setSelectionPopup({
        visible: true,
        top: rect.bottom,
        left: rect.left + rect.width / 2,
        text,
        startChar,
        endChar,
      });
    };

    const onMouseDown = () => {
      isMouseDown = true;
      setSelectionPopup((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const onMouseUp = () => {
      isMouseDown = false;
      // 等 TipTap 处理完选区后再显示
      setTimeout(showPopupForSelection, 30);
    };

    const onSelectionUpdate = () => {
      // 鼠标拖选中不显示，松开后 mouseup 触发；键盘选择时直接显示
      if (isMouseDown) return;
      showPopupForSelection();
    };

    editor.view.dom.addEventListener('mousedown', onMouseDown);
    editor.view.dom.addEventListener('mouseup', onMouseUp);
    editor.on('selectionUpdate', onSelectionUpdate);
    return () => {
      editor.view.dom.removeEventListener('mousedown', onMouseDown);
      editor.view.dom.removeEventListener('mouseup', onMouseUp);
      editor.off('selectionUpdate', onSelectionUpdate);
    };
  }, [editor]);

  const handleSelectionAIChat = () => {
    if (selectedChapter) {
      setInitialSelectionRef({
        chapterId: selectedChapter,
        startChar: selectionPopup.startChar,
        endChar: selectionPopup.endChar,
      });
    }
    if (isMobile) {
      setMobileChatOpen(true);
    } else {
      if (rightSidebarCollapsed) toggleRightSidebar();
    }
    setSelectionPopup((prev) => ({ ...prev, visible: false }));
    setTimeout(() => setInitialSelectionRef(null), 500);
  };

  const handleSelectionOptimize = async (text: string) => {
    if (!editor || !workId) return;
    setSelectionOptimizing(true);
    try {
      const res = await sendChatMessage(
        `请只对以下文本进行润色优化，不要添加任何解释，直接输出优化后的完整文本：\n\n${text}`,
        [],
        workId
      );
      const optimized = (res?.content ?? '').trim();
      if (optimized) {
        const html = '<p>' + optimized.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
        editor.chain().focus().deleteSelection().insertContent(html).run();
      }
      setSelectionPopup((prev) => ({ ...prev, visible: false }));
    } catch (err) {
      
      showMessage(err instanceof Error ? err.message : '优化失败', 'error', undefined, undefined, { toast: true, autoCloseMs: 2500 });
    } finally {
      setSelectionOptimizing(false);
    }
  };
  
  // ===== 事件处理函数 =====
  const handleManualSave = async () => {
    if (!selectedChapter || !editor) {
      showMessage('请先选择章节', 'warning', undefined, undefined, { toast: true, autoCloseMs: 2000 });
      return;
    }

    try {
      // 1. 触发强制同步到 MongoDB
      await syncToServer();
      
      // 2. 创建 Yjs 快照记录作为手动保存点
      const chapterIdNum = parseInt(selectedChapter, 10);
      if (!isNaN(chapterIdNum)) {
        const base64 = createYjsSnapshotFromEditor(editor);
        await chaptersApi.createYjsSnapshot(chapterIdNum, base64, '手动保存');
      }
      
      showMessage('保存成功', 'success', undefined, undefined, { toast: true, autoCloseMs: 2000 });
    } catch {
      showMessage('保存失败', 'error', undefined, undefined, { toast: true, autoCloseMs: 2000 });
    }
  };
  
  const handleDeleteChapter = async (chapterId: string) => {
    showMessage(
      '确定要删除此章节吗？此操作不可恢复。',
      'warning',
      '删除章节',
      async () => {
        try {
          removeChapterLocally(chapterId);
          await deleteChapter(chapterId, { skipRefresh: true });
        } catch {
          // ignore
          setUpdateTrigger(prev => prev + 1);
        }
      }
    );
  };
  
  const handleOpenChapterModal = (
    mode: 'create' | 'edit',
    volumeId?: string,
    volumeTitle?: string,
    chapterData?: ChapterFullData
  ) => {
    openChapterModal(mode, volumeId, volumeTitle, chapterData);
  };
  
  const handleOpenVolumeModal = (mode: 'create' | 'edit', volumeId?: string, defaultTitle?: string) => {
    if (mode === 'create') {
      openNewVolumePopup(defaultTitle);
    } else if (volumeId) {
      const volume = volumes.find((v: { id: string }) => v.id === volumeId);
      if (volume) {
        openEditVolumePopup(volume);
      }
    }
  };
  
  const handleEditCurrentChapter = () => {
    if (selectedChapter && chaptersData[selectedChapter]) {
      const chapter = chaptersData[selectedChapter];
      openChapterModal('edit', chapter.volumeId, chapter.volumeTitle, chapter);
    }
  };

  /** 用户从续写推荐中选择方案后，用该方案的大纲和细纲打开「新建章节」弹窗并预填（卷取第一个真实卷或未分卷） */
  const handleUseContinueRecommendation = (payload: {
    title: string;
    outline: Record<string, unknown> | string;
    detailed_outline: Record<string, unknown> | string;
    next_chapter_number: number;
  }) => {
    const defaultVolume = volumes?.[0];
    const volumeId = defaultVolume?.id ?? 'draft';
    const volumeTitle = defaultVolume?.title ?? '未分卷';
    const chapterData: ChapterFullData = {
      id: '',
      volumeId,
      volumeTitle,
      title: payload.title,
      chapter_number: payload.next_chapter_number,
      characters: [],
      locations: [],
      outline: formatOutlineForEditor(payload.outline),
      detailOutline: formatDetailedOutlineForEditor(payload.detailed_outline),
    };
    openChapterModal('create', volumeId, volumeTitle, chapterData);
  };

  const handleSaveChapter = async (data: ChapterSaveData) => {
    const isCreate = !data.id || isNaN(parseInt(data.id));
    await saveChapterSettings(data);
    closeChapterModal();
    if (isCreate) {
      showMessage('章节创建成功', 'success', undefined, undefined, { toast: true, autoCloseMs: 2000 });
    }
  };
  
  const handleGenerateContent = async (content: string, isFinal?: boolean) => {
    if (editor) {
      const htmlContent = content
        .split('\n\n')
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');
      editor.commands.setContent(htmlContent || '<p></p>');
      if (isFinal) {
        // ignore
      }
    }
  };

  /** 根据当前章节的大纲和细纲生成章节内容（/gen_chapter 与 AI 助手调用） */
  const handleGenerateChapterFromOutline = async () => {
    if (!selectedChapter || !chaptersData[selectedChapter]) {
      throw new Error('请先选择章节');
    }
    const chapterIdNum = parseInt(selectedChapter, 10);
    if (isNaN(chapterIdNum)) {
      throw new Error('无效的章节');
    }
    const chapterData = chaptersData[selectedChapter];
    let outline = (chapterData.outline ?? '').trim();
    let detailOutline = (chapterData.detailOutline ?? '').trim();
    const title = chapterData.title ?? '';

    if (!outline || !detailOutline) {
      try {
        const docResult = await chaptersApi.getChapterDocument(chapterIdNum);
        const meta = docResult?.chapter_info?.metadata as Record<string, unknown> | undefined;
        if (meta) {
          if (!outline && meta.outline != null) {
            outline = typeof meta.outline === 'string' ? meta.outline : JSON.stringify(meta.outline);
          }
          if (!detailOutline && meta.detailed_outline != null) {
            detailOutline = typeof meta.detailed_outline === 'string'
              ? meta.detailed_outline
              : JSON.stringify(meta.detailed_outline);
          }
        }
      } catch {
        // ignore
      }
    }

    if (!outline || !detailOutline) {
      throw new Error('当前章节未填写大纲或细纲，请先在章节设置中填写');
    }
    if (!editor) {
      throw new Error('编辑器未就绪');
    }

    const meta = work?.metadata as { characters?: Array<{ name?: string }>; component_data?: { characters?: Array<{ name?: string }> } } | undefined;
    const chars1 = meta?.characters ?? [];
    const chars2 = meta?.component_data?.characters ?? [];
    const characterNames = [...chars1, ...chars2]
      .map((c: { name?: string }) => c?.name)
      .filter((n): n is string => Boolean(n));

    let fullContent = '';
    await generateChapterContent(
      outline,
      detailOutline,
      title || undefined,
      characterNames.length > 0 ? characterNames : undefined,
      [],
      (progress) => {
        if (progress.text) {
          fullContent += progress.text;
          handleGenerateContent(fullContent, false);
        }
        if (progress.status === 'done') {
          handleGenerateContent(fullContent, true);
        }
      },
    );
  };

  const handleDeleteWork = () => {
    showMessage(
      '确定要删除此作品吗？此操作不可恢复。',
      'warning',
      '删除作品',
      async () => {
        if (!workId) return;
        try {
          await worksApi.deleteWork(workId);
          showMessage('作品已删除', 'success', undefined, undefined, { toast: true, autoCloseMs: 2000 });
          const uid = authApi.getUserInfo()?.id;
          navigate(uid ? `/users/${uid}` : '/');
        } catch (err) {

          showMessage('删除作品失败', 'error');
        }
      }
    );
  };
  
  const handleReplace = () => {
    setIsReplacePanelOpen(!isReplacePanelOpen);
  };
  
  // ===== 渲染 =====
  if (loading) {
    return (
      <div className="novel-editor-page">
        <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>
      </div>
    );
  }
  
  if (error && !work) {
    return (
      <div className="novel-editor-page">
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--error, #666666)' }}>
          {error}
          <button 
            onClick={() => {
              const uid = authApi.getUserInfo()?.id;
              navigate(uid ? `/users/${uid}` : '/');
            }} 
            style={{ marginTop: '16px', padding: '8px 16px' }}
          >
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
          <button className="exit-btn" onClick={() => {
            if (work?.owner_id) {
              const currentUser = authApi.getUserInfo();
              if (currentUser?.id && work.owner_id === currentUser.id) {
                navigate(`/users/${currentUser.id}`);
              } else {
                navigate(`/users/${work.owner_id}`);
              }
            } else {
              navigate(-1);
            }
          }}>
            <ArrowLeft size={16} />
            <span>退出</span>
          </button>
          <div className="work-info">
            <h1 
              ref={titleEditableRef}
              className="work-title work-title-editable"
              contentEditable
              suppressContentEditableWarning
              onBlur={handleSaveTitle}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              title="点击编辑标题"
            >
              {work?.title || ''}
            </h1>
            <div className="work-info-row">
              <div className="work-stats-inline">
                <span className="sync-status-text">
                  {syncStatus.isOnline 
                    ? (syncStatus.pendingCount > 0 
                        ? `同步中 (${syncStatus.pendingCount})` 
                        : '已同步')
                    : '离线模式'}
                </span>
                <span className="stats-divider">·</span>
                <span>本章字数：{currentChapterWordCount}</span>
                <span className="stats-divider">·</span>
                <span>总字数：{work?.word_count ?? 0}</span>
                <span 
                  className="word-count-tooltip-wrapper"
                  data-tooltip-visible={showWordCountTooltip}
                  onMouseEnter={() => {
                    if (!isMobile) {
                      setShowWordCountTooltip(true);
                    }
                  }}
                  onMouseLeave={() => !isMobile && setShowWordCountTooltip(false)}
                  onClick={(e) => {
                    if (isMobile) {
                      e.stopPropagation();
                      setShowWordCountTooltip(!showWordCountTooltip);
                    }
                  }}
                >
                  <Info size={13} />
                  {showWordCountTooltip && (
                    <div 
                      className="word-count-tooltip"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="tooltip-section">
                        <div className="tooltip-title">原创保护</div>
                        <div className="tooltip-content">
                          球球写作尊重每一位作者的创作成果和知识权，不会将作者上传或发布在本平台上的任何内容用于AI训练或其他机器学习用途。<br />
                          生成结果仅供您参考，内容由AI大模型输出，不代表我们的态度或观点。
                        </div>
                      </div>
                    </div>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="header-center">
        </div>
        <div className="header-right">
          {isMobile ? (
            <>
              <button
                className="mobile-menu-btn"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              <button
                className="mobile-chat-btn"
                onClick={() => setMobileChatOpen(!mobileChatOpen)}
              >
                <MessageSquare size={24} />
              </button>
              <HeaderSettingsMenu
                onFindReplace={() => {
                  handleReplace();
                  setMobileMenuOpen(false);
                }}
                tipsEnabled={tipsEnabled}
                onToggleTips={toggleTips}
                onDeleteWork={handleDeleteWork}
                isMobile={true}
              />
            </>
          ) : (
            <>
              <div className="header-actions">
              <div className="sidebar-toggle-buttons">
                <button
                  className={`sidebar-toggle-btn-header left-toggle-header ${leftSidebarCollapsed ? 'collapsed' : ''}`}
                  onClick={toggleLeftSidebar}
                  title={leftSidebarCollapsed ? '展开左侧边栏' : '折叠左侧边栏'}
                >
                  {leftSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
                <button
                  className={`sidebar-toggle-btn-header right-toggle-header ${rightSidebarCollapsed ? 'collapsed' : ''}`}
                  onClick={toggleRightSidebar}
                  title={rightSidebarCollapsed ? '展开右侧边栏' : '折叠右侧边栏'}
                >
                  {rightSidebarCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
                </button>
              </div>
                
                
                <HeaderSettingsMenu
                  onFindReplace={() => {
                    handleReplace();
                    setMobileMenuOpen(false);
                  }}
                  tipsEnabled={tipsEnabled}
                  onToggleTips={toggleTips}
                  onDeleteWork={handleDeleteWork}
                />
              </div>

            </>
          )}
        </div>
      </header>

      <div className={`novel-editor-body ${leftSidebarCollapsed ? 'left-collapsed' : ''} ${rightSidebarCollapsed ? 'right-collapsed' : ''} ${isMobile ? 'mobile' : ''}`}>
        {/* 左侧边栏 - 桌面端 */}
        {!isMobile && (
          <div className={`sidebar-wrapper left-sidebar-wrapper ${leftSidebarCollapsed ? 'collapsed' : ''}`}>
            <SideNav
              activeNav={activeNav}
              onNavChange={setActiveNav}
              selectedChapter={selectedChapter}
              onChapterSelect={handleChapterSelect}
              onOpenChapterModal={handleOpenChapterModal}
              onOpenVolumeModal={handleOpenVolumeModal}
              onChapterDelete={handleDeleteChapter}
              deletedChapters={deletedChapters}
              loadDeletedChapters={loadDeletedChapters}
              onRestoreChapter={async (id) => {
                await restoreChapter(id);
                loadDeletedChapters();
              }}
              volumes={volumes}
              onVolumesChange={setVolumes}
              workType="long"
            />
          </div>
        )}
        
        {/* 移动端菜单抽屉 */}
        {isMobile && mobileMenuOpen && (
          <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
            <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-menu-header">
                <div className="mobile-menu-header-top">
                  <h2 className="mobile-menu-title">{work?.title ?? '作品信息'}</h2>
                  <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
                    <X size={24} />
                  </button>
                </div>
                <div className="mobile-menu-stats work-stats-inline">
                  <span className="sync-status-text">
                    {syncStatus.isOnline
                      ? (syncStatus.pendingCount > 0
                          ? `同步中 (${syncStatus.pendingCount})`
                          : '已同步')
                      : '离线模式'}
                  </span>
                  <span className="stats-divider">·</span>
                  <span>本章字数：{currentChapterWordCount}</span>
                  <span className="stats-divider">·</span>
                  <span>总字数：{work?.word_count ?? 0}</span>
                </div>
              </div>
              <div className="mobile-menu-content">
                <SideNav
                  activeNav={activeNav}
                  onNavChange={(nav) => {
                    setActiveNav(nav);
                    setMobileMenuOpen(false);
                  }}
                  selectedChapter={selectedChapter}
                  onChapterSelect={handleChapterSelect}
                  onOpenChapterModal={handleOpenChapterModal}
                  onOpenVolumeModal={handleOpenVolumeModal}
                  onChapterDelete={handleDeleteChapter}
                  deletedChapters={deletedChapters}
                  loadDeletedChapters={loadDeletedChapters}
                  onRestoreChapter={async (id) => {
                    await restoreChapter(id);
                    loadDeletedChapters();
                  }}
                  volumes={volumes}
                  onVolumesChange={setVolumes}
                  workType="long"
                />
              </div>
            </div>
          </div>
        )}

        {/* 主编辑区 */}
        <div className="novel-editor-main">
          {activeNav === 'work-info' && selectedChapter === null && (
            <WorkInfoManager 
              workId={workId} 
              workData={work ? { metadata: { ...(work.metadata || {}) } } as import('../components/editor/work-info/types').WorkData : undefined} 
            />
          )}
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'outline' && (
            <ChapterOutline 
              volumes={volumes}
              onEditVolume={(vol) => handleOpenVolumeModal('edit', vol.id)}
              onEditChapter={(chap, volId, volTitle) => {
                const fullChapter = chaptersData[chap.id];
                if (fullChapter) {
                  openChapterModal('edit', volId, volTitle, fullChapter);
                }
              }}
            />
          )}
          {activeNav === 'map' && <MapView />}
          {activeNav === 'characters' && (
            <Characters 
              availableCharacters={
                (() => {
                  type CharItem = { id: string; name: string; avatar?: string; gender?: string; description?: string; type?: string };
                  const metadata = work?.metadata as Record<string, unknown> | undefined;
                  const componentData = metadata?.component_data as Record<string, unknown> | undefined;
                  const chars = (componentData?.characters || metadata?.characters) as CharItem[] | undefined;
                  return Array.isArray(chars) ? chars : [];
                })()
              }
            />
          )}
          {activeNav === 'factions' && <Factions />}
          {activeNav === 'settings' && (
            <div className="placeholder-content">
              <h2>设置</h2>
              <p>功能开发中...</p>
            </div>
          )}
          
          {/* 文本编辑器 */}
          {selectedChapter !== null && !['tags', 'outline', 'map', 'characters', 'settings', 'factions'].includes(activeNav) && (
            <div className="chapter-editor-container">
              <div className="novel-editor-wrapper">
                <div className="chapter-content-wrapper" style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
                  <div className="editor-with-header">
                      {/* 工具栏 */}
                      <div className="embedded-toolbar">
                        <ChapterEditorToolbar
                          editor={editor}
                          onManualSave={handleManualSave}
                          onEditChapter={handleEditCurrentChapter}
                          onOpenHistory={() => setIsHistoryModalOpen(true)}
                          headingMenuOpen={headingMenuOpen}
                          setHeadingMenuOpen={setHeadingMenuOpen}
                        />
                      </div>
                      
                      <div className="editor-scroll-container">
                        {/* 章节头部 */}
                        {selectedChapter && chaptersData[selectedChapter] && (
                          <div className="chapter-header-info">
                            <div
                              ref={chapterNumberInputRef}
                              className="chapter-number chapter-number-editable"
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={handleSaveChapterNumber}
                              onKeyDown={handleChapterNumberKeyDown}
                              title="点击编辑章节号"
                              data-placeholder={chaptersData[selectedChapter].volumeTitle || '第1章'}
                            >
                              {getChapterNumberDisplayText(chaptersData[selectedChapter])}
                            </div>
                            <h2
                              ref={chapterNameInputRef}
                              className="chapter-title"
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={handleSaveChapterName}
                              onKeyDown={handleChapterNameKeyDown}
                            >
                              {chaptersData[selectedChapter].title || '未命名章节'}
                            </h2>
                          </div>
                        )}
                        
                        {/* 编辑器内容：key 随章节变化强制挂载，确保切换章节时显示对应 fragment */}
                        <div className="editor-content-area" key={documentId ?? 'no-chapter'}>
                          <EditorContent editor={editor} />
                        </div>
                      </div>
                    </div>
                </div>
              </div>
              
              {/* 选中文本浮动菜单：AI 对话 / 在编辑器中优化句子 */}
              <EditorSelectionPopup
                visible={selectionPopup.visible}
                top={selectionPopup.top}
                left={selectionPopup.left}
                selectedText={selectionPopup.text}
                startChar={selectionPopup.startChar}
                endChar={selectionPopup.endChar}
                onAIChat={handleSelectionAIChat}
                onOptimizeInEditor={handleSelectionOptimize}
                onClose={() => setSelectionPopup((prev) => ({ ...prev, visible: false }))}
                optimizing={selectionOptimizing}
              />
              {/* 查找替换面板 */}
              {isReplacePanelOpen && (
                <div className="find-replace-panel">
                  <div className="find-replace-inputs">
                    <div className="find-input-wrapper">
                      <input
                        type="text"
                        className="find-input"
                        value={findText}
                        onChange={(e) => setFindText(e.target.value)}
                        placeholder="查找"
                        autoFocus
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (e.shiftKey) {
                              findPrevious();
                            } else {
                              findNext();
                            }
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
                          e.stopPropagation();
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
                    <button
                      className="close-panel-btn"
                      onClick={() => setIsReplacePanelOpen(false)}
                      title="关闭 (Esc)"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧边栏 - 桌面端（AI对话窗口） */}
        {!isMobile && (
          <div className={`sidebar-wrapper right-sidebar-wrapper ${rightSidebarCollapsed ? 'collapsed' : ''}`}>
            <AIAssistant 
              workId={workId}
              initialSelectionRef={initialSelectionRef}
              onGenerateChapterFromOutline={handleGenerateChapterFromOutline}
              onUseContinueRecommendation={handleUseContinueRecommendation}
            />
          </div>
        )}

        {/* 移动端对话抽屉 */}
        {isMobile && mobileChatOpen && (
          <div className="mobile-chat-overlay" onClick={() => setMobileChatOpen(false)}>
            <div className="mobile-chat-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-chat-header">
                <h2>球球AI</h2>
                <button className="mobile-chat-close" onClick={() => setMobileChatOpen(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="mobile-chat-content">
                <AIAssistant 
                  workId={workId}
                  initialSelectionRef={initialSelectionRef}
                  onGenerateChapterFromOutline={handleGenerateChapterFromOutline}
                  onUseContinueRecommendation={handleUseContinueRecommendation}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 章节设置弹窗 */}
      <ChapterSettingsModal
        isOpen={isChapterModalOpen}
        mode={chapterModalMode}
        volumeId={currentVolumeId}
        volumeTitle={currentVolumeTitle}
        initialData={currentChapterData}
        availableCharacters={chapterModalAvailableCharacters}
        workMetadata={work?.metadata as Record<string, unknown> | undefined}
        defaultCharacterDataKey="component_data.characters"
        availableLocations={[]}
        availableVolumes={volumes.map((vol: { id: string; title: string }) => ({ id: vol.id, title: vol.title }))}
        onClose={closeChapterModal}
        onSave={handleSaveChapter}
        onGenerateContent={handleGenerateContent}
      />

      {/* 卷设置弹窗 */}
      <VolumeSettingsModal
        isOpen={isVolumePopupOpen}
        mode={isCreatingNewVolume ? 'create' : 'edit'}
        volumeId={currentEditingVolume?.id}
        initialTitle={editingVolumeTitle}
        initialOutline={editingVolumeOutline}
        initialDetailOutline={editingVolumeDetailOutline}
        onClose={closeVolumePopup}
        onSave={handleSaveVolume}
        onDelete={handleDeleteVolume}
      />

      {/* 章节历史记录 */}
      <ChapterHistoryModal
        isOpen={isHistoryModalOpen}
        chapterId={selectedChapter}
        chapterTitle={selectedChapter && chaptersData[selectedChapter] ? chaptersData[selectedChapter].title : undefined}
        onClose={() => setIsHistoryModalOpen(false)}
        getCurrentContent={editor ? () => getTextFromProsemirrorJSON(editor.getJSON()) : undefined}
        onRestore={editor && selectedChapter ? async (id, type) => {
          const chapterIdNum = parseInt(selectedChapter!, 10);
          if (Number.isNaN(chapterIdNum)) return;
          
          if (type === 'snapshot') {
            const data = await chaptersApi.getYjsSnapshot(chapterIdNum, id);
            restoreYjsSnapshotToEditor(editor!, data.snapshot);
            showMessage('已恢复到此快照', 'success', undefined, undefined, { toast: true, autoCloseMs: 2000 });
          }
        } : undefined}
      />
      
      {/* 消息提示 */}
      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        toast={messageState.toast}
        autoCloseMs={messageState.autoCloseMs}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />

      {/* 问题反馈按钮（右下角固定） */}
      <button
        className="feedback-fab"
        onClick={() => setFeedbackOpen(true)}
        title="问题反馈"
      >
        <MessageCircleQuestion size={18} />
      </button>

      {/* 问题反馈弹窗 */}
      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onShowMessage={(msg, type) =>
          showMessage(msg, type, undefined, undefined, { toast: true, autoCloseMs: 2500 })
        }
        context={{ work_id: workId, chapter_id: selectedChapter }}
      />

      {/* 新手引导 */}
      {workId && (
        <OnboardingGuide
          workId={workId}
          onStart={() => {
            setActiveNav('work-info');
            setSelectedChapter(null);
          }}
          onSkip={() => {}}
        />
      )}
      {/* 移动端侧边栏遮罩 */}
      {isMobile && (!leftSidebarCollapsed || !rightSidebarCollapsed) && (
        <div 
          className="sidebar-overlay"
          onClick={() => {
            if (!leftSidebarCollapsed) toggleLeftSidebar();
            if (!rightSidebarCollapsed) toggleRightSidebar();
          }}
        />
      )}
    </div>
  );
}
