/**
 * 小说编辑器页面
 * 模块化重构版本 - 控制在1000行以内
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Menu, X, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, MessageCircleQuestion, Share2 } from 'lucide-react';
import { EditorContent } from '@tiptap/react';

// 组件
import SideNav from '../components/editor/SideNav';
import CollabAIPanel from '../components/editor/CollabAIPanel';
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
import ExportModal from '../components/editor/ExportModal';
import ShareWorkModal from '../components/ShareWorkModal';

// HooksExportModal from '../components/editor/ExportModal';

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
import { authApi, type UserInfo } from '../utils/authApi';
import { countCharacters } from '../utils/textUtils';
import { chaptersApi } from '../utils/chaptersApi';
import { createYjsSnapshotFromEditor, restoreYjsSnapshotToEditor, getTextFromProsemirrorJSON } from '../utils/yjsSnapshot';
import { sendChatMessage } from '../utils/chatApi';

// 样式
import './NovelEditorPage.css';

export default function NovelEditorPage() {
  // Hook Order Fix: Ensure all hooks are declared at the top level before any conditional returns.
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get('workId');
  const isMobile = useIsMobile();
  
  // ===== 基础状态 =====
  const [work, setWork] = useState<Work | null>(null);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
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
  
  // 权限检查
  const canEdit = useMemo(() => {
    if (!work || !currentUser) return false;
    if (work.owner_id === currentUser.id) return true;
    if (work.collaborators) {
      const collaborator = work.collaborators.find(c => c.user_id === currentUser.id);
      if (collaborator && ['admin', 'editor'].includes(collaborator.permission)) {
        return true;
      }
    }
    return false;
  }, [work, currentUser]);

  const canView = useMemo(() => {
    if (!work || !currentUser) return false;
    if (work.owner_id === currentUser.id) return true;
    if (work.is_public) return true;
    if (work.collaborators) {
      const collaborator = work.collaborators.find(c => c.user_id === currentUser.id);
      if (collaborator && ['admin', 'editor', 'reader'].includes(collaborator.permission)) {
        return true;
      }
    }
    return false;
  }, [work, currentUser]);

  const isPending = useMemo(() => {
    if (!work || !currentUser) return false;
    if (work.collaborators) {
      const collaborator = work.collaborators.find(c => c.user_id === currentUser.id);
      if (collaborator && collaborator.permission === 'pending') {
        return true;
      }
    }
    return false;
  }, [work, currentUser]);

  const hasPendingRequests = useMemo(() => {
    if (!work || !currentUser || work.owner_id !== currentUser.id) return false;
    return work.collaborators?.some(c => c.permission === 'pending') ?? false;
  }, [work, currentUser]);

  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    if (!work) return;
    try {
      setIsApplying(true);
      await worksApi.applyCollaborator(work.id);
      showMessage('申请已发送，请等待作者批准', 'success', undefined, undefined, { toast: true, autoCloseMs: 3000 });
      // 重新加载作品信息以更新状态
      const updatedWork = await worksApi.getWork(work.id, true, true);
      setWork(updatedWork);
    } catch (err) {
      const message = err instanceof Error ? err.message : '申请失败';
      showMessage(message, 'error');
    } finally {
      setIsApplying(false);
    }
  };
  
  // ===== 功能引导状态 =====
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
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
    apiChapterWordCounts,
    updateChapterWordCount,
    deletedChapters,
    loadDeletedChapters,
  } = useChapterManagement({
    workId,
    updateTrigger,
    onError: (err: unknown) => {
      // 忽略 404 (可能是新作品没有章节)
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404')) {
        showMessage(`加载章节列表失败: ${msg}`, 'error');
      }
    }
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
  
  const { editor, syncToServer } = useYjsEditor({
    documentId,
    // Yjs IndexedDB (y-indexeddb) 是内容的唯一来源。
    // 此回调仅在 Yjs 本地和远端均无内容时作为最后兜底（如旧数据迁移场景）。
    fetchInitialContent: async (docId) => {
      const m = docId.match(/^work_(.+?)_chapter_(.+)$/);
      if (!m) return null;
      const chapterId = parseInt(m[2], 10);
      if (Number.isNaN(chapterId)) return null;
      try {
        const res = await chaptersApi.getChapterDocument(chapterId);
        return res?.content || null;
      } catch {
        return null;
      }
    },
    placeholder: '开始写作...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
    editable: canEdit,
    onUpdate: (content) => {
      const wordCount = countCharacters(content);
      setCurrentChapterWordCount(wordCount);
      if (selectedChapter) updateChapterWordCount(selectedChapter, wordCount);
    },
    onSyncSuccess: () => {
      // Yjs 同步成功
    },
    onSyncError: () => {
      // ignore
    },
  });
  
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

  // ===== 章节顺序导航 =====
  const orderedChapters = useMemo(() => volumes.flatMap(vol => vol.chapters), [volumes]);
  const currentChapterIndex = useMemo(
    () => (selectedChapter ? orderedChapters.findIndex(c => c.id === selectedChapter) : -1),
    [orderedChapters, selectedChapter]
  );
  const prevChapter = currentChapterIndex > 0 ? orderedChapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < orderedChapters.length - 1
    ? orderedChapters[currentChapterIndex + 1] : null;

  // 传给章节弹窗的角色列表保持引用稳定，避免弹窗内 useEffect 因依赖变化反复重置选中状态
  const chapterModalAvailableCharacters = useMemo(
    () => availableCharacters.map((char, index) => ({ id: String(index), name: char })),
    [availableCharacters]
  );
  
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
        // 并行加载作品和用户信息
        const [workData, userData] = await Promise.all([
          worksApi.getWork(workId, true, true),
          authApi.getCurrentUser().catch(() => null)
        ]);
        
        setWork(workData);
        setCurrentUser(userData);
        
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
  
  // ===== 监听在线/离线状态 =====
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
        updateChapterWordCount(selectedChapter, wordCount);
      }, 100);
      return () => clearTimeout(timer);
    } else if (!selectedChapter) {
      setCurrentChapterWordCount(0);
    }
  }, [selectedChapter, editor]); // eslint-disable-line react-hooks/exhaustive-deps
  
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

  const handleSelectionAIChatRef = useRef<() => void>(() => {});

  const handleSelectionAIChat = () => {
    if (isMobile) {
      setMobileChatOpen(true);
    } else {
      if (rightSidebarCollapsed) toggleRightSidebar();
    }
    setSelectionPopup((prev) => ({ ...prev, visible: false }));
  };

  // 保持 ref 与最新的 handleSelectionAIChat 同步，避免 Ctrl+U 监听器中闭包过期
  useEffect(() => {
    handleSelectionAIChatRef.current = handleSelectionAIChat;
  });

  // Ctrl+U 快捷键：选中文本时直接打开 AI 对话
  useEffect(() => {
    if (!editor) return;
    const handleCtrlU = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          e.preventDefault();
          handleSelectionAIChatRef.current();
        }
      }
    };
    editor.view.dom.addEventListener('keydown', handleCtrlU);
    return () => {
      editor.view.dom.removeEventListener('keydown', handleCtrlU);
    };
  }, [editor]);

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
        } catch {

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
  
  // 权限检查逻辑已移至组件顶部

  if (work && !canView) {
    return (
      <div className="novel-editor-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          background: 'var(--bg-secondary, #252b3b)', 
          borderRadius: '8px',
          maxWidth: '500px',
          width: '90%'
        }}>
          <h2 style={{ marginBottom: '16px', color: 'var(--text-primary, #e1e1e1)' }}>{work.title}</h2>
          <p style={{ marginBottom: '24px', color: 'var(--text-secondary, #a0a0a0)' }}>
            您没有访问该作品的权限，无法查看内容。
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            {isPending ? (
              <button 
                className="secondary-btn"
                disabled
                style={{ padding: '8px 24px', opacity: 0.7, cursor: 'not-allowed' }}
              >
                申请审核中
              </button>
            ) : (
              <button 
                className="primary-btn"
                onClick={handleApply}
                disabled={isApplying}
                style={{ padding: '8px 24px' }}
              >
                {isApplying ? '发送中...' : '申请访问权限'}
              </button>
            )}
            <button 
              className="secondary-btn"
              onClick={() => navigate('/')}
              style={{ padding: '8px 24px' }}
            >
              返回首页
            </button>
          </div>
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
            const currentUser = authApi.getUserInfo();
            if (currentUser?.id) {
              navigate(`/users/${currentUser.id}`);
            } else {
              navigate('/');
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
                  {isOnline ? '已同步' : '离线模式'}
                </span>
                <span className="stats-divider">·</span>
                <span>本章字数：{currentChapterWordCount}</span>
                <span className="stats-divider">·</span>
                <span>总字数：{Object.values(apiChapterWordCounts).reduce((sum, n) => sum + n, 0)}</span>
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
                className="mobile-share-btn"
                onClick={() => setIsShareModalOpen(true)}
              >
                <Share2 size={24} />
              </button>
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
                onExport={() => setIsExportModalOpen(true)}
                onShare={() => setIsShareModalOpen(true)}
                isMobile={true}
                hasPendingRequests={hasPendingRequests}
                readOnly={!canEdit}
              />
            </>
          ) : (
            <>
              <div className="header-actions">
              {canEdit && (
              <button
                className="header-share-btn"
                onClick={() => setIsShareModalOpen(true)}
                title="共享作品"
              >
                {hasPendingRequests && <div className="share-badge" />}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <span>分享</span>
              </button>
              )}
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
                  onExport={() => setIsExportModalOpen(true)}
                  onShare={() => setIsShareModalOpen(true)}
                  hasPendingRequests={hasPendingRequests}
                  readOnly={!canEdit}
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
              readOnly={!canEdit}
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
                    {isOnline ? '已同步' : '离线模式'}
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
              readOnly={!canEdit}
            />
          )}
          {activeNav === 'tags' && <TagsManager readOnly={!canEdit} />}
          {activeNav === 'outline' && (
            <ChapterOutline 
              volumes={volumes}
              readOnly={!canEdit}
              onEditVolume={(vol) => handleOpenVolumeModal('edit', vol.id)}
              onEditChapter={(chap, volId, volTitle) => {
                const fullChapter = chaptersData[chap.id];
                if (fullChapter) {
                  openChapterModal('edit', volId, volTitle, fullChapter);
                }
              }}
            />
          )}
          {activeNav === 'map' && <MapView readOnly={!canEdit} />}
          {activeNav === 'characters' && (
            <Characters 
              readOnly={!canEdit}
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
          {activeNav === 'factions' && <Factions readOnly={!canEdit} />}
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
                          readOnly={!canEdit}
                        />
                      </div>
                      
                      <div className="editor-scroll-container">
                        {/* 章节头部 */}
                        {selectedChapter && chaptersData[selectedChapter] && (
                          <div className="chapter-header-info">
                            <div
                              ref={chapterNumberInputRef}
                              className={`chapter-number ${canEdit ? 'chapter-number-editable' : ''}`}
                              contentEditable={canEdit}
                              suppressContentEditableWarning
                              onBlur={handleSaveChapterNumber}
                              onKeyDown={handleChapterNumberKeyDown}
                              title={canEdit ? "点击编辑章节号" : undefined}
                              data-placeholder={chaptersData[selectedChapter].volumeTitle || '第1章'}
                            >
                              {getChapterNumberDisplayText(chaptersData[selectedChapter])}
                            </div>
                            <h2
                              ref={chapterNameInputRef}
                              className="chapter-title"
                              contentEditable={canEdit}
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

                      {/* 章节导航 - 固定在编辑器底部 */}
                      {(prevChapter || nextChapter) && (
                        <div className="chapter-nav-footer">
                          {prevChapter ? (
                            <button
                              className="chapter-nav-btn prev"
                              onClick={() => handleChapterSelect(prevChapter.id)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                              <div className="chapter-nav-info">
                                <span className="chapter-nav-label">上一章</span>
                                <span className="chapter-nav-title">{prevChapter.title || '未命名章节'}</span>
                              </div>
                            </button>
                          ) : <div className="chapter-nav-placeholder" />}
                          {nextChapter ? (
                            <button
                              className="chapter-nav-btn next"
                              onClick={() => handleChapterSelect(nextChapter.id)}
                            >
                              <div className="chapter-nav-info">
                                <span className="chapter-nav-label">下一章</span>
                                <span className="chapter-nav-title">{nextChapter.title || '未命名章节'}</span>
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </button>
                          ) : <div className="chapter-nav-placeholder" />}
                        </div>
                      )}
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
                readOnly={!canEdit}
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
                    {canEdit && (
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
                    )}
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
            <CollabAIPanel
              workId={workId ?? ''}
              chapters={orderedChapters}
              currentChapterId={selectedChapter ?? undefined}
              onUseContinueRecommendation={handleUseContinueRecommendation}
              onWriteToEditor={handleGenerateContent}
              currentUserId={currentUser?.id}
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
                <CollabAIPanel
                  workId={workId ?? ''}
                  chapters={orderedChapters}
                  currentChapterId={selectedChapter ?? undefined}
                  onUseContinueRecommendation={handleUseContinueRecommendation}
                  currentUserId={currentUser?.id}
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
        workId={workId}
        chapterId={currentChapterData?.id ? Number(currentChapterData.id) : undefined}
        onClose={closeChapterModal}
        onSave={handleSaveChapter}
        onGenerateContent={handleGenerateContent}
        readOnly={!canEdit}
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
        readOnly={!canEdit}
      />

      {/* 章节历史记录 */}
      <ChapterHistoryModal
        isOpen={isHistoryModalOpen}
        chapterId={selectedChapter}
        chapterTitle={selectedChapter && chaptersData[selectedChapter] ? chaptersData[selectedChapter].title : undefined}
        onClose={() => setIsHistoryModalOpen(false)}
        getCurrentContent={editor ? () => getTextFromProsemirrorJSON(editor.getJSON()) : undefined}
        onRestore={canEdit && editor && selectedChapter ? async (id, type) => {
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
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        workId={workId || ''}
        workTitle={work?.title || '未命名作品'}
        volumes={volumes}
      />

      <ShareWorkModal
        isOpen={isShareModalOpen}
        workId={workId || ''}
        workTitle={work?.title || '未命名作品'}
        onClose={() => setIsShareModalOpen(false)}
      />

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
