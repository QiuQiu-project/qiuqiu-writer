import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import DraggableResizableModal from './DraggableResizableModal';
import { Button } from '@/components/ui/button';

export type MessageType = 'success' | 'error' | 'warning' | 'info';

interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: MessageType;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  /** 仅提示、无按钮，自动关闭（替换成功等） */
  toast?: boolean;
  autoCloseMs?: number;
}

export default function MessageModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  onConfirm,
  confirmText = '确定',
  cancelText = '取消',
  toast = false,
  autoCloseMs,
}: MessageModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(timer);
    } else {
      const timer = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !toast || autoCloseMs == null || autoCloseMs <= 0) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [isOpen, toast, autoCloseMs, onClose]);

  if (!visible && !isOpen) return null;

  const getIcon = (size = 20) => {
    switch (type) {
      case 'success': return <CheckCircle size={size} className="text-green-500" />;
      case 'error': return <AlertCircle size={size} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={size} className="text-amber-500" />;
      case 'info': default: return <Info size={size} className="text-blue-500" />;
    }
  };

  const getDefaultTitle = () => {
    if (title) return title;
    switch (type) {
      case 'success': return '成功';
      case 'error': return '错误';
      case 'warning': return '警告';
      case 'info': default: return '提示';
    }
  };

  // Toast：透明灰色小浮层，不挡操作、自动消失
  if (toast) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center pointer-events-none z-[4000] animate-in fade-in slide-in-from-bottom-2 duration-300"
        aria-live="polite"
      >
        <div className="bg-black/70 backdrop-blur-md text-white px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg pointer-events-auto">
          {getIcon(18)}
          <span className="text-sm font-normal whitespace-nowrap">{message}</span>
        </div>
      </div>
    );
  }

  // 模态框：带遮罩的完整弹窗
  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={400}
      initialHeight={250}
      className="message-modal"
      handleClassName=".message-modal-header"
      overlayClassName={isOpen ? 'open' : ''}
    >
      <div className="message-modal-header flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="m-0 text-base font-semibold text-foreground flex items-center gap-2">
          {getIcon(20)}
          <span>{getDefaultTitle()}</span>
        </h3>
        <button
          className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 rounded flex items-center justify-center transition-all hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-5 py-6 text-muted-foreground text-sm leading-relaxed flex-1 overflow-y-auto">
        {message}
      </div>

      <div className="flex justify-end gap-3 px-5 py-4 border-t border-border bg-muted/30 rounded-b-xl">
        {onConfirm && (
          <Button variant="outline" size="sm" onClick={onClose}>
            {cancelText}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            if (onConfirm) onConfirm();
            onClose();
          }}
        >
          {confirmText}
        </Button>
      </div>
    </DraggableResizableModal>
  );
}
