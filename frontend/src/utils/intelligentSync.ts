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

  const syncTimer = useRef<number | undefined>(undefined);
  const pollTimer = useRef<number | undefined>(undefined);
  const syncCheckTimer = useRef<number | undefined>(undefined);
  const lastSyncedContent = useRef<string>('');
  const lastSyncedVersion = useRef<number>(0);
  const syncInProgress = useRef<boolean>(false);
  const lastUserInputTime = useRef<number>(Date.now());
  const lastSyncTime = useRef<Date | null>(null);
  const documentStateRef = useRef<{ version: number; content: string } | null>(null);
  const appliedVersions = useRef<Set<number>>(new Set()); // 记录已应用的版本，避免重复应用
  
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
  }, [documentId, getCurrentContent, updateContent, onSyncSuccess, onSyncError, onCollaborativeUpdate, onContentChange]);

  /**
   * 轮询检查更新
   */
  const pollForUpdates = useCallback(async () => {
    if (!documentId) {
      
      return;
    }

    if (syncInProgress.current) {
      
      return;
    }

    try {
      // 关键修复：验证 documentId 格式，确保是当前章节的文档
      if (!documentId || documentId.trim() === '') {
        
        return;
      }
      
      // 关键修复：从 documentId 中提取章节ID，用于验证
      let expectedChapterId: number | null = null;
      if (documentId.startsWith('work_') && documentId.includes('_chapter_')) {
        const match = documentId.match(/work_\d+_chapter_(\d+)/);
        if (match) {
          expectedChapterId = parseInt(match[1]);
        }
      } else if (documentId.startsWith('chapter_')) {
        expectedChapterId = parseInt(documentId.replace('chapter_', ''));
      }
      
      
      // 获取服务器最新状态
      const serverDoc = await documentCache.getDocument(documentId);
      
      if (!serverDoc) {
        
        return;
      }

      // 关键修复：验证服务器文档是否属于当前章节
      if (expectedChapterId !== null) {
        const serverChapterId = serverDoc.metadata?.chapter_id;
        if (serverChapterId && serverChapterId !== expectedChapterId) {
          console.error('❌ [IntelligentSync] 严重错误：服务器文档属于其他章节！', {
            serverChapterId,
            expectedChapterId,
            documentId,
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
  }, [documentId, updateContent, userInputWindow, onCollaborativeUpdate, onContentChange]);

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
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
    }
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
    }
    if (syncCheckTimer.current) {
      clearTimeout(syncCheckTimer.current);
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

  // 移除 WebSocket 订阅，只使用轮询
  // 初始化轮询（主要更新方式）
  // 关键修复：使用 useRef 存储最新的 pollForUpdates，避免依赖项变化导致 useEffect 重新运行
  const pollForUpdatesRef = useRef(pollForUpdates);
  pollForUpdatesRef.current = pollForUpdates;

  useEffect(() => {
    // 关键修复：同时检查 enablePolling 和 documentId
    // 如果 documentId 为空，不启动轮询
    if (!enablePolling) {
      
      return;
    }

    if (!documentId || documentId.trim() === '') {
      
      return;
    }

    // 关键修复：清理之前的定时器，避免重复创建
    if (pollTimer.current) {
      
      clearInterval(pollTimer.current);
      pollTimer.current = undefined;
    }

    
    
    // 延迟执行第一次轮询，避免与章节加载冲突
    const firstPollDelay = setTimeout(() => {
      
      pollForUpdatesRef.current().catch(error => {
        console.error('[IntelligentSync] 第一次轮询失败:', error);
      });
    }, 2000); // 延迟2秒，让章节加载完成

    // 设置固定间隔轮询（轮询是主要更新方式）
    pollTimer.current = setInterval(() => {
      if (!documentId || documentId.trim() === '') {
        
        if (pollTimer.current) {
          clearInterval(pollTimer.current);
          pollTimer.current = undefined;
        }
        return;
      }
      
      pollForUpdatesRef.current().catch(error => {
        console.error('[IntelligentSync] 轮询失败:', error);
      });
    }, pollInterval); // 使用正常的轮询间隔

    return () => {
      
      clearTimeout(firstPollDelay);
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = undefined;
      }
    };
  }, [enablePolling, pollInterval, documentId]); // 移除 pollForUpdates 依赖，使用 ref

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

