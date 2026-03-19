import React, { useRef, useState, useEffect } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import { useIsMobile } from '../../hooks/useMediaQuery';
import './DraggableResizableModal.css';

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
  
  // 使用 state 管理 ResizableBox 的宽高，以便在重新打开时重置或保持
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);

  // 当 isOpen 变为 true 时，如果需要重置，可以在这里处理
  useEffect(() => {
    if (isOpen) {
      // 可以在这里添加逻辑
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <div
        className={`draggable-resizable-modal-overlay ${overlayClassName}`}
        onClick={onClose}
        onWheel={(e) => e.stopPropagation()}
        style={{ padding: 0 }}
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
            backgroundColor: 'var(--bg-primary, #ffffff)', // 默认背景色，避免透明
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
      className={`draggable-resizable-modal-overlay ${overlayClassName}`}
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
            className={`react-resizable ${className}`}
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
