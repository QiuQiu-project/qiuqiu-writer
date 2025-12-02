import { Home, BookOpen, FileText, Video, PenTool, GraduationCap, HelpCircle, Sparkles, Wrench } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import './HomeSideNav.css';

const navItems = [
  { id: 'home', label: '首页', icon: Home, path: '/home' },
  { id: 'works', label: '我的作品', icon: BookOpen, path: '/works' },
  { id: 'novel', label: '小说写作', icon: FileText, path: '/novel' },
  { id: 'script', label: '剧本写作', icon: Video, path: '/script' },
  { id: 'comic', label: '漫剧视频', icon: Video, path: '/comic' },
  { id: 'general', label: '通用写作', icon: PenTool, path: '/general' },
  { id: 'classroom', label: '蛙蛙课堂 New', icon: GraduationCap, path: '/classroom', badge: true },
  { id: 'tutorial', label: '使用教程', icon: HelpCircle, path: '/tutorial' },
  { id: 'ai-tools', label: 'AI工具 (升级版)', icon: Sparkles, path: '/ai-tools' },
  { id: 'toolbox', label: 'AI工具箱', icon: Wrench, path: '/toolbox' },
  { id: 'submission', label: '投稿168 合作', icon: FileText, path: '/submission' },
  { id: 'data', label: '网文大数据 合作', icon: BookOpen, path: '/data' },
];

export default function HomeSideNav() {
  const location = useLocation();

  return (
    <aside className="home-side-nav">
      <div className="nav-logo">
        <span className="frog-icon">🐸</span>
        <span className="logo-text">蛙蛙写作</span>
      </div>
      <nav className="nav-menu">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge && <span className="badge">New</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

