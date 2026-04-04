/**
 * 小说编辑器页面
 * 模块化重构版本 - 控制在1000行以内
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    setLeftSidebarCollapsed,
    setRightSidebarCollapsed,
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
  const leftSidebarAutoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightSidebarAutoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLeftSidebarAutoCollapseTimer = useCallback(() => {
    if (leftSidebarAutoCollapseTimerRef.current) {
      clearTimeout(leftSidebarAutoCollapseTimerRef.current);
      leftSidebarAutoCollapseTimerRef.current = null;
    }
  }, []);
  const clearRightSidebarAutoCollapseTimer = useCallback(() => {
    if (rightSidebarAutoCollapseTimerRef.current) {
      clearTimeout(rightSidebarAutoCollapseTimerRef.current);
      rightSidebarAutoCollapseTimerRef.current = null;
    }
  }, []);
  const scheduleLeftSidebarAutoCollapse = useCallback(() => {
    if (isMobile || leftSidebarCollapsed) return;
    clearLeftSidebarAutoCollapseTimer();
    leftSidebarAutoCollapseTimerRef.current = setTimeout(() => {
      setLeftSidebarCollapsed(true);
    }, 1800);
  }, [clearLeftSidebarAutoCollapseTimer, isMobile, leftSidebarCollapsed, setLeftSidebarCollapsed]);
  const scheduleRightSidebarAutoCollapse = useCallback(() => {
    if (isMobile || rightSidebarCollapsed) return;
    clearRightSidebarAutoCollapseTimer();
    rightSidebarAutoCollapseTimerRef.current = setTimeout(() => {
      setRightSidebarCollapsed(true);
    }, 1800);
  }, [clearRightSidebarAutoCollapseTimer, isMobile, rightSidebarCollapsed, setRightSidebarCollapsed]);

  useEffect(() => {
    if (!isMobile && !leftSidebarCollapsed) {
      scheduleLeftSidebarAutoCollapse();
    } else {
      clearLeftSidebarAutoCollapseTimer();
    }
    return clearLeftSidebarAutoCollapseTimer;
  }, [clearLeftSidebarAutoCollapseTimer, isMobile, leftSidebarCollapsed, scheduleLeftSidebarAutoCollapse]);

  useEffect(() => {
    if (!isMobile && !rightSidebarCollapsed) {
      scheduleRightSidebarAutoCollapse();
    } else {
      clearRightSidebarAutoCollapseTimer();
    }
    return clearRightSidebarAutoCollapseTimer;
  }, [clearRightSidebarAutoCollapseTimer, isMobile, rightSidebarCollapsed, scheduleRightSidebarAutoCollapse]);
  
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
          navigate('/novel?section=workbench');
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
      <div className="fixed inset-0 z-[2000] flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(180deg,#f6f0ff_0%,#fdf7ff_100%)] text-foreground">
        <div className="p-10 text-center text-sm text-[#574235]">加载中...</div>
      </div>
    );
  }
  
  if (error && !work) {
    return (
      <div className="fixed inset-0 z-[2000] flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(180deg,#f6f0ff_0%,#fdf7ff_100%)] text-foreground">
        <div className="p-10 text-center text-destructive">
          {error}
          <button
            onClick={() => {
              navigate('/novel?section=workbench');
            }} 
            className="mt-4 rounded-xl border border-[#dfc1af] bg-white px-4 py-2 text-[#1f045a] transition-colors hover:bg-[#f8f1ff]"
          >
            返回工作台
          </button>
        </div>
      </div>
    );
  }
  
  // 权限检查逻辑已移至组件顶部

  if (work && !canView) {
    return (
      <div className="fixed inset-0 z-[2000] flex h-screen w-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f6f0ff_0%,#fdf7ff_100%)] text-foreground">
        <div className="w-[90%] max-w-[500px] rounded-[28px] border border-[#ede4ff] bg-white/95 p-10 text-center shadow-[0px_28px_60px_rgba(31,4,90,0.12)] backdrop-blur">
          <h2 className="mb-4 text-2xl font-semibold text-[#1f045a]">{work.title}</h2>
          <p className="mb-6 text-sm leading-6 text-[#574235]/80">
            您没有访问该作品的权限，无法查看内容。
          </p>
          <div className="flex justify-center gap-4">
            {isPending ? (
              <Button
                variant="outline"
                disabled
              >
                申请审核中
              </Button>
            ) : (
              <Button
                onClick={handleApply}
                disabled={isApplying}
              >
                {isApplying ? '发送中...' : '申请访问权限'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate('/novel?section=workbench')}
            >
              返回工作台
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2000] flex h-screen w-screen flex-col overflow-hidden bg-[linear-gradient(180deg,#f6f0ff_0%,#fdf7ff_100%)] text-foreground">
      <header className="relative z-20 flex min-h-[72px] items-center justify-between gap-4 border-b border-[#ede4ff] bg-[#fdf7ff]/95 px-5 py-3 shadow-sm backdrop-blur max-md:h-16 max-md:min-h-16 max-md:gap-2 max-md:px-3 max-md:py-2">
        <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-3 max-md:gap-1">
          <button className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#ede4ff] bg-white px-3 py-2 text-sm text-[#574235]/80 transition-colors hover:bg-[#f8f1ff] hover:text-[#1f045a] max-md:px-2 max-md:py-1.5" onClick={() => navigate('/novel?section=workbench')}>
            <ArrowLeft size={16} />
            <span className="max-md:hidden">返回工作台</span>
          </button>
          <div className="relative flex min-w-0 flex-1 flex-col justify-center">
            <h1 
              ref={titleEditableRef}
              className="min-w-0 truncate rounded px-0.5 text-[18px] font-semibold leading-[1.2] text-[#1f045a] outline-none max-md:text-[15px]"
              contentEditable
              suppressContentEditableWarning
              onBlur={handleSaveTitle}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              title="点击编辑标题"
            >
              {work?.title || ''}
            </h1>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 max-md:hidden">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#574235]/70">
                <span className="font-medium text-[#574235]/70">
                  {isOnline ? '已同步' : '离线模式'}
                </span>
                <span className="mx-0.5 font-bold text-[#dfc1af]">·</span>
                <span>本章字数：{currentChapterWordCount}</span>
                <span className="mx-0.5 font-bold text-[#dfc1af]">·</span>
                <span>总字数：{Object.values(apiChapterWordCounts).reduce((sum, n) => sum + n, 0)}</span>
                <span 
                  className="inline-flex shrink-0 cursor-help items-center justify-center rounded p-0.5 text-[#574235]/70 transition-colors hover:bg-[#f2ebff] hover:text-[#1f045a]"
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
                      className="fixed left-6 top-[65px] z-[2000000] w-[300px] rounded-2xl border border-[#ede4ff] bg-white/95 p-4 text-[13px] text-[#1f045a] shadow-[0px_20px_40px_rgba(31,4,90,0.1)] backdrop-blur-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="text-sm font-bold text-[#1f045a]">原创保护</div>
                        <div className="leading-6 text-[#574235]/80">
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
        <div className="flex min-w-0 flex-none items-center gap-3 max-md:gap-1">
          {isMobile ? (
            <>
              <button
                className="inline-flex size-10 items-center justify-center rounded-xl border border-[#ede4ff] bg-white text-[#574235]/70 transition-colors hover:bg-[#f8f1ff] hover:text-[#1f045a]"
                onClick={() => setIsShareModalOpen(true)}
              >
                <Share2 size={24} />
              </button>
              <button
                className="inline-flex size-10 items-center justify-center rounded-xl border border-[#ede4ff] bg-white text-[#574235]/70 transition-colors hover:bg-[#f8f1ff] hover:text-[#1f045a]"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              <button
                className="inline-flex size-10 items-center justify-center rounded-xl border border-[#ede4ff] bg-white text-[#574235]/70 transition-colors hover:bg-[#f8f1ff] hover:text-[#1f045a]"
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
              <div className="flex shrink-0 items-center gap-2">
              {canEdit && (
              <button
                className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#dfc1af] bg-white px-3.5 text-[13px] font-medium text-[#1f045a] transition-colors hover:bg-[#f8f1ff] hover:text-[#ff8000]"
                onClick={() => setIsShareModalOpen(true)}
                title="共享作品"
              >
                {hasPendingRequests && <div className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-white bg-[#ff4d4f]" />}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <span>分享</span>
              </button>
              )}
              <div className="flex items-center gap-1 rounded-full border border-[#ede4ff] bg-white px-1.5 py-1 shadow-[0px_8px_20px_rgba(31,4,90,0.04)]">
                <button
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full text-[#574235]/70 transition-all hover:-translate-y-0.5 hover:bg-[#f8f1ff] hover:text-[#1f045a]',
                    leftSidebarCollapsed && 'bg-[#ff8000] text-white shadow-[0_8px_18px_rgba(255,128,0,0.28)] hover:bg-[#e87400]',
                    leftSidebarCollapsed && 'fixed left-4 top-[108px] z-[1000] shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                  )}
                  onClick={toggleLeftSidebar}
                  title={leftSidebarCollapsed ? '展开左侧边栏' : '折叠左侧边栏'}
                >
                  {leftSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
                <button
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full text-[#574235]/70 transition-all hover:-translate-y-0.5 hover:bg-[#f8f1ff] hover:text-[#1f045a]',
                    rightSidebarCollapsed && 'bg-[#ff8000] text-white shadow-[0_8px_18px_rgba(255,128,0,0.28)] hover:bg-[#e87400]',
                    rightSidebarCollapsed && 'fixed right-4 top-[108px] z-[1000] shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                  )}
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

      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,#f6f0ff_0%,#fdf7ff_100%)]">
        {!isMobile && (
          <div
            className={cn(
              'pointer-events-none absolute inset-y-4 left-4 z-40 transition-all duration-300',
              leftSidebarCollapsed ? 'w-0 opacity-0' : 'w-[clamp(220px,22vw,320px)] opacity-100'
            )}
          >
            <div
              className="pointer-events-auto h-full overflow-hidden rounded-[28px] border border-[#ede4ff] bg-[#f8f1ff]/95 shadow-[0px_20px_40px_rgba(31,4,90,0.08)] backdrop-blur"
              onMouseEnter={clearLeftSidebarAutoCollapseTimer}
              onMouseLeave={scheduleLeftSidebarAutoCollapse}
              onFocusCapture={clearLeftSidebarAutoCollapseTimer}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  scheduleLeftSidebarAutoCollapse();
                }
              }}
            >
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
          </div>
        )}
        
        {isMobile && mobileMenuOpen && (
          <div className="fixed inset-0 z-[2100] bg-black/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
            <div className="h-full w-[85vw] max-w-[360px] overflow-hidden bg-[#fdf7ff] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="border-b border-[#ede4ff] px-4 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="truncate text-lg font-semibold text-foreground">{work?.title ?? '作品信息'}</h2>
                  <button className="inline-flex size-9 items-center justify-center rounded-lg text-[#574235]/70 transition-colors hover:bg-[#f2ebff] hover:text-[#1f045a]" onClick={() => setMobileMenuOpen(false)}>
                    <X size={24} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[#574235]/70">
                  <span className="font-medium text-[#574235]/70">
                    {isOnline ? '已同步' : '离线模式'}
                  </span>
                  <span className="font-bold text-border">·</span>
                  <span>本章字数：{currentChapterWordCount}</span>
                  <span className="font-bold text-border">·</span>
                  <span>总字数：{work?.word_count ?? 0}</span>
                </div>
              </div>
              <div className="h-[calc(100%-88px)] overflow-y-auto">
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

        <div className="relative z-0 flex h-full min-w-0 flex-1 flex-col overflow-visible bg-transparent">
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
            <div className="flex min-h-[400px] flex-1 flex-col items-center justify-center text-muted-foreground">
              <h2 className="mb-4 text-2xl font-semibold text-foreground">设置</h2>
              <p>功能开发中...</p>
            </div>
          )}
          
          {/* 文本编辑器 */}
          {selectedChapter !== null && !['tags', 'outline', 'map', 'characters', 'settings', 'factions'].includes(activeNav) && (
            <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 flex-1">
                <div className="mx-auto flex h-full w-full max-w-[900px]">
                  <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
                      <div className="shrink-0">
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
                      
                      <div className="min-h-0 flex-1 overflow-y-auto bg-transparent">
                        {selectedChapter && chaptersData[selectedChapter] && (
                          <div className="px-6 pb-5 pt-8 max-md:px-4">
                            <div
                              ref={chapterNumberInputRef}
                              className={cn(
                                'mb-2 text-sm font-medium tracking-[0.18em] text-[#964900] outline-none',
                                canEdit && 'cursor-text'
                              )}
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
                              className="text-[28px] font-semibold leading-tight text-[#1f045a] outline-none max-md:text-[24px]"
                              contentEditable={canEdit}
                              suppressContentEditableWarning
                              onBlur={handleSaveChapterName}
                              onKeyDown={handleChapterNameKeyDown}
                            >
                              {chaptersData[selectedChapter].title || '未命名章节'}
                            </h2>
                          </div>
                        )}
                        
                        <div className="px-6 pb-10 max-md:px-4" key={documentId ?? 'no-chapter'}>
                          <EditorContent editor={editor} />
                        </div>
                      </div>

                      {(prevChapter || nextChapter) && (
                        <div className="grid shrink-0 grid-cols-2 gap-0 border-t border-[#ede4ff] bg-[#fdf7ff]/92 px-6 py-3 backdrop-blur max-md:px-4">
                          {prevChapter ? (
                            <button
                              className="flex min-w-0 items-center gap-3 py-3 pr-4 text-left transition-colors hover:text-[#ff8000]"
                              onClick={() => handleChapterSelect(prevChapter.id)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                              <div className="flex min-w-0 flex-col">
                                <span className="text-xs text-[#574235]/70">上一章</span>
                                <span className="truncate text-sm font-medium text-[#1f045a]">{prevChapter.title || '未命名章节'}</span>
                              </div>
                            </button>
                          ) : <div />}
                          {nextChapter ? (
                            <button
                              className="flex min-w-0 items-center justify-end gap-3 py-3 pl-4 text-right transition-colors hover:text-[#ff8000]"
                              onClick={() => handleChapterSelect(nextChapter.id)}
                            >
                              <div className="flex min-w-0 flex-col">
                                <span className="text-xs text-[#574235]/70">下一章</span>
                                <span className="truncate text-sm font-medium text-[#1f045a]">{nextChapter.title || '未命名章节'}</span>
                              </div>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </button>
                          ) : <div />}
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

        {!isMobile && (
          <div
            className={cn(
              'pointer-events-none absolute inset-y-4 right-4 z-40 transition-all duration-300',
              rightSidebarCollapsed ? 'w-0 opacity-0' : 'w-[clamp(260px,26vw,360px)] opacity-100'
            )}
          >
            <div
              className="pointer-events-auto h-full overflow-hidden rounded-[28px] border border-[#ede4ff] bg-[#f8f1ff]/95 shadow-[0px_20px_40px_rgba(31,4,90,0.08)] backdrop-blur"
              onMouseEnter={clearRightSidebarAutoCollapseTimer}
              onMouseLeave={scheduleRightSidebarAutoCollapse}
              onFocusCapture={clearRightSidebarAutoCollapseTimer}
              onBlurCapture={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  scheduleRightSidebarAutoCollapse();
                }
              }}
            >
              <CollabAIPanel
                workId={workId ?? ''}
                chapters={orderedChapters}
                currentChapterId={selectedChapter ?? undefined}
                onUseContinueRecommendation={handleUseContinueRecommendation}
                onWriteToEditor={handleGenerateContent}
                currentUserId={currentUser?.id}
              />
            </div>
          </div>
        )}

        {isMobile && mobileChatOpen && (
          <div className="fixed inset-0 z-[2100] bg-black/40 backdrop-blur-sm" onClick={() => setMobileChatOpen(false)}>
            <div className="ml-auto flex h-full w-[85vw] max-w-[380px] flex-col overflow-hidden bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border px-4 py-4">
                <h2 className="text-lg font-semibold text-foreground">球球AI</h2>
                <button className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={() => setMobileChatOpen(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
        className="fixed bottom-6 right-6 z-[2100] inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:bg-primary/90"
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
          className="fixed inset-0 z-[2050] bg-black/20 backdrop-blur-[1px]"
          onClick={() => {
            if (!leftSidebarCollapsed) toggleLeftSidebar();
            if (!rightSidebarCollapsed) toggleRightSidebar();
          }}
        />
      )}
    </div>
  );
}
