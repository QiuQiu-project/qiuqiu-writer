import { useState, useRef, useEffect } from 'react';
import { Search, Lightbulb, LightbulbOff, Trash2, MoreVertical, Download } from 'lucide-react';
import ThemeSelector from '../ThemeSelector';
import { cn } from '@/lib/utils';

interface HeaderSettingsMenuProps {
  onFindReplace: () => void;
  tipsEnabled: boolean;
  onToggleTips: () => void;
  onDeleteWork: () => void;
  onExport: () => void;
  onShare: () => void;
  isMobile?: boolean;
  hasPendingRequests?: boolean;
  readOnly?: boolean;
}

const menuItemClass = 'flex items-center gap-2.5 w-full px-3 py-2 border-none bg-transparent rounded-[var(--radius-sm)] cursor-pointer text-left text-sm font-normal transition-[background-color] duration-100 hover:[background:var(--bg-tertiary)]';

export default function HeaderSettingsMenu({
  onFindReplace,
  tipsEnabled,
  onToggleTips,
  onDeleteWork,
  onExport,
  isMobile = false,
  hasPendingRequests = false,
  readOnly,
}: HeaderSettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !target.closest('.theme-selector-dropdown-portal')
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      className={cn('relative inline-flex items-center', isMobile && 'flex justify-center h-10 shrink-0')}
      ref={menuRef}
    >
      <button
        className={cn(
          'relative flex items-center justify-center border cursor-pointer transition-all',
          isMobile
            ? cn(
                'w-10 h-10 min-w-[40px] rounded-[8px] border-none',
                isOpen ? '[background:var(--bg-tertiary)]' : 'hover:[background:var(--bg-tertiary)]'
              )
            : cn(
                'w-[34px] h-[34px] min-w-[34px] rounded-[6px]',
                isOpen
                  ? '[background:var(--bg-secondary)] [border-color:var(--border-hover,#cbd5e1)] [color:var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                  : 'hover:[background:var(--bg-secondary)] hover:[border-color:var(--border-hover,#cbd5e1)] hover:[color:var(--text-primary)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
              )
        )}
        style={
          isMobile
            ? { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }
            : { background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }
        }
        onClick={() => setIsOpen(!isOpen)}
        title="设置与工具"
      >
        {hasPendingRequests && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ff4d4f] rounded-full border border-white z-10" />
        )}
        <MoreVertical size={isMobile ? 24 : 16} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-[calc(100%+8px)] right-0 border rounded-[var(--radius-md)] p-1.5 min-w-[180px] z-[10010] flex flex-col gap-0.5 [animation:slide-down_0.15s_ease-out]',
            isMobile && 'w-[200px] -right-2'
          )}
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)', boxShadow: 'var(--shadow-lg)' }}
        >
          <button
            className={cn(menuItemClass, isMobile && 'px-4 py-3 text-base')}
            style={{ color: 'var(--text-primary)' }}
            onClick={() => { onFindReplace(); setIsOpen(false); }}
          >
            <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span>查找替换</span>
          </button>

          <button
            className={cn(menuItemClass, isMobile && 'px-4 py-3 text-base')}
            style={{ color: 'var(--text-primary)' }}
            onClick={() => { onToggleTips(); setIsOpen(false); }}
          >
            {tipsEnabled
              ? <Lightbulb size={16} color="#eab308" style={{ flexShrink: 0 }} />
              : <LightbulbOff size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            }
            <span>{tipsEnabled ? '关闭引导' : '开启引导'}</span>
          </button>

          <div className="h-px my-1 w-full" style={{ background: 'var(--border-light)' }} />

          <div className="w-full">
            <ThemeSelector onClose={() => setIsOpen(false)} />
          </div>

          <div className="h-px my-1 w-full" style={{ background: 'var(--border-light)' }} />

          <button
            className={cn(menuItemClass, isMobile && 'px-4 py-3 text-base')}
            style={{ color: 'var(--text-primary)' }}
            onClick={() => { onExport(); setIsOpen(false); }}
          >
            <Download size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span>导出作品</span>
          </button>

          {!readOnly && (
            <button
              className={cn(menuItemClass, isMobile && 'px-4 py-3 text-base', 'hover:[background:var(--bg-danger-light)]')}
              style={{ color: 'var(--color-danger)' }}
              onClick={() => { onDeleteWork(); setIsOpen(false); }}
            >
              <Trash2 size={16} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
              <span>删除作品</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
