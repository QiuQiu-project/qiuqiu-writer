/**
 * Yjs WebSocket 连接复用管理器
 * 
 * 优化：同一作品（work）下的所有章节共享一个 WebSocket 连接，
 * 使用 Y.XmlFragment 为每个章节创建独立的文档片段。
 * 
 * 优势：
 * - 减少 WebSocket 连接数（从每章节一个减少到每作品一个）
 * - 切换章节时无需重新连接，响应更快
 * - 降低服务器压力
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

interface WorkConnection {
  workId: string;
  ydoc: Y.Doc;
  wsProvider: WebsocketProvider;
  idbProvider: IndexeddbPersistence;
  chapterFragments: Map<string, Y.XmlFragment>;
  refCount: number; // 引用计数，当为 0 时延迟断开
  disconnectTimer?: ReturnType<typeof setTimeout>;
  keepAliveTimer?: ReturnType<typeof setInterval>;
}

class YjsConnectionManager {
  private connections: Map<string, WorkConnection> = new Map();
  private readonly DISCONNECT_DELAY = 30000; // 30 秒后断开未使用的连接

  /**
   * 获取或创建作品的 WebSocket 连接
   */
  getWorkConnection(workId: string, wsUrl: string): WorkConnection {
    const key = workId;
    
    let conn = this.connections.get(key);
    if (conn) {
      // 清除断开定时器（连接被重新使用）
      if (conn.disconnectTimer) {
        clearTimeout(conn.disconnectTimer);
        conn.disconnectTimer = undefined;
      }
      conn.refCount++;
      return conn;
    }

    // 创建新连接
    // resyncInterval: 每 20 秒重新发送 sync step1，防止 y-websocket 的 30 秒空闲超时触发断连
    const ydoc = new Y.Doc();
    const wsProvider = new WebsocketProvider(wsUrl, `work_${workId}`, ydoc, {
      connect: true,
      resyncInterval: 20000,
    });
    const idbProvider = new IndexeddbPersistence(`work_${workId}`, ydoc);

    conn = {
      workId,
      ydoc,
      wsProvider,
      idbProvider,
      chapterFragments: new Map(),
      refCount: 1,
    };

    this.connections.set(key, conn);
    
    
    return conn;
  }

  /**
   * 获取章节的 Y.XmlFragment（如果不存在则创建）
   */
  getChapterFragment(workId: string, chapterId: string): Y.XmlFragment {
    const conn = this.connections.get(workId);
    if (!conn) {
      throw new Error(`作品连接不存在: ${workId}`);
    }

    let fragment = conn.chapterFragments.get(chapterId);
    if (!fragment) {
      fragment = conn.ydoc.getXmlFragment(`chapter_${chapterId}`);
      conn.chapterFragments.set(chapterId, fragment);
      
    }

    return fragment;
  }

  /**
   * 释放连接引用（当不再使用时调用）
   */
  releaseConnection(workId: string): void {
    const conn = this.connections.get(workId);
    if (!conn) return;

    conn.refCount--;
    if (conn.refCount <= 0) {
      // 延迟断开，以便快速切换章节时可以复用
      conn.disconnectTimer = setTimeout(() => {
        if (conn.keepAliveTimer) {
          clearInterval(conn.keepAliveTimer);
        }
        conn.wsProvider.destroy();
        conn.idbProvider.destroy();
        conn.ydoc.destroy();
        this.connections.delete(workId);
      }, this.DISCONNECT_DELAY);
    }
  }

  /**
   * 立即断开连接（用于清理）
   */
  disconnect(workId: string): void {
    const conn = this.connections.get(workId);
    if (!conn) return;

    if (conn.disconnectTimer) {
      clearTimeout(conn.disconnectTimer);
    }
    if (conn.keepAliveTimer) {
      clearInterval(conn.keepAliveTimer);
    }
    conn.wsProvider.destroy();
    conn.idbProvider.destroy();
    conn.ydoc.destroy();
    this.connections.delete(workId);

  }

  /**
   * 为新创建的章节初始化空的 Y.XmlFragment
   * 防止切换到新章节时，Collaboration 扩展将旧章节内容写入空片段
   */
  initializeEmptyChapterFragment(workId: string, chapterId: string): void {
    const conn = this.connections.get(workId);
    if (!conn) return; // 无活跃连接时跳过，首次打开章节会自然创建

    const fragment = conn.ydoc.getXmlFragment(`chapter_${chapterId}`);

    if (fragment.length === 0) {
      conn.ydoc.transact(() => {
        const paragraph = new Y.XmlElement('paragraph');
        fragment.insert(0, [paragraph]);
      });
    }

    conn.chapterFragments.set(chapterId, fragment);
  }

  /**
   * 断开所有连接
   */
  disconnectAll(): void {
    for (const [workId] of this.connections) {
      this.disconnect(workId);
    }
  }
}

// 单例
export const yjsConnectionManager = new YjsConnectionManager();
