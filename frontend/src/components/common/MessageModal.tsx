import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import './MessageModal.css';

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
}

export default function MessageModal({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  onConfirm,
  confirmText = '确定',
  cancelText = '取消'
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

  if (!visible && !isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle size={20} className="icon-success" />;
      case 'error': return <AlertCircle size={20} className="icon-error" />;
      case 'warning': return <AlertTriangle size={20} className="icon-warning" />;
      case 'info': default: return <Info size={20} className="icon-info" />;
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

  return (
    <div className={`message-modal-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
      <div className="message-modal" onClick={e => e.stopPropagation()}>
        <div className="message-modal-header">
          <h3>
            {getIcon()}
            <span>{getDefaultTitle()}</span>
          </h3>
          <button className="message-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        
        <div className="message-modal-body">
          {message}
        </div>

        <div className="message-modal-footer">
          {onConfirm && (
            <button className="message-btn secondary" onClick={onClose}>
              {cancelText}
            </button>
          )}
          <button 
            className="message-btn primary" 
            onClick={() => {
              if (onConfirm) onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
