/**
 * 作品恢复模态框
 * 从本地缓存恢复作品和章节
 */

import { useState, useEffect } from 'react';
import { X, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { 
  getRecoverableWorks, 
  recoverWorkFromCache, 
  type RecoveryProgress 
} from '../utils/workRecovery';
import './WorkRecoveryModal.css';

interface WorkRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workId: number) => void;
}

interface RecoverableWork {
  workId: number;
  workTitle?: string;
  chapterCount: number;
  existsOnline: boolean;
}

export default function WorkRecoveryModal({ 
  isOpen, 
  onClose, 
  onSuccess 
}: WorkRecoveryModalProps) {
  const [recoverableWorks, setRecoverableWorks] = useState<RecoverableWork[]>([]);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [progress, setProgress] = useState<RecoveryProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载可恢复的作品列表
  useEffect(() => {
    if (isOpen) {
      loadRecoverableWorks();
    }
  }, [isOpen]);

  const loadRecoverableWorks = async () => {
    setLoading(true);
    setError(null);
    try {
      const works = await getRecoverableWorks();
      // 只显示不在线上的作品
      const offlineWorks = works.filter(w => !w.existsOnline);
      setRecoverableWorks(offlineWorks);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载可恢复作品失败');
      console.error('加载可恢复作品失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (workId: number) => {
    setRecovering(true);
    setProgress(null);
    setError(null);

    try {
      const result = await recoverWorkFromCache(workId, (progress) => {
        setProgress(progress);
      });

      if (result.success && result.workId) {
        // 恢复成功
        setTimeout(() => {
          onSuccess?.(result.workId!);
          handleClose();
        }, 2000);
      } else {
        setError(result.error || '恢复失败');
        setRecovering(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
      setRecovering(false);
    }
  };

  const handleClose = () => {
    setRecovering(false);
    setProgress(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="work-recovery-modal-overlay" onClick={handleClose}>
      <div className="work-recovery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="work-recovery-modal-header">
          <h2>从本地缓存恢复作品</h2>
          <button className="work-recovery-modal-close" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="work-recovery-modal-body">
          {loading ? (
            <div className="work-recovery-loading">
              <Loader2 size={24} className="spinning" />
              <p>正在扫描本地缓存...</p>
            </div>
          ) : error && !recovering ? (
            <div className="work-recovery-error">
              <AlertCircle size={24} />
              <p>{error}</p>
              <button className="work-recovery-retry-btn" onClick={loadRecoverableWorks}>
                重试
              </button>
            </div>
          ) : recoverableWorks.length === 0 ? (
            <div className="work-recovery-empty">
              <p>未找到可恢复的作品</p>
              <p className="work-recovery-empty-hint">
                只有存在于本地缓存但不在线上的作品才能恢复
              </p>
            </div>
          ) : recovering ? (
            <div className="work-recovery-progress">
              {progress && (
                <>
                  <div className="work-recovery-progress-header">
                    <h3>{progress.workTitle || `作品 ${progress.workId}`}</h3>
                    <div className="work-recovery-progress-status">
                      {progress.status === 'completed' && (
                        <CheckCircle size={20} className="success" />
                      )}
                      {progress.status === 'error' && (
                        <AlertCircle size={20} className="error" />
                      )}
                      {progress.status !== 'completed' && progress.status !== 'error' && (
                        <Loader2 size={20} className="spinning" />
                      )}
                    </div>
                  </div>
                  
                  <div className="work-recovery-progress-message">
                    {progress.message}
                  </div>

                  {progress.totalChapters > 0 && (
                    <div className="work-recovery-progress-bar">
                      <div 
                        className="work-recovery-progress-fill"
                        style={{ 
                          width: `${(progress.recoveredChapters / progress.totalChapters) * 100}%` 
                        }}
                      />
                      <div className="work-recovery-progress-text">
                        {progress.recoveredChapters} / {progress.totalChapters}
                      </div>
                    </div>
                  )}

                  {progress.currentChapter && (
                    <div className="work-recovery-current-chapter">
                      正在恢复: 第{progress.currentChapter.chapterNumber}章 - {progress.currentChapter.title}
                    </div>
                  )}

                  {progress.status === 'completed' && (
                    <div className="work-recovery-success">
                      <CheckCircle size={24} className="success" />
                      <p>恢复完成！</p>
                      <p className="work-recovery-success-detail">
                        成功恢复 {progress.recoveredChapters} 个章节
                      </p>
                    </div>
                  )}

                  {progress.status === 'error' && progress.error && (
                    <div className="work-recovery-error">
                      <AlertCircle size={24} className="error" />
                      <p>{progress.error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="work-recovery-list">
              <p className="work-recovery-list-hint">
                以下作品存在于本地缓存但不在线上，可以恢复：
              </p>
              <div className="work-recovery-works">
                {recoverableWorks.map((work) => (
                  <div key={work.workId} className="work-recovery-item">
                    <div className="work-recovery-item-info">
                      <h4>{work.workTitle || `作品 ${work.workId}`}</h4>
                      <p className="work-recovery-item-meta">
                        作品ID: {work.workId} · {work.chapterCount} 个章节
                      </p>
                    </div>
                    <button
                      className="work-recovery-item-btn"
                      onClick={() => handleRecover(work.workId)}
                      disabled={recovering}
                    >
                      <RefreshCw size={16} />
                      <span>恢复</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



