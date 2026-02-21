/**
 * 章节内容加载工具
 * 处理章节内容的加载、缓存、同步等功能
 */

import { Editor } from '@tiptap/react';
import { documentCache } from './documentCache';
import { localCacheManager } from './localCacheManager';
import { countCharacters } from './textUtils';
import type { ShareDBDocument, ChapterFullData } from '../types/document';
import { chaptersApi, type Chapter } from './chaptersApi';

interface CustomWindow extends Window {
  __chapterSaveTimeout?: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  __chapterPullTimer?: ReturnType<typeof setTimeout>;
}

/**
 * 加载章节内容的参数接口
 */
export interface LoadChapterContentParams {
  // 基础参数
  chapterId: number;
  workId: string | null;
  selectedChapter: string | null;
  
  // 编辑器相关
  editor: Editor;
  
  // State setters
  setChapterLoading: (loading: boolean) => void;
  setChaptersData: React.Dispatch<React.SetStateAction<Record<string, ChapterFullData>>>;
  setCurrentChapterData: React.Dispatch<React.SetStateAction<ChapterFullData | undefined>>;
  setCurrentChapterWordCount: (count: number) => void;
  
  // State values
  chaptersData: Record<string, ChapterFullData>;
  allChapters: Chapter[];
  
  // Refs
  isChapterLoadingRef: React.MutableRefObject<boolean>;
  currentChapterIdRef: React.MutableRefObject<number | null>;
  lastSetContentRef: React.MutableRefObject<string>;
  
  // 函数
  stopSync: () => void;
}

/**
 * 加载章节内容
 */
export async function loadChapterContent(params: LoadChapterContentParams): Promise<void> {
  const {
    chapterId,
    workId,
    selectedChapter,
    editor,
    setChapterLoading,
    setChaptersData,
    setCurrentChapterData,
    setCurrentChapterWordCount,
    chaptersData,
    allChapters,
    isChapterLoadingRef,
    currentChapterIdRef,
    lastSetContentRef,
    stopSync,
  } = params;

  // 显示加载弹窗
  setChapterLoading(true);
  // 关键修复：设置加载状态标记，防止其他操作干扰
  isChapterLoadingRef.current = true;
  
  // 关键修复：在开始加载新章节前，立即停止智能同步的所有操作
  // 这样可以防止轮询、同步检查等在章节切换时干扰编辑器内容
  if (typeof stopSync === 'function') {
    stopSync();
  }
  
  try {
    // 关键修复：在加载新章节前，先保存当前章节的内容
    // 注意：这里使用 currentChapterIdRef.current，因为此时还是前一个章节的 ID
    const previousChapterId = currentChapterIdRef.current;
    
    // 🔍 [调试] 检查是否是真正的章节切换
    const isChapterSwitch = previousChapterId && previousChapterId !== chapterId;
        
    if (isChapterSwitch && workId) {
      try {
        // 关键修复：立即清除所有待保存的定时器，避免保存到错误的章节
        // 这样可以防止自动保存在新章节加载后保存到前一个章节
        const saveTimeoutRef = (window as unknown as CustomWindow).__chapterSaveTimeout;
        if (saveTimeoutRef?.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        // 关键修复：清除自动拉取定时器，避免拉取其他章节的内容
        const pullTimer = (window as unknown as CustomWindow).__chapterPullTimer;
        if (pullTimer) {
          clearTimeout(pullTimer);
          delete (window as unknown as CustomWindow).__chapterPullTimer;
        }
        
        // 等待一小段时间，确保所有异步保存操作完成
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 关键修复：在清空编辑器前，立即获取并保存当前章节内容
        // 此时编辑器还显示前一个章节的内容
        const currentContent = editor.getHTML();
        const previousDocumentId = `work_${workId}_chapter_${previousChapterId}`;
        
                
        // 关键修复：验证编辑器内容确实属于前一个章节
        // 如果编辑器内容已经被清空或改变，说明可能已经切换了，不应该保存
        if (currentContent && currentContent.trim() !== '<p></p>' && currentContent.trim() !== '') {
          // 立即保存前一个章节的内容，使用同步方式确保保存完成
          // 关键修复：从 chaptersData 或 allChapters 中获取正确的章节号
          const previousChapterIdStr = String(previousChapterId);
          const previousChapterData = chaptersData[previousChapterIdStr];
          const previousChapter = allChapters.find(c => String(c.id) === previousChapterIdStr);
          const previousChapterNumber = previousChapterData?.chapter_number 
            || previousChapter?.chapter_number 
            || undefined;
          
          // 🔍 [调试] 切换章节时保存前一个章节的缓存
                    
          // 关键修复：只在 sync 请求中进行缓存操作
          // 直接调用 syncDocumentState，它会内部处理缓存更新
          // 关键修复：切换章节时保存前一个章节，不需要验证当前章节（因为已经是前一个章节了）
          try {
            await documentCache.syncDocumentState(
              previousDocumentId, 
              currentContent, 
              undefined, 
              {
                work_id: workId,
                chapter_id: previousChapterId,
                chapter_number: previousChapterNumber,
                updated_at: new Date().toISOString(),
              },
              // 切换章节时保存前一个章节，不需要验证（因为已经是前一个章节了）
              undefined
            );
          } catch {
            // Ignore sync error during chapter switch
          }
          
          // 验证保存是否成功
          const savedDoc = await documentCache.getDocument(previousDocumentId);
          if (savedDoc && typeof savedDoc.content === 'string') {
            if (savedDoc.content === currentContent) {
              // 保存成功
            } else {
              // Content mismatch, but we proceed
            }
          }
        } else {
          // Content is empty or invalid, skipping save
        }
      } catch {
        // Ignore general error during chapter switch save
      }
    }
    
    // 🔍 [调试] 切换章节时的关键步骤
        
    // 关键修复：只有在真正切换章节时才清空编辑器
    // 如果是同一个章节重新加载，不清空编辑器，避免空内容被保存
    if (isChapterSwitch) {
      // 关键修复：在更新 currentChapterIdRef 之前，先清除所有待保存的定时器
      // 这可以防止已经排队的自动保存定时器在章节切换后仍然执行
      const saveTimeoutRef = (window as unknown as CustomWindow).__chapterSaveTimeout;
      if (saveTimeoutRef?.current) {
        
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      } else {
        // No pending save timeout
      }
      
      // 关键修复：等待一小段时间，确保所有待保存的定时器都被清除
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 关键修复：在加载新章节前，先更新 currentChapterIdRef，防止自动保存将空内容保存到前一个章节
      // 必须在清空编辑器之前更新，这样自动保存检查时会发现章节已切换，不会保存空内容
      // 注意：此时前一个章节的内容已经保存完成（第 78-158 行），所以可以安全地更新
            currentChapterIdRef.current = chapterId;
      
      // 关键修复：在加载新章节前，先清空编辑器内容，避免显示旧内容
      // 清空编辑器时使用 emitUpdate: false，不触发更新事件，同时清除历史
      // 即使 emitUpdate: false，TipTap 可能仍会触发某些内部事件，所以我们已经提前更新了 currentChapterIdRef
            editor.commands.setContent('<p></p>', { emitUpdate: false });
      
      // 等待编辑器清空完成
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 🔍 [调试] 验证编辑器内容
      // const editorContentAfterClear = editor.getHTML();
          } else {
      // 同一个章节重新加载，不需要清空编辑器
            
      // 仍然更新 currentChapterIdRef（虽然值相同，但确保状态一致）
      if (currentChapterIdRef.current !== chapterId) {
        currentChapterIdRef.current = chapterId;
      }
    }
    
    try {
      // 使用 workId 和 chapterId 生成唯一的缓存键（统一使用新格式）
      if (!workId) {
        
        setChapterLoading(false);
        return;
      }
      const documentId = `work_${workId}_chapter_${chapterId}`;
      
      let content: string | null = null;
      
      // 关键优化：本地优先策略 - 优先使用本地缓存，避免不必要的服务器请求
      // 1. 先从本地存储缓存获取
      let cachedDoc: ShareDBDocument | null = null;
      
      try {
                
        // 1.1 先从本地存储缓存获取
        cachedDoc = await localCacheManager.get<ShareDBDocument>(documentId);
        
        // 1.2 如果本地存储缓存没有，尝试从旧格式迁移
        if (!cachedDoc && documentId.startsWith('work_') && documentId.includes('_chapter_')) {
          const match = documentId.match(/work_([a-zA-Z0-9_-]+)_chapter_(\d+)/);
            if (match) {
            const [, , chapterIdStr] = match;
            const oldFormatKey = `chapter_${chapterIdStr}`;
            const oldCached = await localCacheManager.get<ShareDBDocument>(oldFormatKey);
            
            if (oldCached) {
              
              const contentStr = typeof oldCached.content === 'string' ? oldCached.content : '';
              cachedDoc = {
                document_id: documentId,
                content: contentStr,
                version: oldCached.version || 1,
                metadata: oldCached.metadata || {},
              };
              // 保存到新格式
              await localCacheManager.set(documentId, cachedDoc, cachedDoc.version || 1);
            }
          }
        }
        
        // 1.3 如果本地存储缓存也没有，尝试从内存缓存获取
        if (!cachedDoc) {
          const memoryContent = documentCache.currentContent.get(documentId);
          const memoryVersion = documentCache.currentVersion.get(documentId);
          if (memoryContent !== undefined && memoryVersion !== undefined) {
            cachedDoc = {
              document_id: documentId,
              content: memoryContent,
              version: memoryVersion,
              metadata: {},
            };
          }
        }
      } catch {
        // Ignore cache error
      }
      
      // 验证缓存内容是否属于当前章节
      if (cachedDoc) {
        const cachedChapterId = cachedDoc.metadata?.chapter_id;
        if (cachedChapterId && cachedChapterId !== chapterId) {
                    // 关键修复：不在非 sync/document 请求中直接操作缓存
          // 错误的缓存会在下次 getDocument 时被覆盖，或者通过 syncDocumentState 更新
          
          cachedDoc = null;
        }
      }
      
      if (cachedDoc) {
        // 统一格式：content 必须是字符串
        if (typeof cachedDoc.content === 'string' && cachedDoc.content.trim().length > 0) {
          content = cachedDoc.content;
                  } else if (typeof cachedDoc.content !== 'string') {
          
          // 关键修复：格式错误时不设置为空字符串，保持 content 为 null，让后续逻辑处理
          // content = ''; // 注释掉，避免空字符串导致编辑器被清空
        } else if (typeof cachedDoc.content === 'string' && cachedDoc.content.trim().length === 0) {
                    // 关键修复：空字符串时不设置 content，保持为 null，让后续逻辑处理
          // content = ''; // 注释掉，避免空字符串导致编辑器被清空
        }
        
        // 从缓存中读取 outline 和 detailed_outline（如果存在）
        if (cachedDoc.metadata?.outline || cachedDoc.metadata?.detailed_outline) {
          const chapterIdStr = String(chapterId);
          const cachedOutline = cachedDoc.metadata.outline || '';
          const cachedDetailedOutline = cachedDoc.metadata.detailed_outline || '';
          
          // 更新 chaptersData 中的章节数据
          setChaptersData(prev => {
            const updated = { ...prev };
            if (updated[chapterIdStr]) {
              updated[chapterIdStr] = {
                ...updated[chapterIdStr],
                outline: cachedOutline,
                detailOutline: cachedDetailedOutline,
              };
            }
            return updated;
          });
          
          // 如果当前选中的章节就是这个章节，也更新 currentChapterData
          if (selectedChapter === chapterIdStr) {
            setCurrentChapterData(prev => {
              if (prev && prev.id === chapterIdStr) {
                return {
                  ...prev,
                  outline: cachedOutline,
                  detailOutline: cachedDetailedOutline,
                };
              }
              return prev;
            });
          }
        }
      }
      
      // 2. 只有当 chaptersData 中没有大纲和细纲时，才从服务器获取章节信息
      // 避免频繁请求，优先使用已缓存的数据
      const chapterIdStr = String(chapterId);
      const hasOutlineInCache = chaptersData[chapterIdStr]?.outline && chaptersData[chapterIdStr].outline.trim().length > 0;
      const hasDetailOutlineInCache = chaptersData[chapterIdStr]?.detailOutline && chaptersData[chapterIdStr].detailOutline.trim().length > 0;
      
      // 关键优化：本地优先策略 - 只有当缓存中完全没有大纲和细纲时，才从服务器获取
      // 避免频繁请求，优先使用已缓存的数据
      if (!hasOutlineInCache || !hasDetailOutlineInCache) {
        // 关键优化：不再自动从服务器获取，避免不必要的请求
        // 如果用户需要最新的大纲/细纲，可以通过手动刷新或编辑章节设置来获取
        
      }

      // 3. 如果缓存中没有内容，尝试从后端 API 获取
      if (content === null || (typeof content === 'string' && content.trim() === '')) {
        
        try {
          // 调用后端接口获取章节文档内容（直接从 ShareDB/MongoDB 获取）
          // 使用专门的文档接口 /document，而不是通用的章节详情接口
          const docResponse = await chaptersApi.getChapterDocument(chapterId);
          
          if (docResponse && typeof docResponse.content === 'string') {
            content = docResponse.content;
            
            // 更新本地缓存，以便下次直接从缓存加载
            const documentId = `work_${workId}_chapter_${chapterId}`;
            const newDoc: ShareDBDocument = {
              document_id: documentId,
              content: content,
              version: 1,
              metadata: {
                work_id: workId,
                chapter_id: chapterId,
                chapter_number: docResponse.chapter_info.chapter_number,
                title: docResponse.chapter_info.title,
                outline: JSON.stringify(docResponse.chapter_info.outline || {}),
                detailed_outline: JSON.stringify(docResponse.chapter_info.detailed_outline || {}),
                updated_at: new Date().toISOString(),
              },
            };
            
            // 异步更新缓存
            localCacheManager.set(documentId, newDoc, 1).catch(() => {
              // Ignore cache update error
            });
          } else {
            // Invalid response format
          }
        } catch {
          // Ignore API error
        }
      }
      
      // 关键修复：在设置编辑器前，添加调试日志
            
      // 🔍 [调试] 检查内容状态
      if (content === null) {
        // Content is null
      } else if (content === '') {
        // Content is empty string
      }
      
      // 关键修复：只有在 content 不为 null 且不为空字符串时才设置编辑器
      // 如果是空字符串，检查是否是同一章节重新加载，如果是则保留现有内容
      if (content !== null && content !== '') {
        // 关键修复：验证内容确实属于当前章节
        if (!workId) {
          
          setChapterLoading(false);
          return;
        }

        // 关键修复：防止频闪 - 检查是否与上次设置的内容相同
        // 但在章节切换时，即使内容相同也要设置，因为这是新章节的内容
        // 关键修复：改进HTML格式检测和转换逻辑，确保格式不丢失
        const convertTextToHtml = (text: string): string => {
          if (!text || text.trim() === '') {
            return '<p></p>';
          }
          
          // 更准确地检测HTML格式：检查是否包含HTML标签（如 <p>, <br>, <div> 等）
          const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
          const hasHtmlTags = htmlTagPattern.test(text);
          
          // 如果已经是 HTML 格式（包含HTML标签），直接返回，不做转换
          if (hasHtmlTags) {
            // 验证HTML格式是否完整，如果不完整则进行修复
            const trimmed = text.trim();
            // 如果内容以标签开始和结束，说明是完整的HTML
            if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
              return text;
            }
            // 如果包含HTML标签但格式不完整，尝试修复
            // 例如：只有内容没有外层标签，添加段落标签
            if (trimmed.includes('<p>') || trimmed.includes('<br>') || trimmed.includes('<div>')) {
              return text; // 已经有HTML标签，直接返回
            }
          }
          
          // 将纯文本转换为 HTML：换行符转换为段落
          // 多个连续换行符转换为段落分隔
          return text
            .split(/\n\s*\n/) // 按双换行符分割段落
            .map(para => para.trim())
            .filter(para => para.length > 0)
            .map(para => {
              // 段落内的单换行符转换为 <br>
              return `<p>${para.replace(/\n/g, '<br>')}</p>`;
            })
            .join('') || '<p></p>';
        };
        
        const normalizedContent = convertTextToHtml(content || '');
        const shouldSetContent = lastSetContentRef.current !== normalizedContent || 
                                 (currentChapterIdRef.current !== chapterId);
        
        // 🔍 [调试] 检查是否应该设置内容
                
        if (shouldSetContent) {
          // 🔍 [调试] 设置编辑器内容前的状态
          // const editorContentBeforeSet = editor.getHTML();
                    
          // 关键修复：设置内容时确保格式被正确解析和保留
          // TipTap 会自动规范化HTML，但我们需要确保格式信息不丢失
          editor.commands.setContent(normalizedContent, { 
            emitUpdate: false
          });
          
          // 🔍 [调试] 设置编辑器内容后的状态
          setTimeout(() => {
            const editorContentAfterSet = editor.getHTML();
                        
            if (editorContentAfterSet.trim() === '<p></p>' || editorContentAfterSet.trim() === '') {
              // Editor content is empty after set
            }
          }, 100);
          
          // 使用 setTimeout 确保内容设置完成后再更新字数
          setTimeout(() => {
            // 更新字数显示
            const wordCount = countCharacters(editor.getHTML());
            setCurrentChapterWordCount(wordCount);
            
            // 关键修复：验证设置后的内容格式
            const setContent = editor.getHTML();
            // 不进行严格比较，因为TipTap可能会规范化HTML（如添加/删除空格）
            // 只检查关键内容是否存在
            const normalizedSet = setContent.trim();
            const normalizedExpected = normalizedContent.trim();
            
            // 🔍 [调试] 验证设置后的内容
                        
            if (normalizedSet.length === 0 && normalizedExpected.length > 0) {
              // Content mismatch: expected content but got empty
            }
          }, 0);
          
          lastSetContentRef.current = normalizedContent; // 记录已设置的内容
        } else {
          // Content already up to date or no need to set
        }
      } else {
        // 如果 content 是 null（获取失败），设置空编辑器
        // 🔍 [调试] 记录为什么内容为 null
                
        // 关键修复：在设置空编辑器前，检查是否是同一章节重新加载
        // 如果是同一章节，不应该清空编辑器，应该保留现有内容
        const currentEditorContent = editor.getHTML();
        if (!isChapterSwitch && currentEditorContent && currentEditorContent.trim() !== '<p></p>') {
                    // 不清空编辑器，保留现有内容
        } else {
          // 只有在真正切换章节或编辑器确实为空时才设置空编辑器
          editor.commands.setContent('<p></p>');
          setCurrentChapterWordCount(0);
        }
      }
      
      // 关键修复：currentChapterIdRef 已经在加载新章节前更新了（第 164 行）
      // 这里不需要再次更新，但为了代码清晰，保留这个注释
      // currentChapterIdRef.current = chapterId; // 已在第 164 行更新
      
      // 关键修复：章节内容加载完成后，清除加载状态标记
      // 注意：这里不立即重新启动智能同步，因为 useIntelligentSync 的 useEffect 会在 documentId 变化时自动重新启动
      isChapterLoadingRef.current = false;

      // 关键优化：移除延迟拉取逻辑，避免额外的 document 请求
      // 章节加载时已经从服务器获取了最新内容（通过 forcePullFromServer），不需要再次拉取
      
      // 隐藏加载动画
      setChapterLoading(false);
      // 关键修复：确保在加载完成或失败时都清除加载状态标记
      isChapterLoadingRef.current = false;
    } catch {
      
      // 即使所有方法都失败，也显示空内容，保证编辑器可用
      editor.commands.setContent('<p></p>');
      // 隐藏加载动画
      setChapterLoading(false);
      // 关键修复：确保在加载失败时也清除加载状态标记
      isChapterLoadingRef.current = false;
    }
  } catch {
    
    // 即使所有方法都失败，也显示空内容，保证编辑器可用
    editor.commands.setContent('<p></p>');
    // 隐藏加载动画
    setChapterLoading(false);
    // 关键修复：确保在加载失败时也清除加载状态标记
    isChapterLoadingRef.current = false;
  }
}
