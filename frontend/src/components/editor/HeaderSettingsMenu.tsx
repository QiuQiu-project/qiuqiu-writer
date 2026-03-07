import { useState, useRef, useEffect } from 'react';
import { Search, Lightbulb, LightbulbOff, Trash2, MoreVertical, Download, Users } from 'lucide-react';
import ThemeSelector from '../ThemeSelector';
import './HeaderSettingsMenu.css';

interface HeaderSettingsMenuProps {
  onFindReplace: () => void;
  tipsEnabled: boolean;
  onToggleTips: () => void;
  onDeleteWork: () => void;
  onExport: () => void;
  onShare: () => void;
  isMobile?: boolean;
  hasPendingRequests?: boolean;
}

export default function HeaderSettingsMenu({
  onFindReplace,
  tipsEnabled,
  onToggleTips,
  onDeleteWork,
  onExport,
  onShare,
  isMobile = false,
  hasPendingRequests = false,
}: HeaderSettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement;
      // Check if click is inside the menu OR inside the theme selector portal
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
    <div className={`header-settings-menu ${isMobile ? 'mobile' : ''}`} ref={menuRef}>
      <button 
        className={`settings-trigger-btn ${isOpen ? 'active' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        title="设置与工具"
      >
        {hasPendingRequests && <div className="settings-badge" />}
        <MoreVertical size={isMobile ? 24 : 16} />
      </button>

      {isOpen && (
        <div className="settings-dropdown">
          <button 
            className="menu-item" 
            onClick={() => {
              onFindReplace();
              setIsOpen(false);
            }}
          >
            <Search size={16} />
            <span>查找替换</span>
          </button>

          <button 
            className="menu-item" 
            onClick={() => {
              onToggleTips();
              // Keep open or close? Usually toggles like this might want to stay open, but closing is safer.
              // User might want to see the effect.
              setIsOpen(false);
            }}
          >
            {tipsEnabled ? <Lightbulb size={16} className="text-yellow-500" color="#eab308" /> : <LightbulbOff size={16} />}
            <span>{tipsEnabled ? '关闭引导' : '开启引导'}</span>
          </button>

          <div className="menu-divider" />

          {/* ThemeSelector renders its own button, we wrap it to style it or let it handle itself */}
          <div className="menu-item-wrapper theme-selector-wrapper-in-menu">
            <ThemeSelector onClose={() => setIsOpen(false)} />
          </div>

          <div className="menu-divider" />

          <button 
            className="menu-item" 
            onClick={() => {
              onExport();
              setIsOpen(false);
            }}
          >
            <Download size={16} />
            <span>导出作品</span>
          </button>

          <button 
            className="menu-item" 
            onClick={() => {
              onShare();
              setIsOpen(false);
            }}
          >
            <Users size={16} />
            <span>添加协作者</span>
            {hasPendingRequests && <span className="menu-item-badge" />}
          </button>

          <button 
            className="menu-item delete-item" 
            onClick={() => {
              onDeleteWork();
              setIsOpen(false);
            }}
          >
            <Trash2 size={16} />
            <span>删除作品</span>
          </button>
        </div>
      )}
    </div>
  );
}
