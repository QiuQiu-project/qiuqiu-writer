import { useState } from 'react';
import { X, Bug, Lightbulb, MessageSquare } from 'lucide-react';
import { feedbackApi, type FeedbackCreate } from '../../utils/feedbackApi';
import './FeedbackModal.css';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowMessage?: (msg: string, type: 'success' | 'error') => void;
  context?: {
    work_id?: string | null;
    chapter_id?: string | null;
  };
}

const TYPES: { value: FeedbackCreate['type']; label: string; icon: React.ReactNode }[] = [
  { value: 'bug', label: 'Bug 反馈', icon: <Bug size={14} /> },
  { value: 'suggestion', label: '功能建议', icon: <Lightbulb size={14} /> },
  { value: 'other', label: '其他', icon: <MessageSquare size={14} /> },
];

export default function FeedbackModal({ isOpen, onClose, onShowMessage, context }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackCreate['type']>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await feedbackApi.submit({
        type,
        title: title.trim(),
        description: description.trim(),
        context: {
          work_id: context?.work_id ?? null,
          chapter_id: context?.chapter_id ?? null,
          page_url: window.location.pathname,
        },
      });
      onShowMessage?.('反馈已提交，感谢您的反馈！', 'success');
      setTitle('');
      setDescription('');
      setType('bug');
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '提交失败，请稍后再试';
      onShowMessage?.(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="feedback-overlay" onClick={onClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-header">
          <h3>问题反馈</h3>
          <button className="feedback-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="feedback-body">
          {/* 类型选择 */}
          <div className="feedback-field">
            <label className="feedback-label">反馈类型</label>
            <div className="feedback-type-group">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  className={`feedback-type-btn ${type === t.value ? 'active' : ''}`}
                  onClick={() => setType(t.value)}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 标题 */}
          <div className="feedback-field">
            <label className="feedback-label">标题</label>
            <input
              className="feedback-input"
              type="text"
              placeholder="简述问题或建议…"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* 描述 */}
          <div className="feedback-field">
            <label className="feedback-label">详细描述</label>
            <textarea
              className="feedback-textarea"
              placeholder="请详细描述您遇到的问题或建议内容…"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="feedback-footer">
          <button className="feedback-btn secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            className="feedback-btn primary"
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !description.trim()}
          >
            {submitting ? '提交中…' : '提交反馈'}
          </button>
        </div>
      </div>
    </div>
  );
}
