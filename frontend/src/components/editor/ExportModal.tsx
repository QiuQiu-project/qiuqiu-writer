import { useState, useEffect, useMemo } from 'react';
import { X, Download, FileText, File, CheckCircle2, Circle, AlertCircle, Check } from 'lucide-react';
import DraggableResizableModal from '../common/DraggableResizableModal';
import { worksApi } from '../../utils/worksApi';
import type { VolumeData } from '../../hooks/useChapterManagement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  workId: string;
  workTitle: string;
  volumes: VolumeData[];
}

type ExportFormat = 'text' | 'word';

export default function ExportModal({
  isOpen,
  onClose,
  workId,
  workTitle,
  volumes
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('text');
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [rangeInput, setRangeInput] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChapterIds = useMemo(() => {
    return volumes.flatMap(v => v.chapters.map(c => String(c.id)));
  }, [volumes]);

  useEffect(() => {
    if (isOpen && allChapterIds.length > 0) {
      setSelectedChapters(new Set(allChapterIds));
      setRangeInput('');
      setError(null);
    }
  }, [isOpen, allChapterIds]);

  const handleRangeChange = (value: string) => {
    setRangeInput(value);
    if (!value.trim()) return;

    const newSelected = new Set<string>();
    const parts = value.split(/[,，]/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-').map(s => s.trim());
        const start = parseInt(startStr);
        const end = parseInt(endStr);
        if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
          for (let i = start - 1; i < end; i++) {
            if (i < allChapterIds.length) newSelected.add(allChapterIds[i]);
          }
        }
      } else {
        const index = parseInt(trimmed);
        if (!isNaN(index) && index > 0 && index <= allChapterIds.length) {
          newSelected.add(allChapterIds[index - 1]);
        }
      }
    }
    setSelectedChapters(newSelected);
  };

  const handleToggleChapter = (chapterId: string) => {
    const newSelected = new Set(selectedChapters);
    if (newSelected.has(chapterId)) {
      newSelected.delete(chapterId);
    } else {
      newSelected.add(chapterId);
    }
    setSelectedChapters(newSelected);
    setRangeInput('');
  };

  const handleToggleVolume = (volumeChapterIds: string[]) => {
    const allSelected = volumeChapterIds.every(id => selectedChapters.has(id));
    const newSelected = new Set(selectedChapters);
    if (allSelected) {
      volumeChapterIds.forEach(id => newSelected.delete(id));
    } else {
      volumeChapterIds.forEach(id => newSelected.add(id));
    }
    setSelectedChapters(newSelected);
    setRangeInput('');
  };

  const handleSelectAll = () => {
    if (selectedChapters.size === allChapterIds.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(allChapterIds));
    }
    setRangeInput('');
  };

  const handleExport = async () => {
    if (selectedChapters.size === 0) {
      setError('请至少选择一个章节');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const blob = await worksApi.exportWork(workId, {
        format,
        chapter_ids: Array.from(selectedChapters)
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      const ext = format === 'text' ? 'txt' : 'docx';
      a.download = `${workTitle}_${timestamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      const errorMessage = (err instanceof Error && err.message) || '导出失败，请重试';
      setError(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const isAllSelected = selectedChapters.size === allChapterIds.length;
  const hasSelection = selectedChapters.size > 0;

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={520}
      initialHeight={600}
      className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
      handleClassName=".export-modal-header"
    >
      <div className="export-modal-header flex items-center justify-between border-b border-border px-[18px] py-3.5">
        <h2 className="flex items-center gap-[7px] text-base font-semibold text-foreground">
          <Download size={20} />
          <span>导出作品</span>
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0">
          <X size={20} />
        </Button>
      </div>

        <div className="flex-1 overflow-y-auto p-[18px]">
          {/* Format Selection */}
          <div className="mb-5">
            <h3 className="mb-2.5 flex items-center gap-2 text-[0.82rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">导出格式</h3>
            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-[11px] transition-colors',
                  format === 'text'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border/80 hover:bg-background'
                )}
                onClick={() => setFormat('text')}
              >
                <div className="flex items-center gap-3">
                  <FileText size={22} className={cn('shrink-0 text-muted-foreground transition-colors', format === 'text' && 'text-primary')} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.9rem] font-medium text-foreground">纯文本</span>
                    <span className="text-[0.78rem] text-muted-foreground">TXT · 兼容性最佳</span>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all',
                    format === 'text' ? 'scale-100 opacity-100' : 'scale-60 opacity-0'
                  )}
                >
                  <Check size={14} />
                </div>
              </div>

              <div
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-[11px] transition-colors',
                  format === 'word'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border/80 hover:bg-background'
                )}
                onClick={() => setFormat('word')}
              >
                <div className="flex items-center gap-3">
                  <File size={22} className={cn('shrink-0 text-muted-foreground transition-colors', format === 'word' && 'text-primary')} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.9rem] font-medium text-foreground">Word 文档</span>
                    <span className="text-[0.78rem] text-muted-foreground">DOCX · 支持排版</span>
                  </div>
                </div>
                <div
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all',
                    format === 'word' ? 'scale-100 opacity-100' : 'scale-60 opacity-0'
                  )}
                >
                  <Check size={14} />
                </div>
              </div>
            </div>
          </div>

          {/* Chapter Selection */}
          <div className="mb-5">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[0.82rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                选择章节
                <span className="rounded-[10px] bg-primary/10 px-[7px] py-px text-[0.78rem] font-medium text-primary normal-case tracking-normal">
                  {selectedChapters.size} / {allChapterIds.length}
                </span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-auto px-2 py-1 text-[0.82rem]',
                  isAllSelected ? 'text-muted-foreground' : 'text-primary'
                )}
                onClick={handleSelectAll}
              >
                {isAllSelected ? '取消全选' : '全选'}
              </Button>
            </div>

            <div className="relative mb-2.5">
              <Input
                type="text"
                className="h-9 rounded-[7px] bg-muted/40 pr-8 text-sm"
                placeholder="按编号筛选，例如：1-5, 8, 11-13"
                value={rangeInput}
                onChange={(e) => handleRangeChange(e.target.value)}
              />
              {rangeInput && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => {
                    setRangeInput('');
                    setSelectedChapters(new Set(allChapterIds));
                  }}
                  aria-label="清除"
                >
                  <X size={14} />
                </Button>
              )}
            </div>

            <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border bg-muted/40">
              {volumes.map((volume) => {
                const volChapterIds = volume.chapters.map(c => String(c.id));
                const allVolSelected = volChapterIds.length > 0 && volChapterIds.every(id => selectedChapters.has(id));
                const someVolSelected = volChapterIds.some(id => selectedChapters.has(id));

                return (
                  <div key={volume.id} className="border-b border-border last:border-b-0">
                    <div
                      className="sticky top-0 z-[1] flex cursor-pointer select-none items-center gap-[7px] bg-muted px-3 py-[7px] text-[0.8rem] font-semibold text-muted-foreground transition-colors hover:bg-border/80"
                      onClick={() => handleToggleVolume(volChapterIds)}
                      title={allVolSelected ? '取消选择本卷' : '选择本卷全部章节'}
                    >
                      <div
                        className={cn(
                          'flex shrink-0 items-center',
                          (allVolSelected || someVolSelected) ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        {allVolSelected ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Circle size={14} />
                        )}
                      </div>
                      <span>{volume.title}</span>
                      <span className="ml-auto text-[0.75rem] font-normal text-muted-foreground">{volChapterIds.length} 章</span>
                    </div>

                    {volume.chapters.map((chapter, idx) => {
                      const chapterId = String(chapter.id);
                      const isSelected = selectedChapters.has(chapterId);
                      const chapterNum = chapter.chapter_number ?? idx + 1;

                      return (
                        <div
                          key={chapter.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 border-b border-border px-3 py-[7px] transition-colors last:border-b-0',
                            isSelected ? 'bg-primary/10' : 'hover:bg-background'
                          )}
                          onClick={() => handleToggleChapter(chapterId)}
                        >
                          <div className="flex shrink-0 items-center">
                            {isSelected ? (
                              <CheckCircle2 size={16} className="text-primary" />
                            ) : (
                              <Circle size={16} className="text-muted-foreground" />
                            )}
                          </div>
                          <span className="min-w-11 shrink-0 text-[0.78rem] text-muted-foreground">第 {chapterNum} 章</span>
                          <span className="flex-1 truncate text-sm text-foreground">{chapter.title}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {allChapterIds.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">暂无章节</div>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-[7px] rounded-[7px] border border-destructive/20 bg-destructive/10 px-3 py-[9px] text-[0.85rem] text-destructive">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-[18px] py-3">
          <span className="text-[0.82rem] text-muted-foreground">
            {hasSelection
              ? `已选 ${selectedChapters.size} 章`
              : <span className="text-muted-foreground">未选择章节</span>}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || !hasSelection}
            >
              {isExporting ? (
                <>
                  <div className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  导出中...
                </>
              ) : (
                <>
                  <Download size={15} />
                  导出{hasSelection ? ` (${selectedChapters.size})` : ''}
                </>
              )}
            </Button>
          </div>
        </div>
    </DraggableResizableModal>
  );
}
