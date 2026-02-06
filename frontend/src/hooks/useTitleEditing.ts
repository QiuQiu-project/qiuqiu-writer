/**
 * Hook: 标题编辑
 * 处理作品标题和章节名的内联编辑
 */

import { useRef, useCallback } from 'react';
import { worksApi, type Work } from '../utils/worksApi';
import { chaptersApi } from '../utils/chaptersApi';
import type { ChapterFullData } from '../types/document';

export interface UseTitleEditingOptions {
  work: Work | null;
  workId: string | null;
  selectedChapter: string | null;
  chaptersData: Record<string, ChapterFullData>;
  onWorkUpdate: (work: Work) => void;
  onChapterTitleUpdate: (chapterId: string, newTitle: string) => void;
  onError?: (msg: string) => void;
}

export interface UseTitleEditingReturn {
  titleEditableRef: React.RefObject<HTMLDivElement | null>;
  chapterNameInputRef: React.RefObject<HTMLDivElement | null>;
  handleSaveTitle: (e: React.FocusEvent<HTMLDivElement>) => Promise<void>;
  handleTitleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  handleSaveChapterName: (e: React.FocusEvent<HTMLDivElement>) => Promise<void>;
  handleChapterNameKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function useTitleEditing(options: UseTitleEditingOptions): UseTitleEditingReturn {
  const { work, workId, selectedChapter, chaptersData, onWorkUpdate, onChapterTitleUpdate, onError } = options;

  const titleEditableRef = useRef<HTMLDivElement | null>(null);
  const chapterNameInputRef = useRef<HTMLDivElement | null>(null);

  /** 保存作品标题 */
  const handleSaveTitle = useCallback(async (e: React.FocusEvent<HTMLDivElement>) => {
    if (!work || !workId) return;

    const currentTitle = work.title || '';
    const newTitle = (e.currentTarget.textContent || '').trim();

    if (newTitle === currentTitle) return;

    if (!newTitle) {
      e.currentTarget.textContent = currentTitle;
      return;
    }

    try {
      const updatedWork = await worksApi.updateWork(workId, { title: newTitle });
      onWorkUpdate(updatedWork);
    } catch (err) {
      console.error('更新标题失败:', err);
      onError?.(err instanceof Error ? err.message : '更新标题失败');
      e.currentTarget.textContent = currentTitle;
    }
  }, [work, workId, onWorkUpdate, onError]);

  /** 标题键盘事件 */
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (work) {
        e.currentTarget.textContent = work.title || '';
        e.currentTarget.blur();
      }
    }
  }, [work]);

  /** 保存章节名 */
  const handleSaveChapterName = useCallback(async (e: React.FocusEvent<HTMLDivElement>) => {
    if (!selectedChapter || !chaptersData[selectedChapter]) return;

    const chapterId = parseInt(selectedChapter);
    const currentTitle = chaptersData[selectedChapter].title || '';
    const newTitle = (e.currentTarget.textContent || '').trim();

    if (newTitle === currentTitle) return;

    if (!newTitle) {
      e.currentTarget.textContent = currentTitle;
      return;
    }

    try {
      await chaptersApi.updateChapter(chapterId, { title: newTitle });
      onChapterTitleUpdate(selectedChapter, newTitle);
    } catch (err) {
      console.error('更新章节名失败:', err);
      onError?.(err instanceof Error ? err.message : '更新章节名失败');
      e.currentTarget.textContent = currentTitle;
    }
  }, [selectedChapter, chaptersData, onChapterTitleUpdate, onError]);

  /** 章节名键盘事件 */
  const handleChapterNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (selectedChapter && chaptersData[selectedChapter]) {
        e.currentTarget.textContent = chaptersData[selectedChapter].title || '未命名章节';
        e.currentTarget.blur();
      }
    }
  }, [selectedChapter, chaptersData]);

  return {
    titleEditableRef,
    chapterNameInputRef,
    handleSaveTitle,
    handleTitleKeyDown,
    handleSaveChapterName,
    handleChapterNameKeyDown,
  };
}
