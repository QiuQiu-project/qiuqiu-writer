import { ChevronRight } from 'lucide-react';
import './Announcements.css';

const announcements = [
  { title: '小说/剧本编辑器的"回收站"上线啦!', date: '2025-11-27 19:24' },
  { title: '给各位股东播报一下蛙蛙最近的更新内容', date: '2025-11-20 17:25' },
  { title: '「AI工具大赛第五期」获奖名单重磅揭晓!', date: '2025-11-27 14:53' },
  { title: '无限卡重磅回归!', date: '2025-11-10 20:34' },
];

export default function Announcements() {
  return (
    <div className="announcements">
      <div className="card-header">
        <h3 className="card-title">活动公告</h3>
        <a href="#" className="more-link">
          查看更多 <ChevronRight size={14} />
        </a>
      </div>
      <div className="announcements-list">
        {announcements.map((item, index) => (
          <div key={index} className="announcement-item">
            <p className="announcement-title">{item.title}</p>
            <span className="announcement-date">{item.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

