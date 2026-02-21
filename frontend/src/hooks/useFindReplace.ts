/**
 * Hook: 查找替换
 * 处理文本查找和替换功能
 */

import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';

export interface UseFindReplaceMessageOptions {
  toast?: boolean;
  autoCloseMs?: number;
}

export interface UseFindReplaceOptions {
  editor: Editor | null;
  onMessage?: (message: string, type: 'success' | 'error', options?: UseFindReplaceMessageOptions) => void;
}

export interface UseFindReplaceReturn {
  isReplacePanelOpen: boolean;
  findText: string;
  replaceText: string;
  matchCase: boolean;
  currentMatchIndex: number;
  matches: Array<{ start: number; end: number }>;
  setIsReplacePanelOpen: (open: boolean) => void;
  setFindText: (text: string) => void;
  setReplaceText: (text: string) => void;
  setMatchCase: (matchCase: boolean) => void;
  handleReplace: () => void;
  findNext: () => void;
  findPrevious: () => void;
  replaceCurrent: () => void;
  replaceAllMatches: () => void;
}

export function useFindReplace(options: UseFindReplaceOptions): UseFindReplaceReturn {
  const { editor, onMessage } = options;
  
  const [isReplacePanelOpen, setIsReplacePanelOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [matches, setMatches] = useState<Array<{ start: number; end: number }>>([]);
  
  // 滚动到匹配项，使匹配处固定在可视区域正中间；focusEditor=false 时不抢焦点
  const scrollToMatch = useCallback((match: { start: number; end: number }, focusEditor = true) => {
    if (!editor) return;

    editor.commands.setTextSelection({ from: match.start, to: match.end });
    if (focusEditor) {
      editor.commands.focus();
    }

    const runScroll = () => {
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const matchRect = range.getBoundingClientRect();
        if (matchRect.height === 0 && matchRect.width === 0) return;

        const dom = editor.view.dom;
        const scrollContainer: HTMLElement | null =
          dom.closest('.editor-with-header') as HTMLElement ||
          dom.closest('.chapter-editor-container') as HTMLElement ||
          (() => {
            let el: HTMLElement | null = dom.parentElement;
            while (el && el !== document.body) {
              const style = getComputedStyle(el);
              if (el.scrollHeight > el.clientHeight && style.overflowY !== 'visible') {
                return el;
              }
              el = el.parentElement;
            }
            return null;
          })();

        if (!scrollContainer) {
          range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        const containerRect = scrollContainer.getBoundingClientRect();
        const matchCenterY = matchRect.top + matchRect.height / 2;
        const containerCenterY = containerRect.top + containerRect.height / 2;
        const deltaY = matchCenterY - containerCenterY;
        const targetScrollTop = scrollContainer.scrollTop + deltaY;
        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        const clamped = Math.max(0, Math.min(targetScrollTop, maxScroll));

        scrollContainer.scrollTo({ top: clamped, behavior: 'smooth' });
      } catch {
        // ignore
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(runScroll);
    });
  }, [editor]);

  // 查找匹配项
  const findMatches = useCallback(() => {
    if (!editor || !findText.trim()) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    try {
      const { state } = editor;
      const { doc } = state;
      
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = matchCase 
        ? new RegExp(escaped, 'g')
        : new RegExp(escaped, 'gi');

      const foundMatches: Array<{ start: number; end: number }> = [];
      
      doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          regex.lastIndex = 0;
          let match;
          
          while ((match = regex.exec(node.text)) !== null) {
            foundMatches.push({
              start: pos + match.index,
              end: pos + match.index + match[0].length,
            });
            
            if (match[0].length === 0) {
              regex.lastIndex++;
            }
          }
        }
      });

      setMatches(foundMatches);
      if (foundMatches.length > 0) {
        setCurrentMatchIndex(0);
        // 输入时只滚动、不抢焦点，避免第二个字被输入到编辑器
        scrollToMatch(foundMatches[0], false);
      } else {
        setCurrentMatchIndex(-1);
      }
    } catch {
      
      setMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, [editor, findText, matchCase, scrollToMatch]);
  
  // 打开/关闭查找替换面板
  const handleReplace = useCallback(() => {
    setIsReplacePanelOpen(prev => !prev);
    if (!isReplacePanelOpen && editor) {
      setTimeout(() => {
        const findInput = document.querySelector('.find-replace-panel .find-input') as HTMLInputElement;
        findInput?.focus();
      }, 0);
    }
  }, [isReplacePanelOpen, editor]);
  
  // 查找下一个（点击按钮时聚焦编辑器，便于继续操作）
  const findNext = useCallback(() => {
    if (matches.length === 0) {
      findMatches();
      return;
    }

    const nextIndex = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIndex);
    scrollToMatch(matches[nextIndex], true);
  }, [matches, currentMatchIndex, findMatches, scrollToMatch]);

  // 查找上一个
  const findPrevious = useCallback(() => {
    if (matches.length === 0) {
      findMatches();
      return;
    }

    const prevIndex = currentMatchIndex <= 0 ? matches.length - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);
    scrollToMatch(matches[prevIndex], true);
  }, [matches, currentMatchIndex, findMatches, scrollToMatch]);
  
  // 替换当前匹配项
  const replaceCurrent = useCallback(() => {
    if (!editor || matches.length === 0 || currentMatchIndex < 0) return;

    try {
      const match = matches[currentMatchIndex];
      editor.commands.setTextSelection({ from: match.start, to: match.end });
      editor.commands.deleteSelection();
      editor.commands.insertContent(replaceText);
      
      setTimeout(() => findMatches(), 50);
    } catch {
      // ignore
    }
  }, [editor, matches, currentMatchIndex, replaceText, findMatches]);
  
  // 替换全部
  const replaceAllMatches = useCallback(() => {
    if (!editor || !findText.trim() || matches.length === 0) return;

    try {
      const htmlContent = editor.getHTML();
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = matchCase 
        ? new RegExp(escaped, 'g')
        : new RegExp(escaped, 'gi');

      const newHtmlContent = htmlContent.replace(regex, replaceText);
      editor.commands.setContent(newHtmlContent);
      
      onMessage?.(`已替换 ${matches.length} 处"${findText}"为"${replaceText}"`, 'success', { toast: true, autoCloseMs: 2000 });
      setMatches([]);
      setCurrentMatchIndex(-1);
      setFindText('');
    } catch {
      
      onMessage?.('替换失败，请重试', 'error');
    }
  }, [editor, findText, matchCase, replaceText, matches, onMessage]);
  
  // 监听查找文本变化
  useEffect(() => {
    if (isReplacePanelOpen && findText && editor) {
      const timeoutId = setTimeout(() => {
        findMatches();
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      // 避免同步更新 state 导致级联渲染警告
      const timeoutId = setTimeout(() => {
        setMatches([]);
        setCurrentMatchIndex(-1);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [findText, matchCase, isReplacePanelOpen, editor, findMatches]);
  
  return {
    isReplacePanelOpen,
    findText,
    replaceText,
    matchCase,
    currentMatchIndex,
    matches,
    setIsReplacePanelOpen,
    setFindText,
    setReplaceText,
    setMatchCase,
    handleReplace,
    findNext,
    findPrevious,
    replaceCurrent,
    replaceAllMatches,
  };
}
