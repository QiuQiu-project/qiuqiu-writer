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
import UnderlineExtension from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import { authApi } from '../utils/authApi';

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
}

export interface UseYjsEditorOptions {
  /** 文档ID（同时作为 y-websocket room name） */
  documentId: string;
  /** 初始内容（HTML） */
  initialContent?: string;
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

  // ===== 初始化 Y.Doc 和 Providers =====
  // 注意：cleanup 函数负责重置 collabState 和 connectionStatus，
  // 无需在 effect 开头重复设置（首次运行时已是初始值 null/'disconnected'）
  useEffect(() => {
    isInitialized.current = false;

    if (!documentId) {
      wsProviderRef.current = null;
      return;
    }

    console.log('📄 [useYjsEditor] 创建 Yjs 文档:', documentId);

    // 1. 创建 Y.Doc
    const ydoc = new Y.Doc();

    // 2. 创建 IndexedDB 持久化（离线支持）
    const idbProvider = new IndexeddbPersistence(documentId, ydoc);

    // 3. 创建 WebSocket Provider（连接后端）
    const wsUrl = getWebSocketUrl();
    console.log('🔌 [useYjsEditor] 连接 WebSocket:', wsUrl, '房间:', documentId);

    const wsProvider = new WebsocketProvider(
      wsUrl,
      documentId,
      ydoc,
      { connect: true }
    );
    wsProviderRef.current = wsProvider;

    // 4. 监听连接状态
    wsProvider.on('status', (event: { status: string }) => {
      console.log('🔗 [useYjsEditor] WebSocket 状态:', event.status);
      if (event.status === 'connected') {
        setConnectionStatus('connected');
      } else if (event.status === 'disconnected') {
        setConnectionStatus('disconnected');
      } else {
        setConnectionStatus('connecting');
      }
    });

    // 5. 等待同步完成后设置 collabState（触发编辑器创建）
    let readyMarked = false;
    const markReady = () => {
      if (!readyMarked) {
        readyMarked = true;
        console.log('✅ [useYjsEditor] 协作就绪:', documentId);
        setCollabState({ ydoc, wsProvider });
      }
    };

    idbProvider.on('synced', () => {
      console.log('💾 [useYjsEditor] IndexedDB 已同步:', documentId);
      markReady();
    });

    wsProvider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        console.log('🌐 [useYjsEditor] WebSocket 已同步:', documentId);
        markReady();
        onSyncSuccess?.(Date.now());
      }
    });

    // 超时兜底
    const timeout = setTimeout(() => {
      if (!readyMarked) {
        console.log('⏰ [useYjsEditor] 初始化超时，强制就绪');
        markReady();
      }
    }, 5000);

    // 6. 清理
    return () => {
      clearTimeout(timeout);
      console.log('🧹 [useYjsEditor] 清理资源:', documentId);
      setCollabState(null);
      setConnectionStatus('disconnected');
      wsProvider.destroy();
      idbProvider.destroy();
      ydoc.destroy();
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
      }),
      UnderlineExtension,
      Placeholder.configure({
        placeholder,
      }),
      // 仅在 collabState 就绪后添加协作扩展
      ...(collabState
        ? [
            Collaboration.configure({
              document: collabState.ydoc,
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

      // 如果有初始内容且 Yjs 文档为空，设置初始内容
      if (initialContent && !isInitialized.current && collabState) {
        const xmlFragment = collabState.ydoc.getXmlFragment('default');
        if (xmlFragment.length === 0) {
          console.log('📝 [useYjsEditor] 设置初始内容');
          ed.commands.setContent(initialContent);
          isInitialized.current = true;
        }
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
