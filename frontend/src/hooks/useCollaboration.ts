/**
 * React Hook for CRDT协作编辑
 * 支持Yjs和Automerge
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { CollaborationClient, CollaborationClientOptions } from '../utils/collaborationClient'
import { YjsClient } from '../utils/yjsClient'

export interface UseCollaborationOptions {
  documentId: string
  userId?: number
  type?: 'yjs' | 'automerge' | 'sharedb'
  enabled?: boolean
  onContentChange?: (content: string) => void
}

export interface UseCollaborationResult {
  content: string
  setContent: (content: string) => void
  connected: boolean
  yjsClient: YjsClient | null
  error: Error | null
}

/**
 * 使用CRDT协作编辑的Hook
 */
export function useCollaboration(options: UseCollaborationOptions): UseCollaborationResult {
  const { documentId, userId, type = 'yjs', enabled = true, onContentChange } = options
  
  const clientRef = useRef<CollaborationClient | null>(null)
  const [content, setContentState] = useState<string>('')
  const [connected, setConnected] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)

  // 初始化客户端
  useEffect(() => {
    if (!enabled || !documentId) return

    try {
      const client = new CollaborationClient({
        type,
        documentId,
        userId,
        onConnect: () => {
          setConnected(true)
          setError(null)
        },
        onDisconnect: () => {
          setConnected(false)
        },
        onUpdate: (newContent) => {
          setContentState(newContent)
          if (onContentChange) {
            onContentChange(newContent)
          }
        }
      })

      clientRef.current = client
      client.connect()

      // 初始化内容
      const initialContent = client.getContent()
      if (initialContent) {
        setContentState(initialContent)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.destroy()
        clientRef.current = null
      }
    }
  }, [documentId, userId, type, enabled, onContentChange])

  // 设置内容
  const setContent = useCallback((newContent: string) => {
    if (clientRef.current) {
      clientRef.current.setContent(newContent)
      setContentState(newContent)
    }
  }, [])

  // 获取Yjs客户端（用于TipTap集成）
  const yjsClient = clientRef.current?.getYjsClient() || null

  return {
    content,
    setContent,
    connected,
    yjsClient,
    error
  }
}

