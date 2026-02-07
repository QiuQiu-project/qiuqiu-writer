/**
 * 章节历史记录弹窗（Yjs 原生快照，Git 式版本历史）
 * 支持「创建版本」「恢复到此版本」与「预览对比」当前内容与历史版本
 */

import { useState, useEffect } from 'react';
import { X, History, Plus, RotateCcw, FileDiff } from 'lucide-react';
import { chaptersApi, type YjsSnapshotMeta } from '../../utils/chaptersApi';
import { getContentJSONFromYjsSnapshotBase64, getTextFromProsemirrorJSON } from '../../utils/yjsSnapshot';
import { diffLines, type DiffLine } from '../../utils/simpleDiff';
import LoadingSpinner from '../common/LoadingSpinner';
import './ChapterHistoryModal.css';

interface ChapterHistoryModalProps {
  isOpen: boolean;
  chapterId: string | null;
  chapterTitle?: string;
  onClose: () => void;
  /** 获取当前编辑器纯文本（用于对比预览） */
  getCurrentContent?: () => string;
  /** 创建版本 */
  onCreateVersion?: () => Promise<void>;
  /** 恢复到此快照 */
  onRestore?: (snapshotId: number) => Promise<void>;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="chapter-history-diff">
      {lines.map((line, idx) => (
        <div key={idx} className={`chapter-history-diff-line ${line.type}`}>
          <span className="chapter-history-diff-prefix">
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <span className="chapter-history-diff-text">{line.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChapterHistoryModal({
  isOpen,
  chapterId,
  chapterTitle,
  onClose,
  getCurrentContent,
  onCreateVersion,
  onRestore,
}: ChapterHistoryModalProps) {
  const [snapshots, setSnapshots] = useState<YjsSnapshotMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [previewSnapshotId, setPreviewSnapshotId] = useState<number | null>(null);
  const [diffLinesState, setDiffLinesState] = useState<DiffLine[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const loadSnapshots = () => {
    if (!chapterId) return;
    const id = parseInt(chapterId, 10);
    if (Number.isNaN(id)) return;
    setLoading(true);
    chaptersApi
      .listYjsSnapshots(id, 1, 50)
      .then((res) => setSnapshots(res.snapshots || []))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen || !chapterId) {
      setSnapshots([]);
      setPreviewSnapshotId(null);
      setDiffLinesState(null);
      return;
    }
    loadSnapshots();
  }, [isOpen, chapterId]);

  const handleCreateVersion = async () => {
    if (!onCreateVersion) return;
    setCreating(true);
    try {
      await onCreateVersion();
      loadSnapshots();
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snapshotId: number) => {
    if (!onRestore) return;
    setRestoringId(snapshotId);
    try {
      await onRestore(snapshotId);
      onClose();
    } finally {
      setRestoringId(null);
    }
  };

  const handlePreview = async (snapshotId: number) => {
    if (!chapterId || !getCurrentContent) return;
    const id = parseInt(chapterId, 10);
    if (Number.isNaN(id)) return;
    setDiffLoading(true);
    setPreviewSnapshotId(snapshotId);
    setDiffLinesState(null);
    try {
      const data = await chaptersApi.getYjsSnapshot(id, snapshotId);
      const versionJson = getContentJSONFromYjsSnapshotBase64(data.snapshot);
      const versionText = getTextFromProsemirrorJSON(versionJson);
      const currentText = getCurrentContent();
      const lines = diffLines(versionText, currentText);
      setDiffLinesState(lines);
    } catch {
      setDiffLinesState([]);
    } finally {
      setDiffLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewSnapshotId(null);
    setDiffLinesState(null);
  };

  if (!isOpen) return null;

  const showingDiff = previewSnapshotId !== null;

  return (
    <div className="chapter-history-overlay" onClick={onClose}>
      <div className="chapter-history-modal chapter-history-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="chapter-history-header">
          <span className="chapter-history-title">
            <History size={18} />
            {showingDiff ? '对比预览' : '历史记录（Yjs 版本）'}
            {chapterTitle && <span className="chapter-history-sub"> · {chapterTitle}</span>}
          </span>
          <button type="button" className="chapter-history-close" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        <div className="chapter-history-body">
          {showingDiff ? (
            <>
              <div className="chapter-history-diff-toolbar">
                <span className="chapter-history-diff-legend">
                  <span className="diff-remove">− 该版本删除</span>
                  <span className="diff-add">+ 当前新增</span>
                </span>
                <button type="button" className="chapter-history-back-btn" onClick={closePreview}>
                  返回列表
                </button>
              </div>
              {diffLoading ? (
                <div className="chapter-history-loading">
                  <LoadingSpinner />
                </div>
              ) : diffLinesState && diffLinesState.length > 0 ? (
                <div className="chapter-history-diff-wrap">
                  <DiffView lines={diffLinesState} />
                </div>
              ) : diffLinesState ? (
                <p className="chapter-history-empty">当前内容与该版本一致，无差异。</p>
              ) : null}
            </>
          ) : (
            <>
              {onCreateVersion && (
                <div className="chapter-history-actions">
                  <button
                    type="button"
                    className="chapter-history-create-btn"
                    onClick={handleCreateVersion}
                    disabled={creating}
                  >
                    <Plus size={16} />
                    {creating ? '创建中…' : '创建版本'}
                  </button>
                </div>
              )}
              {loading ? (
                <div className="chapter-history-loading">
                  <LoadingSpinner />
                </div>
              ) : snapshots.length === 0 ? (
                <p className="chapter-history-empty">
                  暂无历史版本。点击「创建版本」保存当前内容为快照，可随时恢复。
                </p>
              ) : (
                <ul className="chapter-history-list">
                  {snapshots.map((s) => (
                    <li key={s.id} className="chapter-history-item">
                      <div className="chapter-history-item-head">
                        <span className="chapter-history-version">
                          {s.label || `版本 ${s.id}`}
                        </span>
                        <span className="chapter-history-date">{formatDate(s.created_at)}</span>
                      </div>
                      <div className="chapter-history-item-actions">
                        {getCurrentContent && (
                          <button
                            type="button"
                            className="chapter-history-preview-btn"
                            onClick={() => handlePreview(s.id)}
                          >
                            <FileDiff size={14} />
                            预览对比
                          </button>
                        )}
                        {onRestore && (
                          <button
                            type="button"
                            className="chapter-history-restore-btn"
                            onClick={() => handleRestore(s.id)}
                            disabled={restoringId !== null}
                          >
                            <RotateCcw size={14} />
                            {restoringId === s.id ? '恢复中…' : '恢复到此版本'}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
