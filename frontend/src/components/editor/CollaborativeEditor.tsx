/**
 * 协作编辑器组件示例
 * 使用TipTap + Yjs实现实时协作编辑
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { useCollaboration } from '../../hooks/useCollaboration'
import { useEffect } from 'react'

interface CollaborativeEditorProps {
  documentId: string
  userId?: number
  userName?: string
  userColor?: string
}

export function CollaborativeEditor({
  documentId,
  userId = 0,
  userName = 'User',
  userColor = '#958DF1'
}: CollaborativeEditorProps) {
  const { yjsClient, connected } = useCollaboration({
    documentId,
    userId,
    type: 'yjs',
    onContentChange: (content) => {
      console.log('📝 内容已更新:', content.length, '字符')
    }
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      // Yjs协作扩展
      ...(yjsClient ? [
        Collaboration.configure({
          document: yjsClient.getDoc()
        }),
        CollaborationCursor.configure({
          provider: yjsClient.getAwareness(),
          user: {
            name: userName,
            color: userColor
          }
        })
      ] : [])
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[500px] p-4'
      }
    }
  })

  // 更新编辑器内容
  useEffect(() => {
    if (editor && yjsClient) {
      const ytext = yjsClient.getText()
      // Yjs会自动同步，不需要手动更新
    }
  }, [editor, yjsClient])

  if (!editor) {
    return <div>加载编辑器...</div>
  }

  return (
    <div className="collaborative-editor">
      <div className="editor-toolbar mb-4 p-2 bg-gray-100 rounded">
        <div className="flex items-center gap-4">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-3 py-1 rounded ${editor.isActive('bold') ? 'bg-blue-500 text-white' : 'bg-white'}`}
          >
            Bold
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-3 py-1 rounded ${editor.isActive('italic') ? 'bg-blue-500 text-white' : 'bg-white'}`}
          >
            Italic
          </button>
          <div className="ml-auto">
            <span className={`px-2 py-1 rounded text-sm ${connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {connected ? '🟢 已连接' : '🔴 未连接'}
            </span>
          </div>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}


