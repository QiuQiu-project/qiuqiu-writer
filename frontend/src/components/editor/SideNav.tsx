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
  outline?: string;
  detailOutline?: string;
}

interface SideNavProps {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  selectedChapter?: string | null;
  onChapterSelect?: (chapterId: string | null) => void;
  onOpenChapterModal?: (mode: 'create' | 'edit', volumeId: string, volumeTitle: string, chapterData?: ChapterFullData) => void;
  onOpenVolumeModal?: (mode: 'create' | 'edit', volumeId?: string, currentTitle?: string, currentOutline?: string, currentDetailOutline?: string) => void;
  onChapterDelete?: (chapterId: string) => void;  // 删除章节回调
  volumes?: Volume[];
  onVolumesChange?: (volumes: Volume[]) => void;
  workType?: 'long' | 'short' | 'script' | 'video';  // 作品类型：长篇支持分卷，短篇不分卷
}

// 导出 Chapter, Volume, SideNavProps 类型供外部使用
export type { Chapter, Volume, SideNavProps };

export default function SideNav({ activeNav, onNavChange, selectedChapter, onChapterSelect, onOpenChapterModal, onOpenVolumeModal, onChapterDelete, volumes: externalVolumes, onVolumesChange }: SideNavProps) {
  const [chaptersExpanded, setChaptersExpanded] = useState(true);
  const [isChaptersReversed, setIsChaptersReversed] = useState(false); // 章节排序状态
  
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
            {/* 显示添加卷按钮 */}
            <button className="nav-add-btn" title="添加卷" onClick={handleAddVolume}>
              <Plus size={14} />
            </button>
          </div>
        </div>
        {chaptersExpanded && (
          <div className="nav-submenu">
            {/* 显示分卷结构 */}
            {volumes.map((volume) => (
                <div key={volume.id} className="nav-volume">
                  <div className="nav-volume-header">
                    <button
                      className="nav-volume-toggle"
                      onClick={() => setVolumeExpanded(volume.id, !volumesExpanded[volume.id])}
                    >
                      {volumesExpanded[volume.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="nav-volume-item">
                      <span>{volume.title}</span>
                    </div>
                    <button
                      className="nav-volume-settings-btn"
                      title="卷纲设置"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenVolumeModal) {
                          onOpenVolumeModal('edit', volume.id, volume.title, volume.outline, volume.detailOutline);
                        } else {
                          console.log('Open volume settings for:', volume.title);
                        }
                      }}
                    >
                      <Settings size={12} />
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
                      {(isChaptersReversed 
                        ? [...volume.chapters].sort((a, b) => {
                            const numA = a.chapter_number ?? 0;
                            const numB = b.chapter_number ?? 0;
                            return numB - numA; // 倒序
                          })
                        : [...volume.chapters].sort((a, b) => {
                            const numA = a.chapter_number ?? 0;
                            const numB = b.chapter_number ?? 0;
                            return numA - numB; // 正序
                          })
                      ).map((chapter) => (
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
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}

