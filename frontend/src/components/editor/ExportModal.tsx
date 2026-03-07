import { useState, useEffect, useMemo } from 'react';
import { X, Download, FileText, File, CheckCircle2, Circle, AlertCircle, Check } from 'lucide-react';
import { worksApi } from '../../utils/worksApi';
import type { VolumeData } from '../../hooks/useChapterManagement';
import './ExportModal.css';

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
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="export-modal-header">
          <h2>
            <Download size={18} />
            导出作品
          </h2>
          <button className="export-modal-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="export-modal-content">
          {/* Format Selection */}
          <div className="export-section">
            <h3 className="export-section-title">导出格式</h3>
            <div className="format-options">
              <div
                className={`format-option ${format === 'text' ? 'selected' : ''}`}
                onClick={() => setFormat('text')}
              >
                <div className="format-option-left">
                  <FileText size={22} className="format-icon" />
                  <div className="format-info">
                    <span className="format-name">纯文本</span>
                    <span className="format-desc">TXT · 兼容性最佳</span>
                  </div>
                </div>
                <div className={`format-check ${format === 'text' ? 'visible' : ''}`}>
                  <Check size={14} />
                </div>
              </div>

              <div
                className={`format-option ${format === 'word' ? 'selected' : ''}`}
                onClick={() => setFormat('word')}
              >
                <div className="format-option-left">
                  <File size={22} className="format-icon" />
                  <div className="format-info">
                    <span className="format-name">Word 文档</span>
                    <span className="format-desc">DOCX · 支持排版</span>
                  </div>
                </div>
                <div className={`format-check ${format === 'word' ? 'visible' : ''}`}>
                  <Check size={14} />
                </div>
              </div>
            </div>
          </div>

          {/* Chapter Selection */}
          <div className="export-section">
            <div className="chapters-selection-header">
              <h3 className="export-section-title">
                选择章节
                <span className="chapters-count-badge">
                  {selectedChapters.size} / {allChapterIds.length}
                </span>
              </h3>
              <button
                className={`select-all-btn ${isAllSelected ? 'deselect' : ''}`}
                onClick={handleSelectAll}
              >
                {isAllSelected ? '取消全选' : '全选'}
              </button>
            </div>

            <div className="chapter-range-input-container">
              <input
                type="text"
                className="chapter-range-input"
                placeholder="按编号筛选，例如：1-5, 8, 11-13"
                value={rangeInput}
                onChange={(e) => handleRangeChange(e.target.value)}
              />
              {rangeInput && (
                <button
                  className="range-clear-btn"
                  onClick={() => {
                    setRangeInput('');
                    setSelectedChapters(new Set(allChapterIds));
                  }}
                  aria-label="清除"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="chapters-list">
              {volumes.map((volume) => {
                const volChapterIds = volume.chapters.map(c => String(c.id));
                const allVolSelected = volChapterIds.length > 0 && volChapterIds.every(id => selectedChapters.has(id));
                const someVolSelected = volChapterIds.some(id => selectedChapters.has(id));

                return (
                  <div key={volume.id} className="volume-group">
                    <div
                      className="volume-header"
                      onClick={() => handleToggleVolume(volChapterIds)}
                      title={allVolSelected ? '取消选择本卷' : '选择本卷全部章节'}
                    >
                      <div className={`volume-check-icon ${allVolSelected ? 'all' : someVolSelected ? 'some' : ''}`}>
                        {allVolSelected ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Circle size={14} />
                        )}
                      </div>
                      <span>{volume.title}</span>
                      <span className="volume-chapter-count">{volChapterIds.length} 章</span>
                    </div>

                    {volume.chapters.map((chapter, idx) => {
                      const chapterId = String(chapter.id);
                      const isSelected = selectedChapters.has(chapterId);
                      const chapterNum = chapter.chapter_number ?? idx + 1;

                      return (
                        <div
                          key={chapter.id}
                          className={`chapter-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleToggleChapter(chapterId)}
                        >
                          <div className="chapter-check">
                            {isSelected ? (
                              <CheckCircle2 size={16} color="var(--primary-color)" />
                            ) : (
                              <Circle size={16} color="var(--text-tertiary)" />
                            )}
                          </div>
                          <span className="chapter-number">第 {chapterNum} 章</span>
                          <span className="chapter-title">{chapter.title}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {allChapterIds.length === 0 && (
                <div className="chapters-empty">暂无章节</div>
              )}
            </div>
          </div>

          {error && (
            <div className="export-error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="export-modal-footer">
          <span className="footer-summary">
            {hasSelection
              ? `已选 ${selectedChapters.size} 章`
              : <span className="footer-warn">未选择章节</span>}
          </span>
          <div className="footer-actions">
            <button className="btn-cancel" onClick={onClose}>取消</button>
            <button
              className="btn-export"
              onClick={handleExport}
              disabled={isExporting || !hasSelection}
            >
              {isExporting ? (
                <>
                  <div className="loading-spinner" />
                  导出中...
                </>
              ) : (
                <>
                  <Download size={15} />
                  导出{hasSelection ? ` (${selectedChapters.size})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
