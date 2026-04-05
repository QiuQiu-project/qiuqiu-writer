import { Home, BookOpen } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { id: 'home', label: '首页', icon: Home, path: '/home' },
  { id: 'works', label: '个人主页', icon: BookOpen, path: '/works' },
];

export default function HomeSideNav() {
  const location = useLocation();

  return (
    <aside
      className="w-[220px] border-r flex flex-col py-6 h-[calc(100vh-64px)] overflow-y-auto sticky top-16"
      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
    >
      <div
        className="flex items-center gap-2 px-5 pb-6 border-b mb-4"
        style={{ borderColor: 'var(--border-light)' }}
      >
        <img src="/logo.svg" alt="Logo" className="w-8 h-8 object-contain" data-no-lightbox />
        <span
          className="text-lg font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: 'var(--accent-gradient)' }}
        >
          球球写作
        </span>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm no-underline transition-all duration-200',
                isActive ? 'font-semibold' : 'hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]',
              )}
              style={
                isActive
                  ? { background: 'var(--accent-light)', color: 'var(--accent-primary)' }
                  : { color: 'var(--text-secondary)' }
              }
            >
              <Icon size={18} className="shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
