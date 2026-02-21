/**
 * 同步管理器
 * 处理离线/在线状态、同步队列、冲突解决
 */

// 关键修复：统一使用 documentCache，移除重复的缓存逻辑
import { documentCache } from './documentCache';
import { localCacheManager } from './localCacheManager';
import type { ShareDBDocument } from '../types/document';

// 关键修复：使用统一的类型定义，不再重复定义
// 关键修复：移除重复的 documentCache 实现，统一使用 documentCache.ts 中的实现

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
  error: string | null;
}

export interface SyncOptions {
  retryAttempts?: number;
  retryDelay?: number;
  batchSize?: number;
}

const DEFAULT_OPTIONS: Required<SyncOptions> = {
  retryAttempts: 3,
  retryDelay: 1000,
  batchSize: 10,
};

class SyncManager {
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private statusCallbacks: Set<(status: SyncStatus) => void> = new Set();
  private lastSyncTime: number | null = null;
  private error: string | null = null;
  private options: Required<SyncOptions>;
  // 当前打开的文档 ID
  private activeDocumentId: string | null = null;

  constructor(options: SyncOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.setupNetworkListeners();
    this.startSyncTimer();
  }

  /**
   * 设置当前打开的文档 ID
   */
  setActiveDocumentId(id: string | null): void {
    this.activeDocumentId = id;
    // 
  }

  /**
   * 获取同步状态
   */
  getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: localCacheManager.getPendingSyncKeys().length,
      lastSyncTime: this.lastSyncTime,
      error: this.error,
    };
  }

  /**
   * 监听状态变化
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * 手动触发同步
   */
  async sync(force: boolean = false): Promise<void> {
    if (this.isSyncing && !force) {
      return;
    }

    if (!this.isOnline) {
      this.error = '网络未连接';
      this.notifyStatusChange();
      return;
    }

    this.isSyncing = true;
    this.error = null;
    this.notifyStatusChange();

    try {
      const pendingKeys = localCacheManager.getPendingSyncKeys();
      
      if (pendingKeys.length === 0) {
        this.isSyncing = false;
        this.notifyStatusChange();
        return;
      }

      // 批量同步
      await this.syncBatch(pendingKeys.slice(0, this.options.batchSize));

      this.lastSyncTime = Date.now();
      this.error = null;
    } catch (error) {
      this.error = error instanceof Error ? error.message : '同步失败';
      
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
  }

  /**
   * 同步单个文档
   */
  async syncDocument(documentId: string): Promise<void> {
    if (!this.isOnline) {
      return;
    }

    // 检查是否有待同步的更改
    const pendingKeys = localCacheManager.getPendingSyncKeys();
    if (!pendingKeys.includes(documentId)) {
      return;
    }
    
    const cached = await localCacheManager.get<ShareDBDocument>(documentId);
    if (!cached) {
      // 如果缓存不存在，也标记为已同步以避免重复尝试
      localCacheManager.markAsSynced(documentId);
      return;
    }

    // 根据文档类型选择同步方式
    await this.syncChapterDocument(documentId, cached);
    
    // 注意：syncChapterDocument 内部可能会调用 markAsSynced
    // 但为了保险起见，这里也可以调用，markAsSynced 是幂等的
    // localCacheManager.markAsSynced(documentId);
  }

  /**
   * 解决冲突（使用最后写入获胜策略）
   */
  async resolveConflict(
    documentId: string,
    localVersion: number,
    remoteVersion: number
  ): Promise<void> {
    // 如果远程版本更新，使用远程版本
    if (remoteVersion > localVersion) {
      // 从服务器获取最新版本
      const remoteDoc = await documentCache.getDocument(documentId);
      if (remoteDoc) {
        await localCacheManager.set(documentId, remoteDoc, remoteDoc.version || remoteVersion);
      }
    } else {
      // 本地版本更新，同步到服务器
      await this.syncDocument(documentId);
    }
  }

  /**
   * 预加载文档（智能预测）
   */
  async preloadDocuments(documentIds: string[]): Promise<void> {
    // 预加载到内存缓存
    await localCacheManager.preload(documentIds);

    // 如果在线，预取可能访问的文档
    if (this.isOnline) {
      for (const docId of documentIds) {
        try {
          await documentCache.getDocument(docId);
        } catch {
          // Ignore preload error
        }
      }
    }
  }

  /**
   * 清理同步队列
   */
  clearSyncQueue(): void {
    // 这里可以添加清理逻辑
  }

  /**
   * 销毁同步管理器
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  // ========== 私有方法 ==========

  private setupNetworkListeners(): void {
    this.handleOnline = () => {
      this.isOnline = true;
      this.error = null;
      this.notifyStatusChange();
      // 网络恢复后立即同步
      this.sync().catch(console.error);
    };

    this.handleOffline = () => {
      this.isOnline = false;
      this.error = '网络已断开';
      this.notifyStatusChange();
    };

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private handleOnline = () => {};
  private handleOffline = () => {};

  private startSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // 每 5 秒检查一次待同步项
    this.syncTimer = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.sync().catch(console.error);
      }
    }, 5000);
  }

  private async syncBatch(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(
      keys.map(key => this.syncDocument(key))
    );

    // 检查是否有失败
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      // Log failures or handle retry logic here if needed
    }
  }

  private async syncChapterDocument(
    documentId: string,
    cached: { data?: { content?: unknown }; content?: unknown }
  ): Promise<void> {
    // 统一格式：content 必须是字符串
    const content = cached.data?.content || cached.content;
    const contentStr = typeof content === 'string' ? content : '';

    // 关键修复：未打开章节不要同步
    if (this.activeDocumentId && documentId !== this.activeDocumentId) {
      
      // 关键修复：对于未打开的章节，暂时不移除 pending 状态，等待下次检查
      // 这样当用户打开该章节时，可以继续同步
      // 但为了避免无限循环日志，我们可以不在这里输出日志，或者降低日志频率
      return;
    }

    // 关键修复：检查内容是否为空，如果为空则跳过同步
    if (!contentStr || contentStr.trim() === '' || contentStr.trim() === '<p></p>') {
            // 标记为已同步（因为空内容不需要同步）
      localCacheManager.markAsSynced(documentId);
      return;
    }

    // 使用新的同步方法（借鉴 nexcode_web 的实现）
    // 这会自动处理版本控制和冲突解决
    await documentCache.syncDocumentState(documentId, contentStr);
    
    // 同步成功后，标记为已同步
    localCacheManager.markAsSynced(documentId);
  }


  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusCallbacks.forEach(callback => callback(status));
  }
}

// 导出单例
export const syncManager = new SyncManager();
