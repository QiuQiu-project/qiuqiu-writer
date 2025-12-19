import { Home, BookOpen, FileText, Video, PenTool, GraduationCap, HelpCircle, Sparkles, Wrench } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import './HomeSideNav.css';

const navItems = [
  { id: 'home', label: '首页', icon: Home, path: '/home' },
  { id: 'works', label: '小说写作', icon: BookOpen, path: '/works' },
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
              {/* 如果以后需要 badge，可以给 navItems 增加 badge 字段并扩展类型 */}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

