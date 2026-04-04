import { BookOpen, ChevronDown, ChevronRight, Plus, Settings, ArrowUpDown, Trash2, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export type NavItem = 'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions';

export interface ChapterFullData {
  id: string;
  volumeId: string;
  volumeTitle: string;
  title: string;
  chapter_number?: number;
  characters: string[];
  locations: string[];
  outline: string;
  detailOutline: string;
}

interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  chapter_number?: number;
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
  onChapterDelete?: (chapterId: string) => void;
  deletedChapters?: Array<{ id: number; title: string; chapter_number?: number }>;
  loadDeletedChapters?: () => Promise<void>;
  onRestoreChapter?: (chapterId: string) => void;
  volumes?: Volume[];
  onVolumesChange?: (volumes: Volume[]) => void;
  workType?: 'long' | 'short' | 'script' | 'video';
  readOnly?: boolean;
}

export type { Chapter, Volume, SideNavProps };

// Shared small icon button base
const iconBtnClass = 'w-6 h-6 p-0 border-none bg-transparent cursor-pointer flex items-center justify-center rounded-[4px] transition-all shrink-0';

export default function SideNav({
  activeNav,
  onNavChange,
  selectedChapter,
  onChapterSelect,
  onOpenChapterModal,
  onOpenVolumeModal,
  onChapterDelete,
  deletedChapters = [],
  loadDeletedChapters,
  onRestoreChapter,
  volumes: externalVolumes,
  readOnly,
}: SideNavProps) {
  const [chaptersExpanded, setChaptersExpanded] = useState(true);
  const [isChaptersReversed, setIsChaptersReversed] = useState(false);
  const [recycleExpanded, setRecycleExpanded] = useState(false);

  const [internalVolumes] = useState<Volume[]>([
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

  const [volumesExpanded, setVolumesExpanded] = useState<Record<string, boolean>>({
    vol1: true,
    vol2: false,
  });

  const setVolumeExpanded = (volumeId: string, expanded: boolean) => {
    setVolumesExpanded(prev => ({ ...prev, [volumeId]: expanded }));
  };

  const handleAddVolume = (e: React.MouseEvent) => {
    e.stopPropagation();
    const volumeNumber = volumes.length + 1;
    const defaultTitle = `第${getVolumeNumber(volumeNumber)}卷`;
    onOpenVolumeModal?.('create', undefined, defaultTitle);
  };

  const handleAddChapter = (volumeId: string, volumeTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVolumesExpanded(prev => ({ ...prev, [volumeId]: true }));
    onOpenChapterModal?.('create', volumeId, volumeTitle);
  };

  const handleEditChapter = (chapter: Chapter, volumeTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const volume = volumes.find(v => v.chapters.some(c => c.id === chapter.id));
    if (volume) {
      onOpenChapterModal?.('edit', volume.id, volumeTitle, {
        id: chapter.id,
        volumeId: volume.id,
        volumeTitle,
        title: chapter.title,
        chapter_number: chapter.chapter_number,
        characters: chapter.characters || [],
        locations: chapter.locations || [],
        outline: chapter.outline || '',
        detailOutline: chapter.detailOutline || '',
      });
    }
  };

  const handleDeleteChapter = (chapter: Chapter, e: React.MouseEvent) => {
    e.stopPropagation();
    onChapterDelete?.(chapter.id);
  };

  const getVolumeNumber = (num: number): string => {
    const numbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (num <= 10) return numbers[num - 1];
    if (num <= 19) return `十${numbers[num - 11]}`;
    return `${numbers[Math.floor(num / 10) - 1]}十${numbers[(num % 10) - 1] || ''}`;
  };

  const handleWorkInfoClick = () => {
    onNavChange('work-info');
    onChapterSelect?.(null);
  };

  useEffect(() => {
    if (recycleExpanded && loadDeletedChapters) loadDeletedChapters();
  }, [recycleExpanded, loadDeletedChapters]);

  const isWorkInfoActive = activeNav === 'work-info' && selectedChapter === null;

  return (
    <aside
      className="w-full flex flex-col py-3 overflow-y-auto rounded-[12px] shadow-[var(--shadow-md)] max-md:rounded-none max-md:shadow-none max-md:h-full"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* 作品信息 */}
      <div className="flex items-center gap-2 px-3 py-2 pl-6 rounded-[8px] transition-all mb-1">
        <button
          className={cn(
            'flex items-center gap-3 w-full px-4 py-2.5 border-none text-base font-bold text-left cursor-pointer transition-all rounded-[8px] border-l-[3px] tracking-[0.2px] max-md:py-3 max-md:text-sm',
            isWorkInfoActive
              ? 'border-l-[var(--accent-primary)]'
              : 'border-l-transparent hover:[background:var(--bg-secondary)]'
          )}
          style={
            isWorkInfoActive
              ? {
                  background: 'linear-gradient(90deg, var(--accent-light) 0%, transparent 100%)',
                  color: 'var(--accent-primary)',
                  paddingLeft: '17px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }
              : { color: 'var(--text-primary)', background: 'transparent' }
          }
          onClick={handleWorkInfoClick}
        >
          <BookOpen size={24} className="shrink-0" />
          <span className="!text-[15px] !font-bold">作品信息</span>
        </button>
      </div>

      {/* 章节区 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 px-3 py-2 pl-6 rounded-[8px] transition-all mb-1 hover:[background:var(--bg-secondary)]">
          <button
            className="flex items-center gap-3 flex-1 border-none bg-transparent text-base font-bold text-left cursor-pointer transition-all max-md:py-2 max-md:text-sm"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => setChaptersExpanded(!chaptersExpanded)}
          >
            {chaptersExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="!text-[15px] !font-bold">章节</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              className={cn(
                iconBtnClass,
                isChaptersReversed
                  ? '[color:var(--accent-primary)] [background:var(--accent-light)] hover:[background:var(--accent-primary)] hover:[color:var(--text-inverse)]'
                  : '[color:var(--text-tertiary)] hover:[background:var(--bg-secondary)] hover:[color:var(--accent-primary)]'
              )}
              title={isChaptersReversed ? '正序显示' : '倒序显示'}
              onClick={(e) => {
                e.stopPropagation();
                setIsChaptersReversed(!isChaptersReversed);
              }}
            >
              <ArrowUpDown size={14} />
            </button>
            {!readOnly && (
              <button
                className={cn(iconBtnClass, '[color:var(--text-tertiary)] hover:[background:var(--bg-secondary)] hover:[color:var(--accent-primary)]')}
                title="添加卷"
                onClick={handleAddVolume}
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>

        {chaptersExpanded && (
          <div className="flex flex-col pl-5 gap-0.5 mt-1.5">
            {volumes.map((volume) => (
              <div key={volume.id} className="mb-2">
                {/* Volume row */}
                <div className="group flex items-center gap-2 px-3 py-2 pl-6 rounded-[8px] transition-all mb-1 hover:[background:var(--bg-secondary)]">
                  <button
                    className={cn(iconBtnClass, '[color:var(--text-secondary)] hover:[color:var(--accent-primary)] hover:[background:var(--accent-light)]')}
                    onClick={() => setVolumeExpanded(volume.id, !volumesExpanded[volume.id])}
                  >
                    {volumesExpanded[volume.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div
                    className="flex-1 py-1.5 px-2 bg-transparent text-[13px] font-semibold text-left rounded-[8px] whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {volume.title}
                  </div>
                  {!readOnly && (
                    <button
                      className={cn(iconBtnClass, 'mr-1 hidden group-hover:flex [color:var(--text-tertiary)] hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]')}
                      title="卷纲设置"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenVolumeModal?.('edit', volume.id, volume.title, volume.outline, volume.detailOutline);
                      }}
                    >
                      <Settings size={12} />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      className={cn('w-5 h-5 p-0 border-none bg-transparent cursor-pointer flex items-center justify-center rounded-[4px] transition-all shrink-0', '[color:var(--text-tertiary)] hover:[background:var(--bg-secondary)] hover:[color:var(--accent-primary)]')}
                      title="添加章"
                      onClick={(e) => handleAddChapter(volume.id, volume.title, e)}
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>

                {/* Chapters */}
                {volumesExpanded[volume.id] && (
                  <div className="flex flex-col pl-6 gap-0.5 mt-1.5">
                    {(isChaptersReversed
                      ? [...volume.chapters].sort((a, b) => (b.chapter_number ?? 0) - (a.chapter_number ?? 0))
                      : [...volume.chapters].sort((a, b) => (a.chapter_number ?? 0) - (b.chapter_number ?? 0))
                    ).map((chapter) => {
                      const isActive = selectedChapter === chapter.id;
                      return (
                        <div
                          key={chapter.id}
                          className="relative ml-2"
                        >
                          <div
                            className={cn(
                              'flex items-center justify-between gap-2 w-full px-3 py-2 border-none text-sm font-medium text-left cursor-pointer rounded-[8px] transition-all border-l-[3px]',
                              isActive
                                ? 'border-l-[var(--accent-primary)]'
                                : 'border-l-transparent hover:[background:var(--bg-secondary)] hover:translate-x-0.5'
                            )}
                            style={
                              isActive
                                ? {
                                    background: 'linear-gradient(90deg, var(--accent-light) 0%, transparent 100%)',
                                    color: 'var(--accent-primary)',
                                    paddingLeft: '11px',
                                    fontWeight: 600,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                  }
                                : { color: 'var(--text-primary)', background: 'transparent' }
                            }
                            onClick={() => onChapterSelect?.(chapter.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') onChapterSelect?.(chapter.id);
                            }}
                          >
                            <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-[1.4]">
                              {chapter.chapter_number !== undefined
                                ? `第${chapter.chapter_number}章 ${chapter.title}`
                                : chapter.title}
                            </span>
                            {isActive && !readOnly && (
                              <div className="flex items-center gap-1">
                                <button
                                  className={cn(iconBtnClass, '[color:var(--accent-primary)] hover:[background:var(--accent-light)] hover:scale-110')}
                                  onClick={(e) => handleEditChapter(chapter, volume.title, e)}
                                  title="编辑章节设置"
                                >
                                  <Settings size={12} />
                                </button>
                                <button
                                  className={cn(iconBtnClass, '[color:var(--accent-primary)] hover:[background:var(--error-light)] hover:[color:var(--error)] hover:scale-110')}
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 回收站 */}
      {!readOnly && (loadDeletedChapters || deletedChapters.length > 0) && (
        <div className="mb-6">
          <div className="flex items-center gap-2 px-3 py-2 pl-6 rounded-[8px] transition-all mb-1 hover:[background:var(--bg-secondary)]">
            <button
              className="flex items-center gap-3 flex-1 border-none bg-transparent text-[15px] font-bold text-left cursor-pointer transition-all max-md:py-2 max-md:text-sm"
              style={{ color: 'var(--text-primary)' }}
              onClick={() => setRecycleExpanded(!recycleExpanded)}
            >
              {recycleExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span>回收站</span>
              {deletedChapters.length > 0 && (
                <span
                  className="ml-1.5 px-1.5 py-0.5 text-[11px] font-semibold rounded-[10px]"
                  style={{ color: 'var(--text-inverse)', background: 'var(--text-tertiary)' }}
                >
                  {deletedChapters.length}
                </span>
              )}
            </button>
          </div>

          {recycleExpanded && (
            <div className="flex flex-col pl-5 gap-0.5 mt-1.5">
              {deletedChapters.length === 0 ? (
                <div className="px-4 py-3 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                  暂无已删除章节
                </div>
              ) : (
                deletedChapters.map((ch) => (
                  <div key={ch.id} className="relative ml-2">
                    <div
                      className="flex items-center justify-between gap-2 w-full px-3 py-2 border-none text-sm font-medium text-left cursor-pointer rounded-[8px] transition-all border-l-[3px] border-l-transparent"
                      style={{ color: 'var(--text-primary)', background: 'transparent' }}
                    >
                      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-[1.4]">
                        {ch.chapter_number != null
                          ? `第${ch.chapter_number}章 ${ch.title}`
                          : ch.title}
                      </span>
                      {onRestoreChapter && (
                        <button
                          type="button"
                          className={cn(iconBtnClass, '[color:var(--text-tertiary)] hover:[background:var(--accent-light)] hover:[color:var(--accent-primary)]')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestoreChapter(String(ch.id));
                          }}
                          title="恢复章节"
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
