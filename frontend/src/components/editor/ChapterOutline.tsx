import { useState } from 'react';
import { FileText, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OutlineChapter {
  id: string;
  title: string;
  outline?: string;
  detailOutline?: string;
}

export interface OutlineVolume {
  id: string;
  title: string;
  outline?: string;
  detailOutline?: string;
  chapters: OutlineChapter[];
}

interface ChapterOutlineProps {
  volumes: OutlineVolume[];
  onEditVolume?: (volume: OutlineVolume) => void;
  onEditChapter?: (chapter: OutlineChapter, volumeId: string, volumeTitle: string) => void;
  readOnly?: boolean;
}

export default function ChapterOutline({ volumes, onEditVolume, onEditChapter, readOnly }: ChapterOutlineProps) {
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'outline' | 'detail'>('outline');

  return (
    <div className="w-full h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex justify-between items-center px-6 py-5 border-b max-md:flex-col max-md:items-start max-md:gap-3 max-md:px-4 max-md:py-4"
        style={{ borderColor: 'var(--border-light)' }}
      >
        <h2 className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
          章细纲和大纲
        </h2>
        <div className="flex gap-2 max-md:w-full max-md:overflow-x-auto max-md:pb-1">
          <button
            className={cn(
              'px-4 py-1.5 border-none text-sm rounded-[6px] cursor-pointer transition-all max-md:whitespace-nowrap max-md:px-3',
              viewMode === 'outline'
                ? 'font-medium'
                : 'bg-transparent hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]'
            )}
            style={
              viewMode === 'outline'
                ? { background: 'var(--text-secondary)', color: 'var(--text-inverse)' }
                : { color: 'var(--text-secondary)' }
            }
            onClick={() => setViewMode('outline')}
          >
            大纲
          </button>
          <button
            className={cn(
              'px-4 py-1.5 border-none text-sm rounded-[6px] cursor-pointer transition-all max-md:whitespace-nowrap max-md:px-3',
              viewMode === 'detail'
                ? 'font-medium'
                : 'bg-transparent hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]'
            )}
            style={
              viewMode === 'detail'
                ? { background: 'var(--text-secondary)', color: 'var(--text-inverse)' }
                : { color: 'var(--text-secondary)' }
            }
            onClick={() => setViewMode('detail')}
          >
            细纲
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden max-md:flex-col">
        {/* Sidebar */}
        <div
          className="w-[280px] border-r flex flex-col overflow-y-auto max-md:w-full max-md:h-[40%] max-md:min-h-[200px] max-md:border-r-0 max-md:border-b"
          style={{ borderColor: 'var(--border-light)', background: 'var(--bg-primary)' }}
        >
          <div className="flex-1 p-4 overflow-y-auto">
            {volumes.map((volume) => (
              <div key={volume.id} className="mb-3">
                {/* Volume header */}
                <div
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2.5 rounded-[8px] cursor-pointer transition-all relative',
                    selectedVolume === volume.id && !selectedChapter
                      ? '[background:var(--accent-light)] font-medium'
                      : 'hover:[background:var(--bg-secondary)]'
                  )}
                  style={{ color: 'var(--text-primary)', background: selectedVolume === volume.id && !selectedChapter ? undefined : 'var(--bg-primary)' }}
                  onClick={() => {
                    setSelectedVolume(volume.id);
                    setSelectedChapter(null);
                  }}
                >
                  <FileText size={16} className="shrink-0" />
                  <span className="flex-1">{volume.title}</span>
                  {!readOnly && onEditVolume && (
                    <button
                      className="w-6 h-6 p-0 border-none bg-transparent rounded-[4px] flex items-center justify-center cursor-pointer transition-all opacity-0 group-hover:opacity-100 hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]"
                      style={{ color: 'var(--text-tertiary)' }}
                      title="编辑卷"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditVolume(volume);
                      }}
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>

                {/* Chapters */}
                {volume.chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className={cn(
                      'group flex items-center gap-2 pl-8 pr-3 py-2 rounded-[6px] cursor-pointer transition-all text-[13px]',
                      selectedChapter === chapter.id
                        ? '[background:var(--accent-light)] font-medium'
                        : 'hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]'
                    )}
                    style={{ color: selectedChapter === chapter.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    onClick={() => {
                      setSelectedVolume(volume.id);
                      setSelectedChapter(chapter.id);
                    }}
                  >
                    <span className="flex-1">{chapter.title}</span>
                    {!readOnly && onEditChapter && (
                      <button
                        className="w-6 h-6 p-0 border-none bg-transparent rounded-[4px] flex items-center justify-center cursor-pointer transition-all opacity-0 group-hover:opacity-100 hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]"
                        style={{ color: 'var(--text-tertiary)' }}
                        title="编辑章节"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditChapter(chapter, volume.id, volume.title);
                        }}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-6 max-md:p-4">
          {selectedChapter ? (
            (() => {
              const volume = volumes.find(v => v.id === selectedVolume);
              const chapter = volume?.chapters.find(c => c.id === selectedChapter);
              if (!chapter) return <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>请选择章节</div>;
              const content = viewMode === 'outline' ? chapter.outline : chapter.detailOutline;
              return (
                <div>
                  <h3 className="text-base font-semibold mb-4 m-0" style={{ color: 'var(--text-primary)' }}>
                    {chapter.title} - {viewMode === 'outline' ? '大纲' : '细纲'}
                  </h3>
                  <div>
                    {content ? (
                      <pre className="text-sm leading-[1.8] whitespace-pre-wrap min-h-[200px]" style={{ color: 'var(--text-secondary)' }}>{content}</pre>
                    ) : (
                      <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>暂无{viewMode === 'outline' ? '大纲' : '细纲'}内容</div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : selectedVolume ? (
            (() => {
              const volume = volumes.find(v => v.id === selectedVolume);
              if (!volume) return <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>请选择卷</div>;
              const content = viewMode === 'outline' ? volume.outline : volume.detailOutline;
              return (
                <div>
                  <h3 className="text-base font-semibold mb-4 m-0" style={{ color: 'var(--text-primary)' }}>
                    {volume.title} - {viewMode === 'outline' ? '大纲' : '细纲'}
                  </h3>
                  <div>
                    {content ? (
                      <pre className="text-sm leading-[1.8] whitespace-pre-wrap min-h-[200px]" style={{ color: 'var(--text-secondary)' }}>{content}</pre>
                    ) : (
                      <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>暂无{viewMode === 'outline' ? '大纲' : '细纲'}内容</div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-tertiary)' }}>
              请选择卷或章节查看大纲
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
