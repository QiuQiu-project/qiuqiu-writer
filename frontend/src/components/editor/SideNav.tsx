import { BookOpen, ChevronDown, ChevronRight, Plus, Settings, ArrowUpDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import './SideNav.css';

export type NavItem = 'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions';

export interface ChapterFullData {
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

interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  chapter_number?: number;  // 章节号
  characters?: string[];
  locations?: string[];
  outline?: string;
  detailOutline?: string;
}

interface Volume {
  id: string;
  title: string;
  chapters: Chapter[];
}

interface Draft {
  id: string;
  title: string;
  volumeId?: string;
  volumeTitle?: string;
  characters?: string[];
  locations?: string[];
  outline?: string;
  detailOutline?: string;
}

interface SideNavProps {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  selectedChapter?: string | null;
  onChapterSelect?: (chapterId: string | null) => void;
  onOpenChapterModal?: (mode: 'create' | 'edit', volumeId: string, volumeTitle: string, chapterData?: ChapterFullData) => void;
  onChapterDelete?: (chapterId: string) => void;  // 删除章节回调
  drafts?: Draft[];
  onDraftsChange?: (drafts: Draft[]) => void;
  volumes?: Volume[];
  onVolumesChange?: (volumes: Volume[]) => void;
  workType?: 'long' | 'short' | 'script' | 'video';  // 作品类型：长篇支持分卷，短篇不分卷
}

// 导出 Chapter 和 Volume 类型供外部使用
export type { Chapter, Volume };

export default function SideNav({ activeNav, onNavChange, selectedChapter, onChapterSelect, onOpenChapterModal, onChapterDelete, drafts: externalDrafts, onDraftsChange, volumes: externalVolumes, onVolumesChange, workType = 'long' }: SideNavProps) {
  const [chaptersExpanded, setChaptersExpanded] = useState(true);
  const [draftsExpanded, setDraftsExpanded] = useState(false);
  const [isChaptersReversed, setIsChaptersReversed] = useState(false); // 章节排序状态
  
  // 草稿数据 - 使用外部传入的或内部状态
  const [internalDrafts, setInternalDrafts] = useState<Draft[]>([
    { id: 'draft1', title: '草稿 1' },
  ]);
  const drafts = externalDrafts || internalDrafts;
  const setDrafts = onDraftsChange || setInternalDrafts;
  
  // 卷和章节数据 - 使用外部传入的或内部状态
  const [internalVolumes, setInternalVolumes] = useState<Volume[]>([
    {
      id: 'vol1',
      title: '第一卷',
      chapters: [
        { id: 'vol1-chap1', volumeId: 'vol1', title: '第1章', characters: [], locations: [], outline: '', detailOutline: '' },
        { id: 'vol1-chap2', volumeId: 'vol1', title: '第2章', characters: [], locations: [], outline: '', detailOutline: '' },
        { id: 'vol1-chap3', volumeId: 'vol1', title: '第3章', characters: [], locations: [], outline: '', detailOutline: '' },
      ],
    },
    {
      id: 'vol2',
      title: '第二卷',
      chapters: [
        { id: 'vol2-chap1', volumeId: 'vol2', title: '第1章', characters: [], locations: [], outline: '', detailOutline: '' },
      ],
    },
  ]);
  const volumes = externalVolumes || internalVolumes;
  const setVolumes = onVolumesChange || setInternalVolumes;

  const [volumesExpanded, setVolumesExpanded] = useState<Record<string, boolean>>({
    vol1: true,
    vol2: false,
  });

  const setVolumeExpanded = (volumeId: string, expanded: boolean) => {
    setVolumesExpanded(prev => ({
      ...prev,
      [volumeId]: expanded,
    }));
  };

  // 添加新卷
  const handleAddVolume = (e: React.MouseEvent) => {
    e.stopPropagation();
    const volumeNumber = volumes.length + 1;
    const volumeId = `vol${volumeNumber}`;
    const newVolume: Volume = {
      id: volumeId,
      title: `第${getVolumeNumber(volumeNumber)}卷`,
      chapters: [],
    };
    setVolumes([...volumes, newVolume]);
    setVolumesExpanded(prev => ({ ...prev, [volumeId]: true }));
  };

  // 打开新建章节弹框
  const handleAddChapter = (volumeId: string, volumeTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVolumesExpanded(prev => ({ ...prev, [volumeId]: true }));
    onOpenChapterModal?.('create', volumeId, volumeTitle);
  };

  // 打开编辑章节弹框
  const handleEditChapter = (chapter: Chapter, volumeTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const volume = volumes.find(v => v.chapters.some(c => c.id === chapter.id));
    if (volume) {
      onOpenChapterModal?.('edit', volume.id, volumeTitle, {
        id: chapter.id,
        volumeId: volume.id,
        volumeTitle,
        title: chapter.title,
        chapter_number: chapter.chapter_number,  // 传递章节号
        characters: chapter.characters || [],
        locations: chapter.locations || [],
        outline: chapter.outline || '',
        detailOutline: chapter.detailOutline || '',
      });
    }
  };

  // 删除章节
  const handleDeleteChapter = (chapter: Chapter, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定要删除章节"${chapter.title}"吗？此操作不可恢复。`)) {
      onChapterDelete?.(chapter.id);
    }
  };

  // 获取卷的中文数字
  const getVolumeNumber = (num: number): string => {
    const numbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (num <= 10) return numbers[num - 1];
    if (num <= 19) return `十${numbers[num - 11]}`;
    return `${numbers[Math.floor(num / 10) - 1]}十${numbers[(num % 10) - 1] || ''}`;
  };

  // 点击作品信息标题
  const handleWorkInfoClick = () => {
    onNavChange('work-info');
    onChapterSelect?.(null); // 清除选中的章节，这样才能显示 WorkInfoManager
  };

  // 添加新草稿
  const handleAddDraft = (e: React.MouseEvent) => {
    e.stopPropagation();
    const draftNumber = drafts.length + 1;
    const draftId = `draft${draftNumber}`;
    const newDraft: Draft = {
      id: draftId,
      title: `草稿 ${draftNumber}`,
    };
    setDrafts([...drafts, newDraft]);
    // 打开草稿编辑弹框
    onOpenChapterModal?.('create', 'draft', '草稿箱', {
      id: draftId,
      volumeId: 'draft',
      volumeTitle: '草稿箱',
      title: newDraft.title,
      characters: [],
      locations: [],
      outline: '',
      detailOutline: '',
    });
  };

  // 打开编辑草稿弹框
  const handleEditDraft = (draft: Draft, e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenChapterModal?.('edit', 'draft', '草稿箱', {
      id: draft.id,
      volumeId: 'draft',
      volumeTitle: '草稿箱',
      title: draft.title,
      characters: draft.characters || [],
      locations: draft.locations || [],
      outline: draft.outline || '',
      detailOutline: draft.detailOutline || '',
    });
  };

  return (
    <aside className="side-nav">
      <div className="nav-volume-header">
            <button
              className={`nav-section-header ${activeNav === 'work-info' && selectedChapter === null ? 'active' : ''}`}
              onClick={handleWorkInfoClick}
            >
              <BookOpen size={24} />
              <span>作品信息</span>
            </button>
      </div>

      <div className="nav-section">
        <div className="nav-volume-header">
          <button
            className="nav-section-header"
            onClick={() => setChaptersExpanded(!chaptersExpanded)}
          >
            {chaptersExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span>章节</span>
          </button>
          <div className="nav-header-actions">
            <button 
              className={`nav-sort-btn ${isChaptersReversed ? 'reversed' : ''}`}
              title={isChaptersReversed ? '正序显示' : '倒序显示'}
              onClick={(e) => {
                e.stopPropagation();
                setIsChaptersReversed(!isChaptersReversed);
              }}
            >
              <ArrowUpDown size={14} />
            </button>
            {/* 只有长篇作品才显示添加卷按钮 */}
            {workType === 'long' && (
              <button className="nav-add-btn" title="添加卷" onClick={handleAddVolume}>
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>
        {chaptersExpanded && (
          <div className="nav-submenu">
            {workType === 'long' ? (
              // 长篇作品：显示分卷结构
              volumes.map((volume) => (
                <div key={volume.id} className="nav-volume">
                  <div className="nav-volume-header">
                    <button
                      className="nav-volume-toggle"
                      onClick={() => setVolumeExpanded(volume.id, !volumesExpanded[volume.id])}
                    >
                      {volumesExpanded[volume.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <button className="nav-volume-item">
                      <span>{volume.title}</span>
                    </button>
                    <button 
                      className="nav-add-btn small" 
                      title="添加章"
                      onClick={(e) => handleAddChapter(volume.id, volume.title, e)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {volumesExpanded[volume.id] && (
                    <div className="nav-chapters">
                      {(isChaptersReversed ? [...volume.chapters].reverse() : volume.chapters).map((chapter) => (
                        <div
                          key={chapter.id}
                          className={`nav-chapter-item-wrapper ${selectedChapter === chapter.id ? 'active' : ''}`}
                        >
                          <div
                            className={`nav-chapter-item ${selectedChapter === chapter.id ? 'active' : ''}`}
                            onClick={() => onChapterSelect?.(chapter.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                onChapterSelect?.(chapter.id);
                              }
                            }}
                          >
                            <span>
                              {chapter.chapter_number !== undefined 
                                ? `第${chapter.chapter_number}章 ${chapter.title}`
                                : chapter.title
                              }
                            </span>
                                {selectedChapter === chapter.id && (
                                  <div className="nav-chapter-actions">
                                    <button
                                      className="nav-chapter-edit-btn"
                                      onClick={(e) => handleEditChapter(chapter, volume.title, e)}
                                      title="编辑章节设置"
                                    >
                                      <Settings size={12} />
                                    </button>
                                    <button
                                      className="nav-chapter-delete-btn"
                                      onClick={(e) => handleDeleteChapter(chapter, e)}
                                      title="删除章节"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              // 短篇作品：不显示分卷，直接显示所有章节（合并所有卷的章节）
              (() => {
                // 合并所有卷的章节
                const allShortChapters = volumes.flatMap(vol => vol.chapters);
                const defaultVolumeId = volumes.length > 0 ? volumes[0].id : 'vol0';
                const defaultVolumeTitle = volumes.length > 0 ? volumes[0].title : '未分卷';
                
                return (
                  <>
                    {allShortChapters.length > 0 ? (
                      <div className="nav-chapters">
                        {(isChaptersReversed ? [...allShortChapters].reverse() : allShortChapters).map((chapter) => {
                          const volume = volumes.find(v => v.chapters.some(c => c.id === chapter.id));
                          return (
                            <div
                              key={chapter.id}
                              className={`nav-chapter-item-wrapper ${selectedChapter === chapter.id ? 'active' : ''}`}
                            >
                              <div
                                className={`nav-chapter-item ${selectedChapter === chapter.id ? 'active' : ''}`}
                                onClick={() => onChapterSelect?.(chapter.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    onChapterSelect?.(chapter.id);
                                  }
                                }}
                              >
                                <span>
                                  {chapter.chapter_number !== undefined 
                                    ? `第${chapter.chapter_number}章 ${chapter.title}`
                                    : chapter.title
                                  }
                                </span>
                                {selectedChapter === chapter.id && (
                                  <div className="nav-chapter-actions">
                                    <button
                                      className="nav-chapter-edit-btn"
                                      onClick={(e) => handleEditChapter(chapter, volume?.title || '未分卷', e)}
                                      title="编辑章节设置"
                                    >
                                      <Settings size={12} />
                                    </button>
                                    <button
                                      className="nav-chapter-delete-btn"
                                      onClick={(e) => handleDeleteChapter(chapter, e)}
                                      title="删除章节"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="nav-empty-state" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                        <span>暂无章节</span>
                      </div>
                    )}
                    {/* 短篇作品：始终显示添加章节按钮 */}
                    <div style={{ padding: '8px 16px' }}>
                      <button 
                        className="nav-add-btn small" 
                        title="添加章节"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddChapter(defaultVolumeId, defaultVolumeTitle, e);
                        }}
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        <Plus size={12} />
                        <span style={{ marginLeft: '4px' }}>添加章节</span>
                      </button>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        )}
      </div>

      <div className="nav-section">
        <div className="nav-volume-header">
          <button
            className="nav-section-header"
            onClick={() => setDraftsExpanded(!draftsExpanded)}
          >
            {draftsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span>草稿箱</span>
          </button>
          <div className="nav-header-actions">
            <button className="nav-add-btn" title="添加草稿" onClick={handleAddDraft}>
              <Plus size={14} />
            </button>
          </div>
        </div>
        {draftsExpanded && (
          <div className="nav-submenu">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className={`nav-chapter-item-wrapper ${selectedChapter === draft.id ? 'active' : ''}`}
              >
                <div
                  className={`nav-chapter-item ${selectedChapter === draft.id ? 'active' : ''}`}
                  onClick={() => onChapterSelect?.(draft.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onChapterSelect?.(draft.id);
                    }
                  }}
                >
                  <span>{draft.title}</span>
                  {selectedChapter === draft.id && (
                    <button
                      className="nav-chapter-edit-btn"
                      onClick={(e) => handleEditDraft(draft, e)}
                      title="编辑草稿设置"
                    >
                      <Settings size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

