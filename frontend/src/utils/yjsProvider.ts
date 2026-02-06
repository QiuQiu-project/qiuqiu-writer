/**
 * 自定义 Yjs Provider
 * 连接到现有的 RESTful API 和 IndexedDB
 * 提供离线优先的同步策略
 */

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { documentCache } from './documentCache';

export interface YjsProviderOptions {
  /** 文档ID */
  documentId: string;
  /** Yjs 文档实例 */
  ydoc: Y.Doc;
  /** 同步间隔（毫秒），默认 5000ms */
  syncInterval?: number;
  /** 是否启用自动同步，默认 true */
  autoSync?: boolean;
  /** 同步成功回调 */
  onSyncSuccess?: (version: number) => void;
  /** 同步失败回调 */
  onSyncError?: (error: Error) => void;
  /** 状态变化回调 */
  onStatusChange?: (status: 'connected' | 'disconnected' | 'syncing') => void;
}

/**
 * 自定义 Yjs Provider
 * 结合 IndexedDB 本地持久化和 RESTful API 同步
 */
export class RestfulYjsProvider {
  private documentId: string;
  private ydoc: Y.Doc;
  private indexeddbProvider: IndexeddbPersistence;
  private syncInterval: number;
  private autoSync: boolean;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing: boolean = false;
  private isDestroyed: boolean = false;
  private status: 'connected' | 'disconnected' | 'syncing' = 'disconnected';
  
  // 回调函数
  private onSyncSuccess?: (version: number) => void;
  private onSyncError?: (error: Error) => void;
  private onStatusChange?: (status: 'connected' | 'disconnected' | 'syncing') => void;

  // 记录最后同步的状态向量，用于判断是否有变化
  private lastSyncStateVector: Uint8Array | null = null;

  constructor(options: YjsProviderOptions) {
    this.documentId = options.documentId;
    this.ydoc = options.ydoc;
    this.syncInterval = options.syncInterval || 5000;
    this.autoSync = options.autoSync !== false;
    this.onSyncSuccess = options.onSyncSuccess;
    this.onSyncError = options.onSyncError;
    this.onStatusChange = options.onStatusChange;

    // 初始化 IndexedDB 持久化
    this.indexeddbProvider = new IndexeddbPersistence(this.documentId, this.ydoc);

    // 等待 IndexedDB 加载完成
    this.indexeddbProvider.on('synced', () => {
      console.log('📦 [YjsProvider] IndexedDB 已加载:', this.documentId);
      this.setStatus('connected');
      
      // 首次加载后立即同步到服务器
      if (this.autoSync) {
        this.sync().catch(console.error);
      }
    });

    // 监听文档变化
    this.ydoc.on('update', this.handleUpdate);

    // 启动自动同步
    if (this.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * 处理文档更新
   */
  private handleUpdate = (_update: Uint8Array, origin: unknown) => {
    // 如果更新来自远程，不触发同步（避免循环）
    if (origin === this) {
      return;
    }

    // 标记有待同步的更改
    console.log('✏️ [YjsProvider] 文档已更新，待同步');
  };

  /**
   * 设置状态
   */
  private setStatus(status: 'connected' | 'disconnected' | 'syncing') {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange?.(status);
    }
  }

  /**
   * 启动自动同步
   */
  private startAutoSync() {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = setInterval(() => {
      if (!this.isSyncing && !this.isDestroyed) {
        this.sync().catch(console.error);
      }
    }, this.syncInterval);
  }

  /**
   * 停止自动同步
   */
  private stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * 同步到服务器
   */
  async sync(): Promise<void> {
    if (this.isSyncing || this.isDestroyed) {
      return;
    }

    // 检查是否有变化
    const currentStateVector = Y.encodeStateVector(this.ydoc);
    if (this.lastSyncStateVector && 
        this.arraysEqual(currentStateVector, this.lastSyncStateVector)) {
      // 没有变化，跳过同步
      return;
    }

    this.isSyncing = true;
    this.setStatus('syncing');

    try {
      // 从 Yjs 文档中获取内容
      const xmlFragment = this.ydoc.getXmlFragment('default');
      const content = this.xmlToHtml(xmlFragment);

      if (!content || content.trim() === '<p></p>') {
        // 空内容，跳过同步
        this.isSyncing = false;
        this.setStatus('connected');
        return;
      }

      console.log('🔄 [YjsProvider] 同步到服务器:', {
        documentId: this.documentId,
        contentLength: content.length,
      });

      // 调用现有的同步 API
      const result = await documentCache.syncDocumentState(this.documentId, content);

      if (result.success) {
        console.log('✅ [YjsProvider] 同步成功:', result.version);
        
        // 更新最后同步的状态向量
        this.lastSyncStateVector = Y.encodeStateVector(this.ydoc);
        
        this.onSyncSuccess?.(result.version);
        this.setStatus('connected');
      } else {
        throw new Error(result.error || '同步失败');
      }
    } catch (error) {
      console.error('❌ [YjsProvider] 同步失败:', error);
      this.onSyncError?.(error instanceof Error ? error : new Error('同步失败'));
      this.setStatus('disconnected');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 从服务器加载内容
   */
  async loadFromServer(): Promise<void> {
    try {
      const doc = await documentCache.getDocument(this.documentId);
      
      if (doc && doc.content) {
        // 将服务器内容转换为 Yjs 格式
        const content = typeof doc.content === 'string' ? doc.content : '';
        
        // 使用事务更新文档，标记来源为 this，避免触发 update 事件
        this.ydoc.transact(() => {
          const xmlFragment = this.ydoc.getXmlFragment('default');
          this.htmlToXml(content, xmlFragment);
        }, this);

        console.log('📥 [YjsProvider] 从服务器加载内容完成');
      }
    } catch (error) {
      console.error('❌ [YjsProvider] 从服务器加载失败:', error);
      this.onSyncError?.(error instanceof Error ? error : new Error('加载失败'));
    }
  }

  /**
   * 强制同步
   */
  async forceSync(): Promise<void> {
    // 重置最后同步状态，强制同步
    this.lastSyncStateVector = null;
    return this.sync();
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      status: this.status,
      isSyncing: this.isSyncing,
      documentId: this.documentId,
    };
  }

  /**
   * 销毁 Provider
   */
  destroy() {
    this.isDestroyed = true;
    this.stopAutoSync();
    this.ydoc.off('update', this.handleUpdate);
    this.indexeddbProvider.destroy();
    this.setStatus('disconnected');
    console.log('🗑️ [YjsProvider] 已销毁:', this.documentId);
  }

  // ========== 辅助方法 ==========

  /**
   * 比较两个 Uint8Array 是否相等
   */
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * 将 XML Fragment 转换为 HTML
   * 这是一个简化的实现，Tiptap 会自动处理
   */
  private xmlToHtml(xmlFragment: Y.XmlFragment): string {
    // Tiptap 会自动将 Yjs 文档转换为 HTML
    // 这里只是占位符，实际转换由 Tiptap 处理
    
    // 简化实现：遍历 XML 节点并生成 HTML
    let html = '';
    
    const processNode = (node: Y.XmlElement | Y.XmlText): string => {
      if (node instanceof Y.XmlText) {
        return node.toString();
      } else if (node instanceof Y.XmlElement) {
        const tagName = node.nodeName;
        const attributes = node.getAttributes();
        const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ');
        
        // 使用 toArray() 获取子节点
        const childNodes = node.toArray();
        const children = childNodes.map(child => processNode(child as Y.XmlElement | Y.XmlText)).join('');
        return `<${tagName}${attrs ? ' ' + attrs : ''}>${children}</${tagName}>`;
      }
      return '';
    };

    // 使用 toArray() 遍历 fragment
    const nodes = xmlFragment.toArray();
    for (const node of nodes) {
      html += processNode(node as Y.XmlElement | Y.XmlText);
    }

    return html || '<p></p>';
  }

  /**
   * 将 HTML 转换为 XML Fragment
   * 这是一个简化的实现，实际应该使用 ProseMirror 的解析器
   */
  private htmlToXml(html: string, xmlFragment: Y.XmlFragment): void {
    // 清空现有内容
    const length = xmlFragment.length;
    if (length > 0) {
      xmlFragment.delete(0, length);
    }

    // 简化实现：只处理基本的 HTML
    // 实际应该使用 ProseMirror 的 DOMParser
    if (!html || html === '<p></p>') {
      const p = new Y.XmlElement('p');
      xmlFragment.insert(0, [p]);
      return;
    }

    // 这里应该使用 ProseMirror 的解析器
    // 暂时使用简单的解析
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const convertNode = (node: Node): Y.XmlElement | Y.XmlText | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text) {
          return new Y.XmlText(text);
        }
        return null;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const xmlElement = new Y.XmlElement(element.tagName.toLowerCase());
        
        // 复制属性
        const attributes = element.attributes;
        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          xmlElement.setAttribute(attr.name, attr.value);
        }
        
        // 递归处理子节点
        const childNodes = element.childNodes;
        const xmlChildren: (Y.XmlElement | Y.XmlText)[] = [];
        for (let i = 0; i < childNodes.length; i++) {
          const xmlChild = convertNode(childNodes[i]);
          if (xmlChild) {
            xmlChildren.push(xmlChild);
          }
        }
        if (xmlChildren.length > 0) {
          xmlElement.insert(0, xmlChildren);
        }
        
        return xmlElement;
      }
      return null;
    };

    // 处理 body 下的所有子节点
    const bodyChildren = doc.body.childNodes;
    const xmlNodes: (Y.XmlElement | Y.XmlText)[] = [];
    for (let i = 0; i < bodyChildren.length; i++) {
      const xmlNode = convertNode(bodyChildren[i]);
      if (xmlNode) {
        xmlNodes.push(xmlNode);
      }
    }
    if (xmlNodes.length > 0) {
      xmlFragment.insert(0, xmlNodes);
    }
  }
}

/**
 * 创建 Yjs Provider 的工厂函数
 */
export function createYjsProvider(options: YjsProviderOptions): RestfulYjsProvider {
  return new RestfulYjsProvider(options);
}
