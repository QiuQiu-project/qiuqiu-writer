import React, { useRef, useState, useEffect } from 'react';
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

  const overlayClass = `fixed inset-0 flex justify-center items-center z-[3200] backdrop-blur-[3px] ${overlayClassName}`;
  const overlayStyle = { background: 'rgba(0,0,0,0.45)' };

  if (isMobile) {
    return (
      <div
        className={overlayClass}
        style={{ ...overlayStyle, padding: 0 }}
        onClick={onClose}
        onWheel={(e) => e.stopPropagation()}
      >
        <div
          className={className}
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '100dvh',
            borderRadius: 0,
            overflow: 'hidden',
            overflowY: scrollable ? 'auto' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-primary, #ffffff)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={overlayClass}
      style={overlayStyle}
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
            className={`relative box-border ${className}`}
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
}
