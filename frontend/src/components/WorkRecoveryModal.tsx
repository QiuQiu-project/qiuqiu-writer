/**
 * 作品恢复模态框
 * 从本地缓存恢复作品和章节
 */

import { useState, useEffect } from 'react';
import DraggableResizableModal from './common/DraggableResizableModal';
import { X, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import {
  getRecoverableWorks,
  recoverWorkFromCache,
  type RecoveryProgress
} from '../utils/workRecovery';
import { Button } from '@/components/ui/button';

interface WorkRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workId: string) => void;
}

interface RecoverableWork {
  workId: string;
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
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (workId: string) => {
    setRecovering(true);
    setProgress(null);
    setError(null);

    try {
      const result = await recoverWorkFromCache(workId, (progress) => {
        setProgress(progress);
      });

      if (result.success && result.workId) {
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
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={handleClose}
      initialWidth={600}
      initialHeight={600}
      className="work-recovery-modal"
      handleClassName=".work-recovery-modal-header"
    >
      {/* Header */}
      <div className="work-recovery-modal-header flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="m-0 text-xl font-semibold text-foreground">从本地缓存恢复作品</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X size={20} />
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 size={24} className="animate-spin" />
            <p className="m-0">正在扫描本地缓存...</p>
          </div>
        ) : error && !recovering ? (
          <div className="flex flex-col items-center gap-3 py-8 text-destructive">
            <AlertCircle size={24} />
            <p className="m-0">{error}</p>
            <Button variant="outline" size="sm" onClick={loadRecoverableWorks}>
              重试
            </Button>
          </div>
        ) : recoverableWorks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p className="m-0">未找到可恢复的作品</p>
            <p className="m-0 mt-2 text-sm">
              只有存在于本地缓存但不在线上的作品才能恢复
            </p>
          </div>
        ) : recovering ? (
          <div className="py-4">
            {progress && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="m-0 text-base font-semibold text-foreground">
                    {progress.workTitle || `作品 ${progress.workId}`}
                  </h3>
                  <div>
                    {progress.status === 'completed' && (
                      <CheckCircle size={20} className="text-green-500" />
                    )}
                    {progress.status === 'error' && (
                      <AlertCircle size={20} className="text-destructive" />
                    )}
                    {progress.status !== 'completed' && progress.status !== 'error' && (
                      <Loader2 size={20} className="animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="mb-3 text-sm text-muted-foreground">
                  {progress.message}
                </div>

                {progress.totalChapters > 0 && (
                  <div className="relative mb-3 h-5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${(progress.recoveredChapters / progress.totalChapters) * 100}%`
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
                      {progress.recoveredChapters} / {progress.totalChapters}
                    </div>
                  </div>
                )}

                {progress.currentChapter && (
                  <div className="text-sm text-muted-foreground">
                    正在恢复: 第{progress.currentChapter.chapterNumber}章 - {progress.currentChapter.title}
                  </div>
                )}

                {progress.status === 'completed' && (
                  <div className="mt-4 flex flex-col items-center gap-2 text-center">
                    <CheckCircle size={24} className="text-green-500" />
                    <p className="m-0 font-medium text-foreground">恢复完成！</p>
                    <p className="m-0 text-sm text-muted-foreground">
                      成功恢复 {progress.recoveredChapters} 个章节
                    </p>
                  </div>
                )}

                {progress.status === 'error' && progress.error && (
                  <div className="mt-4 flex flex-col items-center gap-2 text-center text-destructive">
                    <AlertCircle size={24} />
                    <p className="m-0">{progress.error}</p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm text-muted-foreground">
              以下作品存在于本地缓存但不在线上，可以恢复：
            </p>
            <div className="flex flex-col gap-3">
              {recoverableWorks.map((work) => (
                <div
                  key={work.workId}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4 transition-all hover:border-primary/50 hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="m-0 text-base font-semibold text-foreground">
                      {work.workTitle || `作品 ${work.workId}`}
                    </h4>
                    <p className="m-0 mt-1 text-sm text-muted-foreground">
                      作品ID: {work.workId} · {work.chapterCount} 个章节
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-4 shrink-0 gap-1.5"
                    onClick={() => handleRecover(work.workId)}
                    disabled={recovering}
                  >
                    <RefreshCw size={16} />
                    <span>恢复</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DraggableResizableModal>
  );
}
