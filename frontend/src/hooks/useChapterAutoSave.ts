import { useEffect } from 'react';
import type { RefObject } from 'react';
import { Editor } from '@tiptap/react';
import { documentCache } from '../utils/documentCache';
// 关键修复：移除直接使用 localCacheManager，只在 sync/document 请求中进行缓存操作
import { countCharacters } from '../utils/textUtils';
import type { Chapter } from '../utils/chaptersApi';
import type { ChapterFullData } from '../types/document';
import type { Work } from '../utils/worksApi';

export interface UseChapterAutoSaveOptions {
  editor: Editor | null;
  selectedChapter: string | null;
  workId: string | null;
  chaptersData: Record<string, ChapterFullData>;
  allChapters: Chapter[];
  work: Work | null;
  setWork: React.Dispatch<React.SetStateAction<Work | null>>;
  setAllChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  setCurrentChapterWordCount: (count: number) => void;
  stopSync: () => void;
  // Refs
  isChapterLoadingRef: RefObject<boolean>;
  currentChapterIdRef: RefObject<number | null>;
  saveTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
  updateContentTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
  wordCountSaveTimeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * Hook: 自动保存章节内容（本地优先策略 + 智能同步）
 */
export function useChapterAutoSave({
  editor,
  selectedChapter,
  workId,
  chaptersData,
  allChapters,
  work,
  setWork,
  setAllChapters,
  setCurrentChapterWordCount,
  stopSync,
  isChapterLoadingRef,
  currentChapterIdRef,
  saveTimeoutRef,
  updateContentTimeoutRef,
  wordCountSaveTimeoutRef,
}: UseChapterAutoSaveOptions) {
  useEffect(() => {
    if (!editor || !selectedChapter || !workId) {
      console.log('⚠️ 自动保存未启动:', {
        hasEditor: !!editor,
        selectedChapter,
        workId,
      });
      return;
    }

    const chapterId = parseInt(selectedChapter);
    if (isNaN(chapterId)) {
      console.warn('⚠️ 自动保存未启动：章节ID无效', selectedChapter);
      return;
    }

    const handleUpdate = () => {
      // 实时更新字数显示
      if (editor) {
        const wordCount = countCharacters(editor.getHTML());
        setCurrentChapterWordCount(wordCount);
      }
      
      // 关键修复：如果正在加载章节，不触发保存，避免干扰章节加载
      if (isChapterLoadingRef.current) {
        return;
      }
      
      // 关键修复：在触发保存前，先检查章节是否已经切换
      const currentChapterIdCheck = currentChapterIdRef.current;
      if (currentChapterIdCheck !== chapterId) {
        console.warn('⚠️ [自动保存] 章节已切换，跳过保存:', {
          currentChapterIdRef: currentChapterIdCheck,
          expectedChapterId: chapterId,
        });
        return;
      }
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // 更新全局引用，方便在切换章节时清除
      (window as any).__chapterSaveTimeout = { current: null };

      saveTimeoutRef.current = setTimeout(async () => {
        // 再次检查，确保章节没有切换（双重验证）
        const currentChapterIdCheck2 = currentChapterIdRef.current;
        if (selectedChapter !== String(chapterId) || !workId || currentChapterIdCheck2 !== chapterId) {
          console.warn('⚠️ [自动保存] 跳过：章节已切换或作品ID缺失', {
            currentSelected: selectedChapter,
            expectedChapter: chapterId,
            currentChapterIdRef: currentChapterIdCheck2,
            workId,
          });
          return;
        }

        try {
          // 关键修复：再次验证章节ID，确保保存到正确的章节
          const currentChapterIdCheck = currentChapterIdRef.current;
          if (currentChapterIdCheck !== chapterId) {
            console.warn('⚠️ [自动保存] 章节ID不匹配，跳过保存:', {
              currentChapterIdRef: currentChapterIdCheck,
              expectedChapterId: chapterId,
            });
            return;
          }
          
          // 关键修复：直接使用编辑器中的实际内容，确保保存的是用户当前看到的内容
          // 从编辑器获取最新内容（而不是使用可能过时的变量）
          const editorContent = editor.getHTML();
          
          // 关键修复：检查内容是否为空，如果为空且不是用户主动清空（章节切换时会被清空），则跳过保存
          // 这样可以防止章节切换时，编辑器被清空后触发自动保存，将空内容保存到错误的章节
          if (!editorContent || editorContent.trim() === '<p></p>' || editorContent.trim() === '') {
            // 检查是否是章节切换导致的清空（通过检查 currentChapterIdRef 是否匹配）
            // 如果 currentChapterIdRef 匹配，说明是当前章节，可能是用户主动清空，应该保存
            // 如果不匹配，说明章节已切换，不应该保存空内容
            if (currentChapterIdCheck !== chapterId) {
              console.warn('⚠️ [自动保存] 编辑器内容为空且章节已切换，跳过保存');
              return;
            }
          }
          // 关键修复：同时获取 JSON 格式，用于更精确的段落级合并
          const editorContentJson = editor.getJSON();
          // 使用 workId 和 chapterId 生成唯一的缓存键
          const documentId = `work_${workId}_chapter_${chapterId}`;
          
          // 关键修复：从 chaptersData 或 allChapters 中获取章节信息（包括 title）
          const chapterIdStr = String(chapterId);
          const chapterData = chaptersData[chapterIdStr];
          const chapter = allChapters.find(c => String(c.id) === chapterIdStr);
          const chapterNumber = chapterData?.chapter_number 
            || chapter?.chapter_number 
            || undefined;
          const chapterTitle = chapterData?.title 
            || chapter?.title 
            || undefined;
          
          // 关键修复：构建包含 title 的 metadata
          const metadata = {
            work_id: Number(workId),
            chapter_id: chapterId,
            chapter_number: chapterNumber,
            title: chapterTitle, // 关键修复：保存章节标题
            updated_at: new Date().toISOString(),
          };
          
          // 关键修复：验证内容不为空且确实属于当前章节
          // 注意：即使内容为空（用户删除了所有内容），也应该保存，因为这是用户的意图
          // 但如果是初始空内容，可以跳过
          if (!editorContent || (editorContent.trim() === '<p></p>' && editorContent.length <= 7)) {
            // 检查是否是真正的空内容（只有默认的空段落）
          }
          
          // 关键优化：检查内容是否真的改变了
          const lastSavedContent = documentCache.currentContent.get(documentId);
          if (lastSavedContent === editorContent) {
            // 内容没有变化，不触发保存
            console.log('⏭️ [自动保存] 内容未变化，跳过保存');
            return;
          }
          
          // 🔍 [调试] 自动保存时的缓存操作
          console.log('🔍 [自动保存-缓存操作] 开始自动保存并更新缓存:', {
            documentId,
            chapterId,
            contentLength: editorContent.length,
            contentPreview: editorContent.substring(0, 100),
            hasJson: !!editorContentJson,
            hasMetadata: !!metadata,
            metadataKeys: Object.keys(metadata),
            timestamp: new Date().toISOString(),
            stackTrace: new Error().stack?.split('\n').slice(0, 8).join('\n'),
          });
          
          // 关键优化：只调用 syncDocumentState，它会内部处理缓存更新
          // 不再单独调用 updateDocument，避免重复更新
          // 关键修复：传递 metadata 到 syncDocumentState
          // 关键修复：添加验证函数，确保只有当前章节才会同步
          try {
            const syncResult = await documentCache.syncDocumentState(
              documentId, 
              editorContent, 
              editorContentJson, 
              metadata,
              (docId: string) => {
                // 验证是否是当前章节
                const currentChapterIdCheck = currentChapterIdRef.current;
                if (currentChapterIdCheck !== chapterId) {
                  return false;
                }
                // 从 documentId 中提取章节ID
                const match = docId.match(/work_\d+_chapter_(\d+)/);
                if (match) {
                  const docChapterId = parseInt(match[1]);
                  return docChapterId === chapterId;
                }
                return false;
              }
            );
            
            // 关键修复：只有在同步成功时才更新状态
            if (syncResult.success) {
              console.log('✅ [自动保存] 已同步到服务器:', {
                documentId,
                contentLength: editorContent.length,
              });
              
              // 如果 sync 接口返回了更新后的作品和章节信息，更新本地状态
              if (syncResult.work || syncResult.chapter) {
                // 如果返回了更新后的作品信息，更新本地状态
                if (syncResult.work) {
                  // 关键修复：只有在 prevWork 存在时才更新，避免将 work 设置为 null
                  setWork(prevWork => {
                    if (prevWork) {
                      return { ...prevWork, word_count: syncResult.work!.word_count };
                    }
                    // 如果 prevWork 为 null，不更新（因为需要完整的 work 对象）
                    return prevWork;
                  });
                  
                  console.log('✅ [字数统计] 作品总字数已更新（从 sync 接口返回）:', {
                    workId,
                    totalWordCount: syncResult.work.word_count,
                  });
                }
                
                // 如果返回了更新后的章节信息，更新本地章节数据
                if (syncResult.chapter) {
                  setAllChapters(prevChapters => 
                    prevChapters.map(ch => 
                      ch.id === chapterId ? { ...ch, word_count: syncResult.chapter!.word_count } : ch
                    )
                  );
                  
                  console.log('✅ [字数统计] 章节字数已更新（从 sync 接口返回）:', {
                    chapterId,
                    wordCount: syncResult.chapter.word_count,
                  });
                }
              }
            } else {
              console.warn('⚠️ [自动保存] 同步未成功，跳过状态更新:', {
                documentId,
                error: syncResult.error,
              });
            }
          } catch (syncErr) {
            console.warn('⚠️ [自动保存] 同步到服务器失败，但已保存到本地缓存:', syncErr);
          }
          
          // 关键修复：保存后验证内容确实保存到了正确的章节
          const savedDoc = await documentCache.getDocument(documentId);
          if (savedDoc) {
            const savedChapterId = savedDoc.metadata?.chapter_id;
            if (savedChapterId && savedChapterId !== chapterId) {
              console.error('❌ [自动保存] 严重错误：内容被保存到了错误的章节！', {
                savedChapterId,
                expectedChapterId: chapterId,
                documentId,
              });
              // 关键修复：从 chaptersData 或 allChapters 中获取正确的章节号和标题
              const chapterIdStr = String(chapterId);
              const chapterData = chaptersData[chapterIdStr];
              const chapter = allChapters.find(c => String(c.id) === chapterIdStr);
              const chapterNumber = chapterData?.chapter_number 
                || chapter?.chapter_number 
                || undefined;
              const chapterTitle = chapterData?.title 
                || chapter?.title 
                || undefined;
              
              // 关键修复：构建包含 title 的 metadata
              const retryMetadata = {
                work_id: Number(workId),
                chapter_id: chapterId,
                chapter_number: chapterNumber, // 关键修复：保存正确的章节号
                title: chapterTitle, // 关键修复：保存章节标题
                updated_at: new Date().toISOString(),
              };
              
              // 关键修复：只在 sync 请求中进行缓存操作
              // syncDocumentState 内部会处理缓存更新，不需要手动删除和更新
              // 关键修复：添加验证函数，确保只有当前章节才会同步
              try {
                await documentCache.syncDocumentState(
                  documentId, 
                  editorContent, 
                  undefined, 
                  retryMetadata,
                  (docId: string) => {
                    // 验证是否是当前章节
                    const currentChapterIdCheck = currentChapterIdRef.current;
                    if (currentChapterIdCheck !== chapterId) {
                      return false;
                    }
                    // 从 documentId 中提取章节ID
                    const match = docId.match(/work_\d+_chapter_(\d+)/);
                    if (match) {
                      const docChapterId = parseInt(match[1]);
                      return docChapterId === chapterId;
                    }
                    return false;
                  }
                );
              } catch (retryErr) {
                console.warn('⚠️ [自动保存] 重试同步失败:', retryErr);
              }
            }
          }
          
          // 验证保存
          // 关键修复：只在 document 请求中进行缓存读取操作
          const saved = await documentCache.getDocument(documentId);
          if (saved && saved.content) {
            // 进一步验证内容是否正确保存
            if (saved.content === editorContent) {
              // 保存成功
            } else {
              console.warn('⚠️ [自动保存] 内容验证失败，内容不匹配', {
                savedContentLength: saved.content.length,
                expectedContentLength: editorContent.length,
              });
            }
          } else {
            console.error('❌ [自动保存] 验证失败，缓存中不存在');
          }
          
          // 字数统计已在 sync 接口中处理，不需要单独更新
        } catch (err) {
          console.error('❌ [自动保存] 保存到本地缓存失败:', err);
        }
      }, 2000); // 2秒后保存到本地
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // 清除更新内容的防抖定时器
      if (updateContentTimeoutRef.current) {
        clearTimeout(updateContentTimeoutRef.current);
      }
      // 清除字数统计保存定时器
      if (wordCountSaveTimeoutRef.current) {
        clearTimeout(wordCountSaveTimeoutRef.current);
      }
      // 清除全局引用
      if ((window as any).__chapterSaveTimeout) {
        (window as any).__chapterSaveTimeout.current = null;
      }
      // 停止智能同步
      stopSync();
    };
  }, [
    editor,
    workId,
    selectedChapter,
    stopSync,
    chaptersData,
    allChapters,
    work,
    setWork,
    setAllChapters,
    setCurrentChapterWordCount,
    isChapterLoadingRef,
    currentChapterIdRef,
    saveTimeoutRef,
    updateContentTimeoutRef,
    wordCountSaveTimeoutRef,
  ]);
}

