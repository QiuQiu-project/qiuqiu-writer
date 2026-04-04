import React, { useState, useEffect } from 'react';
import DraggableResizableModal from '../common/DraggableResizableModal';
import { X, Save, Trash2 } from 'lucide-react';

interface VolumeSettingsModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  volumeId?: string;
  initialTitle?: string;
  initialOutline?: string;
  initialDetailOutline?: string;
  onClose: () => void;
  onSave: (title: string, volumeId?: string, outline?: string, detailOutline?: string) => void;
  onDelete?: (volumeId: string) => void;
  readOnly?: boolean;
}

const inputClass = 'w-full px-3 py-2.5 border rounded-[6px] text-[15px] transition-all resize-none focus:outline-none focus:border-[var(--accent-primary)] focus:bg-[var(--bg-primary)] focus:[box-shadow:0_0_0_3px_var(--accent-light)]';

export default function VolumeSettingsModal({
  isOpen,
  mode,
  volumeId,
  initialTitle = '',
  initialOutline = '',
  initialDetailOutline = '',
  onClose,
  onSave,
  onDelete,
  readOnly
}: VolumeSettingsModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [outline, setOutline] = useState(initialOutline || '');
  const [detailOutline, setDetailOutline] = useState(initialDetailOutline || '');

  useEffect(() => {
    setTimeout(() => {
      setTitle(initialTitle);
      setOutline(initialOutline || '');
      setDetailOutline(initialDetailOutline || '');
    }, 0);
  }, [initialTitle, initialOutline, initialDetailOutline, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title, volumeId, outline, detailOutline);
    onClose();
  };

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={600}
      initialHeight={650}
      className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-light)] [box-shadow:var(--shadow-md)] [animation:modalSlideIn_0.2s_ease-out]"
      handleClassName=".volume-modal-header"
    >
      <div className="volume-modal-header flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-light)' }}>
        <h2 className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>{mode === 'create' ? '新建卷' : '卷纲设置'}</h2>
        <button
          className="w-8 h-8 flex items-center justify-center border-none bg-transparent cursor-pointer rounded-[4px] transition-all hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]"
          style={{ color: 'var(--text-tertiary)' }}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto px-6 py-6 gap-6 max-md:px-4 max-md:py-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="volume-title" className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>卷名称</label>
          <input
            id="volume-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="请输入卷名称"
            autoFocus
            className={inputClass}
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
            disabled={readOnly}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="volume-outline" className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>卷大纲</label>
          <textarea
            id="volume-outline"
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
            placeholder="请输入卷大纲..."
            className={inputClass}
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)', minHeight: '80px' }}
            rows={4}
            disabled={readOnly}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="volume-detail-outline" className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>卷细纲</label>
          <textarea
            id="volume-detail-outline"
            value={detailOutline}
            onChange={(e) => setDetailOutline(e.target.value)}
            placeholder="请输入卷细纲..."
            className={inputClass}
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)', minHeight: '80px' }}
            rows={6}
            disabled={readOnly}
          />
        </div>

        <div className="flex justify-between items-center pt-2 max-[640px]:flex-col max-[640px]:gap-3 max-[640px]:items-stretch">
          {!readOnly && mode === 'edit' && onDelete && volumeId && (
            <button
              type="button"
              className="flex items-center gap-1.5 px-4 h-9 border-none rounded-[6px] text-sm font-medium cursor-pointer transition-all max-[640px]:justify-center max-[640px]:order-2"
              style={{ background: 'var(--error-light)', color: 'var(--error)' }}
              onClick={() => {
                if (window.confirm('确定要删除该卷吗？删除后卷内章节将保留但不再属于任何卷。')) {
                  onDelete(volumeId);
                  onClose();
                }
              }}
            >
              <Trash2 size={16} /> 删除卷
            </button>
          )}
          <div className="flex gap-3 ml-auto max-[640px]:ml-0 max-[640px]:order-1 max-[640px]:w-full">
            <button
              type="button"
              className="px-4 h-9 min-w-[80px] border rounded-[6px] bg-transparent text-sm font-medium cursor-pointer transition-all flex items-center justify-center max-[640px]:flex-1 hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)] hover:[border-color:var(--border-hover)]"
              style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
              onClick={onClose}
            >
              取消
            </button>
            {!readOnly && (
              <button
                type="submit"
                className="flex items-center justify-center gap-1.5 px-4 h-9 min-w-[80px] border-none rounded-[6px] text-sm font-medium cursor-pointer transition-all max-[640px]:flex-1 hover:[background:var(--accent-hover)] hover:-translate-y-px hover:[box-shadow:var(--shadow-md)] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
                style={{ background: 'var(--accent-primary)', color: 'white', boxShadow: 'var(--shadow)' }}
                disabled={!title.trim()}
              >
                <Save size={16} /> 保存
              </button>
            )}
          </div>
        </div>
      </form>
    </DraggableResizableModal>
  );
}
