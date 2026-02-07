/**
 * Hook: Yjs 编辑器集成 (y-websocket 版本)
 *
 * 使用 y-websocket 连接后端 WebSocket 服务进行实时协作，
 * 同时保留 IndexedDB 做离线持久化。
 *
 * 关键设计：
 * - 使用 useEffect 创建 Y.Doc 和 Providers
 * - 通过 collabState 状态门控协作扩展，确保 Y.Doc + Provider 完全就绪后才传给编辑器
 * - useEditor 依赖 [collabState] 确保编辑器完整重建
 * - 文档同步由 y-websocket 自动处理，不再使用 REST API 轮询
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { authApi } from '../utils/authApi';
import { yjsConnectionManager } from '../utils/yjsConnectionManager';

/** 从 documentId 解析 workId 和 chapterId */
function parseDocumentId(documentId: string): { workId: string; chapterId: string } | null {
  const match = documentId.match(/^work_(.+?)_chapter_(.+)$/);
  if (!match) return null;
  return { workId: match[1], chapterId: match[2] };
}

// 随机颜色池，用于区分不同用户的光标
const CURSOR_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7',
  '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4',
  '#009688', '#4caf50', '#8bc34a', '#ff9800',
  '#ff5722', '#795548', '#607d8b',
];

function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

/** 构建 WebSocket URL：从 VITE_API_URL 推导 */
function getWebSocketUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8001';
  // http -> ws, https -> wss
  const wsUrl = apiUrl.replace(/^http/, 'ws');
  return `${wsUrl}/api/v1/yjs`;
}

/** 协作就绪后的状态快照（避免 ref 在 render 中被访问） */
interface CollabState {
  ydoc: Y.Doc;
  wsProvider: WebsocketProvider;
  /** 当前章节的 fragment 名称，用于 Collaboration 的 field 选项 */
  field: string;
}

export interface UseYjsEditorOptions {
  /** 文档ID（格式：work_{workId}_chapter_{chapterId}） */
  documentId: string;
  /** 初始内容（HTML） */
  initialContent?: string;
  /** 当 Yjs 片段为空时从后端拉取内容（如导入作品后的章节），返回 HTML 或 null */
  fetchInitialContent?: (documentId: string) => Promise<string | null>;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否可编辑 */
  editable?: boolean;
  /** 内容更新回调（用于字数统计等） */
  onUpdate?: (content: string) => void;
  /** 同步成功回调 */
  onSyncSuccess?: (version: number) => void;
  /** 同步失败回调 */
  onSyncError?: (error: Error) => void;
}

export interface UseYjsEditorReturn {
  /** Tiptap 编辑器实例 */
  editor: ReturnType<typeof useEditor>;
  /** 手动触发保存（兼容旧接口） */
  syncToServer: () => Promise<void>;
  /** 从服务器加载内容（兼容旧接口） */
  loadFromServer: () => Promise<void>;
  /** 同步状态 */
  isSyncing: boolean;
  /** WebSocket 连接状态 */
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

/**
 * 使用 Yjs + y-websocket 的编辑器 Hook
 */
export function useYjsEditor(options: UseYjsEditorOptions): UseYjsEditorReturn {
  const {
    documentId,
    initialContent,
    fetchInitialContent,
    placeholder = '开始写作...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
    editable = true,
    onUpdate,
    onSyncSuccess,
    onSyncError,
  } = options;

  // ===== 状态 =====
  // collabState 同时作为 "协作就绪" 的标志和数据源
  // 为 null 时表示未就绪，编辑器不会添加协作扩展
  const [collabState, setCollabState] = useState<CollabState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  // 获取当前用户信息（只计算一次）
  const userInfo = useMemo(() => {
    const user = authApi.getUserInfo();
    return {
      name: user?.display_name || user?.username || '匿名用户',
      color: getRandomColor(),
    };
  }, []);

  // 保留一个 ref 给 syncToServer/loadFromServer 回调使用
  const wsProviderRef = useRef<WebsocketProvider | null>(null);
  const isInitialized = useRef(false);
  const documentIdRef = useRef<string>(documentId);
  documentIdRef.current = documentId;

  // ===== 初始化：同一作品共用一个 WebSocket，按章节使用不同 field =====
  useEffect(() => {
    isInitialized.current = false;

    if (!documentId) {
      wsProviderRef.current = null;
      return;
    }

    const parsed = parseDocumentId(documentId);
    if (!parsed) {
      console.warn('⚠️ [useYjsEditor] 无效的 documentId 格式:', documentId);
      return;
    }

    const { workId, chapterId } = parsed;
    const field = `chapter_${chapterId}`;
    console.log('📄 [useYjsEditor] 章节:', chapterId, '作品:', workId, 'field:', field);

    // 1. 获取或创建作品的共享连接（一个 work 一个 WebSocket）
    const wsUrl = getWebSocketUrl();
    const workConn = yjsConnectionManager.getWorkConnection(workId, wsUrl);
    const { ydoc, wsProvider } = workConn;
    wsProviderRef.current = wsProvider;

    // 2. 监听连接状态
    const statusHandler = (event: { status: string }) => {
      if (event.status === 'connected') {
        setConnectionStatus('connected');
      } else if (event.status === 'disconnected') {
        setConnectionStatus('disconnected');
      } else {
        setConnectionStatus('connecting');
      }
    };
    wsProvider.on('status', statusHandler);

    // 3. 等待同步完成后设置 collabState（Collaboration 使用 document + field）
    // 优先等待 IndexedDB 加载完成，这样重启后能立即显示本地持久化的章节内容
    let readyMarked = false;
    const markReady = () => {
      if (!readyMarked) {
        readyMarked = true;
        console.log('✅ [useYjsEditor] 协作就绪:', documentId);
        setCollabState({ ydoc, wsProvider, field });
      }
    };

    // 重启后先等 IndexedDB 把 ydoc 灌满，再显示编辑器，避免看到空内容
    workConn.idbProvider.whenSynced.then(() => {
      markReady();
    }).catch(() => {
      if (!readyMarked) markReady();
    });

    wsProvider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        markReady();
        onSyncSuccess?.(Date.now());
      }
    });

    const timeout = setTimeout(() => {
      if (!readyMarked) {
        markReady();
      }
    }, 5000);

    return () => {
      clearTimeout(timeout);
      setCollabState(null);
      setConnectionStatus('disconnected');
      wsProvider.off('status', statusHandler);
      yjsConnectionManager.releaseConnection(workId);
      wsProviderRef.current = null;
      isInitialized.current = false;
    };
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 创建编辑器 =====
  // 依赖 collabState 使编辑器在协作就绪时完整重建
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 由 Collaboration 扩展提供撤销重做
        undoRedo: false,
        // StarterKit 默认包含 underline，如果不需要可以禁用
        // underline: false, // 保持默认启用 underline
      }),
      Placeholder.configure({
        placeholder,
      }),
      // 仅在 collabState 就绪后添加协作扩展（同一 Y.Doc，不同 field 区分章节）
      ...(collabState
        ? [
            Collaboration.configure({
              document: collabState.ydoc,
              field: collabState.field,
            }),
            CollaborationCursor.configure({
              provider: collabState.wsProvider,
              user: userInfo,
            }),
          ]
        : []),
    ],
    editable,
    editorProps: {
      attributes: {
        class: 'novel-editor-content',
      },
    },
    onCreate: ({ editor: ed }) => {
      console.log('✨ [useYjsEditor] 编辑器已创建');

      if (!collabState) return;
      const xmlFragment = collabState.ydoc.getXmlFragment(collabState.field);
      if (xmlFragment.length > 0) return; // 已有内容（IndexedDB/WebSocket），不覆盖
      if (isInitialized.current) return;

      const loadingField = collabState.field;

      const applyContent = (html: string) => {
        if (!html || isInitialized.current) return;
        // 仍为同一章节且 fragment 仍为空时再写入（避免切换章节后旧请求覆盖新章节）
        const frag = collabState?.ydoc.getXmlFragment(loadingField);
        if (collabState?.field !== loadingField || (frag && frag.length > 0)) return;
        ed.commands.setContent(html);
        isInitialized.current = true;
        console.log('📝 [useYjsEditor] 已从后端注入初始内容');
      };

      if (initialContent) {
        applyContent(initialContent);
        isInitialized.current = true;
        return;
      }

      if (fetchInitialContent) {
        const docIdFetchedFor = documentId;
        fetchInitialContent(docIdFetchedFor)
          .then((html) => {
            if (documentIdRef.current !== docIdFetchedFor) return;
            applyContent(html || '');
          })
          .catch((err) => {
            console.warn('⚠️ [useYjsEditor] 从后端拉取初始内容失败:', err);
          });
      }
    },
    onUpdate: ({ editor: ed }) => {
      if (onUpdate) {
        const html = ed.getHTML();
        onUpdate(html);
      }
    },
  }, [collabState]); // 当 collabState 改变时重新创建编辑器

  // ===== 手动保存（兼容旧接口） =====
  const syncToServer = useCallback(async () => {
    if (!editor) return;

    console.log('💾 [useYjsEditor] 手动保存确认（y-websocket 自动同步中）');

    if (wsProviderRef.current?.wsconnected) {
      onSyncSuccess?.(Date.now());
    } else {
      onSyncError?.(new Error('WebSocket 未连接，文档将在重连后自动同步'));
    }
  }, [editor, onSyncSuccess, onSyncError]);

  // ===== 从服务器加载（兼容旧接口） =====
  const loadFromServer = useCallback(async () => {
    if (!editor || !wsProviderRef.current) return;

    console.log('📥 [useYjsEditor] 请求从服务器加载（触发重连同步）');

    if (wsProviderRef.current.wsconnected) {
      wsProviderRef.current.disconnect();
      setTimeout(() => {
        wsProviderRef.current?.connect();
      }, 100);
    } else {
      wsProviderRef.current.connect();
    }
  }, [editor]);

  return {
    editor,
    syncToServer,
    loadFromServer,
    isSyncing: connectionStatus === 'connecting',
    connectionStatus,
  };
}
