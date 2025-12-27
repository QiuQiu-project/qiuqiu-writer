/**
 * Automerge CRDT客户端
 * 用于实时协作编辑
 */

import * as Automerge from '@automerge/automerge'

export interface AutomergeClientOptions {
  wsUrl?: string
  documentId: string
  userId?: number
  onConnect?: () => void
  onDisconnect?: () => void
  onUpdate?: (doc: Automerge.Doc<any>) => void
}

export class AutomergeClient {
  private doc: Automerge.Doc<any>
  private ws: WebSocket | null = null
  private options: AutomergeClientOptions
  private connected: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000

  constructor(options: AutomergeClientOptions) {
    this.options = options
    // 初始化文档
    this.doc = Automerge.init()
    this.doc = Automerge.change(this.doc, (d: any) => {
      d.content = ''
    })
  }

  /**
   * 连接到服务器
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    const wsUrl = this.options.wsUrl || 
      import.meta.env.VITE_AUTOMERGE_WS_URL || 
      `ws://localhost:8001/ws/automerge/${this.options.documentId}`

    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      this.connected = true
      this.reconnectAttempts = 0
      
      
      if (this.options.onConnect) {
        this.options.onConnect()
      }
    }

    this.ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        // 二进制消息（更改）
        const buffer = await event.data.arrayBuffer()
        const changesData = new TextDecoder().decode(buffer)
        const changesList = JSON.parse(changesData)
        
        // 应用更改
        for (const changeHex of changesList) {
          const changeBytes = Uint8Array.from(
            changeHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
          )
          this.doc = Automerge.applyChanges(this.doc, [changeBytes])
        }
        
        if (this.options.onUpdate) {
          this.options.onUpdate(this.doc)
        }
      } else if (typeof event.data === 'string') {
        // 文本消息
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'automerge_connected') {
            
          } else if (message.type === 'pong') {
            // 心跳响应
          }
        } catch (e) {
          console.warn('⚠️ [Automerge] 无法解析消息:', e)
        }
      }
    }

    this.ws.onerror = (error) => {
      console.error('❌ [Automerge] 连接错误:', error)
      this.connected = false
      if (this.options.onDisconnect) {
        this.options.onDisconnect()
      }
    }

    this.ws.onclose = () => {
      
      this.connected = false
      if (this.options.onDisconnect) {
        this.options.onDisconnect()
      }
      
      // 自动重连
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        setTimeout(() => {
          
          this.connect()
        }, this.reconnectDelay * this.reconnectAttempts)
      }
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.connected = false
    }
  }

  /**
   * 获取文档
   */
  getDoc(): Automerge.Doc<any> {
    return this.doc
  }

  /**
   * 获取文档内容
   */
  getContent(): string {
    return this.doc.content || ''
  }

  /**
   * 设置文档内容
   */
  setContent(content: string): void {
    this.doc = Automerge.change(this.doc, (d: any) => {
      d.content = content
    })
    
    // 发送更改到服务器
    this.sendChanges()
  }

  /**
   * 应用本地更改
   */
  applyLocalChange(changeFn: (doc: any) => void): void {
    const oldDoc = this.doc
    this.doc = Automerge.change(this.doc, changeFn)
    
    // 获取更改并发送
    const changes = Automerge.getChanges(oldDoc, this.doc)
    if (changes.length > 0) {
      this.sendChanges()
    }
    
    if (this.options.onUpdate) {
      this.options.onUpdate(this.doc)
    }
  }

  /**
   * 发送更改到服务器
   */
  private sendChanges(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    // 获取自上次同步以来的更改
    // 注意：这里简化处理，实际应该跟踪同步状态
    const emptyDoc = Automerge.init()
    const changes = Automerge.getChanges(emptyDoc, this.doc)
    
    if (changes.length > 0) {
      // 将更改转换为十六进制字符串列表
      const changesList = changes.map(change => 
        Array.from(change)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
      )
      
      const changesData = JSON.stringify(changesList)
      this.ws.send(changesData)
    }
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * 销毁客户端
   */
  destroy(): void {
    this.disconnect()
  }
}





