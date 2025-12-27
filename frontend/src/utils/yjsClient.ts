/**
 * Yjs CRDT客户端
 * 用于实时协作编辑
 */

import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export interface YjsClientOptions {
  wsUrl?: string
  documentId: string
  userId?: number
  onConnect?: () => void
  onDisconnect?: () => void
  onUpdate?: (update: Uint8Array, origin: any) => void
}

export class YjsClient {
  private ydoc: Y.Doc
  private provider: WebsocketProvider | null = null
  private ytext: Y.Text
  private options: YjsClientOptions
  private connected: boolean = false

  constructor(options: YjsClientOptions) {
    this.options = options
    this.ydoc = new Y.Doc()
    this.ytext = this.ydoc.getText('content')
    
    // 监听更新
    this.ydoc.on('update', (update: Uint8Array, origin: any) => {
      if (this.options.onUpdate) {
        this.options.onUpdate(update, origin)
      }
    })
  }

  /**
   * 连接到服务器
   */
  connect(): void {
    if (this.provider) {
      return
    }

    const wsUrl = this.options.wsUrl || 
      import.meta.env.VITE_YJS_WS_URL || 
      `ws://localhost:8001/ws/yjs/${this.options.documentId}`

    this.provider = new WebsocketProvider(
      wsUrl,
      this.options.documentId,
      this.ydoc,
      {
        connect: true,
        params: {
          userId: this.options.userId?.toString() || '0'
        }
      }
    )

    this.provider.on('status', (event: { status: string }) => {
      
      
      if (event.status === 'connected') {
        this.connected = true
        if (this.options.onConnect) {
          this.options.onConnect()
        }
      } else if (event.status === 'disconnected') {
        this.connected = false
        if (this.options.onDisconnect) {
          this.options.onDisconnect()
        }
      }
    })

    
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.provider) {
      this.provider.destroy()
      this.provider = null
      this.connected = false
      
    }
  }

  /**
   * 获取Y.Text对象（用于绑定编辑器）
   */
  getText(): Y.Text {
    return this.ytext
  }

  /**
   * 获取Y.Doc对象
   */
  getDoc(): Y.Doc {
    return this.ydoc
  }

  /**
   * 获取文档内容
   */
  getContent(): string {
    return this.ytext.toString()
  }

  /**
   * 设置文档内容
   */
  setContent(content: string): void {
    this.ydoc.transact(() => {
      const currentContent = this.ytext.toString()
      if (currentContent !== content) {
        // 清空并设置新内容
        this.ytext.delete(0, currentContent.length)
        this.ytext.insert(0, content)
      }
    })
  }

  /**
   * 获取Awareness对象（用于显示其他用户的光标和选择）
   */
  getAwareness(): any {
    return this.provider?.awareness || null
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 销毁客户端
   */
  destroy(): void {
    this.disconnect()
    this.ydoc.destroy()
  }
}





