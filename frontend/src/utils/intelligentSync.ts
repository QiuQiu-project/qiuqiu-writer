/**
 * 智能同步工具
 * 借鉴 nexcode_web 的 IntelligentSyncPlugin 实现
 * 提供防抖同步、轮询更新、冲突检测等功能
 */

import { useRef, useCallback, useEffect } from 'react';
// 关键修复：统一使用 documentCache，移除重复的缓存逻辑
import { documentCache } from './documentCache';

export interface IntelligentSyncOptions {
  /** 轮询间隔（毫秒），默认 10000ms */
  pollInterval?: number;
  /** 用户输入检测时间窗口（毫秒），默认 5000ms */
  userInputWindow?: number;
  /** 同步检查间隔（毫秒），默认 3000ms */
  syncCheckInterval?: number;
  /** 是否启用轮询，默认 true */
  enablePolling?: boolean;
  /** 同步回调 */
  onSyncSuccess?: (content: string, version: number) => void;
  /** 同步失败回调 */
  onSyncError?: (error: Error) => void;
  /** 协作更新回调 */
  onCollaborativeUpdate?: (hasUpdates: boolean) => void;
  /** 内容变化回调 */
  onContentChange?: (synced: boolean) => void;
}

export interface IntelligentSyncResult {
  /** 执行同步 */
  performSync: () => Promise<void>;
  /** 强制同步 */
  forceSync: () => Promise<void>;
  /** 停止同步 */
  stop: () => void;
  /** 获取同步状态 */
  getStatus: () => {
    isSyncing: boolean;
    lastSyncTime: Date | null;
    hasPendingChanges: boolean;
  };
}

/**
 * 智能同步 Hook
 * 提供防抖同步、轮询更新等功能
 */
export function useIntelligentSync(
  documentId: string,
  getCurrentContent: () => string,
  updateContent: (content: string) => void,
  options: IntelligentSyncOptions = {}
): IntelligentSyncResult {
  const {
    pollInterval = 5000,
    userInputWindow = 5000,
    syncCheckInterval = 3000,
    enablePolling = true,
    onSyncSuccess,
    onSyncError,
    onCollaborativeUpdate,
    onContentChange,
  } = options;

  // 关键修复：在浏览器环境中，setInterval 返回 number 类型
  const syncTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pollTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const syncCheckTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // 关键修复：使用 ref 存储最新的 documentId，确保轮询时使用最新值
  const documentIdRef = useRef(documentId);
  const lastSyncedContent = useRef<string>('');
  const lastSyncedVersion = useRef<number>(0);
  const syncInProgress = useRef<boolean>(false);
  const lastUserInputTime = useRef<number>(Date.now());
  const lastSyncTime = useRef<Date | null>(null);
  const documentStateRef = useRef<{ version: number; content: string } | null>(null);
  const appliedVersions = useRef<Set<number>>(new Set()); // 记录已应用的版本，避免重复应用
  const lastSyncTimestamp = useRef<number>(0); // 记录最后一次 sync 的时间戳，用于跳过 sync 后的轮询
  
  // 清理旧版本记录，避免内存泄漏
  const cleanupOldVersions = useCallback(() => {
    const currentVersion = lastSyncedVersion.current;
    // 只保留最近 10 个版本的记录
    if (appliedVersions.current.size > 10) {
      const versionsToKeep = Array.from(appliedVersions.current)
        .filter(v => v >= currentVersion - 10)
        .sort((a, b) => b - a)
        .slice(0, 10);
      appliedVersions.current = new Set(versionsToKeep);
      
    }
  }, []);

  /**
   * 执行同步
   */
  const performSync = useCallback(async () => {
    if (syncInProgress.current) {
      
      return;
    }

    const currentContent = getCurrentContent();
    if (!currentContent || currentContent === lastSyncedContent.current) {
      
      return;
    }

    syncInProgress.current = true;

    try {
      
      
      // 🔍 [调试] 智能同步调用 syncDocumentState
      console.log('🔍 [IntelligentSync] 调用 syncDocumentState:', {
        documentId,
        currentContentLength: currentContent.length,
        currentContentPreview: currentContent.substring(0, 100),
        timestamp: new Date().toISOString(),
      });
      
      // 使用 documentCache 的同步方法
      const result = await documentCache.syncDocumentState(documentId, currentContent);

      if (result.success) {
        // 同步成功，内容已保存到本地缓存
        const syncedContent = result.content;
        
        // 关键：检查版本是否已应用，避免重复应用
        if (appliedVersions.current.has(result.version)) {
          
          lastSyncedContent.current = syncedContent;
          lastSyncedVersion.current = result.version;
          return; // 避免重复应用
        }
        
        // 如果同步后的内容与本地不同（通常不会发生，因为只是保存到本地）
        if (syncedContent !== currentContent) {
                    
          // 检查用户是否正在编辑
          const now = Date.now();
          const timeSinceLastInput = now - lastUserInputTime.current;
          const userIsEditing = timeSinceLastInput < userInputWindow;
          
          if (!userIsEditing) {
            // 用户没有在编辑，更新内容
            
            updateContent(syncedContent);
            lastSyncedContent.current = syncedContent;
            appliedVersions.current.add(result.version); // 标记版本已应用
          } else {
            // 用户正在编辑，保留用户当前编辑的内容
            
            // 仍然更新 lastSyncedContent，但保留用户当前编辑的内容
            lastSyncedContent.current = syncedContent;
            appliedVersions.current.add(result.version); // 标记版本已应用
          }
        } else {
          // 内容相同
          lastSyncedContent.current = syncedContent;
          appliedVersions.current.add(result.version); // 标记版本已应用
        }
        
        lastSyncedVersion.current = result.version;
        lastSyncTime.current = new Date();
        // 关键优化：记录 sync 时间戳，用于跳过 sync 后的轮询
        lastSyncTimestamp.current = Date.now();
        
        // 关键优化：更新 documentStateRef，这样轮询时如果版本没有变化，就不会触发更新
        documentStateRef.current = {
          version: result.version,
          content: syncedContent
        };
        
        // 清理旧版本记录
        cleanupOldVersions();

        onSyncSuccess?.(syncedContent, result.version);
        onContentChange?.(true);
        
      } else {
        console.error('[IntelligentSync] 同步失败:', result.error);
        onSyncError?.(new Error(result.error || '同步失败'));
        onContentChange?.(false);
      }
    } catch (error) {
      console.error('[IntelligentSync] 同步错误:', error);
      onSyncError?.(error instanceof Error ? error : new Error('同步失败'));
      onContentChange?.(false);
    } finally {
      syncInProgress.current = false;
    }
  }, [documentId, getCurrentContent, updateContent, onSyncSuccess, onSyncError, onContentChange, cleanupOldVersions, userInputWindow]);

  /**
   * 轮询检查更新
   * 关键修复：使用 documentIdRef.current 而不是 documentId 参数，确保使用最新的 documentId
   */
  const pollForUpdates = useCallback(async () => {
    // 关键修复：使用 documentIdRef.current 获取最新的 documentId
    const currentDocumentId = documentIdRef.current;
    
    console.log('🔄 [pollForUpdates] 开始执行轮询:', {
      documentId: currentDocumentId,
      syncInProgress: syncInProgress.current,
      timestamp: new Date().toISOString(),
    });
    
    if (!currentDocumentId) {
      console.log('⏸️ [pollForUpdates] documentId 为空，跳过');
      return;
    }

    if (syncInProgress.current) {
      console.log('⏸️ [pollForUpdates] 同步正在进行中，跳过');
      return;
    }

    // 关键优化：如果刚刚完成 sync（3秒内），跳过轮询，避免重复请求
    // sync 操作已经返回了最新的版本号和内容，不需要立即再调用 document 请求
    const timeSinceLastSync = Date.now() - lastSyncTimestamp.current;
    const SYNC_COOLDOWN = 3000; // 3秒冷却时间
    if (timeSinceLastSync < SYNC_COOLDOWN) {
      console.log('⏸️ [pollForUpdates] 刚刚完成 sync，跳过轮询（避免重复请求）:', {
        timeSinceLastSync,
        cooldown: SYNC_COOLDOWN,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      // 关键修复：验证 documentId 格式，确保是当前章节的文档
      if (!currentDocumentId || currentDocumentId.trim() === '') {
        console.log('⏸️ [pollForUpdates] documentId 格式无效，跳过');
        return;
      }
      
      // 关键修复：从 documentId 中提取章节ID，用于验证
      let expectedChapterId: number | null = null;
      if (currentDocumentId.startsWith('work_') && currentDocumentId.includes('_chapter_')) {
        const match = currentDocumentId.match(/work_\d+_chapter_(\d+)/);
        if (match) {
          expectedChapterId = parseInt(match[1]);
        }
      } else if (currentDocumentId.startsWith('chapter_')) {
        expectedChapterId = parseInt(currentDocumentId.replace('chapter_', ''));
      }
      
      
      // 关键修复：使用 fetchFromServer 而不是 getDocument，避免重复请求
      // getDocument 会先检查本地缓存，然后才从服务器获取，可能导致重复请求
      // fetchFromServer 直接从服务器获取，有请求去重机制
      console.log('🔄 [IntelligentSync-pollForUpdates] 开始从服务器获取文档:', {
        documentId: currentDocumentId,
        timestamp: new Date().toISOString(),
      });
      const serverDoc = await documentCache.fetchFromServer(currentDocumentId);
      
      console.log('📥 [pollForUpdates] 获取到服务器文档:', {
        documentId: currentDocumentId,
        hasServerDoc: !!serverDoc,
        version: serverDoc?.version,
        contentLength: serverDoc?.content?.length || 0,
        timestamp: new Date().toISOString(),
      });
      
      if (!serverDoc) {
        console.log('⏸️ [pollForUpdates] 服务器文档为空，跳过');
        return;
      }

      // 关键修复：验证服务器文档是否属于当前章节
      if (expectedChapterId !== null) {
        const serverChapterId = serverDoc.metadata?.chapter_id as number | undefined;
        if (serverChapterId && serverChapterId !== expectedChapterId) {
          console.error('❌ [IntelligentSync] 严重错误：服务器文档属于其他章节！', {
            serverChapterId,
            expectedChapterId,
            documentId: currentDocumentId,
          });
          return; // 不更新，避免覆盖错误的内容
        }
      }



      const serverVersion = serverDoc.version || 0;
      const currentVersion = documentStateRef.current?.version || lastSyncedVersion.current;


      // 只有版本真正更新时才处理
      if (serverVersion > currentVersion) {
        // 关键：检查版本是否已应用，避免重复应用
        if (appliedVersions.current.has(serverVersion)) {
          
          return;
        }
        
        

        // 统一格式：content 必须是字符串
        const serverContent = typeof serverDoc.content === 'string' ? serverDoc.content : '';
        
        // 关键修复：统一使用 documentCache，缓存操作已在 getDocument 中完成
        // documentCache.currentVersion 和 currentContent 会在 getDocument 时自动更新
        
        documentStateRef.current = {
          version: serverVersion,
          content: serverContent
        };

        // 检查用户是否正在编辑
        const now = Date.now();
        const timeSinceLastInput = now - lastUserInputTime.current;
        const userIsEditing = timeSinceLastInput < userInputWindow;

        // serverContent 已经在上面定义了

        if (serverContent !== lastSyncedContent.current) {
          if (!userIsEditing) {
            // 用户没有在编辑，直接更新
            // 关键修复：updateContent 内部会验证章节ID，这里直接调用即可
            updateContent(serverContent);
            lastSyncedContent.current = serverContent;
            lastSyncedVersion.current = serverVersion;
            appliedVersions.current.add(serverVersion); // 标记版本已应用
            
          } else {
            // 用户正在编辑，标记有协作更新但不立即应用
            
            onCollaborativeUpdate?.(true);
            appliedVersions.current.add(serverVersion); // 标记版本已应用，避免重复
          }
        }

        onContentChange?.(true);
      } 
    } catch (error) {
      console.error('[IntelligentSync] 轮询失败:', error);
      onContentChange?.(false);
    }
  }, [updateContent, userInputWindow, onCollaborativeUpdate, onContentChange]);

  /**
   * 更新用户输入时间
   */
  const updateUserInputTime = useCallback(() => {
    lastUserInputTime.current = Date.now();
  }, []);

  /**
   * 启动同步检查
   */
  const startSyncCheck = useCallback(() => {
    if (syncCheckTimer.current) {
      clearTimeout(syncCheckTimer.current);
    }

    syncCheckTimer.current = setTimeout(() => {
      const currentContent = getCurrentContent();

      // 检查是否需要同步
      if (currentContent !== lastSyncedContent.current) {
        const contentDiff = Math.abs(currentContent.length - lastSyncedContent.current.length);
        const timeSinceLastInput = Date.now() - lastUserInputTime.current;

        // 只在用户停止编辑2秒后且内容有变化时同步
        if (timeSinceLastInput > 2000 && contentDiff > 0) {
          
          performSync().finally(() => {
            // 同步完成后，重新启动检查
            startSyncCheck();
          });
        } else {
          // 继续检查
          startSyncCheck();
        }
      } else {
        // 没有变化，继续检查
        startSyncCheck();
      }
    }, syncCheckInterval);
  }, [getCurrentContent, performSync, syncCheckInterval]);

  /**
   * 强制同步
   */
  const forceSync = useCallback(async () => {
    // 清除所有定时器
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
    }
    if (syncCheckTimer.current) {
      clearTimeout(syncCheckTimer.current);
    }

    // 立即执行同步
    await performSync();
  }, [performSync]);

  /**
   * 停止同步
   */
  const stop = useCallback(() => {
    console.log('🛑 [IntelligentSync] stop 被调用，清理所有定时器:', {
      hasSyncTimer: !!syncTimer.current,
      hasPollTimer: !!pollTimer.current,
      hasSyncCheckTimer: !!syncCheckTimer.current,
      documentId: documentIdRef.current,
      timestamp: new Date().toISOString(),
    });
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = undefined;
    }
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = undefined;
    }
    if (syncCheckTimer.current) {
      clearTimeout(syncCheckTimer.current);
      syncCheckTimer.current = undefined;
    }
  }, []);

  /**
   * 获取同步状态
   */
  const getStatus = useCallback(() => {
    return {
      isSyncing: syncInProgress.current,
      lastSyncTime: lastSyncTime.current,
      hasPendingChanges: getCurrentContent() !== lastSyncedContent.current,
    };
  }, [getCurrentContent]);

  // 关键修复：更新 documentIdRef，确保轮询时使用最新值
  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  // 移除 WebSocket 订阅，只使用轮询
  // 初始化轮询（主要更新方式）
  // 关键修复：使用 useRef 存储最新的 pollForUpdates，避免依赖项变化导致 useEffect 重新运行
  const pollForUpdatesRef = useRef(pollForUpdates);
  pollForUpdatesRef.current = pollForUpdates;

  useEffect(() => {
    // 关键修复：同时检查 enablePolling 和 documentId
    // 如果 documentId 为空，不启动轮询
    if (!enablePolling) {
      console.log('⏸️ [IntelligentSync] 轮询已禁用');
      return;
    }

    const currentDocumentId = documentIdRef.current;
    if (!currentDocumentId || currentDocumentId.trim() === '') {
      console.log('⏸️ [IntelligentSync] documentId 为空，不启动轮询:', {
        documentId: currentDocumentId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.log('🔄 [IntelligentSync] 启动轮询机制:', {
      documentId: currentDocumentId,
      pollInterval,
      timestamp: new Date().toISOString(),
    });

    // 关键修复：清理之前的定时器，避免重复创建
    if (pollTimer.current) {
      console.log('🧹 [IntelligentSync] 清理之前的轮询定时器');
      clearInterval(pollTimer.current);
      pollTimer.current = undefined;
    }

    
    
    // 关键修复：延迟执行第一次轮询，避免与章节加载冲突
    // 延迟时间改为10秒，与轮询间隔一致，避免打开章节时连续请求
    const firstPollDelay = setTimeout(() => {
      const docId = documentIdRef.current;
      console.log('🔄 [IntelligentSync] 执行第一次轮询:', {
        documentId: docId,
        timestamp: new Date().toISOString(),
      });
      if (docId && docId.trim() !== '') {
        pollForUpdatesRef.current().catch(error => {
          console.error('[IntelligentSync] 第一次轮询失败:', error);
        });
      }
    }, 10000); // 延迟10秒，与轮询间隔一致，避免打开章节时连续请求

    // 设置固定间隔轮询（轮询是主要更新方式）
    pollTimer.current = setInterval(() => {
      const docId = documentIdRef.current;
      if (!docId || docId.trim() === '') {
        console.log('⏸️ [IntelligentSync] documentId 为空，停止轮询');
        if (pollTimer.current) {
          clearInterval(pollTimer.current);
          pollTimer.current = undefined;
        }
        return;
      }
      
      console.log('🔄 [IntelligentSync] 执行定期轮询:', {
        documentId: docId,
        timestamp: new Date().toISOString(),
        pollTimerExists: !!pollTimer.current,
      });
      
      // 关键修复：确保轮询函数存在且定时器仍然有效
      if (pollForUpdatesRef.current && pollTimer.current) {
        pollForUpdatesRef.current().catch(error => {
          console.error('[IntelligentSync] 轮询失败:', error);
          // 关键修复：即使轮询失败，也不清理定时器，继续下一次轮询
        });
      } else {
        console.warn('⚠️ [IntelligentSync] 轮询函数或定时器不存在，重新启动轮询');
        // 如果定时器被意外清理，尝试重新启动（但这里不应该发生）
      }
    }, pollInterval); // 使用正常的轮询间隔


    return () => {
      console.log('🧹 [IntelligentSync] 清理轮询定时器:', {
        documentId: documentIdRef.current,
        hasPollTimer: !!pollTimer.current,
        timestamp: new Date().toISOString(),
        reason: 'useEffect cleanup',
      });
      clearTimeout(firstPollDelay);
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = undefined;
      }
    };
  }, [enablePolling, pollInterval, documentId]); // 当 documentId 变化时重新启动轮询

  // 关键修复：禁用自动同步检查，避免与 useChapterAutoSave 重复同步
  // useChapterAutoSave 已经负责了自动保存，useIntelligentSync 只负责轮询更新
  // useEffect(() => {
  //   startSyncCheck();
  //   return () => {
  //     if (syncCheckTimer.current) {
  //       clearTimeout(syncCheckTimer.current);
  //     }
  //   };
  // }, [startSyncCheck]);

  // 关键修复：禁用初始同步，避免与 useChapterAutoSave 重复同步
  // useEffect(() => {
  //   const initTimer = setTimeout(() => {
  //     const initialContent = getCurrentContent();
  //     if (initialContent && initialContent !== lastSyncedContent.current) {
  //       performSync();
  //     }
  //   }, 1000);
  //   return () => clearTimeout(initTimer);
  // }, [getCurrentContent, performSync]);

  // 监听用户输入事件
  useEffect(() => {
    const handleUserInput = () => {
      updateUserInputTime();
    };

    const events = ['mousedown', 'input', 'paste', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInput, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInput, true);
      });
    };
  }, [updateUserInputTime]);

  return {
    performSync,
    forceSync,
    stop,
    getStatus,
  };
}

