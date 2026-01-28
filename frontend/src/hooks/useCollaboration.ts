/**
 * React Hook for CRDT协作编辑
 * 支持Yjs和Automerge
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { CollaborationClient } from '../utils/collaborationClient'
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
  const [yjsClient, setYjsClient] = useState<YjsClient | null>(null)

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
      
      // 使用 setTimeout 避免在 effect 中直接同步设置 state
      setTimeout(() => {
        setYjsClient(client.getYjsClient() || null)
        
        // 初始化内容
        const initialContent = client.getContent()
        if (initialContent) {
          setContentState(initialContent)
        }
      }, 0)
    } catch (err) {
      setTimeout(() => {
        setError(err instanceof Error ? err : new Error(String(err)))
      }, 0)
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.destroy()
        clientRef.current = null
        setYjsClient(null)
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

  return {
    content,
    setContent,
    connected,
    yjsClient,
    error
  }
}







