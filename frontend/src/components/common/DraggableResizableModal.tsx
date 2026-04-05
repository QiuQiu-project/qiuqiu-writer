import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface DraggableResizableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
  overlayClassName?: string;
  handleClassName?: string;
  /** 整体内容可垂直滚动（适合无内部滚动分区的简单模态框） */
  scrollable?: boolean;
}
export default function DraggableResizableModal({
  isOpen,
  onClose,
  children,
  initialWidth = 520,
  initialHeight = 400,
  minWidth = 300,
  minHeight = 200,
  maxWidth = 1200,
  maxHeight = 800,
  className = '',
  overlayClassName = '',
  handleClassName = '.modal-header',
  scrollable = true,
}: DraggableResizableModalProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);

  useEffect(() => {
    if (isOpen) {
      // 可以在这里添加逻辑
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const overlayClass = `fixed inset-0 flex items-center justify-center z-[3200] bg-black/20 supports-backdrop-filter:backdrop-blur-xs ${overlayClassName}`;

  const mobileContent = (
    <div
      className={overlayClass}
      style={{ padding: 0 }}
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className={`border border-border bg-popover text-popover-foreground shadow-xl ${className}`}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100dvh',
          borderRadius: 0,
          overflow: 'hidden',
          overflowY: scrollable ? 'auto' : 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  const desktopContent = (
    <div
      className={overlayClass}
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <Draggable
        nodeRef={nodeRef}
        handle={handleClassName}
        bounds="parent"
      >
        <div ref={nodeRef} style={{ display: 'inline-block' }} className="draggable-wrapper">
          <ResizableBox
            width={width}
            height={height}
            minConstraints={[minWidth, minHeight]}
            maxConstraints={[maxWidth, maxHeight]}
            onResize={(_e, { size }) => {
              setWidth(size.width);
              setHeight(size.height);
            }}
            className={`relative box-border overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 ${className}`}
            resizeHandles={['se']}
            handle={
              <span className="custom-resize-handle" onClick={(e) => e.stopPropagation()} />
            }
          >
            <div
              style={{ width: '100%', height: '100%', overflow: 'hidden', overflowY: scrollable ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' }}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </div>
          </ResizableBox>
        </div>
      </Draggable>
    </div>
  );

  return createPortal(isMobile ? mobileContent : desktopContent, document.body);
}
