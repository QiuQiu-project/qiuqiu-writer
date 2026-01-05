/**
 * 文档缓存和同步工具
 * 处理文档的本地缓存、服务器同步、版本管理等
 */

import { localCacheManager } from './localCacheManager';
import { chaptersApi } from './chaptersApi';
import type { ShareDBDocument, SyncResponse } from '../types/document';

/**
 * 文档缓存管理器
 * 提供文档的获取、更新、同步等功能
 */
export const documentCache = {
  // 版本和内容缓存
  currentVersion: new Map<string, number>(),
  currentContent: new Map<string, string>(),
  // 关键修复：保存上次同步的版本和内容，用于三路合并
  lastSyncedVersion: new Map<string, number>(),
  lastSyncedContent: new Map<string, string>(),
  // 请求去重：记录正在进行的请求，避免重复请求
  pendingRequests: new Map<string, Promise<any>>(),
  // 关键修复：防止重复同步的锁
  syncLocks: new Map<string, Promise<SyncResponse>>(),
  
  // 获取文档（本地优先策略：优先使用缓存，后台刷新）
  async getDocument(documentId: string): Promise<ShareDBDocument | null> {
    // 1. 优先从本地缓存获取（立即响应）
    try {
      let cached = await localCacheManager.get<ShareDBDocument>(documentId);
      
      // 关键修复：如果新格式缓存不存在，尝试从旧格式迁移
      if (!cached && documentId.startsWith('work_') && documentId.includes('_chapter_')) {
        const match = documentId.match(/work_(\d+)_chapter_(\d+)/);
        if (match) {
          const [, , chapterId] = match;
          const oldFormatKey = `chapter_${chapterId}`;
          const oldCached = await localCacheManager.get<ShareDBDocument>(oldFormatKey);
          
          if (oldCached) {
            console.log(`🔄 [DocumentCache] 从旧格式迁移: ${oldFormatKey} -> ${documentId}`);
            
            // 统一格式：content 必须是字符串
            const contentStr = typeof oldCached.content === 'string' ? oldCached.content : '';
            
            // 创建标准格式的缓存
            cached = {
              document_id: documentId,
              content: contentStr,
              version: oldCached.version || 1,
              metadata: oldCached.metadata || {},
            };
            
            // 保存到标准格式
            await localCacheManager.set(documentId, cached, cached.version || 1);
          }
        }
      }
      
      if (cached) {
        // 统一格式：content 必须是字符串
        if (typeof cached.content !== 'string') {
          console.warn('⚠️ [DocumentCache] 缓存内容格式错误，应为字符串:', typeof cached.content);
          cached.content = '';
          await localCacheManager.set(documentId, cached, cached.version || 1);
        }
        
        // 更新内存缓存
        documentCache.currentVersion.set(documentId, cached.version || 1);
        documentCache.currentContent.set(documentId, cached.content);
        
        console.log('✅ [DocumentCache] 从缓存加载文档（本地优先）:', documentId);
        
        // 后台异步刷新（不阻塞用户）
        this.refreshDocumentFromServer(documentId).catch(err => {
          console.warn('⚠️ [DocumentCache] 后台刷新文档失败:', err);
        });
        
        return cached;
      }
    } catch (error) {
      console.warn('⚠️ [DocumentCache] 从缓存获取文档失败:', error);
    }
    
    // 2. 缓存没有，从服务器获取
    const requestKey = documentId.includes('_chapter_') 
      ? `chapter_doc_${documentId.match(/work_\d+_chapter_(\d+)/)?.[1] || ''}`
      : `chapter_doc_${documentId.replace('chapter_', '')}`;
    
    // 如果已经有相同章节的请求正在进行，等待该请求完成
    if (documentCache.pendingRequests.has(requestKey)) {
      try {
        const existingResult = await documentCache.pendingRequests.get(requestKey);
        if (existingResult) {
          // 转换为 ShareDBDocument 格式（统一格式：content 必须是字符串）
          const content = typeof existingResult.content === 'string' 
            ? existingResult.content 
            : '';
          const doc: ShareDBDocument = {
            document_id: documentId,
            content: content,
            version: existingResult.chapter_info?.id || 1,
            metadata: {
              work_id: existingResult.chapter_info?.work_id,
              chapter_id: existingResult.chapter_info?.id,
              chapter_number: existingResult.chapter_info?.chapter_number,
              outline: existingResult.chapter_info?.metadata?.outline,
              detailed_outline: existingResult.chapter_info?.metadata?.detailed_outline,
            },
          };
          // 更新内存缓存
          documentCache.currentVersion.set(documentId, doc.version || 1);
          documentCache.currentContent.set(documentId, doc.content);
          await localCacheManager.set(documentId, doc, doc.version || 1).catch(console.error);
          return doc;
        }
      } catch (error) {
        console.warn('⏳ [DocumentCache] 等待中的请求失败:', error);
      }
    }
    
    // 从服务器获取最新版本
    let serverDoc: ShareDBDocument | null = null;
    
    try {
      const fetchPromise = documentCache.fetchFromServer(documentId);
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => resolve(null), 2000)
      );
      
      serverDoc = await Promise.race([fetchPromise, timeoutPromise]) as ShareDBDocument | null;
      
      if (serverDoc) {
        // 根据 document_exists 字段判断是否更新缓存
        // 如果 document_exists 为 false，说明 MongoDB 没有数据，不应该覆盖本地缓存
        const documentExists = serverDoc.document_exists !== false;
        // 统一格式：content 必须是字符串
        const contentStr = typeof serverDoc.content === 'string' ? serverDoc.content : '';
        
        if (!documentExists) {
          console.log('⚠️ [getDocument] MongoDB 没有数据（document_exists=false），不覆盖本地缓存，尝试使用本地缓存');
          
          // 当 document_exists=false 时，将本地缓存内容同步回服务器
          try {
            const localCached = await localCacheManager.get<ShareDBDocument>(documentId);
            if (localCached && localCached.content) {
              // 统一格式：content 必须是字符串
              const localContent = typeof localCached.content === 'string' ? localCached.content : '';
              
              if (localContent && localContent.trim().length > 0) {
                console.log('🔄 [getDocument] 开始将本地缓存同步回 MongoDB...');
                
                // 关键修复：复用保存按钮的请求逻辑（syncDocumentState）
                // 注意：当 document_exists=false 时，需要确保版本号正确
                // 如果 localVersion 为 0，syncDocumentState 会使用 0，后端会创建新文档
                try {
                  // 确保版本号正确：如果缓存中有版本号，使用它；否则使用 0（后端会创建新文档）
                  const localVersion = localCached.version || 0;
                  
                  // 关键修复：如果版本号为 0，需要确保 currentVersion 也被设置为 0
                  // 这样 syncDocumentState 才能正确传递版本号
                  if (localVersion === 0) {
                    documentCache.currentVersion.set(documentId, 0);
                  } else {
                    // 如果缓存中有版本号，也要更新内存中的版本号
                    documentCache.currentVersion.set(documentId, localVersion);
                  }
                  
                  console.log('📤 [getDocument] 准备同步，版本号:', {
                    documentId,
                    localVersion,
                    cachedVersion: localCached.version,
                    currentVersionInMemory: documentCache.currentVersion.get(documentId),
                    contentLength: localContent.length,
                    contentPreview: localContent.substring(0, 100),
                  });
                  
                  const syncResult = await documentCache.syncDocumentState(
                    documentId,
                    localContent,
                    undefined // contentJson 可以为 undefined
                  );
                  
                  console.log('📥 [getDocument] 同步结果:', {
                    success: syncResult.success,
                    version: syncResult.version,
                    error: syncResult.error,
                    hasContent: !!syncResult.content,
                    contentLength: typeof syncResult.content === 'string' ? syncResult.content.length : 0,
                  });
                  
                  if (syncResult.success) {
                    console.log('✅ [getDocument] 本地缓存已成功同步回 MongoDB:', {
                      documentId,
                      version: syncResult.version,
                      contentLength: localContent.length,
                    });
                    
                    // 同步成功后，更新 serverDoc 的内容为本地缓存内容
                    serverDoc.content = localContent;
                    serverDoc.document_exists = true; // 同步后，文档已存在
                    serverDoc.version = syncResult.version;
                    
                    // 关键修复：移除验证逻辑，避免额外的 document 请求
                    // 验证会在下次轮询时自动进行，不需要立即验证
                    // setTimeout(async () => {
                    //   try {
                    //     const verifyDoc = await documentCache.fetchFromServer(documentId);
                    //     if (verifyDoc && verifyDoc.document_exists === true) {
                    //       console.log('✅ [getDocument] 验证成功：MongoDB 中已存在文档');
                    //     } else {
                    //       console.warn('⚠️ [getDocument] 验证失败：MongoDB 中仍然没有文档');
                    //     }
                    //   } catch (verifyErr) {
                    //     console.warn('⚠️ [getDocument] 验证时出错:', verifyErr);
                    //   }
                    // }, 1000);
                  } else {
                    console.warn('⚠️ [getDocument] 同步回 MongoDB 失败:', syncResult.error);
                    // 关键修复：如果同步失败，打印完整的错误信息
                    console.error('❌ [getDocument] 同步失败详情:', {
                      documentId,
                      error: syncResult.error,
                      version: syncResult.version,
                      contentLength: localContent.length,
                    });
                  }
                } catch (syncErr) {
                  console.error('❌ [getDocument] 同步回 MongoDB 时出错:', syncErr);
                  // 打印完整的错误信息
                  if (syncErr instanceof Error) {
                    console.error('错误详情:', {
                      message: syncErr.message,
                      stack: syncErr.stack,
                    });
                  }
                  // 即使同步失败，也继续使用本地缓存内容
                }
              }
            }
          } catch (syncErr) {
            console.error('❌ [getDocument] 同步回 MongoDB 时出错:', syncErr);
          }
          
          // 不保存空内容到缓存，继续使用本地缓存
        } else {
          // document_exists 为 true，正常保存到缓存
          const previousVersion = documentCache.currentVersion.get(documentId);
          
          // 关键修复：如果这是第一次获取文档，保存为 lastSynced 版本
          // 这样下次同步时可以使用它作为 base_content
          if (!previousVersion || previousVersion === 0) {
            documentCache.lastSyncedVersion.set(documentId, serverDoc.version || 1);
            documentCache.lastSyncedContent.set(documentId, contentStr);
          }
          
          documentCache.currentVersion.set(documentId, serverDoc.version || 1);
          documentCache.currentContent.set(documentId, contentStr);
          
          await localCacheManager.set(documentId, serverDoc, (serverDoc.version || 1)).catch(console.error);
        }
        
        return serverDoc;
      } else {
        console.warn('⚠️ [DocumentCache] 从服务器获取文档超时或失败，尝试使用缓存');
      }
    } catch (error) {
      console.warn('⚠️ [DocumentCache] 从服务器获取文档失败，尝试使用缓存:', error);
    }
    
    // 如果服务器获取失败，使用本地缓存
    try {
      let cached = await localCacheManager.get<ShareDBDocument>(documentId);
      
      // 关键修复：如果新格式缓存不存在，尝试从旧格式迁移
      if (!cached && documentId.startsWith('work_') && documentId.includes('_chapter_')) {
        const match = documentId.match(/work_(\d+)_chapter_(\d+)/);
        if (match) {
          const [, , chapterId] = match;
          const oldFormatKey = `chapter_${chapterId}`;
          const oldCached = await localCacheManager.get<ShareDBDocument>(oldFormatKey);
          
          if (oldCached) {
            console.log(`🔄 [DocumentCache] 从旧格式迁移: ${oldFormatKey} -> ${documentId}`);
            
            // 统一格式：content 必须是字符串
            const contentStr = typeof oldCached.content === 'string' ? oldCached.content : '';
            
            // 创建标准格式的缓存
            cached = {
              document_id: documentId,
              content: contentStr,
              version: oldCached.version || 1,
              metadata: oldCached.metadata || {},
            };
            
            // 保存到标准格式
            await localCacheManager.set(documentId, cached, cached.version || 1);
          }
        }
      }
      
      if (cached) {
        // 统一格式：content 必须是字符串
        if (typeof cached.content !== 'string') {
          console.warn('⚠️ [DocumentCache] 缓存内容格式错误，应为字符串:', typeof cached.content);
          cached.content = '';
          await localCacheManager.set(documentId, cached, cached.version || 1);
        }
        
        documentCache.currentVersion.set(documentId, cached.version || 1);
        documentCache.currentContent.set(documentId, cached.content);
        return cached;
      }
    } catch (error) {
      console.error('从缓存获取文档失败:', error);
    }

    return null;
  },
  
  // 更新文档（保存到本地缓存）
  async updateDocument(
    documentId: string,
    content: string,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    
    // 🔍 [调试] 缓存修改操作
    console.log('🔍 [updateDocument-缓存操作] 开始更新缓存:', {
      documentId,
      contentLength: content.length,
      contentPreview: content.substring(0, 100),
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : [],
      timestamp: new Date().toISOString(),
      stackTrace: new Error().stack?.split('\n').slice(0, 8).join('\n'),
    });
    
    // 统一格式：content 必须是字符串
    const contentToSave = typeof content === 'string' ? content : '';
    
    const existing = await localCacheManager.get<ShareDBDocument>(documentId);
    
    // 关键优化：如果内容没有变化，不更新版本号，只更新 metadata（如果提供了）
    if (existing && existing.content === contentToSave) {
      // 检查 metadata 是否有变化
      if (metadata) {
        const metadataChanged = JSON.stringify(existing.metadata || {}) !== JSON.stringify(metadata);
        if (metadataChanged) {
          existing.metadata = { ...existing.metadata, ...metadata };
          await localCacheManager.set(documentId, existing, existing.version || 1);
          console.log('📝 [updateDocument-缓存操作] 内容未变化，只更新 metadata:', {
            documentId,
            version: existing.version,
            metadataKeys: Object.keys(metadata),
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log('⏭️ [updateDocument-缓存操作] 内容和 metadata 都未变化，跳过更新:', {
            documentId,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        console.log('⏭️ [updateDocument-缓存操作] 内容未变化且无 metadata 更新，跳过:', {
          documentId,
          timestamp: new Date().toISOString(),
        });
      }
      return; // 内容没有变化，直接返回，避免不必要的更新
    }
    
    // 内容有变化，正常更新
    const version = existing?.version || 0;
    const updated: ShareDBDocument = {
      document_id: documentId,
      content: contentToSave, // 只保存字符串内容
      version: version + 1,
      metadata: metadata || existing?.metadata,
    };

    await localCacheManager.set(documentId, updated, updated.version || 1);
    
    documentCache.currentVersion.set(documentId, updated.version || 1);
    documentCache.currentContent.set(documentId, contentToSave);
    
    console.log('💾 [updateDocument-缓存操作] 内容已更新到缓存:', {
      documentId,
      oldVersion: version,
      newVersion: updated.version,
      contentLength: contentToSave.length,
      contentPreview: contentToSave.substring(0, 100),
      timestamp: new Date().toISOString(),
      stackTrace: new Error().stack?.split('\n').slice(0, 8).join('\n'),
    });
  },
  
  // 同步文档状态（保存到本地缓存并同步到服务器）
  // contentJson: 可选的 TipTap JSON 格式内容，用于更精确的段落级合并
  // metadata: 可选的 metadata，用于同步章节信息
  // verifyCurrentChapter: 可选的验证函数，用于验证是否是当前章节
  async syncDocumentState(
    documentId: string, 
    content: string, 
    contentJson?: any, 
    metadata?: any,
    verifyCurrentChapter?: (documentId: string) => boolean
  ): Promise<SyncResponse> {
    // 🔍 [调试] 检查内容是否为空
    if (!content || content.trim() === '' || content.trim() === '<p></p>') {
      console.warn('⚠️ [syncDocumentState] 内容为空，跳过同步:', {
        documentId,
        content,
        contentLength: content?.length || 0,
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n'),
      });
      // 返回一个表示跳过的响应，但不抛出错误
      return {
        success: false,
        version: documentCache.currentVersion.get(documentId) || 0,
        content: content,
        operations: [],
        error: '内容为空，跳过同步',
      };
    }
    
    // 关键修复：验证是否是当前章节，如果不是，跳过同步
    if (verifyCurrentChapter && !verifyCurrentChapter(documentId)) {
      console.warn('⚠️ [syncDocumentState] 不是当前章节，跳过同步:', {
        documentId,
        contentLength: content.length,
        timestamp: new Date().toISOString(),
      });
      // 返回一个表示跳过的响应，但不抛出错误
      return {
        success: false,
        version: documentCache.currentVersion.get(documentId) || 0,
        content: content,
        operations: [],
        error: '不是当前章节，跳过同步',
      };
    }
    
    // 关键修复：防止重复同步 - 如果同一个文档正在同步，等待之前的同步完成
    const existingSync = documentCache.syncLocks.get(documentId);
    if (existingSync) {
      console.warn('⚠️ [syncDocumentState] 检测到重复同步请求，等待之前的同步完成:', {
        documentId,
        contentLength: content.length,
        timestamp: new Date().toISOString(),
      });
      return existingSync;
    }
    
    const localVersion = documentCache.currentVersion.get(documentId) || 0;
    // 关键修复：直接使用传入的 content 参数（编辑器界面上的实际内容），而不是缓存中的内容
    // 这样可以确保保存的是用户当前编辑的内容，而不是可能过时的缓存内容
    const contentToSave = content;
    
    // 创建同步 Promise 并存储到锁中
    const syncPromise = (async (): Promise<SyncResponse> => {
      try {
        // 🔍 [调试] sync 请求中的缓存操作
        console.log('🔍 [syncDocumentState-缓存操作] 开始同步并更新缓存:', {
          documentId,
          localVersion,
          contentLength: contentToSave.length,
          contentPreview: contentToSave.substring(0, 100),
          hasMetadata: !!metadata,
          metadataKeys: metadata ? Object.keys(metadata) : [],
          timestamp: new Date().toISOString(),
          stackTrace: new Error().stack?.split('\n').slice(0, 8).join('\n'),
        });

        // 统一格式：contentToSave 必须是字符串
        // 先保存到本地缓存（使用 updateDocument，它会检查内容是否变化）
        // 这样可以在同步前确保本地有备份，同时避免重复更新
        await documentCache.updateDocument(documentId, contentToSave, metadata);

        // 关键修复：调用后端 ShareDB 同步接口（使用编辑器内容）
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';
        const token = localStorage.getItem('access_token');
        
        try {
          // 关键修复：验证内容不为空（空字符串也是有效内容，但需要确保不是 undefined 或 null）
          if (contentToSave === null || contentToSave === undefined) {
            console.error('❌ [DocumentCache] 内容为 null 或 undefined，无法保存');
            throw new Error('内容不能为 null 或 undefined');
          }
          
          // 关键修复：同时提供 HTML 和 JSON 格式，后端可以使用 JSON 格式进行更精确的段落级合并
          // 关键修复：如果提供了 metadata，也传递给后端
          const requestBody: any = {
            doc_id: documentId,
            version: localVersion,
            content: contentToSave, // HTML 格式（用于兼容）
            // 如果提供了 JSON 格式，直接以对象形式发送给后端（不转换为字符串）
            content_json: contentJson || undefined,
            // 关键修复：提供 base_version 和 base_content，用于三路合并
            // 这样可以正确计算差异，避免新内容插入到旧内容前面
            base_version: documentCache.lastSyncedVersion.get(documentId) || undefined,
            base_content: documentCache.lastSyncedContent.get(documentId) || undefined,
            base_content_json: undefined, // 如果 base_content 是 JSON 格式，这里可以传入
            create_version: false,
            // 关键修复：传递 metadata 到后端
            metadata: metadata || undefined,
          };
          
          // 关键修复：记录发送的内容信息，用于调试
          console.log('📤 [DocumentCache] 发送同步请求:', {
            documentId,
            version: localVersion,
            contentLength: contentToSave.length,
            contentType: typeof contentToSave,
            contentPreview: contentToSave.substring(0, 200),
            hasContentJson: !!contentJson,
            hasMetadata: !!metadata,
            metadataKeys: metadata ? Object.keys(metadata) : [],
            requestBody: {
              doc_id: requestBody.doc_id,
              version: requestBody.version,
              contentLength: requestBody.content?.length || 0,
              hasBaseVersion: !!requestBody.base_version,
              hasBaseContent: !!requestBody.base_content,
              hasMetadata: !!requestBody.metadata,
              metadataKeys: requestBody.metadata ? Object.keys(requestBody.metadata) : [],
            },
          });
          
          const syncResponse = await fetch(`${API_BASE_URL}/v1/sharedb/documents/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': token ? `Bearer ${token}` : '',
            },
            body: JSON.stringify(requestBody),
          });

          console.log('📥 [DocumentCache] 同步响应状态:', {
            status: syncResponse.status,
            statusText: syncResponse.statusText,
            ok: syncResponse.ok,
          });

          if (!syncResponse.ok) {
            const errorText = await syncResponse.text();
            console.error('❌ [DocumentCache] 同步失败，响应内容:', errorText);
            throw new Error(`同步失败: ${syncResponse.status} ${syncResponse.statusText} - ${errorText}`);
          }

          const result = await syncResponse.json();
          
          console.log('📥 [DocumentCache] 同步响应结果:', {
            success: result.success,
            version: result.version,
            contentLength: result.content?.length || 0,
            error: result.error,
          });
          
          if (result.success) {
            // 统一格式：result.content 必须是字符串
            const resultContent = typeof result.content === 'string' ? result.content : '';
            
            // 关键修复：保存上次同步的版本和内容，用于下次同步时的三路合并
            const previousVersion = documentCache.currentVersion.get(documentId) || 0;
            const previousContent = documentCache.currentContent.get(documentId) || '';
            
            // 更新当前版本和内容
            documentCache.currentVersion.set(documentId, result.version);
            documentCache.currentContent.set(documentId, resultContent);
            
            // 保存上次同步的版本和内容（用于三路合并）
            if (previousVersion > 0 && previousContent) {
              documentCache.lastSyncedVersion.set(documentId, previousVersion);
              documentCache.lastSyncedContent.set(documentId, previousContent);
            }
            
            // 关键优化：只更新版本号和内容，不重新保存整个文档（避免重复更新）
            // 如果缓存存在，只更新版本号和内容；如果不存在，创建新文档
            const existingDoc = await localCacheManager.get<ShareDBDocument>(documentId);
            
            if (existingDoc) {
              // 关键修复：确保 existingDoc.content 是字符串（如果它是对象，说明缓存已损坏，需要修复）
              // 统一格式：确保 content 是字符串
              if (typeof existingDoc.content !== 'string') {
                console.warn('⚠️ [syncDocumentState] 检测到 existingDoc.content 格式错误，修复为字符串');
                existingDoc.content = resultContent;
              }
              
              // 只更新版本号和内容，保留原有的 metadata
              existingDoc.version = result.version;
              existingDoc.content = resultContent; // 使用服务器返回的合并后内容
              await localCacheManager.set(documentId, existingDoc, result.version);
            } else {
              // 如果缓存不存在，创建新文档
              const newDoc: ShareDBDocument = {
                document_id: documentId,
                content: resultContent,
                version: result.version,
                metadata: undefined,
              };
              await localCacheManager.set(documentId, newDoc, result.version);
            }
            
            // 关键修复：确保 metadata 被正确保存，并记录日志
            const finalDoc = existingDoc || await localCacheManager.get<ShareDBDocument>(documentId);
            console.log('✅ [DocumentCache] 已更新本地缓存:', {
              documentId,
              version: result.version,
              contentLength: resultContent.length, // 关键修复：使用 resultContent 而不是 result.content
              hasMetadata: !!finalDoc?.metadata,
              metadataKeys: finalDoc?.metadata ? Object.keys(finalDoc.metadata) : [],
            });
            
            console.log('✅ [DocumentCache] 已同步到服务器:', {
              documentId,
              version: result.version,
              previousVersion,
              hasBaseContent: !!documentCache.lastSyncedContent.get(documentId),
            });

            return {
              success: true,
              version: result.version,
              content: resultContent, // 关键修复：返回字符串内容，而不是可能的对象
              operations: result.operations || [],
              work: result.work,  // 传递作品信息（如果存在）
              chapter: result.chapter,  // 传递章节信息（如果存在）
            };
          } else {
            throw new Error(result.error || '同步失败');
          }
      } catch (syncError) {
        console.warn('⚠️ [DocumentCache] 同步到服务器失败，但已保存到本地缓存:', syncError);
        // 关键修复：即使服务器同步失败，也要确保本地缓存已更新
        // 重新读取本地缓存，确保内容已保存
        const savedDoc = await localCacheManager.get<ShareDBDocument>(documentId);
        if (savedDoc) {
          // 统一格式：确保 content 是字符串
          if (typeof savedDoc.content !== 'string') {
            console.warn('⚠️ [syncDocumentState] 检测到缓存内容格式错误，正在修复');
            savedDoc.content = contentToSave;
            await localCacheManager.set(documentId, savedDoc, savedDoc.version || localVersion);
          } else if (savedDoc.content !== contentToSave) {
            // 确保本地缓存中的内容是最新的编辑器内容
            savedDoc.content = contentToSave;
            await localCacheManager.set(documentId, savedDoc, savedDoc.version || localVersion);
            console.log('✅ [DocumentCache] 已更新本地缓存（同步失败后的修复）:', {
              documentId,
              contentLength: contentToSave.length,
            });
          }
        }
        // 即使服务器同步失败，也返回成功（因为已保存到本地）
        return {
          success: true,
          version: documentCache.currentVersion.get(documentId) || localVersion,
          content: contentToSave, // 返回编辑器内容
          operations: [],
        };
      }
      } catch (error) {
        console.error('❌ [DocumentCache] 保存失败:', error);
        return {
          success: false,
          version: localVersion,
          content: contentToSave, // 返回编辑器内容
          operations: [],
          error: error instanceof Error ? error.message : String(error)
        };
      } finally {
        // 同步完成后移除锁
        documentCache.syncLocks.delete(documentId);
      }
    })();
    
    documentCache.syncLocks.set(documentId, syncPromise);
    return syncPromise;
  },
  
  // 强制从服务器拉取
  async forcePullFromServer(documentId: string): Promise<ShareDBDocument | null> {
    // 关键修复：不要删除本地缓存，因为如果 MongoDB 没有数据，我们需要使用本地缓存
    // 只清除内存缓存，保留本地存储缓存
    // await localCacheManager.delete(documentId); // 注释掉，避免删除本地缓存
    documentCache.currentVersion.delete(documentId);
    documentCache.currentContent.delete(documentId);
    
    // 直接调用 fetchFromServer，而不是 getDocument（getDocument 会先检查本地缓存）
    // 这样可以确保从服务器获取最新数据，但如果服务器没有数据，fetchFromServer 会使用本地缓存
    return await documentCache.fetchFromServer(documentId);
  },
  
  // 从服务器获取文档（回退到章节 API）
  async fetchFromServer(documentId: string): Promise<ShareDBDocument | null> {
    let chapterId: number | null = null;
    
    if (documentId.startsWith('chapter_')) {
      chapterId = parseInt(documentId.replace('chapter_', ''));
    } else if (documentId.startsWith('work_') && documentId.includes('_chapter_')) {
      const match = documentId.match(/work_\d+_chapter_(\d+)/);
      if (match) {
        chapterId = parseInt(match[1]);
      }
    }
    
    if (!chapterId || isNaN(chapterId)) {
      return null;
    }

    // 请求去重：如果已经有相同章节的请求正在进行，等待该请求完成
    const requestKey = `chapter_doc_${chapterId}`;
    if (documentCache.pendingRequests.has(requestKey)) {
      
      try {
        const existingResult = await documentCache.pendingRequests.get(requestKey);
        // 将结果转换为 ShareDBDocument 格式（统一格式：content 必须是字符串）
        if (existingResult) {
          const content = typeof existingResult.content === 'string' ? existingResult.content : '';
          return {
            document_id: documentId,
            content: content,
            version: existingResult.chapter_info?.id || chapterId,
            metadata: {
              work_id: existingResult.chapter_info?.work_id,
              chapter_id: existingResult.chapter_info?.id || chapterId,
              chapter_number: existingResult.chapter_info?.chapter_number,
              outline: existingResult.chapter_info?.metadata?.outline,
              detailed_outline: existingResult.chapter_info?.metadata?.detailed_outline,
            },
          };
        }
      } catch (error) {
        console.warn('等待中的请求失败:', error);
      }
    }

    try {
      // 创建请求并记录
      console.log('📡 [fetchFromServer] 发起 document 请求:', {
        documentId,
        chapterId,
        requestKey,
        timestamp: new Date().toISOString(),
        stackTrace: new Error().stack?.split('\n').slice(0, 5).join('\n'),
      });
      const requestPromise = chaptersApi.getChapterDocument(chapterId);
      documentCache.pendingRequests.set(requestKey, requestPromise);
      
      const result = await requestPromise;
      console.log('✅ [fetchFromServer] document 请求完成:', {
        documentId,
        chapterId,
        hasContent: !!result?.content,
        contentLength: result?.content?.length || 0,
        timestamp: new Date().toISOString(),
      });
      
      // 请求完成后移除
      documentCache.pendingRequests.delete(requestKey);
      
      // 关键修复：如果 MongoDB 没有数据（document_exists 为 false 或 content 为空），使用本地缓存
      // 修复判断逻辑：明确检查 document_exists 字段
      const documentExists = (result as any).document_exists === true; // 只有当明确为 true 时才认为存在
      let content: any = result.content;
      
      // 关键修复：检查内容是否有效
      // 如果 document_exists 为 false，或者 content 为空字符串，都认为 MongoDB 没有有效数据
      const hasValidContent = content && 
        (typeof content === 'string' ? content.trim().length > 0 : true);
      
      // 如果 MongoDB 没有数据或内容为空，尝试从本地缓存获取
      const shouldUseLocalCache = !documentExists || !hasValidContent;
      
      if (shouldUseLocalCache) {
        console.log('⚠️ [fetchFromServer] MongoDB 没有数据，尝试使用本地缓存:', {
          documentId,
          documentExists,
          hasValidContent,
          contentLength: typeof content === 'string' ? content.length : 0,
          contentType: typeof content,
        });
        
        const localCached = await localCacheManager.get<ShareDBDocument>(documentId);
        if (localCached && localCached.content) {
          // 统一格式：content 必须是字符串
          const localContent = typeof localCached.content === 'string' ? localCached.content : '';
          
          if (localContent && localContent.trim().length > 0) {
            console.log('✅ [fetchFromServer] 使用本地缓存内容:', {
              documentId,
              contentLength: localContent.length,
            });
            content = localContent;
            // 如果使用了本地缓存，document_exists 仍然保持为 false
            // 这样后续逻辑可以知道 MongoDB 没有数据，需要同步
          }
        }
      }
      
      // 统一格式：确保 content 是字符串
      if (typeof content !== 'string') {
        content = '';
      }
      
      // 将纯文本转换为 HTML 格式（保留换行符）
      const convertTextToHtml = (text: string): string => {
        if (!text || text.trim() === '') {
          return '<p></p>';
        }
        // 如果已经是 HTML 格式（包含标签），直接返回
        if (text.includes('<') && text.includes('>')) {
          return text;
        }
        // 将纯文本转换为 HTML：换行符转换为段落
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
      
      // 确保内容是字符串，并转换为 HTML 格式
      const htmlContent = convertTextToHtml(typeof content === 'string' ? content : (content || ''));
      
      // 关键修复：传递 document_exists 信息
      const serverDocumentExists = (result as any).document_exists === true;
      
      const serverDoc: ShareDBDocument = {
        document_id: documentId,
        content: htmlContent,
        version: result.chapter_info?.id || chapterId,
        document_exists: serverDocumentExists,
        metadata: {
          work_id: result.chapter_info?.work_id,
          chapter_id: result.chapter_info?.id || chapterId,
          chapter_number: result.chapter_info?.chapter_number,
          outline: result.chapter_info?.metadata?.outline,
          detailed_outline: result.chapter_info?.metadata?.detailed_outline,
        },
      };
      
      // 关键修复：确保从服务器获取的数据被缓存（如果服务器有数据）
      if (serverDocumentExists && htmlContent && htmlContent.trim().length > 0) {
        try {
          await localCacheManager.set(documentId, {
            ...serverDoc,
            cached_at: new Date().toISOString(),
          }, serverDoc.version || 1);
          console.log('✅ [DocumentCache] 已缓存服务器文档:', documentId);
          
          // 更新版本号
          documentCache.currentVersion.set(documentId, serverDoc.version || 1);
          documentCache.currentContent.set(documentId, htmlContent);
        } catch (error) {
          console.warn('⚠️ [DocumentCache] 缓存服务器文档失败:', error);
        }
      }
      
      return serverDoc;
    } catch (error) {
      console.error('❌ [DocumentCache] 从章节 API 获取文档失败:', error);
      return null;
    }
  },

  /**
   * 后台刷新文档（不阻塞用户）
   * 从服务器获取最新版本并更新缓存
   */
  async refreshDocumentFromServer(documentId: string): Promise<void> {
    try {
      const serverDoc = await this.fetchFromServer(documentId);
      
      if (serverDoc) {
        // 根据 document_exists 字段判断是否更新缓存
        const documentExists = serverDoc.document_exists !== false;
        const contentStr = typeof serverDoc.content === 'string' ? serverDoc.content : '';
        
        if (documentExists && contentStr && contentStr.trim().length > 0) {
          // 服务器有数据，更新缓存
          const previousVersion = documentCache.currentVersion.get(documentId);
          
          // 只有服务器版本更新时才更新缓存
          const serverVersion = serverDoc.version || 1;
          if (!previousVersion || serverVersion > previousVersion) {
            documentCache.lastSyncedVersion.set(documentId, serverVersion);
            documentCache.lastSyncedContent.set(documentId, contentStr);
            documentCache.currentVersion.set(documentId, serverVersion);
            documentCache.currentContent.set(documentId, contentStr);
            
            await localCacheManager.set(documentId, serverDoc, serverVersion).catch(console.error);
            console.log('✅ [DocumentCache] 后台刷新成功，已更新缓存:', {
              documentId,
              version: serverVersion,
              contentLength: contentStr.length,
            });
          } else {
            console.log('ℹ️ [DocumentCache] 服务器版本未更新，跳过缓存更新:', {
              documentId,
              cachedVersion: previousVersion,
              serverVersion,
            });
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ [DocumentCache] 后台刷新失败:', error);
    }
  },
};

