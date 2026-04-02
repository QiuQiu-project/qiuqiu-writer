/**
 * RatingWidget — 用户对 AI 生成结果的评分组件
 * 1-5 星 + 可选评论，提交后显示感谢提示
 */

import { useState } from 'react';
import { Star, MessageSquare, Check } from 'lucide-react';
import './RatingWidget.css';

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
      <div className="rating-widget rating-widget--done">
        <Check size={13} />
        <span>感谢反馈</span>
      </div>
    );
  }

  return (
    <div className="rating-widget">
      <span className="rating-widget__label">对这次生成评分：</span>
      <div className="rating-widget__stars">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            className={`rating-star${star <= (hover || selected) ? ' active' : ''}`}
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
        ))}
      </div>

      {!compact && showComment && (
        <div className="rating-widget__comment">
          <input
            className="rating-widget__input"
            placeholder="说说原因（可选）"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitWithComment()}
            maxLength={200}
            autoFocus
          />
          <button className="rating-widget__submit" onClick={submitWithComment} disabled={submitting}>
            <Check size={13} />
          </button>
        </div>
      )}

      {!compact && !showComment && (
        <button
          className="rating-widget__comment-btn"
          onClick={() => setShowComment(true)}
          title="添加评论"
        >
          <MessageSquare size={12} />
        </button>
      )}
    </div>
  );
}
