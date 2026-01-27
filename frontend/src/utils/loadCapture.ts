/**
 * 章节内容加载工具
 * 处理章节内容的加载、缓存、同步等功能
 */

import { Editor } from '@tiptap/react';
import { documentCache } from './documentCache';
import { localCacheManager } from './localCacheManager';
import { chaptersApi } from './chaptersApi';
import { countCharacters } from './textUtils';
import type { ShareDBDocument, ChapterFullData } from '../types/document';
import type { Chapter } from './chaptersApi';

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
    console.log('🔍 [切换章节-调试] 检查章节切换状态:', {
      previousChapterId,
      newChapterId: chapterId,
      isChapterSwitch,
      isSameChapter: previousChapterId === chapterId,
      timestamp: new Date().toISOString(),
    });
    
    if (isChapterSwitch && workId) {
      try {
        // 关键修复：立即清除所有待保存的定时器，避免保存到错误的章节
        // 这样可以防止自动保存在新章节加载后保存到前一个章节
        const saveTimeoutRef = (window as any).__chapterSaveTimeout;
        if (saveTimeoutRef?.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        // 关键修复：清除自动拉取定时器，避免拉取其他章节的内容
        const pullTimer = (window as any).__chapterPullTimer;
        if (pullTimer) {
          clearTimeout(pullTimer);
          delete (window as any).__chapterPullTimer;
        }
        
        // 等待一小段时间，确保所有异步保存操作完成
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 关键修复：在清空编辑器前，立即获取并保存当前章节内容
        // 此时编辑器还显示前一个章节的内容
        const currentContent = editor.getHTML();
        const previousDocumentId = `work_${workId}_chapter_${previousChapterId}`;
        
        console.log('💾 [切换章节] 保存前一个章节内容:', {
          previousChapterId,
          newChapterId: chapterId,
          previousDocumentId,
          contentLength: currentContent.length,
          contentPreview: currentContent.substring(0, 100),
          editorContent: editor.getHTML().substring(0, 100), // 验证编辑器内容
        });
        
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
          console.log('🔍 [切换章节-缓存操作] 开始保存前一个章节到缓存:', {
            previousDocumentId,
            previousChapterId,
            contentLength: currentContent.length,
            contentPreview: currentContent.substring(0, 100),
            timestamp: new Date().toISOString(),
            stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n'),
          });
          
          // 关键修复：只在 sync 请求中进行缓存操作
          // 直接调用 syncDocumentState，它会内部处理缓存更新
          // 关键修复：切换章节时保存前一个章节，不需要验证当前章节（因为已经是前一个章节了）
          try {
            await documentCache.syncDocumentState(
              previousDocumentId, 
              currentContent, 
              undefined, 
              {
                work_id: Number(workId),
                chapter_id: previousChapterId,
                chapter_number: previousChapterNumber,
                updated_at: new Date().toISOString(),
              },
              // 切换章节时保存前一个章节，不需要验证（因为已经是前一个章节了）
              undefined
            );
            console.log('✅ [切换章节-缓存操作] 前一个章节缓存保存成功:', {
              previousDocumentId,
              previousChapterId,
            });
          } catch (syncErr) {
            console.warn('⚠️ [切换章节-缓存操作] 同步到服务器失败，但已保存到本地缓存:', syncErr);
          }
          
          // 验证保存是否成功
          const savedDoc = await documentCache.getDocument(previousDocumentId);
          if (savedDoc && typeof savedDoc.content === 'string') {
            if (savedDoc.content === currentContent) {
              // 保存成功
            } else {
              console.warn('⚠️ [切换章节] 保存的内容与原始内容不匹配，可能存在问题', {
                savedLength: savedDoc.content.length,
                originalLength: currentContent.length,
              });
            }
          }
        } else {
          console.warn('⚠️ [切换章节] 编辑器内容为空，跳过保存');
        }
      } catch (err) {
        console.error('❌ [切换章节] 保存前一个章节内容失败:', err);
      }
    }
    
    // 🔍 [调试] 切换章节时的关键步骤
    console.log('🔍 [切换章节-调试] 开始切换章节流程:', {
      previousChapterId: currentChapterIdRef.current,
      newChapterId: chapterId,
      isChapterSwitch,
      timestamp: new Date().toISOString(),
    });
    
    // 关键修复：只有在真正切换章节时才清空编辑器
    // 如果是同一个章节重新加载，不清空编辑器，避免空内容被保存
    if (isChapterSwitch) {
      // 关键修复：在更新 currentChapterIdRef 之前，先清除所有待保存的定时器
      // 这可以防止已经排队的自动保存定时器在章节切换后仍然执行
      const saveTimeoutRef = (window as any).__chapterSaveTimeout;
      if (saveTimeoutRef?.current) {
        console.log('🔍 [切换章节-调试] 清除待保存的定时器');
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      } else {
        console.log('🔍 [切换章节-调试] 没有待保存的定时器');
      }
      
      // 关键修复：等待一小段时间，确保所有待保存的定时器都被清除
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 关键修复：在加载新章节前，先更新 currentChapterIdRef，防止自动保存将空内容保存到前一个章节
      // 必须在清空编辑器之前更新，这样自动保存检查时会发现章节已切换，不会保存空内容
      // 注意：此时前一个章节的内容已经保存完成（第 78-158 行），所以可以安全地更新
      console.log('🔍 [切换章节-调试] 更新 currentChapterIdRef (章节切换):', {
        oldChapterId: currentChapterIdRef.current,
        newChapterId: chapterId,
        timestamp: new Date().toISOString(),
      });
      currentChapterIdRef.current = chapterId;
      
      // 关键修复：在加载新章节前，先清空编辑器内容，避免显示旧内容
      // 清空编辑器时使用 emitUpdate: false，不触发更新事件，同时清除历史
      // 即使 emitUpdate: false，TipTap 可能仍会触发某些内部事件，所以我们已经提前更新了 currentChapterIdRef
      console.log('🔍 [切换章节-调试] 清空编辑器内容 (章节切换, emitUpdate: false):', {
        chapterId,
        timestamp: new Date().toISOString(),
      });
      editor.commands.setContent('<p></p>', { emitUpdate: false });
      
      // 等待编辑器清空完成
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 🔍 [调试] 验证编辑器内容
      const editorContentAfterClear = editor.getHTML();
      console.log('🔍 [切换章节-调试] 编辑器清空后的内容:', {
        chapterId,
        content: editorContentAfterClear,
        contentLength: editorContentAfterClear.length,
        timestamp: new Date().toISOString(),
      });
    } else {
      // 同一个章节重新加载，不需要清空编辑器
      console.log('🔍 [切换章节-调试] 同一章节重新加载，不清空编辑器:', {
        chapterId,
        timestamp: new Date().toISOString(),
      });
      
      // 仍然更新 currentChapterIdRef（虽然值相同，但确保状态一致）
      if (currentChapterIdRef.current !== chapterId) {
        currentChapterIdRef.current = chapterId;
      }
    }
    
    try {
      // 使用 workId 和 chapterId 生成唯一的缓存键（统一使用新格式）
      if (!workId) {
        console.error('❌ [章节加载] workId 不存在，无法加载章节内容');
        setChapterLoading(false);
        return;
      }
      const documentId = `work_${workId}_chapter_${chapterId}`;
      
      let content: string | null = null;
      
      // 关键优化：本地优先策略 - 优先使用本地缓存，避免不必要的服务器请求
      // 1. 先从本地存储缓存获取
      let cachedDoc: ShareDBDocument | null = null;
      
      try {
        console.log('🔍 [缓存检查] 从本地缓存获取，文档ID:', {
          documentId,
          chapterId,
          workId,
        });
        
        // 1.1 先从本地存储缓存获取
        cachedDoc = await localCacheManager.get<ShareDBDocument>(documentId);
        
        // 1.2 如果本地存储缓存没有，尝试从旧格式迁移
        if (!cachedDoc && documentId.startsWith('work_') && documentId.includes('_chapter_')) {
          const match = documentId.match(/work_(\d+)_chapter_(\d+)/);
          if (match) {
            const [, , chapterIdStr] = match;
            const oldFormatKey = `chapter_${chapterIdStr}`;
            const oldCached = await localCacheManager.get<ShareDBDocument>(oldFormatKey);
            
            if (oldCached) {
              console.log(`🔄 [loadChapterContent] 从旧格式迁移: ${oldFormatKey} -> ${documentId}`);
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
      } catch (cacheErr) {
        console.warn('⚠️ [loadChapterContent] 从缓存加载失败:', cacheErr);
      }
      
      // 验证缓存内容是否属于当前章节
      if (cachedDoc) {
        const cachedChapterId = cachedDoc.metadata?.chapter_id;
        if (cachedChapterId && cachedChapterId !== chapterId) {
          console.warn('⚠️ [缓存检查] 缓存内容属于其他章节，清除缓存:', {
            cachedChapterId,
            expectedChapterId: chapterId,
            documentId,
          });
          // 关键修复：不在非 sync/document 请求中直接操作缓存
          // 错误的缓存会在下次 getDocument 时被覆盖，或者通过 syncDocumentState 更新
          console.warn('⚠️ [缓存检查] 缓存内容属于其他章节，将在下次同步时更新');
          cachedDoc = null;
        }
      }
      
      if (cachedDoc) {
        // 统一格式：content 必须是字符串
        if (typeof cachedDoc.content === 'string' && cachedDoc.content.trim().length > 0) {
          content = cachedDoc.content;
          console.log('🔍 [loadChapterContent-调试] 从缓存获取到内容:', {
            chapterId,
            contentLength: content.length,
            timestamp: new Date().toISOString(),
          });
        } else if (typeof cachedDoc.content !== 'string') {
          console.warn('⚠️ [章节加载] 缓存内容格式错误，应为字符串:', typeof cachedDoc.content);
          // 关键修复：格式错误时不设置为空字符串，保持 content 为 null，让后续逻辑处理
          // content = ''; // 注释掉，避免空字符串导致编辑器被清空
        } else if (typeof cachedDoc.content === 'string' && cachedDoc.content.trim().length === 0) {
          console.warn('⚠️ [章节加载] 缓存内容为空字符串:', {
            chapterId,
            timestamp: new Date().toISOString(),
          });
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
      let docResult: any = null;
      const chapterIdStr = String(chapterId);
      const hasOutlineInCache = chaptersData[chapterIdStr]?.outline && chaptersData[chapterIdStr].outline.trim().length > 0;
      const hasDetailOutlineInCache = chaptersData[chapterIdStr]?.detailOutline && chaptersData[chapterIdStr].detailOutline.trim().length > 0;
      
      // 关键优化：本地优先策略 - 只有当缓存中完全没有大纲和细纲时，才从服务器获取
      // 避免频繁请求，优先使用已缓存的数据
      if (!hasOutlineInCache || !hasDetailOutlineInCache) {
        // 关键优化：不再自动从服务器获取，避免不必要的请求
        // 如果用户需要最新的大纲/细纲，可以通过手动刷新或编辑章节设置来获取
        console.log('ℹ️ [loadChapterContent] 缓存中没有大纲/细纲，跳过自动获取（本地优先策略）');

        try {
          // 更新章节的 outline 和 detailed_outline 到设置中
          if (docResult.chapter_info?.metadata) {
            const chapterIdStr = String(docResult.chapter_info.id);
            
            // 将对象格式的 outline 转换为字符串
            let outline = '';
            if (docResult.chapter_info.metadata.outline) {
              const outlineObj = docResult.chapter_info.metadata.outline as any;
              if (typeof outlineObj === 'object' && outlineObj !== null) {
                // 格式化大纲对象为可读字符串
                const parts: string[] = [];
                if (outlineObj.core_function) {
                  parts.push(`核心功能：${outlineObj.core_function}`);
                }
                if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
                  parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
                }
                if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
                  parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
                }
                if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
                  parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
                }
                if (outlineObj.hook) {
                  parts.push(`结尾钩子：${outlineObj.hook}`);
                }
                outline = parts.join('\n\n');
              } else if (typeof outlineObj === 'string') {
                outline = outlineObj;
              }
            }
            
            // 将对象格式的 detailed_outline 转换为字符串
            let detailedOutline = '';
            if (docResult.chapter_info.metadata.detailed_outline) {
              const detailedObj = docResult.chapter_info.metadata.detailed_outline as any;
              if (typeof detailedObj === 'object' && detailedObj !== null) {
                // 格式化细纲对象为可读字符串
                if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
                  detailedOutline = detailedObj.sections.map((section: any) => {
                    const sectionNum = section.section_number || '';
                    const sectionTitle = section.title || '';
                    const sectionContent = section.content || '';
                    return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
                  }).join('\n\n');
                } else {
                  detailedOutline = JSON.stringify(detailedObj, null, 2);
                }
              } else if (typeof detailedObj === 'string') {
                detailedOutline = detailedObj;
              }
            }
            
            // 更新 chaptersData 中的章节数据
            setChaptersData(prev => {
              const updated = { ...prev };
              if (updated[chapterIdStr]) {
                updated[chapterIdStr] = {
                  ...updated[chapterIdStr],
                  outline,
                  detailOutline: detailedOutline,
                };
              } else {
                // 如果章节数据不存在，创建新的数据
                const volNum = docResult.chapter_info.volume_number || 0;
                updated[chapterIdStr] = {
                  id: chapterIdStr,
                  volumeId: `vol${volNum}`,
                  volumeTitle: volNum === 0 ? '未分卷' : `第${volNum}卷`,
                  title: docResult.chapter_info.title,
                  chapter_number: docResult.chapter_info.chapter_number,
                  characters: [],
                  locations: [],
                  outline,
                  detailOutline: detailedOutline,
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
                    outline,
                    detailOutline: detailedOutline,
                  };
                }
                return prev;
              });
            }
          }
          
          // 3. 如果缓存中没有内容，从 docResult 中提取内容
          // 关键修复：如果 MongoDB 没有数据（document_exists 为 false），优先使用本地缓存
          // 修复判断逻辑：明确检查 document_exists 字段
          if (docResult) {
            // 关键修复：只有当 document_exists 明确为 true 时才认为 MongoDB 有数据
            // 如果 document_exists 为 false、undefined 或 null，都认为 MongoDB 没有数据
            const documentExists = (docResult as any).document_exists === true;
            
            // 统一格式：检查内容是否有效（content 必须是字符串）
            let hasContent = false;
            if (docResult.content && typeof docResult.content === 'string') {
              const trimmed = docResult.content.trim();
              hasContent = trimmed.length > 0 && !trimmed.startsWith('{"document_id"');
            } else if (docResult.content && typeof docResult.content !== 'string') {
              console.warn('⚠️ [loadChapterContent] docResult.content 格式错误，应为字符串:', typeof docResult.content);
            }
            
            const shouldUseLocalCache = !documentExists || (!content && !hasContent);
            
            console.log('🔍 [loadChapterContent] 检查是否需要使用本地缓存:', {
              documentExists,
              hasContent,
              hasLocalContent: !!content,
              shouldUseLocalCache,
              docResultContentType: typeof docResult.content,
              docResultContentPreview: typeof docResult.content === 'string' 
                ? docResult.content.substring(0, 100) 
                : 'object',
              docResultDocumentExists: (docResult as any).document_exists,
            });
            
            if (shouldUseLocalCache) {
              // MongoDB 没有数据或内容为空，尝试从本地缓存获取
              console.log('⚠️ [loadChapterContent] MongoDB 没有数据，尝试使用本地缓存:', {
                documentExists,
                hasDocResultContent: !!docResult.content,
                contentLength: typeof docResult.content === 'string' ? docResult.content.length : 0,
              });
              
                // 关键修复：只在 document 请求中进行缓存读取操作
                // 使用 getDocument 来获取缓存，它会自动处理缓存逻辑
                const localCached = await documentCache.getDocument(documentId);
                if (localCached && localCached.content) {
                  // 统一格式：content 必须是字符串
                  const localContent = typeof localCached.content === 'string' ? localCached.content : '';
                
                  if (localContent && localContent.trim().length > 0) {
                    console.log('✅ [loadChapterContent] 使用本地缓存内容:', {
                      documentId,
                      contentLength: localContent.length,
                      contentPreview: localContent.substring(0, 100),
                    });
                    content = localContent;
                    
                    // 关键修复：将本地缓存内容同步回 MongoDB，并传递 metadata
                    // 因为 MongoDB 没有数据，需要将本地缓存的内容写回服务器
                    try {
                      console.log('🔄 [loadChapterContent] 开始将本地缓存同步回 MongoDB...');
                      
                      // 获取缓存的 metadata（如果有）
                      const cachedMetadata = localCached.metadata || {};
                      
                      // 关键修复：只在 sync 请求中进行缓存操作
                      // 关键修复：添加验证函数，确保只有当前章节才会同步
                      const syncResult = await documentCache.syncDocumentState(
                        documentId,
                        localContent, // 使用本地缓存的内容
                        undefined, // contentJson 可以为 undefined
                        cachedMetadata, // 传递 metadata
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
                    
                    if (syncResult.success) {
                      console.log('✅ [loadChapterContent] 本地缓存已成功同步回 MongoDB:', {
                        documentId,
                        version: syncResult.version,
                      });
                    } else {
                      console.warn('⚠️ [loadChapterContent] 同步回 MongoDB 失败:', syncResult.error);
                    }
                  } catch (syncErr) {
                    console.error('❌ [loadChapterContent] 同步回 MongoDB 时出错:', syncErr);
                    // 即使同步失败，也继续使用本地缓存内容
                  }
                } else {
                  console.warn('⚠️ [loadChapterContent] 本地缓存也没有内容或内容为空');
                }
              } else {
                console.warn('⚠️ [loadChapterContent] 本地缓存不存在或没有内容');
              }
            } else {
              console.log('✅ [loadChapterContent] MongoDB 有数据，使用服务器内容');
              // 🔍 [调试] 检查此时 content 的状态
              console.log('🔍 [loadChapterContent-调试] MongoDB 有数据时的 content 状态:', {
                chapterId,
                hasContent: !!content,
                contentLength: content ? content.length : 0,
                contentPreview: content ? content.substring(0, 100) : 'N/A',
                timestamp: new Date().toISOString(),
              });
            }
          }
          
          // 关键修复：只有在 content 为 null 或空时才从 docResult 中提取内容
          // 如果已经从缓存获取到内容，不应该被 docResult 覆盖（除非 docResult 有有效内容）
          // 如果仍然没有内容，从 docResult 中提取内容（仅在 document_exists 为 true 时）
          if (!content && docResult && (docResult as any).document_exists === true && docResult.content) {
            console.log('🔍 [loadChapterContent-调试] 尝试从 docResult 获取内容（content 为空）:', {
              chapterId,
              hasDocResultContent: !!docResult.content,
              docResultContentType: typeof docResult.content,
              docResultContentLength: typeof docResult.content === 'string' ? docResult.content.length : 0,
              timestamp: new Date().toISOString(),
            });
            // 统一格式：content 必须是字符串
            if (typeof docResult.content === 'string') {
              if (docResult.content.trim().length > 0) {
                content = docResult.content;
                console.log('🔍 [loadChapterContent-调试] 从 docResult 获取到内容:', {
                  chapterId,
                  contentLength: docResult.content.length,
                  timestamp: new Date().toISOString(),
                });
              } else {
                console.warn('⚠️ [loadChapterContent] docResult.content 为空字符串:', {
                  chapterId,
                  timestamp: new Date().toISOString(),
                });
                // 关键修复：空字符串时不设置 content，保持为 null，让后续逻辑处理
                // content = ''; // 注释掉，避免空字符串导致编辑器被清空
              }
            } else {
              console.warn('⚠️ [loadChapterContent] docResult.content 格式错误，应为字符串:', typeof docResult.content);
              // 关键修复：格式错误时不设置为空字符串，保持 content 为 null，让后续逻辑处理
              // content = ''; // 注释掉，避免空字符串导致编辑器被清空
            }
            
            // 如果成功获取内容，保存到缓存（包含 outline 和 detailed_outline）
            if (content !== null && content.trim().length > 0) {
              if (!workId) {
                console.error('❌ [缓存] workId 不存在，无法保存到缓存');
                return;
              }
              const cacheKey = `work_${workId}_chapter_${chapterId}`;
              
              // 提取 outline 和 detailed_outline（如果存在）
              let outline = '';
              let detailedOutline = '';
              if (docResult.chapter_info?.metadata) {
                // 将对象格式的 outline 转换为字符串
                if (docResult.chapter_info.metadata.outline) {
                  const outlineObj = docResult.chapter_info.metadata.outline as any;
                  if (typeof outlineObj === 'object' && outlineObj !== null) {
                    const parts: string[] = [];
                    if (outlineObj.core_function) {
                      parts.push(`核心功能：${outlineObj.core_function}`);
                    }
                    if (outlineObj.key_points && Array.isArray(outlineObj.key_points)) {
                      parts.push(`关键情节点：\n${outlineObj.key_points.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`);
                    }
                    if (outlineObj.visual_scenes && Array.isArray(outlineObj.visual_scenes)) {
                      parts.push(`画面感：\n${outlineObj.visual_scenes.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`);
                    }
                    if (outlineObj.atmosphere && Array.isArray(outlineObj.atmosphere)) {
                      parts.push(`氛围：${outlineObj.atmosphere.join('、')}`);
                    }
                    if (outlineObj.hook) {
                      parts.push(`结尾钩子：${outlineObj.hook}`);
                    }
                    outline = parts.join('\n\n');
                  } else if (typeof outlineObj === 'string') {
                    outline = outlineObj;
                  }
                }
                
                // 将对象格式的 detailed_outline 转换为字符串
                if (docResult.chapter_info.metadata.detailed_outline) {
                  const detailedObj = docResult.chapter_info.metadata.detailed_outline as any;
                  if (typeof detailedObj === 'object' && detailedObj !== null) {
                    if (detailedObj.sections && Array.isArray(detailedObj.sections)) {
                      detailedOutline = detailedObj.sections.map((section: any) => {
                        const sectionNum = section.section_number || '';
                        const sectionTitle = section.title || '';
                        const sectionContent = section.content || '';
                        return `${sectionNum}. ${sectionTitle}\n${sectionContent}`;
                      }).join('\n\n');
                    } else {
                      detailedOutline = JSON.stringify(detailedObj, null, 2);
                    }
                  } else if (typeof detailedObj === 'string') {
                    detailedOutline = detailedObj;
                  }
                }
              }
              
              console.log('💾 保存到缓存（包含大纲和细纲）:', {
                cacheKey,
                contentLength: content.length,
                hasOutline: !!outline,
                hasDetailedOutline: !!detailedOutline,
              });
              
              // 关键修复：只在 sync 请求中进行缓存操作
              // 关键修复：添加验证函数，确保只有当前章节才会同步
              documentCache.syncDocumentState(
                cacheKey, 
                content, 
                undefined, 
                {
                  work_id: docResult.chapter_info.work_id,
                  chapter_id: docResult.chapter_info.id,
                  chapter_number: docResult.chapter_info.chapter_number,
                  title: docResult.chapter_info.title,
                  outline: outline || undefined,
                  detailed_outline: detailedOutline || undefined,
                },
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
              ).then(() => {
                // 保存成功
              }).catch(err => {
                console.error('❌ 保存到缓存失败:', err);
              });
            }
          } else {
            // 🔍 [调试] 记录为什么没有从 docResult 获取内容
            console.warn('⚠️ [loadChapterContent-调试] ShareDB 文档中没有内容:', {
              chapterId,
              hasContent: !!content,
              contentLength: content ? content.length : 0,
              hasDocResult: !!docResult,
              docResultDocumentExists: docResult ? (docResult as any).document_exists : undefined,
              hasDocResultContent: docResult ? !!docResult.content : false,
              docResultContentType: docResult && docResult.content ? typeof docResult.content : undefined,
              timestamp: new Date().toISOString(),
            });
            
            // 关键修复：如果此时 content 已经有值（从缓存获取），不应该被清空
            if (content && content.trim().length > 0) {
              console.log('✅ [loadChapterContent-调试] 保留从缓存获取的内容，不覆盖:', {
                chapterId,
                contentLength: content.length,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (docErr) {
          // 如果 ShareDB 失败，尝试从普通章节 API 获取（作为后备）
          // 注意：这个 API 不包含大纲和细纲，只用于获取内容
          if (!content) {
            try {
              const chapter = await chaptersApi.getChapter(chapterId);
              console.log('📥 从章节 API 获取（后备）:', {
                chapterId: chapter.id,
                hasContent: !!chapter.content,
                contentLength: chapter.content?.length || 0,
              });
              
              if (chapter.content) {
                content = chapter.content;
                if (!workId) {
                  console.error('❌ [缓存] workId 不存在，无法保存到缓存');
                  return;
                }
                const cacheKey = `work_${workId}_chapter_${chapterId}`;
                
                // 关键修复：只在 sync 请求中进行缓存操作
                // 关键修复：添加验证函数，确保只有当前章节才会同步
                documentCache.syncDocumentState(
                  cacheKey, 
                  chapter.content, 
                  undefined, 
                  {
                    work_id: chapter.work_id,
                    chapter_id: chapter.id,
                    chapter_number: chapter.chapter_number,
                    title: chapter.title,
                  },
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
                ).catch(err => console.error('保存到缓存失败:', err));
              }
            } catch (err) {
              console.error('❌ 从章节 API 获取也失败:', err);
            }
          }
        }
      }
      
      // 关键修复：在设置编辑器前，添加调试日志
      console.log('🎯 [loadChapterContent] 准备设置编辑器内容:', {
        hasContent: content !== null && content !== undefined,
        contentType: typeof content,
        contentLength: typeof content === 'string' ? content.length : 0,
        contentPreview: typeof content === 'string' ? content.substring(0, 100) : 'N/A',
        chapterId,
        documentId,
        isContentEmpty: content === null || content === '' || (typeof content === 'string' && content.trim() === ''),
        timestamp: new Date().toISOString(),
      });
      
      // 🔍 [调试] 检查内容状态
      if (content === null) {
        console.warn('⚠️ [loadChapterContent-调试] content 为 null，可能所有获取方法都失败了:', {
          chapterId,
          documentId,
          timestamp: new Date().toISOString(),
        });
      } else if (content === '') {
        console.warn('⚠️ [loadChapterContent-调试] content 为空字符串:', {
          chapterId,
          documentId,
          timestamp: new Date().toISOString(),
        });
      }
      
      // 关键修复：只有在 content 不为 null 且不为空字符串时才设置编辑器
      // 如果是空字符串，检查是否是同一章节重新加载，如果是则保留现有内容
      if (content !== null && content !== '') {
        // 关键修复：验证内容确实属于当前章节
        if (!workId) {
          console.error('❌ [章节加载] workId 不存在');
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
        console.log('🔍 [loadChapterContent-调试] 检查是否设置编辑器内容:', {
          chapterId,
          shouldSetContent,
          lastSetContentLength: lastSetContentRef.current.length,
          normalizedContentLength: normalizedContent.length,
          lastSetContentPreview: lastSetContentRef.current.substring(0, 50),
          normalizedContentPreview: normalizedContent.substring(0, 50),
          currentChapterIdRef: currentChapterIdRef.current,
          isSameContent: lastSetContentRef.current === normalizedContent,
          isSameChapter: currentChapterIdRef.current === chapterId,
          timestamp: new Date().toISOString(),
        });
        
        if (shouldSetContent) {
          // 🔍 [调试] 设置编辑器内容前的状态
          const editorContentBeforeSet = editor.getHTML();
          console.log('🔍 [loadChapterContent-调试] 设置编辑器内容前:', {
            chapterId,
            editorContentLength: editorContentBeforeSet.length,
            editorContentPreview: editorContentBeforeSet.substring(0, 100),
            normalizedContentLength: normalizedContent.length,
            normalizedContentPreview: normalizedContent.substring(0, 100),
            timestamp: new Date().toISOString(),
          });
          
          // 关键修复：设置内容时确保格式被正确解析和保留
          // TipTap 会自动规范化HTML，但我们需要确保格式信息不丢失
          editor.commands.setContent(normalizedContent, { 
            emitUpdate: false
          });
          
          // 🔍 [调试] 设置编辑器内容后的状态
          setTimeout(() => {
            const editorContentAfterSet = editor.getHTML();
            console.log('🔍 [loadChapterContent-调试] 设置编辑器内容后:', {
              chapterId,
              editorContentLength: editorContentAfterSet.length,
              editorContentPreview: editorContentAfterSet.substring(0, 100),
              normalizedContentLength: normalizedContent.length,
              normalizedContentPreview: normalizedContent.substring(0, 100),
              isContentEmpty: editorContentAfterSet.trim() === '<p></p>' || editorContentAfterSet.trim() === '',
              timestamp: new Date().toISOString(),
            });
            
            if (editorContentAfterSet.trim() === '<p></p>' || editorContentAfterSet.trim() === '') {
              console.error('❌ [loadChapterContent-调试] 设置编辑器内容后内容为空！', {
                chapterId,
                normalizedContentLength: normalizedContent.length,
                normalizedContentPreview: normalizedContent.substring(0, 200),
                timestamp: new Date().toISOString(),
              });
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
            console.log('🔍 [loadChapterContent-调试] 验证设置后的编辑器内容:', {
              chapterId,
              setContentLength: setContent.length,
              normalizedSetLength: normalizedSet.length,
              normalizedExpectedLength: normalizedExpected.length,
              setContentPreview: setContent.substring(0, 100),
              normalizedExpectedPreview: normalizedExpected.substring(0, 100),
              isContentEmpty: normalizedSet.length === 0,
              timestamp: new Date().toISOString(),
            });
            
            if (normalizedSet.length === 0 && normalizedExpected.length > 0) {
              console.error('❌ [设置编辑器-调试] 内容设置后为空，可能存在格式问题', {
                chapterId,
                expected: normalizedExpected.substring(0, 100),
                actual: normalizedSet,
                normalizedContent: normalizedContent.substring(0, 200),
                timestamp: new Date().toISOString(),
              });
            }
          }, 0);
          
          lastSetContentRef.current = normalizedContent; // 记录已设置的内容
          console.log('✅ [loadChapterContent-调试] 已设置编辑器内容并更新 lastSetContentRef:', {
            chapterId,
            contentLength: normalizedContent.length,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log('⏭️ [loadChapterContent-调试] 跳过设置编辑器内容（内容相同）:', {
            chapterId,
            lastSetContentLength: lastSetContentRef.current.length,
            normalizedContentLength: normalizedContent.length,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        // 如果 content 是 null（获取失败），设置空编辑器
        // 🔍 [调试] 记录为什么内容为 null
        console.warn('⚠️ [loadChapterContent-调试] 内容获取失败，设置空编辑器:', {
          chapterId,
          documentId,
          content,
          contentType: typeof content,
          timestamp: new Date().toISOString(),
          stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n'),
        });
        
        // 关键修复：在设置空编辑器前，检查是否是同一章节重新加载
        // 如果是同一章节，不应该清空编辑器，应该保留现有内容
        const currentEditorContent = editor.getHTML();
        if (!isChapterSwitch && currentEditorContent && currentEditorContent.trim() !== '<p></p>') {
          console.log('🔍 [loadChapterContent-调试] 同一章节重新加载且内容获取失败，保留编辑器现有内容:', {
            chapterId,
            currentContentLength: currentEditorContent.length,
            timestamp: new Date().toISOString(),
          });
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
    } catch (err) {
      console.error('加载章节内容失败（内层）:', err);
      // 即使所有方法都失败，也显示空内容，保证编辑器可用
      editor.commands.setContent('<p></p>');
      // 隐藏加载动画
      setChapterLoading(false);
      // 关键修复：确保在加载失败时也清除加载状态标记
      isChapterLoadingRef.current = false;
    }
  } catch (err) {
    console.error('加载章节内容失败（外层）:', err);
    // 即使所有方法都失败，也显示空内容，保证编辑器可用
    editor.commands.setContent('<p></p>');
    // 隐藏加载动画
    setChapterLoading(false);
    // 关键修复：确保在加载失败时也清除加载状态标记
    isChapterLoadingRef.current = false;
  }
}
