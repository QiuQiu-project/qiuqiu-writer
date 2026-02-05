import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Palette } from 'lucide-react';
import { themes, getCurrentTheme, applyTheme } from '../utils/theme';
import './ThemeSelector.css';

interface ThemeSelectorProps {
  onClose?: () => void;
}

export default function ThemeSelector({ onClose }: ThemeSelectorProps) {
  const [currentThemeId, setCurrentThemeId] = useState<string>(getCurrentTheme());
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 打开时根据触发按钮位置计算下拉框的 fixed 定位（避免被抽屉裁剪，手机版可见）
  useLayoutEffect(() => {
    if (!isOpen || !wrapperRef.current) {
      return;
    }
    const measure = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const padding = 8;
      const dropdownHeight = 320;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const openBelow = spaceBelow >= dropdownHeight || spaceBelow >= rect.top;
      const top = openBelow ? rect.bottom + padding : rect.top - dropdownHeight - padding;
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - 280 - 16));
      setDropdownPosition({ top, left });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen]);

  // 点击/触摸外部关闭
  useEffect(() => {
    function handlePointerOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        wrapperRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
      onClose?.();
    }

    if (isOpen) {
      document.addEventListener('mousedown', handlePointerOutside);
      document.addEventListener('touchstart', handlePointerOutside, { passive: true });
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerOutside);
      document.removeEventListener('touchstart', handlePointerOutside);
    };
  }, [isOpen, onClose]);

  // 切换主题
  const handleThemeChange = (themeId: string) => {
    setCurrentThemeId(themeId);
    applyTheme(themeId);
    setIsOpen(false);
    onClose?.();
  };

  const renderDropdown = () => (
    <div
      ref={dropdownRef}
      className="theme-selector-dropdown theme-selector-dropdown-portal"
      style={
        dropdownPosition
          ? {
              position: 'fixed',
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              right: 'auto',
              width: 280,
              zIndex: 10002,
            }
          : undefined
      }
    >
      <div className="theme-selector-header">
        <span>选择主题</span>
      </div>
      <div className="theme-list">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-item ${currentThemeId === theme.id ? 'active' : ''}`}
            onClick={() => handleThemeChange(theme.id)}
          >
            <div className="theme-preview">
              <div
                className="theme-color-preview"
                style={{
                  background: `linear-gradient(135deg, ${theme.colors.bgGradientStart} 0%, ${theme.colors.bgGradientEnd} 100%)`,
                }}
              />
              <div className="theme-info">
                <span className="theme-name">{theme.name}</span>
                <div className="theme-colors">
                  <span
                    className="theme-color-dot"
                    style={{ backgroundColor: theme.colors.accentPrimary }}
                  />
                  <span
                    className="theme-color-dot"
                    style={{ backgroundColor: theme.colors.bgSecondary }}
                  />
                </div>
              </div>
            </div>
            {currentThemeId === theme.id && (
              <Check size={16} className="theme-check" />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="theme-selector-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="theme-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="选择主题"
        aria-expanded={isOpen}
      >
        <Palette size={16} />
        <span>皮肤</span>
      </button>

      {/* 未在抽屉内时用原有相对定位 */}
      {isOpen && dropdownPosition == null && (
        <div ref={dropdownRef} className="theme-selector-dropdown">
          <div className="theme-selector-header">
            <span>选择主题</span>
          </div>
          <div className="theme-list">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`theme-item ${currentThemeId === theme.id ? 'active' : ''}`}
                onClick={() => handleThemeChange(theme.id)}
              >
                <div className="theme-preview">
                  <div
                    className="theme-color-preview"
                    style={{
                      background: `linear-gradient(135deg, ${theme.colors.bgGradientStart} 0%, ${theme.colors.bgGradientEnd} 100%)`,
                    }}
                  />
                  <div className="theme-info">
                    <span className="theme-name">{theme.name}</span>
                    <div className="theme-colors">
                      <span
                        className="theme-color-dot"
                        style={{ backgroundColor: theme.colors.accentPrimary }}
                      />
                      <span
                        className="theme-color-dot"
                        style={{ backgroundColor: theme.colors.bgSecondary }}
                      />
                    </div>
                  </div>
                </div>
                {currentThemeId === theme.id && (
                  <Check size={16} className="theme-check" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 有定位时用 Portal 挂到 body，避免被抽屉裁剪（手机版可见） */}
      {isOpen && dropdownPosition != null &&
        createPortal(renderDropdown(), document.body)}
    </div>
  );
}
