import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Palette } from 'lucide-react';
import { themes, getCurrentTheme, applyTheme } from '../utils/theme';
import { cn } from '@/lib/utils';

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
      const dropdownHeight = 160;
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

  const renderThemeList = () => (
    <div className="flex max-h-[400px] flex-col gap-1 overflow-y-auto p-2">
      {themes.map((theme) => (
        <button
          key={theme.id}
          type="button"
          className={cn(
            'flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2.5 text-left transition-all hover:border-primary/60 hover:bg-muted/50 hover:translate-x-0.5',
            currentThemeId === theme.id
              ? 'border-primary/60 bg-primary/10'
              : 'border-border bg-background'
          )}
          onClick={() => handleThemeChange(theme.id)}
        >
          <div className="flex flex-1 items-center gap-3">
            <div
              className="h-10 w-10 shrink-0 rounded-md border border-border"
              style={{ background: theme.previewGradient }}
            />
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{theme.name}</span>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: theme.previewAccent }}
                />
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: theme.previewText }}
                />
              </div>
            </div>
          </div>
          {currentThemeId === theme.id && (
            <Check size={16} className="shrink-0 text-primary" />
          )}
        </button>
      ))}
    </div>
  );

  const renderDropdown = () => (
    <div
      ref={dropdownRef}
      className="overflow-hidden rounded-md border border-border bg-background shadow-lg"
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
      <div className="border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground">
        <span>选择主题</span>
      </div>
      {renderThemeList()}
    </div>
  );

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1 rounded-md border-none bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="选择主题"
        aria-expanded={isOpen}
      >
        <Palette size={16} />
        <span>皮肤</span>
      </button>

      {/* 未在抽屉内时用原有相对定位 */}
      {isOpen && dropdownPosition == null && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-[calc(100%+8px)] z-[1000] w-[280px] overflow-hidden rounded-md border border-border bg-background shadow-lg"
        >
          <div className="border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground">
            <span>选择主题</span>
          </div>
          {renderThemeList()}
        </div>
      )}

      {/* 有定位时用 Portal 挂到 body，避免被抽屉裁剪（手机版可见） */}
      {isOpen && dropdownPosition != null &&
        createPortal(renderDropdown(), document.body)}
    </div>
  );
}
