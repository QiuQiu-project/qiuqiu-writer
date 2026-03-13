import React, { useState, useRef, useEffect } from 'react';
import { Modal, ModalProps } from 'antd';
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable';
import { Resizable, ResizableProps, ResizeCallbackData } from 'react-resizable';
import './index.css';

interface ResizableModalProps extends ModalProps {
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

// Correct type definition for Resizable component with custom handle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResizableBox = Resizable as any;

const ResizableModal: React.FC<ResizableModalProps> = ({
  children,
  title,
  initialWidth,
  initialHeight,
  minWidth = 400,
  minHeight = 300,
  width: propsWidth,
  style,
  styles,
  ...rest
}) => {
  const [bounds, setBounds] = useState({ left: 0, top: 0, bottom: 0, right: 0 });
  const draggleRef = useRef<HTMLDivElement>(null);

  // Initialize dimensions
  // Default width 520 matches Ant Design default
  const [width, setWidth] = useState<number>(
    typeof propsWidth === 'number' ? propsWidth : (initialWidth || 520)
  );
  const [height, setHeight] = useState<number | undefined>(initialHeight);

  // Sync width if controlled prop changes
  useEffect(() => {
    if (typeof propsWidth === 'number') {
      setWidth(propsWidth);
    }
  }, [propsWidth]);

  const onStart = (_event: DraggableEvent, uiData: DraggableData) => {
    const { clientWidth, clientHeight } = window.document.documentElement;
    const targetRect = draggleRef.current?.getBoundingClientRect();
    if (!targetRect) {
      return;
    }
    setBounds({
      left: -targetRect.left + uiData.x,
      right: clientWidth - (targetRect.right - uiData.x),
      top: -targetRect.top + uiData.y,
      bottom: clientHeight - (targetRect.bottom - uiData.y),
    });
  };

  const onResize = (_event: React.SyntheticEvent, { size }: ResizeCallbackData) => {
    setWidth(size.width);
    setHeight(size.height);
  };

  const onResizeStart = (_event: React.SyntheticEvent, { size }: ResizeCallbackData) => {
    if (!height) {
      setHeight(size.height);
    }
  };

  const renderTitle = (
    <div
      className="drag-handle"
      style={{
        width: '100%',
        cursor: 'move',
        padding: '4px 0',
      }}
    >
      {title}
    </div>
  );

  return (
    <Modal
      width={width}
      title={renderTitle}
      style={{ ...style, padding: 0 }}
      styles={{
        ...styles,
        body: {
          ...(styles?.body || {}),
          // If height is set, make body scrollable and take remaining space
          ...(height ? { flex: 1, overflow: 'auto', height: 'auto' } : {})
        }
      }}
      modalRender={(modal) => (
        <Draggable
          handle=".drag-handle"
          bounds={bounds}
          nodeRef={draggleRef}
          onStart={(event, uiData) => onStart(event, uiData)}
        >
          <div ref={draggleRef} style={{ pointerEvents: 'auto' }}>
            <ResizableBox
              width={width}
              height={height || 0}
              onResize={onResize}
              onResizeStart={onResizeStart}
              minConstraints={[minWidth, minHeight]}
              handle={(_h: string, ref: React.Ref<HTMLDivElement>) => (
                <div
                  className="custom-resize-handle"
                  ref={ref}
                />
              )}
              draggableOpts={{ enableUserSelectHack: false }}
              className="custom-resizable-modal"
            >
              <div 
                style={{ 
                    width: width, 
                    height: height,
                    display: 'flex',
                    flexDirection: 'column'
                }}
              >
                 {/* 
                    Clone the modal content to inject flex styles so it fills the resized container.
                    We set height: 100% so it takes the Resizable container's height.
                 */}
                 {React.cloneElement(modal as React.ReactElement, {
                    style: {
                        ...(modal as React.ReactElement).props.style,
                        height: height ? '100%' : undefined,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }
                 })}
              </div>
            </ResizableBox>
          </div>
        </Draggable>
      )}
      {...rest}
    >
      {children}
    </Modal>
  );
};

export default ResizableModal;
