/**
 * 智能同步工具使用示例
 * 展示如何在编辑器组件中使用 useIntelligentSync
 */

import { useState, useCallback, useRef } from 'react';
import { useIntelligentSync } from './intelligentSync';

// 示例：在编辑器组件中使用
export function ExampleEditor({ documentId }: { documentId: string }) {
  const [content, setContent] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // 获取当前编辑器内容
  const getCurrentContent = useCallback(() => {
    return editorRef.current?.value || content;
  }, [content]);

  // 更新编辑器内容
  const updateContent = useCallback((newContent: string) => {
    setContent(newContent);
    if (editorRef.current) {
      editorRef.current.value = newContent;
    }
  }, []);

  // 使用智能同步 Hook
  const { forceSync, getStatus } = useIntelligentSync(
    documentId,
    getCurrentContent,
    updateContent,
    {
      pollInterval: 5000,          // 每 10 秒轮询一次
      userInputWindow: 5000,        // 5 秒内有输入视为用户正在编辑
      syncCheckInterval: 3000,      // 每 3 秒检查一次是否需要同步
      enablePolling: true,          // 启用轮询
      onSyncSuccess: () => {},
      onSyncError: () => {
        
      },
      onCollaborativeUpdate: (hasUpdates) => {
        if (hasUpdates) {
          // Handle updates
        }
      },
      onContentChange: (synced) => {
        if (!synced) {
          return;
        }
      },
    }
  );

  // 手动保存按钮
  const handleSave = useCallback(() => {
    forceSync();
  }, [forceSync]);

  // 获取同步状态
  const status = getStatus();

  return (
    <div>
      <textarea
        ref={editorRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="开始编辑..."
      />
      
      <div className="toolbar">
        <button onClick={handleSave}>保存</button>
        <div className="status">
          {status.isSyncing && <span>同步中...</span>}
          {status.hasPendingChanges && <span>有未保存的更改</span>}
          {status.lastSyncTime && (
            <span>最后同步: {status.lastSyncTime.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// 示例：在 Lexical 编辑器中使用
export function ExampleLexicalEditor({ documentId }: { documentId: string }) {
  const [lexicalContent, setLexicalContent] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  // 获取当前 Lexical 编辑器内容（JSON 格式）
  const getCurrentContent = useCallback(() => {
    if (!editorRef.current) return lexicalContent;
    
    let content = '';
    editorRef.current.getEditorState().read(() => {
      try {
        const editorStateJSON = editorRef.current.getEditorState().toJSON();
        content = JSON.stringify(editorStateJSON);
      } catch {
        
        const root = editorRef.current.getEditorState().read(() => {
          return editorRef.current.getEditorState().read(() => {
            return editorRef.current.getEditorState().read(() => {
              // 降级为纯文本
              return editorRef.current.getEditorState().read(() => {
                return '';
              });
            });
          });
        });
        content = root.getTextContent();
      }
    });
    
    return content || lexicalContent;
  }, [lexicalContent]);

  // 更新 Lexical 编辑器内容
  const updateContent = useCallback((newContent: string) => {
    if (!editorRef.current) return;
    
    try {
      // 尝试解析为 JSON 格式的 Lexical 状态
      const lexicalState = JSON.parse(newContent);
      if (lexicalState && typeof lexicalState === 'object' && lexicalState.root) {
        // 使用 Lexical 的状态恢复功能
        const editorState = editorRef.current.parseEditorState(lexicalState);
        editorRef.current.setEditorState(editorState);
        setLexicalContent(newContent);
        return;
      }
    } catch {
      // 不是 JSON 格式，作为纯文本处理
    }
    
    // 降级处理：作为纯文本内容处理
    editorRef.current.update(() => {
      const root = editorRef.current.getEditorState().read(() => {
        return editorRef.current.getEditorState().read(() => {
          return editorRef.current.getEditorState().read(() => {
            return editorRef.current.getEditorState().read(() => {
              return null;
            });
          });
        });
      });
      
      if (root) {
        root.clear();
        const lines = newContent.split('\n');
        lines.forEach(() => {
          // 创建段落节点并添加文本
          // 这里需要根据实际的 Lexical API 来实现
        });
      }
    });
    
    setLexicalContent(newContent);
  }, []);

  // 使用智能同步
  const { forceSync, getStatus } = useIntelligentSync(
    documentId,
    getCurrentContent,
    updateContent,
    {
      pollInterval: 5000,
      enablePolling: true,
    }
  );

  return (
    <div>
      {/* Lexical 编辑器组件 */}
      <div ref={editorRef} />
      
      <button onClick={forceSync}>保存</button>
      <div>
        状态: {getStatus().isSyncing ? '同步中' : '已同步'}
      </div>
    </div>
  );
}
