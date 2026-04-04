import { Heart, MessageCircle, Eye, Calendar } from 'lucide-react';
import { getUserAvatarUrl } from '../../utils/avatarUtils';

interface UGCContent {
  id: string;
  title: string;
  author: string;
  avatar?: string;
  content: string;
  category: string;
  tags: string[];
  likes: number;
  views: number;
  comments: number;
  createdAt: string;
  coverImage?: string;
}

interface ContentCardProps {
  content: UGCContent;
  index?: number;
}

export default function ContentCard({ content, index = 0 }: ContentCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    if (days < 365) return `${Math.floor(days / 30)}个月前`;
    return `${Math.floor(days / 365)}年前`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  return (
    <article
      className="group flex flex-col border rounded-[var(--radius-lg,12px)] overflow-hidden transition-all cursor-pointer h-full shadow-[var(--shadow)] relative hover:-translate-y-2 hover:scale-[1.02] hover:border-transparent hover:shadow-[var(--shadow-lg),var(--shadow-colored)] [animation:card-fade-in_0.6s_ease-out_backwards]"
      style={{
        background: 'var(--bg-primary)',
        borderColor: 'var(--border-light)',
        animationDelay: `calc(${index} * 0.1s)`,
      }}
    >
      {/* Top accent bar — fades in on hover */}
      <span
        className="absolute top-0 left-0 right-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity z-[1]"
        style={{ background: 'var(--accent-gradient)' }}
      />

      {content.coverImage && (
        <div
          className="w-full h-[200px] overflow-hidden relative"
          style={{ background: 'var(--accent-gradient)' }}
        >
          {/* Hover overlay */}
          <span className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity z-[1]" />
          <img
            src={content.coverImage}
            alt={content.title}
            className="w-full h-full object-cover transition-transform duration-[var(--transition-slow,500ms)] group-hover:scale-110"
          />
        </div>
      )}

      <div
        className="flex justify-between items-center px-4 py-3 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div
          className="px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-[0.5px] shadow-[var(--shadow-sm)] transition-all group-hover:scale-105 group-hover:shadow-[var(--shadow)] text-white"
          style={{ background: 'var(--accent-gradient)' }}
        >
          {content.category}
        </div>
        <div className="flex items-center gap-1 text-[0.8125rem]" style={{ color: 'var(--text-secondary)' }}>
          <Calendar size={14} />
          <span>{formatDate(content.createdAt)}</span>
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col gap-3.5 max-md:p-3">
        <h3
          className="text-xl font-bold leading-[1.4] m-0 line-clamp-2 transition-colors group-hover:[color:var(--accent-primary)] max-md:text-base"
          style={{ color: 'var(--text-primary)' }}
        >
          {content.title}
        </h3>
        <p
          className="text-[0.9375rem] leading-[1.7] m-0 line-clamp-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          {content.content}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {content.tags.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-[var(--radius-sm,6px)] text-xs font-medium transition-all border border-transparent group-hover:-translate-y-px group-hover:[background:var(--accent-light)] group-hover:[border-color:var(--accent-primary)]"
              style={{ background: 'var(--bg-gradient-soft)', color: 'var(--accent-primary)' }}
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div
        className="flex justify-between items-center px-5 py-4 border-t max-md:px-3"
        style={{
          borderColor: 'var(--border-light)',
          background: 'linear-gradient(180deg, var(--bg-secondary) 0%, rgba(248,250,252,0.5) 100%)',
        }}
      >
        <div className="flex items-center gap-2">
          <img
            src={getUserAvatarUrl(content.avatar, content.author)}
            alt={content.author}
            className="w-6 h-6 rounded-full object-cover shadow-[var(--shadow-sm)] transition-all group-hover:scale-110 group-hover:shadow-[var(--shadow)]"
          />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {content.author}
          </span>
        </div>
        <div className="flex gap-4 items-center max-md:gap-3">
          {[
            { icon: Eye, count: content.views },
            { icon: Heart, count: content.likes },
            { icon: MessageCircle, count: content.comments },
          ].map(({ icon: Icon, count }) => (
            <div
              key={Icon.name}
              className="flex items-center gap-1.5 text-[0.8125rem] font-medium px-2 py-1 rounded-[var(--radius-sm,6px)] cursor-pointer transition-all hover:-translate-y-px hover:[background:var(--accent-light)] hover:[color:var(--accent-primary)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Icon size={16} className="shrink-0 transition-all group-hover:[color:var(--accent-primary)] group-hover:scale-110" />
              <span>{formatNumber(count)}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
