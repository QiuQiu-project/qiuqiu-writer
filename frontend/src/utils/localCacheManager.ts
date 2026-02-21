/**
 * 本地缓存管理器
 * 实现多级缓存：内存 → 本地存储 → 远程数据库
 * 支持 LRU 淘汰策略、版本控制、离线优先
 */

export interface CacheItem<T = unknown> {
  key: string;
  data: T;
  version: number;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  size: number; // 数据大小（字节）
  synced: boolean; // 是否已同步到远程
  pendingChanges: boolean; // 是否有待同步的更改
}

export interface CacheConfig {
  maxMemorySize: number; // 最大内存缓存大小（字节）
  maxLocalStorageSize: number; // 最大本地存储大小（字节）
  maxItems: number; // 最大缓存项数量
  ttl: number; // 缓存过期时间（毫秒）
  syncInterval: number; // 同步间隔（毫秒）
}

const DEFAULT_CONFIG: CacheConfig = {
  maxMemorySize: 50 * 1024 * 1024, // 50MB
  maxLocalStorageSize: 10 * 1024 * 1024, // 10MB
  maxItems: 1000,
  ttl: 7 * 24 * 60 * 60 * 1000, // 7天
  syncInterval: 5000, // 5秒
};

const STORAGE_PREFIX = 'planetwriter_cache_';
const METADATA_KEY = 'planetwriter_cache_metadata';

class LocalCacheManager {
  private memoryCache: Map<string, CacheItem> = new Map();
  private config: CacheConfig;
  private currentMemorySize: number = 0;
  private syncQueue: Set<string> = new Set();
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadMetadata();
    this.startSyncTimer();
  }

  /**
   * 获取缓存项
   */
  async get<T>(key: string): Promise<T | null> {
    
    
    // 1. 先从内存缓存获取
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem) {
      // 更新访问信息
      memoryItem.lastAccessed = Date.now();
      memoryItem.accessCount++;
      return memoryItem.data as T;
    }

    // 2. 从 localStorage 获取
    const localItem = this.getFromLocalStorage<T>(key);
    if (localItem) {
      // 提升到内存缓存
      this.setToMemory(key, localItem.data, localItem.version, localItem.synced);
      return localItem.data;
    }

    return null;
  }

  /**
   * 设置缓存项（本地优先）
   */
  async set<T>(key: string, data: T, version?: number, options?: { synced?: boolean }): Promise<void> {

    const itemVersion = version ?? this.getNextVersion(key);
    const synced = options?.synced ?? false;

    // 1. 立即写入内存缓存
    this.setToMemory(key, data, itemVersion, synced);

    // 2. 异步写入 localStorage
    this.setToLocalStorage(key, data, itemVersion, synced);

    // 3. 标记为待同步（仅当 synced 为 false 时）
    if (!synced) {
      this.syncQueue.add(key);
    } else {
      // 如果明确标记为已同步，则从同步队列中移除
      this.syncQueue.delete(key);
    }
    
  }

  /**
   * 删除缓存项
   */
  async delete(key: string): Promise<void> {
    // 从内存删除
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem) {
      this.currentMemorySize -= memoryItem.size;
      this.memoryCache.delete(key);
    }

    // 从 localStorage 删除
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      // Ignore localStorage error
    }

    // 从同步队列移除
    this.syncQueue.delete(key);
  }

  /**
   * 检查缓存是否存在
   */
  has(key: string): boolean {
    return this.memoryCache.has(key) || this.getFromLocalStorage(key) !== null;
  }

  /**
   * 获取所有待同步的键
   */
  getPendingSyncKeys(): string[] {
    return Array.from(this.syncQueue);
  }

  /**
   * 标记为已同步
   */
  markAsSynced(key: string): void {
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem) {
      memoryItem.synced = true;
      memoryItem.pendingChanges = false;
    }

    const localItem = this.getFromLocalStorage(key);
    if (localItem) {
      localItem.synced = true;
      localItem.pendingChanges = false;
      this.setToLocalStorage(key, localItem.data, localItem.version, true);
    }

    this.syncQueue.delete(key);
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    // 清理内存缓存
    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp > this.config.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      const item = this.memoryCache.get(key);
      if (item) {
        this.currentMemorySize -= item.size;
        this.memoryCache.delete(key);
      }
    });

    // 清理 localStorage
    this.cleanupLocalStorage();
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      memoryItems: this.memoryCache.size,
      memorySize: this.currentMemorySize,
      pendingSync: this.syncQueue.size,
      localStorageSize: this.getLocalStorageSize(),
    };
  }

  // ========== 私有方法 ==========

  private setToMemory<T>(key: string, data: T, version: number, synced: boolean): void {
    const dataSize = this.calculateSize(data);
    const now = Date.now();

    // 如果内存已满，执行 LRU 淘汰
    if (this.currentMemorySize + dataSize > this.config.maxMemorySize) {
      this.evictLRU();
    }

    const existingItem = this.memoryCache.get(key);
    if (existingItem) {
      this.currentMemorySize -= existingItem.size;
    }

    this.memoryCache.set(key, {
      key,
      data,
      version,
      timestamp: existingItem?.timestamp || now,
      lastAccessed: now,
      accessCount: (existingItem?.accessCount || 0) + 1,
      size: dataSize,
      synced,
      pendingChanges: !synced,
    });

    this.currentMemorySize += dataSize;
  }

  private getFromLocalStorage<T>(key: string): CacheItem<T> | null {
    try {
      const itemStr = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (!itemStr) return null;

      const item = JSON.parse(itemStr) as CacheItem<T>;
      
      // 检查是否过期
      if (Date.now() - item.timestamp > this.config.ttl) {
        localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
        return null;
      }

      return item;
    } catch {
      
      return null;
    }
  }

  private setToLocalStorage<T>(key: string, data: T, version: number, synced: boolean): void {
    try {
      const now = Date.now();
      const item: CacheItem<T> = {
        key,
        data,
        version,
        timestamp: now,
        lastAccessed: now,
        accessCount: 1,
        size: this.calculateSize(data),
        synced,
        pendingChanges: !synced,
      };

      // 检查 localStorage 大小限制
      const currentSize = this.getLocalStorageSize();
      const itemSize = this.calculateSize(item);
      
      if (currentSize + itemSize > this.config.maxLocalStorageSize) {
        this.evictLocalStorageLRU();
      }

      const storageKey = `${STORAGE_PREFIX}${key}`;
      const itemJson = JSON.stringify(item);
      
      localStorage.setItem(storageKey, itemJson);
      
    } catch (e) {
      // 如果存储空间不足，尝试清理
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        this.cleanupLocalStorage();
        // 清理后重试
        try {
          const now = Date.now();
          const retryItem: CacheItem<T> = {
            key,
            data,
            version,
            timestamp: now,
            lastAccessed: now,
            accessCount: 1,
            size: this.calculateSize(data),
            synced,
            pendingChanges: !synced,
          };
          localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(retryItem));
        } catch {
          // Give up if retry fails
        }
      }
    }
  }

  private evictLRU(): void {
    if (this.memoryCache.size === 0) return;

    // 按最后访问时间排序
    const sorted = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // 删除最久未访问的项（保留至少一半）
    const toDelete = Math.floor(sorted.length / 2);
    for (let i = 0; i < toDelete; i++) {
      const [key, item] = sorted[i];
      this.currentMemorySize -= item.size;
      this.memoryCache.delete(key);
    }
  }

  private evictLocalStorageLRU(): void {
    const items: Array<[string, CacheItem]> = [];
    
    // 收集所有 localStorage 中的缓存项
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const item = this.getFromLocalStorage(key.replace(STORAGE_PREFIX, ''));
        if (item) {
          items.push([key, item]);
        }
      }
    }

    // 按最后访问时间排序
    items.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // 删除最久未访问的项（保留至少一半）
    const toDelete = Math.floor(items.length / 2);
    for (let i = 0; i < toDelete; i++) {
      localStorage.removeItem(items[i][0]);
    }
  }

  private cleanupLocalStorage(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const item = this.getFromLocalStorage(key.replace(STORAGE_PREFIX, ''));
        if (item && now - item.timestamp > this.config.ttl) {
          keysToDelete.push(key);
        }
      }
    }

    keysToDelete.forEach(key => localStorage.removeItem(key));
  }

  private getLocalStorageSize(): number {
    let size = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          size += key.length + value.length;
        }
      }
    }
    return size;
  }

  private calculateSize(data: unknown): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 0;
    }
  }

  private getNextVersion(key: string): number {
    const item = this.memoryCache.get(key) || this.getFromLocalStorage(key);
    return (item?.version || 0) + 1;
  }

  private loadMetadata(): void {
    try {
      const metadataStr = localStorage.getItem(METADATA_KEY);
      if (metadataStr) {
        // 可以在这里加载额外的元数据
        JSON.parse(metadataStr);
      }
    } catch {
      // Ignore metadata parse error
    }
  }

  private startSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    // 同步定时器由 SyncManager 管理
  }

  /**
   * 预加载缓存项
   */
  async preload(keys: string[]): Promise<void> {
    for (const key of keys) {
      if (!this.memoryCache.has(key)) {
        const item = this.getFromLocalStorage(key);
        if (item) {
          this.setToMemory(key, item.data, item.version, item.synced);
        }
      }
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.memoryCache.clear();
    this.currentMemorySize = 0;
    this.syncQueue.clear();

    // 清空 localStorage 中的缓存
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
  }
}

// 导出单例
export const localCacheManager = new LocalCacheManager();

