/**
 * RatingWidget — 用户对 AI 生成结果的评分组件
 * 1-5 星 + 可选评论，提交后显示感谢提示
 */

import { useState } from 'react';
import { Star, MessageSquare, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// 获取或生成匿名 session_id（存入 localStorage）
function getSessionId(): string {
  const KEY = 'qw_rating_session';
  let sid = localStorage.getItem(KEY);
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, sid);
  }
  return sid;
}

export interface RatingContext {
  work_id?: string | number;
  chapter_id?: string | number;
  generation_type?: string;
  content_preview?: string;
}

interface RatingWidgetProps {
  promptTemplateId?: number;
  experimentId?: number;
  variantId?: number;
  context?: RatingContext;
  /** 精简模式：隐藏评论输入框 */
  compact?: boolean;
}

export default function RatingWidget({
  promptTemplateId,
  experimentId,
  variantId,
  context,
  compact = false,
}: RatingWidgetProps) {
  const [hover, setHover] = useState(0);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (stars: number) => {
    if (submitting || submitted) return;
    setSelected(stars);
    setSubmitting(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/v1/prompt-ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt_template_id: promptTemplateId,
          experiment_id: experimentId,
          variant_id: variantId,
          rating: stars,
          comment: comment.trim() || null,
          session_id: getSessionId(),
          context: context || {},
        }),
      });
      if (!response.ok) {
        throw new Error(`submit failed: ${response.status}`);
      }
      setSubmitted(true);
    } catch {
      setSubmitting(false);
      return;
    } finally {
      setSubmitting(false);
    }
  };

  const submitWithComment = () => {
    if (selected > 0) submit(selected);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-1 mt-2 px-2.5 py-1 rounded-[8px] text-xs border" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
        <Check size={13} />
        <span>感谢反馈</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 mt-2 px-2.5 py-[5px] rounded-[8px] border flex-wrap"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
        对这次生成评分：
      </span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(star => {
          const isActive = star <= (hover || selected);
          return (
            <button
              key={star}
              className={cn(
                'bg-transparent border-none p-0.5 cursor-pointer transition-[color_0.12s,transform_0.1s] leading-none flex items-center disabled:opacity-50 disabled:cursor-not-allowed',
                isActive ? 'text-amber-400 scale-[1.15] [&>svg]:fill-current' : ''
              )}
              style={{ color: isActive ? '#f59e0b' : 'var(--text-tertiary)' }}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              onClick={() => {
                if (compact) {
                  submit(star);
                } else {
                  setSelected(star);
                  setShowComment(true);
                }
              }}
              disabled={submitting}
              title={`${star} 星`}
            >
              <Star size={14} />
            </button>
          );
        })}
      </div>

      {!compact && showComment && (
        <div className="flex gap-1 items-center flex-1 min-w-[160px]">
          <input
            className="flex-1 h-[26px] px-2 rounded-[5px] border text-xs outline-none focus:[border-color:var(--accent-primary)]"
            style={{ borderColor: 'var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            placeholder="说说原因（可选）"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitWithComment()}
            maxLength={200}
            autoFocus
          />
          <button
            className="w-[26px] h-[26px] rounded-[5px] border-none text-white cursor-pointer flex items-center justify-center shrink-0 hover:opacity-85"
            style={{ background: 'var(--accent-primary)' }}
            onClick={submitWithComment}
            disabled={submitting}
          >
            <Check size={13} />
          </button>
        </div>
      )}

      {!compact && !showComment && (
        <button
          className="bg-transparent border-none cursor-pointer p-0.5 flex items-center hover:[color:var(--text-secondary)]"
          style={{ color: 'var(--text-tertiary)' }}
          onClick={() => setShowComment(true)}
          title="添加评论"
        >
          <MessageSquare size={12} />
        </button>
      )}
    </div>
  );
}
