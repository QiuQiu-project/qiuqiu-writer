import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, BookOpen, FileText, Video, PenTool, User, Bell, Coins, Bot, GraduationCap, Info, Package, PlaySquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './MainLayout.css';

type NavItem = 
  | { id: string; label: string; icon: LucideIcon; path: string; badge?: string }
  | { type: 'divider' };

const navItems: NavItem[] = [
  { id: 'home', label: '首页', icon: Home, path: '/' },
  { id: 'works', label: '我的作品', icon: BookOpen, path: '/works' },
  { id: 'novel', label: '小说写作', icon: FileText, path: '/novel' },
  { id: 'script', label: '剧本写作', icon: Video, path: '/script' },
  { id: 'comic-video', label: '漫剧视频', icon: PlaySquare, path: '/comic-video' },
  { id: 'general', label: '通用写作', icon: PenTool, path: '/general' },
  { type: 'divider' },
  { id: 'classroom', label: '蛙蛙课堂', icon: GraduationCap, path: '/classroom', badge: 'New' },
  { id: 'tutorial', label: '使用教程', icon: Info, path: '/tutorial' },
  { id: 'ai-tools-upgraded', label: 'AI工具 (升级版)', icon: Package, path: '/ai-tools-upgraded' },
  { id: 'ai-toolbox', label: 'AI工具箱', icon: Bot, path: '/ai-toolbox' },
];

const bottomNavItems = [
  { id: 'home', label: '首页', icon: Home, path: '/' },
  { id: 'ai-tools', label: 'AI工具', icon: Bot, path: '/ai-tools' },
  { id: 'classroom', label: '课堂', icon: GraduationCap, path: '/classroom' },
  { id: 'profile', label: '我的', icon: User, path: '/profile' },
];

export default function MainLayout() {
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className="main-layout">
      {/* 顶部导航栏 */}
      <header className="layout-header">
        <div className="header-left">
          <div className="logo-section">
            <span className="frog-icon">🐸</span>
            <h1 className="app-title">蛙蛙写作</h1>
          </div>
        </div>
        <div className="header-right">
          <button className="icon-button">
            <Bell size={20} />
          </button>
          <div className="coin-display">
            <Coins size={18} />
            <span>514+</span>
          </div>
          <div className="user-menu-wrapper">
            <button 
              className="user-avatar-btn"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <User size={20} />
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown">
                <div className="user-info">
                  <div className="user-avatar-large">
                    <User size={24} />
                  </div>
                  <div className="user-details">
                    <p className="user-name">蛙蛙tL2L3z</p>
                    <p className="user-email">user@example.com</p>
                  </div>
                </div>
                <div className="menu-divider"></div>
                <a href="#" className="menu-item">个人设置</a>
                <a href="#" className="menu-item">会员中心</a>
                <a href="#" className="menu-item">退出登录</a>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 左侧导航栏 */}
      <aside className="layout-sidebar">
        <nav className="sidebar-nav">
          {navItems.map((item, index) => {
            if ('type' in item && item.type === 'divider') {
              return <div key={`divider-${index}`} className="nav-divider" />;
            }
            if ('id' in item) {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge}</span>}
                </Link>
              );
            }
            return null;
          })}
        </nav>
      </aside>

      {/* 漂浮的内容区域 */}
      <main className="layout-content">
        <Outlet />
      </main>

      {/* 移动端底部导航栏 */}
      <nav className="bottom-nav">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

