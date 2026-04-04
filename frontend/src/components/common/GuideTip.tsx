import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface GuideTipProps {
  id: string;
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  forceVisible?: boolean; // For debugging or forcing visibility
}

const GLOBAL_ENABLED_KEY = 'wawawriter_guide_tips_enabled';
const TIP_SEEN_PREFIX = 'wawawriter_guide_tip_seen_';

const seenInMemory = new Set<string>();

function safeStorageGet(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage | undefined, key: string, value: string) {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // ignore storage failures (e.g. privacy mode / disabled storage)
  }
}

export default function GuideTip({ id, content, children, placement = 'top', forceVisible = false }: GuideTipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkVisibility = () => {
      // Check global setting
      const globalEnabled = safeStorageGet(window.localStorage, GLOBAL_ENABLED_KEY);

      // Check if this specific tip has been seen
      const seenKey = `${TIP_SEEN_PREFIX}${id}`;
      const hasSeen =
        seenInMemory.has(seenKey) ||
        safeStorageGet(window.sessionStorage, seenKey) === 'true' ||
        safeStorageGet(window.localStorage, seenKey) === 'true';

      // If the tip has been seen, it should not be visible even if forced
      if (hasSeen) {
        setIsVisible(false);
        return;
      }

      if (forceVisible || globalEnabled !== 'false') {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    checkVisibility();

    const handleStorageChange = () => checkVisibility();
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('wawawriter_guide_tips_updated', handleStorageChange);

    // Add resize/scroll listener to update position
    const updatePosition = () => {
      if (containerRef.current && isVisible) {
        const rect = containerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        });
      }
    };

    if (isVisible) {
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      setTimeout(updatePosition, 0);
      setTimeout(updatePosition, 100);
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('wawawriter_guide_tips_updated', handleStorageChange);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [id, forceVisible, isVisible]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    const seenKey = `${TIP_SEEN_PREFIX}${id}`;
    seenInMemory.add(seenKey);
    safeStorageSet(window.sessionStorage, seenKey, 'true');
    safeStorageSet(window.localStorage, seenKey, 'true');
    window.dispatchEvent(new Event('wawawriter_guide_tips_updated'));
  }, [id]);

  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDismiss, isVisible]);

  // Click outside to dismiss (non-blocking, no backdrop)
  useEffect(() => {
    if (!isVisible) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const pop = popoverRef.current;
      const anchor = containerRef.current;
      if (pop?.contains(target)) return;
      if (anchor?.contains(target)) return;
      handleDismiss();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [handleDismiss, isVisible]);

  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
  };

  const pos = position;
  if (pos.top !== undefined) {
    if (placement === 'top') {
      popoverStyle.top = pos.top - 8;
      popoverStyle.left = pos.left + pos.width / 2;
      popoverStyle.transform = 'translate(-50%, -100%)';
    } else if (placement === 'bottom') {
      popoverStyle.top = pos.top + pos.height + 8;
      popoverStyle.left = pos.left + pos.width / 2;
      popoverStyle.transform = 'translate(-50%, 0)';
    } else if (placement === 'left') {
      popoverStyle.top = pos.top + pos.height / 2;
      popoverStyle.left = pos.left - 8;
      popoverStyle.transform = 'translate(-100%, -50%)';
    } else if (placement === 'right') {
      popoverStyle.top = pos.top + pos.height / 2;
      popoverStyle.left = pos.left + pos.width + 8;
      popoverStyle.transform = 'translate(0, -50%)';
    }
  }

  return (
    <>
      <div ref={containerRef} style={{ display: 'inline-flex' }}>
        {children}
      </div>
      {isVisible && createPortal(
        <div
          ref={popoverRef}
          className="w-[240px] rounded-[8px] border p-[14px_14px_12px] [animation:guide-tip-in_0.18s_ease-out]"
          style={{
            ...popoverStyle,
            background: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
          role="dialog"
          aria-label="引导提示"
        >
          <button
            type="button"
            className="absolute top-2 right-2 w-7 h-7 rounded-[8px] border text-[18px] leading-none cursor-pointer hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border-light)',
              color: 'var(--text-secondary)',
            }}
            onClick={handleDismiss}
            aria-label="关闭提示"
          >
            ×
          </button>
          <div className="text-sm mb-2 leading-[1.5]" style={{ color: 'var(--text-primary)' }}>
            {content}
          </div>
          <div
            className="flex justify-between items-center border-t pt-2 mt-2"
            style={{ borderColor: 'var(--border-light)' }}
          >
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-[4px] bg-transparent border-none cursor-pointer hover:[background:var(--bg-secondary)]"
              style={{ color: 'var(--primary-color, #1890ff)' }}
              onClick={handleDismiss}
            >
              知道了
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
