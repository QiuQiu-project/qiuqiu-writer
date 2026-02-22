import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './GuideTip.css';

interface GuideTipProps {
  id: string;
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  forceVisible?: boolean; // For debugging or forcing visibility
}

const GLOBAL_ENABLED_KEY = 'wawawriter_guide_tips_enabled';
const TIP_SEEN_PREFIX = 'wawawriter_guide_tip_seen_';

export default function GuideTip({ id, content, children, placement = 'top', forceVisible = false }: GuideTipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkVisibility = () => {
      // Check global setting
      const globalEnabled = localStorage.getItem(GLOBAL_ENABLED_KEY);
      const isGlobalEnabled = globalEnabled === null || globalEnabled === 'true';
      setIsEnabled(isGlobalEnabled);

      // Check if this specific tip has been seen
      const hasSeen = localStorage.getItem(`${TIP_SEEN_PREFIX}${id}`);
      
      // console.log(`[GuideTip:${id}] checkVisibility: global=${isGlobalEnabled}, seen=${hasSeen}, force=${forceVisible}`);
      
      if (forceVisible || (isGlobalEnabled && !hasSeen)) {
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
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        // Calculate position based on placement
        // We just store the anchor rect info, and let CSS or render logic handle the offset
        // But for Portal, we need absolute coordinates
        let top = rect.top + scrollTop;
        let left = rect.left + scrollLeft;
        
        // Adjust for placement logic handled in render
        setPosition({ 
          top: rect.top, // Use viewport coordinates for fixed positioning
          left: rect.left,
          width: rect.width,
          height: rect.height
        } as any);
      }
    };

    if (isVisible) {
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true); // Capture phase for scrolling containers
      // Initial update
      setTimeout(updatePosition, 0);
      setTimeout(updatePosition, 100); // Retry in case of layout shifts
    }
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('wawawriter_guide_tips_updated', handleStorageChange);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [id, forceVisible, isVisible]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(`${TIP_SEEN_PREFIX}${id}`, 'true');
    // Clicking "Got it" only closes the current tip, it should not turn off the global switch
    // Otherwise, other unread tips will also disappear
  };

  // Render children normally, but wrap with ref
  // If visible, render popover via Portal
  
  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999, // Very high z-index
  };
  
  // Calculate position styles
  const pos = position as any;
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
      <div className="guide-tip-anchor" ref={containerRef} style={{ display: 'inline-flex' }}>
        {children}
      </div>
      {isVisible && createPortal(
        <div className={`guide-tip-popover ${placement}`} style={popoverStyle}>
          <div className="guide-tip-content">
            {content}
          </div>
          <div className="guide-tip-footer">
            <div style={{ flex: 1 }}></div>
            <button className="guide-tip-close" onClick={handleDismiss}>
              知道了
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
