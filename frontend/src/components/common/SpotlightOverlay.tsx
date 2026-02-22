import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface SpotlightOverlayProps {
  targetId: string;
  isActive: boolean;
  padding?: number;
  borderRadius?: number;
}

export const SpotlightOverlay: React.FC<SpotlightOverlayProps> = ({ 
  targetId, 
  isActive, 
  padding = 4,
  borderRadius = 4 
}) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    if (!isActive || !targetId) {
      setRect(null);
      return;
    }

    const updateRect = () => {
      const element = document.getElementById(targetId);
      if (element) {
        setRect(element.getBoundingClientRect());
      }
    };

    // Initial update
    updateRect();
    // Retry shortly after in case of layout shifts or animations
    setTimeout(updateRect, 100);
    setTimeout(updateRect, 300);

    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      updateRect();
    };

    const handleScroll = () => {
      updateRect();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('wawawriter_guide_tips_updated', updateRect);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('wawawriter_guide_tips_updated', updateRect);
    };
  }, [isActive, targetId]);

  if (!isActive || !rect) return null;

  // Calculate path with hole
  // Outer rectangle: 0,0 -> width,0 -> width,height -> 0,height -> 0,0
  // Inner rectangle (hole): x,y -> x+w,y -> x+w,y+h -> x,y+h -> x,y
  // Use evenodd fill rule
  
  const x = rect.left - padding;
  const y = rect.top - padding;
  const w = rect.width + padding * 2;
  const h = rect.height + padding * 2;
  
  // Ensure we don't draw outside window bounds (though SVG handles it)
  // And handle negative values if target is off-screen (shouldn't happen with scrollIntoView)

  // Construct path for rounded rectangle hole
  // We use a path with a hole using fill-rule="evenodd"
  // Outer rect: clockwise
  // Inner rect: counter-clockwise (or doesn't matter for evenodd)
  
  const outerPath = `M 0 0 H ${windowSize.width} V ${windowSize.height} H 0 Z`;
  
  // Inner rounded rect
  const r = borderRadius;
  const innerPath = `
    M ${x + r} ${y}
    H ${x + w - r}
    A ${r} ${r} 0 0 1 ${x + w} ${y + r}
    V ${y + h - r}
    A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}
    H ${x + r}
    A ${r} ${r} 0 0 1 ${x} ${y + h - r}
    V ${y + r}
    A ${r} ${r} 0 0 1 ${x + r} ${y}
    Z
  `;

  return createPortal(
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9990, // Below GuideTip (9999) but above everything else
        pointerEvents: 'none', // Let events pass through
      }}
    >
      <svg 
        width="100%" 
        height="100%" 
        style={{ pointerEvents: 'none' }}
      >
        <path
          d={`${outerPath} ${innerPath}`}
          fill="rgba(0, 0, 0, 0.6)"
          fillRule="evenodd"
          style={{ pointerEvents: 'auto' }}
        />
      </svg>
    </div>,
    document.body
  );
};
