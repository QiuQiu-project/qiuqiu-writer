import { useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { documentCache } from '../utils/documentCache';
import { countCharacters } from '../utils/textUtils';
import type { Work } from '../utils/worksApi';
import type { Chapter } from '../utils/chaptersApi';

export function useAutoSave(
  editor: Editor | null,
  selectedChapter: string | null,
  workId: string | null,
  currentChapterIdRef: React.MutableRefObject<number | null>,
  isChapterLoadingRef: React.MutableRefObject<boolean>,
  onWordCountUpdate: (count: number) => void,
  onWorkUpdate?: (work: Partial<Work>) => void,
  onChapterUpdate?: (chapter: Partial<Chapter>) => void
) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor || !selectedChapter || !workId) return;

    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) return;

    const handleUpdate = () => {
      // 实时更新字数
      if (editor) {
        const wordCount = countCharacters(editor.getHTML());
        onWordCountUpdate(wordCount);
      }

      // 章节加载中跳过保存
      if (isChapterLoadingRef.current) return;

      // 章节ID检查
      if (currentChapterIdRef.current !== chapterId) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const editorContent = editor.getHTML();
          const editorContentJson = editor.getJSON();
          const documentId = `work_${workId}_chapter_${chapterId}`;

          // 检查内容是否变化
          const lastSavedContent = documentCache.currentContent.get(documentId);
          if (lastSavedContent === editorContent) {
            return;
          }

          // 同步到服务器
          const syncResult = await documentCache.syncDocumentState(
            documentId, 
            editorContent, 
            editorContentJson
          );

          // 更新作品和章节信息
          if (syncResult.work && onWorkUpdate) {
            onWorkUpdate(syncResult.work);
          }
          if (syncResult.chapter && onChapterUpdate) {
            onChapterUpdate(syncResult.chapter);
          }

        } catch {
          // ignore
        }
      }, 2000);
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editor, workId, selectedChapter, onWorkUpdate, onChapterUpdate, currentChapterIdRef, isChapterLoadingRef, onWordCountUpdate]);
}