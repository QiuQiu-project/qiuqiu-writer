import { Heart, MessageCircle, Eye, Calendar } from 'lucide-react';
import { getUserAvatarUrl } from '../../utils/avatarUtils';
import './ContentCard.css';

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
      className="content-card"
      style={{ '--index': index } as React.CSSProperties}
    >
      {content.coverImage && (
        <div className="card-cover">
          <img src={content.coverImage} alt={content.title} />
        </div>
      )}
      <div className="card-header">
        <div className="card-category">{content.category}</div>
        <div className="card-date">
          <Calendar size={14} />
          <span>{formatDate(content.createdAt)}</span>
        </div>
      </div>
      <div className="card-body">
        <h3 className="card-title">{content.title}</h3>
        <p className="card-excerpt">{content.content}</p>
        <div className="card-tags">
          {content.tags.map((tag) => (
            <span key={tag} className="card-tag">
              #{tag}
            </span>
          ))}
        </div>
      </div>
      <div className="card-footer">
        <div className="card-author">
          <img 
            src={getUserAvatarUrl(content.avatar, content.author)} 
            alt={content.author} 
            className="author-avatar" 
          />
          <span className="author-name">{content.author}</span>
        </div>
        <div className="card-stats">
          <div className="stat-item">
            <Eye size={16} />
            <span>{formatNumber(content.views)}</span>
          </div>
          <div className="stat-item">
            <Heart size={16} />
            <span>{formatNumber(content.likes)}</span>
          </div>
          <div className="stat-item">
            <MessageCircle size={16} />
            <span>{formatNumber(content.comments)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

