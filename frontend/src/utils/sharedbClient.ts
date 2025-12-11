/**
 * ShareDB 客户端封装
 * 处理文档的实时同步和协作
 * 借鉴 nexcode_web 的同步机制
 */

import { localCacheManager, type CacheItem } from './localCacheManager';
import { chaptersApi } from './chaptersApi';

export interface ShareDBDocument {
  document_id: string;
  content: any;
  version?: number;
  metadata?: {
    work_id?: number;
    chapter_id?: number;
    chapter_number?: number;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
  };
}

export interface ShareDBOperation {
  op: any[];
  v?: number;
  meta?: any;
}

export interface SyncResponse {
  success: boolean;
  version: number;
  content: string;
  operations: Array<{
    doc_id: string;
    version: number;
    operation: any;
    user_id: number;
    timestamp: string;
  }>;
  error?: string;
}

class ShareDBClient {
  private ws: WebSocket | null = null;
  private connection: any = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private wsUrl: string;
  private connected: boolean = false;
  private connectionCallbacks: Set<(connected: boolean) => void> = new Set();
  // 借鉴 nexcode_web 的同步机制
  private syncTimeout: NodeJS.Timeout | null = null;
  private isOnline: boolean = true;
  private pendingOperations: ShareDBOperation[] = [];
  private lastSyncTime: Date | null = null;
  private syncInProgress: boolean = false;
  private currentVersion: Map<string, number> = new Map();
  private currentContent: Map<string, string> = new Map();
  private pendingDocumentId: string | null = null;
  private subscribedDocumentId: string | null = null;
  private documentUpdateCallbacks: Map<string, Set<(content: string, version: number) => void>> = new Map();

  constructor(wsUrl?: string) {
    // 从环境变量或配置获取 WebSocket URL
    this.wsUrl = wsUrl || import.meta.env.VITE_SHAREDB_WS_URL || 'ws://localhost:8001/ws';
  }

  /**
   * 连接 ShareDB
   */
  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // 这里应该使用 ShareDB 客户端库
        // 为了简化，我们使用 WebSocket 直接连接
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log('ShareDB 连接成功');
          this.notifyConnectionChange(true);
          
          // 连接成功后，如果有待订阅的文档，自动订阅
          if (this.pendingDocumentId) {
            setTimeout(() => {
              this.subscribe(this.pendingDocumentId!);
              this.pendingDocumentId = null;
            }, 100);
          }
          
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error('ShareDB 连接错误:', error);
          this.connected = false;
          this.notifyConnectionChange(false);
          reject(error);
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.notifyConnectionChange(false);
          console.log('ShareDB 连接关闭');
          
          // 自动重连
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              this.connect().catch(console.error);
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.notifyConnectionChange(false);
  }

  /**
   * 获取文档（本地优先）
   */
  async getDocument(documentId: string): Promise<ShareDBDocument | null> {
    console.log('🔍 [ShareDB] 获取文档:', documentId);
    
    // 关键修复：总是先尝试从服务器获取最新版本
    // 这样可以避免用旧缓存覆盖服务器上的新数据
    // 但如果服务器没有数据，使用本地缓存（支持离线编辑）
    let serverDoc: ShareDBDocument | null = null;
    let serverFetchFailed = false;
    
    try {
      // 设置超时，避免阻塞太久
      const fetchPromise = this.fetchFromServer(documentId);
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => resolve(null), 2000) // 2秒超时
      );
      
      serverDoc = await Promise.race([fetchPromise, timeoutPromise]) as ShareDBDocument | null;
      
      if (serverDoc) {
        console.log('✅ [ShareDB] 从服务器获取到最新文档:', {
          version: serverDoc.version,
          contentLength: typeof serverDoc.content === 'string' ? serverDoc.content.length : 'not string'
        });
        
        // 初始化版本和内容缓存
        const contentStr = typeof serverDoc.content === 'string' ? serverDoc.content : JSON.stringify(serverDoc.content);
        this.currentVersion.set(documentId, serverDoc.version || 1);
        this.currentContent.set(documentId, contentStr);
        
        // 保存到本地缓存（异步，不阻塞）
        localCacheManager.set(documentId, serverDoc, serverDoc.version).catch(console.error);
        
        return serverDoc;
      } else {
        serverFetchFailed = true;
        console.warn('⚠️ [ShareDB] 从服务器获取文档超时或失败，尝试使用缓存');
      }
    } catch (error) {
      serverFetchFailed = true;
      console.warn('⚠️ [ShareDB] 从服务器获取文档失败，尝试使用缓存:', error);
    }
    
    // 如果服务器获取失败或没有数据，才使用本地缓存
    // 这样可以支持离线编辑，但需要确保本地内容已同步
    try {
      const cached = await localCacheManager.get<ShareDBDocument>(documentId);
      console.log('📦 [ShareDB] 从缓存获取文档（服务器获取失败或没有数据）:', {
        documentId,
        hasCached: !!cached,
        serverFetchFailed
      });
      
      if (cached) {
        // 处理不同的缓存格式
        let doc: ShareDBDocument | null = null;
        
        if (cached && typeof cached === 'object') {
          if ('document_id' in cached && 'content' in cached) {
            doc = cached as ShareDBDocument;
          } else if ('content' in cached) {
            doc = {
              document_id: documentId,
              content: (cached as any).content,
              version: (cached as any).version || 1,
              metadata: (cached as any).metadata,
            };
          } else {
            doc = {
              document_id: documentId,
              content: cached as any,
              version: 1,
              metadata: undefined,
            };
          }
        } else if (typeof cached === 'string') {
          doc = {
            document_id: documentId,
            content: cached,
            version: 1,
            metadata: undefined,
          };
        }
        
        if (doc) {
          // 初始化版本和内容缓存
          const contentStr = typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content);
          const cachedVersion = doc.version || 1;
          
          // 关键修复：如果使用了缓存（服务器获取失败），标记版本为更小的值
          // 这样可以强制在同步时检查服务器，避免用旧数据覆盖新数据
          // 但如果服务器确实没有数据，使用缓存版本（支持离线编辑）
          const adjustedVersion = serverFetchFailed ? Math.max(0, cachedVersion - 1) : cachedVersion;
          this.currentVersion.set(documentId, adjustedVersion);
          this.currentContent.set(documentId, contentStr);
          
          console.log('⚠️ [ShareDB] 使用缓存文档（服务器获取失败或没有数据）:', {
            documentId: doc.document_id,
            cachedVersion,
            adjustedVersion,
            contentLength: typeof doc.content === 'string' ? doc.content.length : 'not string',
            note: serverFetchFailed ? '版本已调整，同步时会强制检查服务器' : '使用缓存版本'
          });
          
          // 如果在线，立即尝试同步检查更新
          if (this.connected && serverFetchFailed) {
            // 异步同步，不阻塞返回
            this.syncDocument(documentId).catch(console.error);
          }
          
          return doc;
        }
      }
    } catch (error) {
      console.warn('⚠️ [ShareDB] 从缓存获取文档失败:', error);
    }

    return null;
  }

  /**
   * 更新文档（本地优先）
   */
  async updateDocument(
    documentId: string,
    content: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    console.log('💾 [ShareDB] 更新文档:', {
      documentId,
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
      metadata,
    });
    
    // 1. 立即更新本地缓存
    const existing = await localCacheManager.get<ShareDBDocument>(documentId);
    const version = existing?.version || (existing && 'version' in existing ? existing.version : 0) || 0;
    
    console.log('📦 [ShareDB] 现有缓存:', {
      exists: !!existing,
      version,
      existingType: existing ? typeof existing : 'null',
    });
    
    const updated: ShareDBDocument = {
      document_id: documentId,
      content,
      version: version + 1,
      metadata: metadata || (existing && 'metadata' in existing ? existing.metadata : undefined),
    };

    console.log('💾 [ShareDB] 保存到缓存:', {
      documentId,
      version: updated.version,
      contentLength: typeof updated.content === 'string' ? updated.content.length : JSON.stringify(updated.content).length,
    });
    
    await localCacheManager.set(documentId, updated, updated.version);
    
    // 更新版本和内容缓存
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    this.currentVersion.set(documentId, updated.version);
    this.currentContent.set(documentId, contentStr);
    
    console.log('✅ [ShareDB] 已保存到缓存:', documentId);

    // 2. 如果在线，使用防抖同步到服务器（借鉴 nexcode_web 的实现）
    if (this.isOnline) {
      // 使用防抖同步，避免频繁请求
      this.debouncedSync(documentId, contentStr, 1000).catch((error) => {
        console.error('同步到服务器失败:', error);
        // 失败时标记为待同步，稍后重试
      });
    }
  }

  /**
   * 创建文档
   */
  async createDocument(
    documentId: string,
    initialContent: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<ShareDBDocument> {
    const doc: ShareDBDocument = {
      document_id: documentId,
      content: initialContent,
      version: 1,
      metadata,
    };

    // 先保存到本地
    await localCacheManager.set(documentId, doc, doc.version);

    // 如果在线，同步到服务器
    if (this.connected) {
      try {
        await this.createOnServer(documentId, initialContent, metadata);
        localCacheManager.markAsSynced(documentId);
      } catch (error) {
        console.error('创建文档到服务器失败:', error);
      }
    }

    return doc;
  }

  /**
   * 删除文档
   */
  async deleteDocument(documentId: string): Promise<void> {
    // 从本地缓存删除
    await localCacheManager.delete(documentId);

    // 如果在线，从服务器删除
    if (this.connected) {
      try {
        await this.deleteOnServer(documentId);
      } catch (error) {
        console.error('从服务器删除文档失败:', error);
      }
    }
  }

  /**
   * 订阅文档变更
   */
  subscribe(
    documentId: string,
    callback: (doc: ShareDBDocument) => void
  ): () => void {
    // 实现文档变更订阅
    // 这里简化处理，实际应该使用 ShareDB 的订阅机制
    
    const unsubscribe = () => {
      // 取消订阅
    };

    return unsubscribe;
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 监听连接状态变化
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.add(callback);
    return () => {
      this.connectionCallbacks.delete(callback);
    };
  }

  // ========== 私有方法 ==========

  private async fetchFromServer(documentId: string): Promise<ShareDBDocument | null> {
    // 如果是章节文档，使用章节 API
    if (documentId.startsWith('chapter_')) {
      const chapterId = parseInt(documentId.replace('chapter_', ''));
      try {
        // 先尝试从章节 API 获取
        const chapter = await chaptersApi.getChapter(chapterId);
        if (chapter.content) {
          return {
            document_id: documentId,
            content: chapter.content,
            version: chapter.id, // 使用章节 ID 作为版本号
            metadata: {
              work_id: chapter.work_id,
              chapter_id: chapter.id,
              chapter_number: chapter.chapter_number,
            },
          };
        }
        
        // 如果章节 API 没有内容，尝试从 ShareDB 文档 API 获取
        const result = await chaptersApi.getChapterDocument(chapterId);
        let content: any = result.content;
        
        // 处理不同的内容格式
        if (typeof content === 'object' && content !== null) {
          if ('content' in content) {
            content = content.content;
          } else {
            content = JSON.stringify(content);
          }
        }
        
        return {
          document_id: documentId,
          content: content || '',
          version: result.chapter_info.id,
          metadata: {
            work_id: result.chapter_info.work_id,
            chapter_id: result.chapter_info.id,
            chapter_number: result.chapter_info.chapter_number,
          },
        };
      } catch (error) {
        console.error('获取章节文档失败:', error);
        return null;
      }
    }

    // 其他类型的文档可以通过通用 API 获取
    return null;
  }

  /**
   * 同步文档状态（借鉴 nexcode_web 的实现）
   * 使用统一的同步 API，支持版本控制和冲突处理
   * 
   * 策略：同步前先获取最新版本，避免覆盖其他用户的更改
   */
  async syncDocumentState(documentId: string, content: string): Promise<SyncResponse> {
    // 防止并发同步
    if (this.syncInProgress) {
      return {
        success: false,
        version: this.currentVersion.get(documentId) || 0,
        content: this.currentContent.get(documentId) || content,
        operations: [],
        error: 'sync_in_progress'
      };
    }

    this.syncInProgress = true;

    try {
      const currentVersion = this.currentVersion.get(documentId) || 0;
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      
      // 关键修复：同步前必须获取服务器最新版本，避免用旧数据覆盖新数据
      // 策略：总是先获取服务器文档，如果服务器版本更新，使用服务器内容作为baseContent
      let serverDoc: ShareDBDocument | null = null;
      let fetchFailed = false;
      let baseContent = this.currentContent.get(documentId) || '';
      
      try {
        // 设置超时，避免阻塞太久
        const fetchPromise = this.fetchFromServer(documentId);
        const timeoutPromise = new Promise<null>((resolve) => 
          setTimeout(() => resolve(null), 3000) // 3秒超时
        );
        
        serverDoc = await Promise.race([fetchPromise, timeoutPromise]) as ShareDBDocument | null;
        
        if (serverDoc) {
          const serverVersion = serverDoc.version || 0;
          const serverContent = typeof serverDoc.content === 'string' 
            ? serverDoc.content 
            : JSON.stringify(serverDoc.content);
          
          // 关键修复：如果服务器版本更新，说明有其他用户修改了
          // 必须使用服务器内容作为baseContent，而不是本地旧内容
          if (serverVersion > currentVersion) {
            console.log('⚠️ [同步] 检测到服务器版本更新，使用服务器内容作为baseContent:', {
              serverVersion,
              clientVersion: currentVersion,
              serverContentLength: serverContent.length,
              clientContentLength: contentStr.length,
              oldBaseContentLength: baseContent.length
            });
            
            // 使用服务器内容作为baseContent，确保不会丢失其他用户的更改
            baseContent = serverContent;
            
            // 更新本地版本号和内容
            this.currentVersion.set(documentId, serverVersion);
            this.currentContent.set(documentId, serverContent);
            
            // 关键修复：用户当前的content参数是基于旧版本的，不能直接使用
            // 需要通知编辑器更新内容，然后使用更新后的内容
            // 或者：使用服务器内容作为content（因为编辑器会更新）
            // 方案：通知编辑器更新，然后使用服务器内容作为content
            const callbacks = this.documentUpdateCallbacks.get(documentId);
            if (callbacks) {
              callbacks.forEach(callback => {
                try {
                  callback(serverContent, serverVersion);
                } catch (error) {
                  console.error('执行文档更新回调失败:', error);
                }
              });
            }
            
            // 关键修复：使用服务器内容作为content，因为用户的内容是基于旧版本的
            // 编辑器已经更新为服务器内容，所以应该使用服务器内容
            // 但用户可能还在编辑，所以需要等待编辑器更新完成
            // 简化方案：使用服务器内容，让编辑器更新后再同步用户的更改
            contentStr = serverContent;  // 使用服务器内容，避免基于旧版本的content导致合并错误
            console.log('⚠️ [同步] 使用服务器内容作为content，因为用户的内容是基于旧版本的');
          } else if (serverVersion === currentVersion && serverContent !== contentStr) {
            // 版本相同但内容不同，说明有并发修改
            console.log('⚠️ [同步] 检测到并发修改（版本相同但内容不同）:', {
              version: serverVersion,
              serverContentLength: serverContent.length,
              clientContentLength: contentStr.length
            });
            
            // 使用服务器内容作为baseContent，确保合并正确
            baseContent = serverContent;
          } else if (serverVersion === currentVersion && serverContent === contentStr) {
            // 版本和内容都相同，说明没有其他用户修改，可以使用本地baseContent
            console.log('✅ [同步] 服务器版本和内容与客户端一致，使用本地baseContent');
          } else {
            // 服务器版本更小（不应该发生，但处理一下）
            console.warn('⚠️ [同步] 服务器版本小于客户端版本（异常情况）:', {
              serverVersion,
              clientVersion: currentVersion
            });
          }
        } else {
          fetchFailed = true;
          console.warn('⚠️ [同步] 获取服务器文档超时或失败，使用本地baseContent（可能丢失数据）');
          // 如果获取失败，使用本地baseContent，但会在同步时使用保守版本号
        }
      } catch (error) {
        fetchFailed = true;
        console.warn('⚠️ [同步] 获取服务器文档失败，使用本地baseContent（可能丢失数据）:', error);
      }
      
      // 如果baseContent仍然为空，尝试从本地获取
      if (!baseContent) {
        try {
          const localDoc = await localCacheManager.get<ShareDBDocument>(documentId);
          if (localDoc && typeof localDoc === 'object' && 'content' in localDoc) {
            baseContent = typeof localDoc.content === 'string' 
              ? localDoc.content 
              : JSON.stringify(localDoc.content);
            console.log('📥 [同步] 从本地缓存初始化 baseContent:', {
              length: baseContent.length,
              preview: baseContent.substring(0, 100)
            });
          }
        } catch (error) {
          console.warn('⚠️ [同步] 从本地缓存获取baseContent失败:', error);
        }
      }
      
      // 关键修复：如果baseContent仍然为空，使用当前content作为baseContent
      // 这样可以确保后端能够正确合并
      if (!baseContent) {
        baseContent = contentStr;
        console.log('⚠️ [同步] baseContent为空，使用当前内容作为baseContent');
      }
      
      // 尝试使用统一的同步 API（如果后端支持）
      // 否则回退到原有的章节 API
      let response: SyncResponse;
      
      try {
        // 尝试使用统一的同步端点
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8001';
        const token = localStorage.getItem('access_token');
        
        // 关键改进：如果获取失败，使用更保守的版本号（减1），强制后端进行合并检查
        // 如果获取成功，使用已更新的版本号（因为可能已经更新了currentVersion）
        let syncVersion: number;
        if (serverDoc) {
          // 使用已更新的版本号（如果服务器版本更新，currentVersion已经更新）
          syncVersion = this.currentVersion.get(documentId) || serverDoc.version || currentVersion;
        } else if (fetchFailed) {
          // 获取失败时，使用更保守的版本号，强制后端合并
          syncVersion = Math.max(0, currentVersion - 1);
          console.log('⚠️ [同步] 使用保守版本号，强制后端合并检查:', syncVersion);
        } else {
          syncVersion = currentVersion;
        }
        
        console.log('📤 [同步] 发送差异同步:', {
          baseLength: baseContent.length,
          contentLength: contentStr.length,
          version: syncVersion,
          basePreview: baseContent.substring(0, 100),
          contentPreview: contentStr.substring(0, 100)
        });
        
        const syncResponse = await fetch(`${apiUrl}/v1/sharedb/documents/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            doc_id: documentId,
            version: syncVersion,  // 使用服务器的最新版本号
            content: contentStr,
            base_content: baseContent,  // 发送上次同步的内容，用于计算差异
            create_version: false
          })
        });

        if (syncResponse.ok) {
          const data = await syncResponse.json();
          response = data as SyncResponse;
          
          // 如果服务器返回的内容与客户端不同，说明发生了合并
          if (response.content !== contentStr) {
            console.log('✅ [同步] 服务器已合并内容:', {
              originalLength: contentStr.length,
              mergedLength: response.content.length,
              version: response.version
            });
          }
        } else {
          throw new Error('Sync API not available, falling back to chapter API');
        }
      } catch (error) {
        // 回退到原有的章节 API 同步方式
        console.log('使用章节 API 同步:', documentId);
        await this.syncToServer(documentId, content);
        
        // 构建响应对象
        response = {
          success: true,
          version: (serverDoc?.version || currentVersion) + 1,
          content: contentStr,
          operations: []
        };
      }
      
      if (response.success) {
        this.currentVersion.set(documentId, response.version);
        this.currentContent.set(documentId, response.content);
        this.lastSyncTime = new Date();
        this.isOnline = true;
        
        // 如果服务器返回的内容与客户端不同，说明发生了合并
        // 需要通知调用方更新内容
        if (response.content !== contentStr) {
          console.log('🔄 [同步] 检测到内容合并:', {
            originalLength: contentStr.length,
            mergedLength: response.content.length,
            version: response.version
          });
          
          // 触发文档更新回调，让编辑器应用合并后的内容
          const callbacks = this.documentUpdateCallbacks.get(documentId);
          if (callbacks) {
            callbacks.forEach(callback => {
              try {
                callback(response.content, response.version);
              } catch (error) {
                console.error('执行文档更新回调失败:', error);
              }
            });
          }
        }
        
        // 如果有缺失的操作，应用它们
        if (response.operations && response.operations.length > 0) {
          console.log('收到操作:', response.operations);
          // TODO: 应用操作到本地内容
        }
      } else {
        console.warn('同步失败:', response.error);
      }
      
      return response;
    } catch (error) {
      console.error('同步文档失败:', error);
      this.isOnline = false;
      
      // 返回当前本地状态作为降级
      return {
        success: false,
        version: this.currentVersion.get(documentId) || 0,
        content: content, // 使用客户端内容
        operations: [],
        error: 'network_error'
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * 防抖同步（借鉴 nexcode_web 的实现）
   */
  debouncedSync(documentId: string, content: string, delay: number = 1000): Promise<SyncResponse> {
    return new Promise((resolve, reject) => {
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }
      
      this.syncTimeout = setTimeout(async () => {
        try {
          const result = await this.syncDocumentState(documentId, content);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }

  /**
   * 强制同步（借鉴 nexcode_web 的实现）
   */
  async forceSyncWithServer(documentId: string): Promise<SyncResponse> {
    try {
      // 获取服务器最新状态
      const serverDoc = await this.getDocument(documentId);
      
      if (serverDoc) {
        const serverContent = typeof serverDoc.content === 'string' 
          ? serverDoc.content 
          : JSON.stringify(serverDoc.content);
        const serverVersion = serverDoc.version || 0;
        
        // 如果本地有未同步的内容，尝试同步
        const localContent = this.currentContent.get(documentId);
        if (localContent && localContent !== serverContent) {
          return await this.syncDocumentState(documentId, localContent);
        }
        
        // 更新本地状态
        this.currentVersion.set(documentId, serverVersion);
        this.currentContent.set(documentId, serverContent);
        
        console.log('强制同步成功');
        return {
          success: true,
          version: serverVersion,
          content: serverContent,
          operations: []
        };
      }
      
      throw new Error('无法获取服务器文档');
    } catch (error) {
      console.error('强制同步失败:', error);
      throw error;
    }
  }

  /**
   * 强制从服务器拉取最新内容（忽略本地缓存）
   * 用于手动刷新，获取服务器上的最新版本
   */
  async forcePullFromServer(documentId: string): Promise<ShareDBDocument | null> {
    console.log('🔄 [ShareDB] 强制从服务器拉取最新内容:', documentId);
    
    try {
      // 直接从服务器获取，忽略本地缓存
      const serverDoc = await this.fetchFromServer(documentId);
      
      if (serverDoc) {
        const serverContent = typeof serverDoc.content === 'string' 
          ? serverDoc.content 
          : JSON.stringify(serverDoc.content);
        const serverVersion = serverDoc.version || 1;
        
        // 更新本地状态
        this.currentVersion.set(documentId, serverVersion);
        this.currentContent.set(documentId, serverContent);
        
        // 更新本地缓存
        await localCacheManager.set(documentId, serverDoc, serverVersion);
        
        console.log('✅ [ShareDB] 强制拉取成功:', {
          version: serverVersion,
          contentLength: serverContent.length
        });
        
        // 通知编辑器更新内容
        const callbacks = this.documentUpdateCallbacks.get(documentId);
        if (callbacks) {
          callbacks.forEach(callback => {
            try {
              callback(serverContent, serverVersion);
            } catch (error) {
              console.error('执行文档更新回调失败:', error);
            }
          });
        }
        
        return serverDoc;
      }
      
      console.warn('⚠️ [ShareDB] 服务器上没有找到文档:', documentId);
      return null;
    } catch (error) {
      console.error('❌ [ShareDB] 强制拉取失败:', error);
      throw error;
    }
  }

  /**
   * 获取同步状态（借鉴 nexcode_web 的实现）
   */
  getSyncStatus(documentId?: string) {
    return {
      isOnline: this.isOnline,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      hasPendingOperations: this.pendingOperations.length > 0,
      pendingOperationsCount: this.pendingOperations.length,
      ...(documentId ? {
        currentVersion: this.currentVersion.get(documentId),
        currentContent: this.currentContent.get(documentId)
      } : {})
    };
  }

  private async syncToServer(
    documentId: string,
    content: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    // 支持新格式 work_X_chapter_Y 和旧格式 chapter_X
    let chapterId: number | null = null;
    
    if (documentId.startsWith('work_') && documentId.includes('_chapter_')) {
      // 新格式: work_X_chapter_Y
      const match = documentId.match(/work_\d+_chapter_(\d+)/);
      if (match) {
        chapterId = parseInt(match[1]);
      }
    } else if (documentId.startsWith('chapter_')) {
      // 旧格式: chapter_X
      chapterId = parseInt(documentId.replace('chapter_', ''));
    }
    
    if (chapterId && !isNaN(chapterId)) {
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      console.log('💾 [ShareDB] 同步到服务器:', {
        documentId,
        chapterId,
        contentLength: contentStr.length,
      });
      
      await chaptersApi.updateChapter(chapterId, {
        content: contentStr,
      });
      localCacheManager.markAsSynced(documentId);
      
      // 更新版本和内容缓存
      const currentVersion = this.currentVersion.get(documentId) || 0;
      this.currentVersion.set(documentId, currentVersion + 1);
      this.currentContent.set(documentId, contentStr);
      
      console.log('✅ [ShareDB] 已同步到服务器:', documentId);
    } else {
      console.warn('⚠️ [ShareDB] 无法解析章节ID:', documentId);
    }
  }

  private async createOnServer(
    documentId: string,
    initialContent: any,
    metadata?: ShareDBDocument['metadata']
  ): Promise<void> {
    // 创建文档到服务器
    // 这里应该调用后端 API
    if (documentId.startsWith('chapter_')) {
      // 章节文档的创建由章节创建流程处理
      return;
    }
  }

  private async deleteOnServer(documentId: string): Promise<void> {
    // 从服务器删除文档
    if (documentId.startsWith('chapter_')) {
      const chapterId = parseInt(documentId.replace('chapter_', ''));
      await chaptersApi.deleteChapter(chapterId);
    }
  }

  private async syncDocument(documentId: string): Promise<void> {
    // 从服务器同步文档更新
    const serverDoc = await this.fetchFromServer(documentId);
    if (serverDoc) {
      const localDoc = await localCacheManager.get<ShareDBDocument>(documentId);
      
      // 如果服务器版本更新，合并更新
      if (!localDoc || (serverDoc.version && serverDoc.version > localDoc.version)) {
        await localCacheManager.set(documentId, serverDoc, serverDoc.version);
      }
    }
  }

  /**
   * 订阅文档更新
   */
  subscribe(documentId: string, userId?: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // 如果 WebSocket 未连接，保存待订阅的文档ID
      this.pendingDocumentId = documentId;
      // 尝试连接
      this.connect().catch(console.error);
      return;
    }

    this.subscribedDocumentId = documentId;
    
    // 获取用户ID（从 localStorage 或其他地方）
    const finalUserId = userId || parseInt(localStorage.getItem('user_id') || '0');
    
    // 发送订阅消息
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      document_id: documentId,
      user_id: finalUserId
    }));
    
    console.log('📡 [ShareDB] 已订阅文档:', documentId);
  }

  /**
   * 取消订阅文档
   */
  unsubscribe(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.subscribedDocumentId) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        document_id: this.subscribedDocumentId
      }));
      this.subscribedDocumentId = null;
      console.log('📡 [ShareDB] 已取消订阅文档');
    }
  }

  /**
   * 监听文档更新
   */
  onDocumentUpdate(documentId: string, callback: (content: string, version: number) => void): () => void {
    if (!this.documentUpdateCallbacks.has(documentId)) {
      this.documentUpdateCallbacks.set(documentId, new Set());
    }
    this.documentUpdateCallbacks.get(documentId)!.add(callback);
    
    // 返回取消监听的函数
    return () => {
      const callbacks = this.documentUpdateCallbacks.get(documentId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.documentUpdateCallbacks.delete(documentId);
        }
      }
    };
  }

  /**
   * 应用操作到内容（增量更新）
   */
  private applyOperations(content: string, operations: any[]): string {
    let result = content;
    
    // 按位置从后往前排序，避免位置偏移问题
    const sortedOps = [...operations].sort((a, b) => {
      const posA = a.position || 0;
      const posB = b.position || 0;
      return posB - posA; // 从后往前
    });
    
    for (const op of sortedOps) {
      try {
        const pos = op.position || 0;
        
        switch (op.type) {
          case 'insert_text':
            // 插入文本
            const text = op.text || '';
            if (pos >= result.length) {
              result = result + text;
            } else {
              result = result.slice(0, pos) + text + result.slice(pos);
            }
            break;
            
          case 'delete_text':
            // 删除文本
            const length = op.length || 0;
            if (pos < result.length) {
              const endPos = Math.min(pos + length, result.length);
              result = result.slice(0, pos) + result.slice(endPos);
            }
            break;
            
          case 'replace_text':
            // 替换文本
            const replaceLength = op.length || 0;
            const replaceText = op.text || '';
            if (pos < result.length) {
              const endPos = Math.min(pos + replaceLength, result.length);
              result = result.slice(0, pos) + replaceText + result.slice(endPos);
            }
            break;
            
          default:
            console.warn('未知的操作类型:', op.type);
        }
      } catch (error) {
        console.error('应用操作失败:', error, op);
      }
    }
    
    return result;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      const messageType = message.type;
      
      console.log('📨 [ShareDB] 收到消息:', messageType, message);
      
      // 处理不同类型的消息
      switch (messageType) {
        case 'connected':
          console.log('✅ [ShareDB] WebSocket 连接已确认');
          break;
          
        case 'subscribed':
          console.log('✅ [ShareDB] 文档订阅成功:', message.document_id);
          break;
          
        case 'document_synced':
        case 'document_updated':
          // 处理文档更新消息（支持增量操作）
          const docId = message.document_id;
          const version = message.version;
          const operations = message.operations || [];
          const fullContent = message.full_content !== false; // 默认true，如果没有operations则使用完整内容
          const content = message.content;
          
          console.log('🔄 [ShareDB] 收到文档更新:', {
            docId,
            version,
            hasOperations: operations.length > 0,
            operationsCount: operations.length,
            hasFullContent: !!content,
            fullContent: fullContent
          });
          
          // 优先使用完整内容更新（更可靠）
          // 如果提供了完整内容，直接使用；否则尝试应用操作
          if (content !== undefined) {
            // 使用完整内容更新（推荐方式）
            console.log('📄 [ShareDB] 使用完整内容更新');
            this.currentVersion.set(docId, version);
            this.currentContent.set(docId, content);
            
            // 通知所有监听该文档的回调
            const callbacks = this.documentUpdateCallbacks.get(docId);
            if (callbacks) {
              callbacks.forEach(callback => {
                try {
                  callback(content, version);
                } catch (error) {
                  console.error('执行文档更新回调失败:', error);
                }
              });
            }
          } else if (operations.length > 0 && !fullContent) {
            // 如果没有完整内容，但有操作，尝试应用操作（增量更新）
            console.log('📝 [ShareDB] 应用增量操作:', operations.length, '个操作');
            let currentContent = this.currentContent.get(docId) || '';
            currentContent = this.applyOperations(currentContent, operations);
            this.currentVersion.set(docId, version);
            this.currentContent.set(docId, currentContent);
            
            // 通知所有监听该文档的回调
            const callbacks = this.documentUpdateCallbacks.get(docId);
            if (callbacks) {
              callbacks.forEach(callback => {
                try {
                  callback(currentContent, version);
                } catch (error) {
                  console.error('执行文档更新回调失败:', error);
                }
              });
            }
          } else {
            console.warn('⚠️ [ShareDB] 收到文档更新但没有内容和操作');
          }
          break;
          
        case 'pong':
          // 心跳响应
          break;
          
        case 'error':
          console.error('❌ [ShareDB] 服务器错误:', message.message);
          break;
          
        default:
          console.log('📨 [ShareDB] 未知消息类型:', messageType);
      }
    } catch (error) {
      console.error('处理 ShareDB 消息失败:', error);
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(callback => callback(connected));
  }

  /**
   * 检查连接状态（借鉴 nexcode_web 的实现）
   */
  async checkConnection(): Promise<boolean> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8001';
      const token = localStorage.getItem('access_token');
      
      // 简单的 ping 操作
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        signal: AbortSignal.timeout(5000)
      });
      
      this.isOnline = response.ok;
      
      // 重试待处理的操作
      if (this.pendingOperations.length > 0 && this.isOnline) {
        await this.retryPendingOperations();
      }
      
      return this.isOnline;
    } catch (error) {
      this.isOnline = false;
      return false;
    }
  }

  /**
   * 重试待处理的操作（借鉴 nexcode_web 的实现）
   */
  async retryPendingOperations(): Promise<void> {
    if (!this.isOnline || this.pendingOperations.length === 0) {
      return;
    }

    const operations = [...this.pendingOperations];
    this.pendingOperations = [];

    for (const operation of operations) {
      try {
        // TODO: 实现操作重试逻辑
        console.log('重试操作:', operation);
      } catch (error) {
        console.error('重试操作失败:', error);
        // 重新添加到待处理队列
        this.pendingOperations.push(operation);
      }
    }
  }

  /**
   * 清理资源（借鉴 nexcode_web 的实现）
   */
  destroy(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.pendingOperations = [];
    this.syncInProgress = false;
    this.currentVersion.clear();
    this.currentContent.clear();
    
    // 断开 WebSocket 连接
    this.disconnect();
  }
}

// 导出单例
export const sharedbClient = new ShareDBClient();

