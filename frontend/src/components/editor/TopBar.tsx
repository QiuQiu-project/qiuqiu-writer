import { ArrowLeft, Cloud, Info, MoreVertical } from 'lucide-react';
import { useState } from 'react';

interface TopBarProps {
  workTitle: string;
  perspective: string;
  frequency: string;
}

const actionBtnClass = 'px-3 py-1.5 border text-sm cursor-pointer rounded-[var(--radius-sm)] transition-all hover:[border-color:var(--accent-primary)] hover:[color:var(--accent-primary)] hover:[background:var(--accent-light)] max-[1200px]:hidden';

export default function TopBar({ workTitle, perspective, frequency }: TopBarProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header
      className="flex items-center justify-between px-6 h-16 border-b sticky top-0 z-[100] shadow-[var(--shadow-sm)]"
      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
    >
      {/* Left */}
      <div className="flex items-center gap-4 flex-1">
        <button
          className="flex items-center gap-1 px-3 py-1.5 border-none bg-transparent text-sm cursor-pointer rounded-[var(--radius-sm)] transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--accent-primary)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={18} />
          <span>退出</span>
        </button>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold m-0" style={{ color: 'var(--text-primary)' }}>
            {workTitle}
          </h1>
          <div className="flex gap-2">
            <span
              className="px-2 py-0.5 text-xs font-medium rounded-[var(--radius-sm)]"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {perspective}
            </span>
            <span
              className="px-2 py-0.5 text-xs font-medium rounded-[var(--radius-sm)]"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              {frequency}
            </span>
          </div>
        </div>
      </div>

      {/* Center */}
      <div className="flex items-center gap-6 flex-1 justify-center max-[1200px]:hidden">
        <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--success)' }}>
          <Cloud size={16} />
          <span>已保存到云端</span>
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Info size={12} />
          <span style={{ color: 'var(--text-tertiary)' }}>总字数:0</span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4 flex-1 justify-end">
        <div className="flex items-center gap-2 text-sm max-[1200px]:hidden" style={{ color: 'var(--text-secondary)' }}>
          <span>皮肤:</span>
          <select
            className="px-2 py-1 border rounded-[var(--radius-sm)] text-sm cursor-pointer outline-none"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          >
            <option>默认</option>
            <option>护眼</option>
            <option>夜间</option>
          </select>
        </div>
        <button
          className={actionBtnClass}
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          替换
        </button>
        <button
          className={actionBtnClass}
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          回收站
        </button>
        <button
          className={actionBtnClass}
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          分享
        </button>
        <div className="relative">
          <button
            className="w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer transition-all hover:[border-color:var(--accent-primary)] hover:[background:var(--accent-light)]"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
            onClick={() => setShowMenu(!showMenu)}
          >
            <MoreVertical size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
