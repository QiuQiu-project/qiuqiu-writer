/**
 * 智能同步工具
 * 借鉴 nexcode_web 的 IntelligentSyncPlugin 实现
 * 提供防抖同步、轮询更新、冲突检测等功能
 */

import { useRef, useCallback, useEffect } from 'react';
import { sharedbClient, type ShareDBDocument } from './sharedbClient';

export interface IntelligentSyncOptions {
  /** 同步防抖延迟（毫秒），默认 1000ms */
  syncDebounceDelay?: number;
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
    syncDebounceDelay = 1000,
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
      console.log('[IntelligentSync] 清理旧版本记录，保留:', versionsToKeep);
    }
  }, []);

  /**
   * 执行同步
   */
  const performSync = useCallback(async () => {
    if (syncInProgress.current) {
      console.log('[IntelligentSync] 同步已在进行中，跳过');
      return;
    }

    const currentContent = getCurrentContent();
    if (!currentContent || currentContent === lastSyncedContent.current) {
      console.log('[IntelligentSync] 内容未变化，跳过同步');
      return;
    }

    syncInProgress.current = true;

    try {
      console.log('[IntelligentSync] 开始同步，内容长度:', currentContent.length);
      
      // 使用 sharedbClient 的同步方法
      const result = await sharedbClient.syncDocumentState(documentId, currentContent);

      if (result.success) {
        // 重要：使用服务器返回的合并后的内容
        const mergedContent = result.content;
        
        // 关键：检查版本是否已应用，避免重复应用
        if (appliedVersions.current.has(result.version)) {
          console.log('⚠️ [IntelligentSync] 版本已应用，跳过:', result.version);
          lastSyncedContent.current = mergedContent;
          lastSyncedVersion.current = result.version;
          return; // 避免重复应用
        }
        
        // 如果服务器返回的内容与本地不同，说明发生了合并
        if (mergedContent !== currentContent) {
          console.log('🔄 [IntelligentSync] 检测到内容合并:', {
            originalLength: currentContent.length,
            mergedLength: mergedContent.length,
            version: result.version
          });
          
          // 检查用户是否正在编辑
          const now = Date.now();
          const timeSinceLastInput = now - lastUserInputTime.current;
          const userIsEditing = timeSinceLastInput < userInputWindow;
          
          if (!userIsEditing) {
            // 用户没有在编辑，立即应用合并后的内容
            console.log('✅ [IntelligentSync] 应用合并后的内容');
            updateContent(mergedContent);
            lastSyncedContent.current = mergedContent;
            appliedVersions.current.add(result.version); // 标记版本已应用
            onCollaborativeUpdate?.(true);
          } else {
            // 用户正在编辑，标记有协作更新但不立即应用
            console.log('⏸️ [IntelligentSync] 用户正在编辑，延迟应用合并内容');
            onCollaborativeUpdate?.(true);
            // 仍然更新 lastSyncedContent，但保留用户当前编辑的内容
            // 用户停止编辑后会自动同步
            lastSyncedContent.current = mergedContent;
            appliedVersions.current.add(result.version); // 标记版本已应用
          }
        } else {
          // 内容相同，没有合并
          lastSyncedContent.current = mergedContent;
          appliedVersions.current.add(result.version); // 标记版本已应用
        }
        
        lastSyncedVersion.current = result.version;
        lastSyncTime.current = new Date();
        
        // 清理旧版本记录
        cleanupOldVersions();

        onSyncSuccess?.(mergedContent, result.version);
        onContentChange?.(true);
        console.log('[IntelligentSync] 同步成功，版本:', result.version);
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
      console.log('[IntelligentSync] 文档ID为空，跳过轮询');
      return;
    }

    if (syncInProgress.current) {
      console.log('[IntelligentSync] 同步进行中，跳过轮询');
      return;
    }

    try {
      // 关键修复：验证 documentId 格式，确保是当前章节的文档
      if (!documentId || documentId.trim() === '') {
        console.log('[IntelligentSync] 文档ID为空，跳过轮询');
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
      
      console.log('[IntelligentSync] 开始轮询，文档ID:', documentId, '章节ID:', expectedChapterId);
      // 获取服务器最新状态
      const serverDoc = await sharedbClient.getDocument(documentId);
      
      if (!serverDoc) {
        console.log('[IntelligentSync] 服务器文档不存在:', documentId);
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

      console.log('[IntelligentSync] 获取到服务器文档:', {
        documentId,
        version: serverDoc.version,
        contentLength: typeof serverDoc.content === 'string' ? serverDoc.content.length : JSON.stringify(serverDoc.content).length
      });

      const serverVersion = serverDoc.version || 0;
      const currentVersion = documentStateRef.current?.version || lastSyncedVersion.current;

      console.log('[IntelligentSync] 版本比较:', {
        serverVersion,
        currentVersion,
        documentStateVersion: documentStateRef.current?.version,
        lastSyncedVersion: lastSyncedVersion.current
      });

      // 只有版本真正更新时才处理
      if (serverVersion > currentVersion) {
        // 关键：检查版本是否已应用，避免重复应用
        if (appliedVersions.current.has(serverVersion)) {
          console.log('⚠️ [IntelligentSync] 轮询检测到版本已应用，跳过:', serverVersion);
          return;
        }
        
        console.log('[IntelligentSync] 检测到新版本，立即更新缓存:', serverVersion);

        const serverContent = typeof serverDoc.content === 'string' 
          ? serverDoc.content 
          : JSON.stringify(serverDoc.content);
        
        // 关键修复：立即更新 sharedbClient 的缓存
        sharedbClient.currentVersion.set(documentId, serverVersion);
        sharedbClient.currentContent.set(documentId, serverContent);
        console.log('✅ [IntelligentSync] 已更新 sharedbClient 缓存:', {
          version: serverVersion,
          contentLength: serverContent.length
        });

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
            console.log('[IntelligentSync] 应用协作更新');
          } else {
            // 用户正在编辑，标记有协作更新但不立即应用
            console.log('[IntelligentSync] 用户正在编辑，延迟协作更新');
            onCollaborativeUpdate?.(true);
            appliedVersions.current.add(serverVersion); // 标记版本已应用，避免重复
          }
        }

        onContentChange?.(true);
      } else {
        console.log('[IntelligentSync] 轮询完成，版本无变化:', {
          serverVersion,
          currentVersion,
          serverContentLength: typeof serverDoc.content === 'string' ? serverDoc.content.length : JSON.stringify(serverDoc.content).length
        });
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
          console.log('[IntelligentSync] 内容变化且用户停止编辑，开始同步');
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
      console.log('[IntelligentSync] 轮询被禁用');
      return;
    }

    if (!documentId || documentId.trim() === '') {
      console.log('[IntelligentSync] 文档ID为空，跳过轮询:', documentId);
      return;
    }

    // 关键修复：清理之前的定时器，避免重复创建
    if (pollTimer.current) {
      console.log('[IntelligentSync] 清理旧的轮询定时器');
      clearInterval(pollTimer.current);
      pollTimer.current = undefined;
    }

    console.log('[IntelligentSync] 🚀 启动轮询，间隔:', pollInterval, 'ms, 文档ID:', documentId);
    
    // 延迟执行第一次轮询，避免与章节加载冲突
    const firstPollDelay = setTimeout(() => {
      console.log('[IntelligentSync] 执行第一次轮询...');
      pollForUpdatesRef.current().catch(error => {
        console.error('[IntelligentSync] 第一次轮询失败:', error);
      });
    }, 2000); // 延迟2秒，让章节加载完成

    // 设置固定间隔轮询（轮询是主要更新方式）
    pollTimer.current = setInterval(() => {
      if (!documentId || documentId.trim() === '') {
        console.log('[IntelligentSync] 文档ID为空，停止轮询');
        if (pollTimer.current) {
          clearInterval(pollTimer.current);
          pollTimer.current = undefined;
        }
        return;
      }
      console.log('[IntelligentSync] 🔄 轮询检查远程更新...', documentId);
      pollForUpdatesRef.current().catch(error => {
        console.error('[IntelligentSync] 轮询失败:', error);
      });
    }, pollInterval); // 使用正常的轮询间隔

    return () => {
      console.log('[IntelligentSync] 🛑 清理轮询定时器和延迟任务');
      clearTimeout(firstPollDelay);
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = undefined;
      }
    };
  }, [enablePolling, pollInterval, documentId]); // 移除 pollForUpdates 依赖，使用 ref

  // 启动同步检查
  useEffect(() => {
    startSyncCheck();

    return () => {
      if (syncCheckTimer.current) {
        clearTimeout(syncCheckTimer.current);
      }
    };
  }, [startSyncCheck]);

  // 初始同步
  useEffect(() => {
    const initTimer = setTimeout(() => {
      const initialContent = getCurrentContent();
      if (initialContent && initialContent !== lastSyncedContent.current) {
        console.log('[IntelligentSync] 初始同步');
        performSync();
      }
    }, 1000);

    return () => clearTimeout(initTimer);
  }, [getCurrentContent, performSync]);

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

