/**
 * 小说编辑器页面
 * 模块化重构版本 - 控制在1000行以内
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Info, Menu, X, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { EditorContent } from '@tiptap/react';

// 组件
import SideNav from '../components/editor/SideNav';
import AIAssistant from '../components/editor/AIAssistant';
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
import ThemeSelector from '../components/ThemeSelector';
import ChapterEditorToolbar from '../components/editor/ChapterEditorToolbar';

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
import { syncManager } from '../utils/syncManager';
import { countCharacters } from '../utils/textUtils';
import { generateChapterContent } from '../utils/bookAnalysisApi';
import { chaptersApi } from '../utils/chaptersApi';
import { createYjsSnapshotFromEditor, restoreYjsSnapshotToEditor, getTextFromProsemirrorJSON } from '../utils/yjsSnapshot';

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
    removeChapterLocally,
    deletedChapters,
    loadDeletedChapters,
  } = useChapterManagement({
    workId,
    updateTrigger,
  });
  
  // ===== 章节操作 =====
  const {
    saveChapterSettings,
    deleteChapter,
    restoreChapter,
  } = useChapterOperations({
    workId,
    onSuccess: (msg: string) => showMessage(msg, 'success'),
    onError: (msg: string) => showMessage(msg, 'error'),
    onUpdateTrigger: () => setUpdateTrigger(prev => prev + 1),
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
    fetchInitialContent: async (docId) => {
      const m = docId.match(/^work_(.+?)_chapter_(.+)$/);
      if (!m) return null;
      const chapterId = parseInt(m[2], 10);
      if (Number.isNaN(chapterId)) return null;
      try {
        const res = await chaptersApi.getChapterDocument(chapterId);
        const content = res?.content;
        if (content && typeof content === 'string') {
          return content;
        }
        return null;
      } catch {
        return null;
      }
    },
    placeholder: '开始写作...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
    editable: true,
    onUpdate: (content) => {
      const wordCount = countCharacters(content);
      setCurrentChapterWordCount(wordCount);
    },
    onSyncSuccess: (version) => {
      console.log('✅ 同步成功，版本:', version);
      setSyncStatus(syncManager.getStatus());
    },
    onSyncError: (error) => {
      console.error('❌ 同步失败:', error);
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
    onMessage: (msg: string, type: 'success' | 'error') => showMessage(msg, type),
  });
  
  // ===== 可用角色列表 =====
  const availableCharacters = useMemo(() => {
    const charSet = new Set<string>();
    Object.values(chaptersData).forEach((chap: ChapterFullData) => {
      chap.characters?.forEach((char: string) => charSet.add(char));
    });
    return Array.from(charSet);
  }, [chaptersData]);
  
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
        console.error('加载作品失败:', err);
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
  
  // ===== 事件处理函数 =====
  const handleManualSave = async () => {
    if (!selectedChapter || !editor) {
      showMessage('请先选择章节', 'warning');
      return;
    }

    try {
      await syncToServer();
      showMessage('保存成功', 'success');
    } catch (err) {
      console.error('保存失败:', err);
      showMessage('保存失败', 'error');
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
        } catch (err) {
          console.error('删除章节失败:', err);
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
  
  const handleOpenVolumeModal = (mode: 'create' | 'edit', volumeId?: string) => {
    if (mode === 'create') {
      openNewVolumePopup();
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
  
  const handleSaveChapter = async (data: ChapterSaveData) => {
    await saveChapterSettings(data);
    closeChapterModal();
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
        console.log('✅ 章节内容生成完成');
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
      } catch (e) {
        console.warn('[handleGenerateChapterFromOutline] 拉取章节文档失败', e);
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
          showMessage('作品已删除', 'success');
          const uid = authApi.getUserInfo()?.id;
          navigate(uid ? `/users/${uid}` : '/');
        } catch (err) {
          console.error('删除作品失败:', err);
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
            <div className="work-info-row">
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
                <Info size={14} />
                {showWordCountTooltip && (
                  <div 
                    className="word-count-tooltip"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {selectedChapter != null && (
                      <span className="word-count-tooltip-line">本章字数：{currentChapterWordCount} 字</span>
                    )}
                    {selectedChapter != null && <span className="word-count-tooltip-sep"> </span>}
                    <span className="word-count-tooltip-line">总字数：{work?.word_count ?? 0} 字</span>
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
            </>
          ) : (
            <>
              <div className="header-actions">
                <span className={`status-tag-header ${syncStatus.isOnline ? 'online' : 'offline'}`}>
                  {syncStatus.isOnline 
                    ? (syncStatus.pendingCount > 0 
                        ? `同步中 (${syncStatus.pendingCount})` 
                        : '已同步')
                    : '离线模式'}
                </span>
                <button 
                  className="action-btn delete-work-btn" 
                  onClick={handleDeleteWork}
                  title="删除作品"
                >
                  <Trash2 size={16} />
                </button>
                <div className="action-btn theme-selector-header-wrap" title="主题">
                  <ThemeSelector onClose={() => setMobileMenuOpen(false)} />
                </div>
              </div>
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
              onChapterSelect={setSelectedChapter}
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
                <h2>菜单</h2>
                <button className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
                  <X size={24} />
                </button>
              </div>
              <div className="mobile-menu-actions">
                <div className="mobile-menu-section">
                  <h3>操作</h3>
                  <button 
                    className="mobile-menu-item" 
                    onClick={() => {
                      handleReplace();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span>查找替换</span>
                  </button>
                  <button 
                    className="mobile-menu-item delete" 
                    onClick={() => {
                      handleDeleteWork();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Trash2 size={20} />
                    <span>删除作品</span>
                  </button>
                </div>
                <div className="mobile-menu-section">
                  <h3>设置</h3>
                  <div className="mobile-menu-item">
                    <ThemeSelector />
                  </div>
                  <div className="mobile-menu-item">
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
              <div className="mobile-menu-content">
                <SideNav
                  activeNav={activeNav}
                  onNavChange={(nav) => {
                    setActiveNav(nav);
                    setMobileMenuOpen(false);
                  }}
                  selectedChapter={selectedChapter}
                  onChapterSelect={setSelectedChapter}
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
              onGenerateChapterFromOutline={handleGenerateChapterFromOutline}
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
                  onGenerateChapterFromOutline={handleGenerateChapterFromOutline}
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
        availableCharacters={availableCharacters.map((char, index) => ({ id: String(index), name: char }))}
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
        onCreateVersion={editor && selectedChapter ? async () => {
          const chapterIdNum = parseInt(selectedChapter!, 10);
          if (Number.isNaN(chapterIdNum)) return;
          const base64 = createYjsSnapshotFromEditor(editor!);
          await chaptersApi.createYjsSnapshot(chapterIdNum, base64);
          showMessage('版本已创建', 'success');
        } : undefined}
        onRestore={editor && selectedChapter ? async (snapshotId) => {
          const chapterIdNum = parseInt(selectedChapter!, 10);
          if (Number.isNaN(chapterIdNum)) return;
          const data = await chaptersApi.getYjsSnapshot(chapterIdNum, snapshotId);
          restoreYjsSnapshotToEditor(editor!, data.snapshot);
          showMessage('已恢复到此版本', 'success');
        } : undefined}
      />
      
      {/* 消息提示 */}
      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />
    </div>
  );
}
