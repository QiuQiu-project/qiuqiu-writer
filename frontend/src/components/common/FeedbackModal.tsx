import { useState, type ReactNode } from 'react';
import DraggableResizableModal from './DraggableResizableModal';
import { X, Bug, Lightbulb, MessageSquare } from 'lucide-react';
import { feedbackApi, type FeedbackCreate } from '../../utils/feedbackApi';
import { parseError } from '../../utils/errorUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowMessage?: (msg: string, type: 'success' | 'error') => void;
  context?: {
    work_id?: string | null;
    chapter_id?: string | null;
  };
}

const TYPES: { value: FeedbackCreate['type']; label: string; icon: ReactNode }[] = [
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
      onShowMessage?.(parseError(e, '提交失败，请稍后再试'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={460}
      initialHeight={600}
      className="feedback-modal"
      handleClassName=".feedback-header"
    >
      <div className="feedback-header flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="m-0 text-[15px] font-semibold text-foreground">问题反馈</h3>
        <button
          className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 rounded flex items-center justify-center transition-all hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">
        {/* 类型选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            反馈类型
          </label>
          <div className="flex gap-2 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t.value}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[13px] cursor-pointer transition-all',
                  type === t.value
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:border-primary hover:text-primary'
                )}
                onClick={() => setType(t.value)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 标题 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            标题
          </label>
          <Input
            type="text"
            placeholder="简述问题或建议…"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* 描述 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            详细描述
          </label>
          <textarea
            className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground font-[inherit] transition-colors outline-none resize-none placeholder:text-muted-foreground focus:border-ring"
            placeholder="请详细描述您遇到的问题或建议内容…"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2.5 px-5 py-3.5 border-t border-border">
        <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !description.trim()}
        >
          {submitting ? '提交中…' : '提交反馈'}
        </Button>
      </div>
    </DraggableResizableModal>
  );
}
