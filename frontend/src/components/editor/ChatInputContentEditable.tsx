/**
 * ContentEditable 输入框：支持 @ 引用在框内持久显示为样式，并严格同步光标/选区
 */

import React, { useRef, useLayoutEffect, useCallback } from 'react';
import './ChatInputContentEditable.css';

const REF_REGEX = /@chapter:\d+\s*第\d+-\d+字|@chapter:\d+|@character:[^\s@]+/g;

function parseMessageForInputRefs(message: string): Array<{ type: 'text' | 'ref'; content: string }> {
  if (!message) return [];
  const segments: Array<{ type: 'text' | 'ref'; content: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  REF_REGEX.lastIndex = 0;
  while ((m = REF_REGEX.exec(message)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', content: message.slice(lastIndex, m.index) });
    }
    segments.push({ type: 'ref', content: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < message.length) {
    segments.push({ type: 'text', content: message.slice(lastIndex) });
  }
  return segments;
}

/** 将 value 对应的 segment 节点挂到 container 上（会先清空 container），避免由 React 管理子节点导致 removeChild 冲突 */
function setContainerContent(container: HTMLElement, value: string): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  if (!value || value.length === 0) return;
  const segments = parseMessageForInputRefs(value);
  for (const seg of segments) {
    if (seg.type === 'text') {
      container.appendChild(document.createTextNode(seg.content));
    } else {
      const span = document.createElement('span');
      span.className = 'chat-input-ref-inline';
      span.textContent = seg.content;
      container.appendChild(span);
    }
  }
}

function getTextContent(container: Node): string {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const parts: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    parts.push((node as Text).data);
  }
  return parts.join('');
}

function getCursorOffset(container: Node): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer)) return 0;
  let offset = 0;
  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).length;
      if (node === range.startContainer) {
        offset += range.startOffset;
        return true;
      }
      offset += len;
      return false;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (node === range.startContainer && range.startOffset === i) return true;
      if (walk(node.childNodes[i])) return true;
    }
    if (node === range.startContainer && range.startOffset === node.childNodes.length) return true;
    return false;
  }
  walk(container);
  return offset;
}

function setCursorOffset(container: Node, targetOffset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const selection = sel;
  let current = 0;
  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).length;
      if (current + len >= targetOffset) {
        const range = document.createRange();
        range.setStart(node, Math.min(targetOffset - current, len));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      current += len;
      return false;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      if (walk(node.childNodes[i])) return true;
    }
    return false;
  }
  walk(container);
}

function setCursorAtEnd(container: Node): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const last = getLastTextNode(container);
  if (last) {
    range.setStart(last, last.length);
    range.collapse(true);
  } else {
    range.selectNodeContents(container);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function getLastTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const found = getLastTextNode(node.childNodes[i]);
    if (found) return found;
  }
  return null;
}

/** 按字符偏移设置选区，供父组件插入 @ 等时使用 */
export function setSelectionRange(container: Node, startOffset: number, endOffset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let current = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).length;
      const textNode = node as Text;
      if (startNode == null && current + len >= startOffset) {
        startNode = textNode;
        startOff = Math.min(startOffset - current, len);
      }
      if (endNode == null && current + len >= endOffset) {
        endNode = textNode;
        endOff = Math.min(endOffset - current, len);
      }
      current += len;
      return;
    }
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
  }
  walk(container);
  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export interface ChatInputContentEditableProps {
  value: string;
  onChange: (text: string, cursorOffset: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 父组件可写入当前光标偏移，用于 @ 菜单等 */
  cursorOffsetRef?: React.MutableRefObject<number>;
  /** 父组件 setMessage 后希望光标落在此偏移（如插入 @ 后），设此 ref 后组件在 useLayoutEffect 中会恢复并清空 */
  cursorAfterUpdateRef?: React.MutableRefObject<number | null>;
  /** 用于 focus() */
  inputRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export default function ChatInputContentEditable({
  value,
  onChange,
  onKeyDown,
  placeholder = '输入你的问题...',
  disabled = false,
  cursorOffsetRef,
  cursorAfterUpdateRef,
  inputRef,
  className = '',
}: ChatInputContentEditableProps) {
  const editableRef = useRef<HTMLDivElement>(null);
  const lastCursorOffsetRef = useRef(0);
  const lastSentValueRef = useRef(value);
  const lastImperativeValueRef = useRef(value);
  const isComposingRef = useRef(false);

  const ref = inputRef ?? editableRef;

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    const el = ref.current;
    if (!el) return;
    const text = getTextContent(el);
    const offset = getCursorOffset(el);
    lastCursorOffsetRef.current = offset;
    lastSentValueRef.current = text;
    if (cursorOffsetRef) cursorOffsetRef.current = offset;
    onChange(text, offset);
  }, [onChange, cursorOffsetRef, ref]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (document.execCommand('insertText', false, text)) {
      handleInput();
    }
  }, [handleInput]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    // 组合结束后同步 DOM 文本并恢复光标，避免中文输入被重渲染打断、新字仍落在 @ 样式里
    const el = ref.current;
    if (el) {
      const text = getTextContent(el);
      const offset = getCursorOffset(el);
      lastCursorOffsetRef.current = offset;
      lastSentValueRef.current = text;
      if (cursorOffsetRef) cursorOffsetRef.current = offset;
      onChange(text, offset);
    }
  }, [onChange, cursorOffsetRef, ref]);

  // 用 imperative 更新内容，避免 React 管理 contenteditable 子节点导致 removeChild 冲突
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (value !== lastImperativeValueRef.current) {
      setContainerContent(el, value);
      lastImperativeValueRef.current = value;
    }

    const after = cursorAfterUpdateRef?.current;
    if (after != null && cursorAfterUpdateRef) {
      setCursorOffset(el, after);
      cursorAfterUpdateRef.current = null;
      return;
    }
    if (value !== lastSentValueRef.current) {
      setCursorAtEnd(el);
      lastSentValueRef.current = value;
    } else {
      setCursorOffset(el, lastCursorOffsetRef.current);
    }
  }, [value, ref, cursorAfterUpdateRef]);

  return (
    <div
      ref={ref}
      contentEditable={!disabled}
      suppressContentEditableWarning
      className={`chat-input-ce ${className}`.trim()}
      data-placeholder={placeholder}
      onInput={handleInput}
      onPaste={handlePaste}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={onKeyDown}
      role="textbox"
      aria-multiline="true"
      aria-placeholder={placeholder}
    />
  );
}
