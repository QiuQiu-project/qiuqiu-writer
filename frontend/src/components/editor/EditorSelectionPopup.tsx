/**
 * 选中文本时显示的浮动菜单：AI 对话、在编辑器中优化句子
 */

import { useEffect } from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';

export interface EditorSelectionPopupProps {
  visible: boolean;
  top: number;
  left: number;
  selectedText: string;
  /** 选中范围在该章中的起始字数（1-based） */
  startChar: number;
  /** 选中范围在该章中的结束字数（含） */
  endChar: number;
  onAIChat: () => void;
  onOptimizeInEditor: (text: string) => void;
  onClose: () => void;
  /** 优化中时禁用按钮 */
  optimizing?: boolean;
  readOnly?: boolean;
}

export default function EditorSelectionPopup({
  visible,
  top,
  left,
  selectedText,
  startChar,
  endChar,
  onAIChat,
  onOptimizeInEditor,
  onClose,
  optimizing = false,
  readOnly,
}: EditorSelectionPopupProps) {
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const popup = document.querySelector('.editor-selection-popup');
      if (popup && !popup.contains(target)) onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  if (!visible || !selectedText.trim()) return null;

  return (
    <div
      className="editor-selection-popup"
      style={{
        position: 'fixed',
        top: top + 6,
        left: Math.max(8, Math.min(left, window.innerWidth - 220)),
        zIndex: 10000,
      }}
    >
      <div className="editor-selection-popup-range" title="选中范围在本章中的字数位置">
        第{startChar}-{endChar}字
      </div>
      {!readOnly && (
        <>
          <button
            type="button"
            className="editor-selection-popup-btn"
            onClick={() => onAIChat()}
            title="用选中内容发起 AI 对话"
          >
            <MessageSquare size={16} />
            <span>AI 对话</span>
          </button>
          <button
            type="button"
            className="editor-selection-popup-btn"
            onClick={() => onOptimizeInEditor(selectedText)}
            disabled={optimizing}
            title="在编辑器中用 AI 优化该段文字"
          >
            <Sparkles size={16} />
            <span>{optimizing ? '优化中…' : '在编辑器中优化句子'}</span>
          </button>
        </>
      )}
    </div>
  );
}
