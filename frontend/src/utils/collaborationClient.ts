/**
 * 协作编辑客户端工厂
 * 支持Yjs和Automerge两种CRDT实现
 */

import { YjsClient, YjsClientOptions } from './yjsClient'
import { AutomergeClient, AutomergeClientOptions } from './automergeClient'

export type CollaborationType = 'yjs' | 'automerge' | 'sharedb'

export interface CollaborationClientOptions {
  type?: CollaborationType
  documentId: string
  userId?: number
  wsUrl?: string
  onConnect?: () => void
  onDisconnect?: () => void
  onUpdate?: (content: string) => void
}

export class CollaborationClient {
  private client: YjsClient | AutomergeClient | null = null
  private options: CollaborationClientOptions
  private type: CollaborationType

  constructor(options: CollaborationClientOptions) {
    this.options = options
    this.type = options.type || 'yjs'
    
    // 根据类型创建客户端
    if (this.type === 'yjs') {
      this.client = new YjsClient({
        documentId: options.documentId,
        userId: options.userId,
        wsUrl: options.wsUrl,
        onConnect: options.onConnect,
        onDisconnect: options.onDisconnect,
        onUpdate: (update, origin) => {
          if (options.onUpdate) {
            const content = (this.client as YjsClient).getContent()
            options.onUpdate(content)
          }
        }
      })
    } else if (this.type === 'automerge') {
      this.client = new AutomergeClient({
        documentId: options.documentId,
        userId: options.userId,
        wsUrl: options.wsUrl,
        onConnect: options.onConnect,
        onDisconnect: options.onDisconnect,
        onUpdate: (doc) => {
          if (options.onUpdate) {
            const content = (this.client as AutomergeClient).getContent()
            options.onUpdate(content)
          }
        }
      })
    }
  }

  /**
   * 连接到服务器
   */
  connect(): void {
    if (this.client) {
      if (this.type === 'yjs') {
        (this.client as YjsClient).connect()
      } else if (this.type === 'automerge') {
        (this.client as AutomergeClient).connect()
      }
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.client) {
      if (this.type === 'yjs') {
        (this.client as YjsClient).disconnect()
      } else if (this.type === 'automerge') {
        (this.client as AutomergeClient).disconnect()
      }
    }
  }

  /**
   * 获取文档内容
   */
  getContent(): string {
    if (!this.client) return ''
    
    if (this.type === 'yjs') {
      return (this.client as YjsClient).getContent()
    } else if (this.type === 'automerge') {
      return (this.client as AutomergeClient).getContent()
    }
    
    return ''
  }

  /**
   * 设置文档内容
   */
  setContent(content: string): void {
    if (!this.client) return
    
    if (this.type === 'yjs') {
      (this.client as YjsClient).setContent(content)
    } else if (this.type === 'automerge') {
      (this.client as AutomergeClient).setContent(content)
    }
  }

  /**
   * 获取Yjs客户端（仅当type为yjs时）
   */
  getYjsClient(): YjsClient | null {
    return this.type === 'yjs' ? (this.client as YjsClient) : null
  }

  /**
   * 获取Automerge客户端（仅当type为automerge时）
   */
  getAutomergeClient(): AutomergeClient | null {
    return this.type === 'automerge' ? (this.client as AutomergeClient) : null
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    if (!this.client) return false
    
    if (this.type === 'yjs') {
      return (this.client as YjsClient).isConnected()
    } else if (this.type === 'automerge') {
      return (this.client as AutomergeClient).isConnected()
    }
    
    return false
  }

  /**
   * 销毁客户端
   */
  destroy(): void {
    if (this.client) {
      if (this.type === 'yjs') {
        (this.client as YjsClient).destroy()
      } else if (this.type === 'automerge') {
        (this.client as AutomergeClient).destroy()
      }
      this.client = null
    }
  }
}





