import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Quote, Code, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Highlighter, Palette, Type
} from 'lucide-react';

const TipTapEditor = () => {
  const [isCollabReady, setIsCollabReady] = useState(false);
  const [userName] = useState(`User-${Math.floor(Math.random() * 1000)}`);
  const [userColor] = useState(
    `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
  );
  const ydocRef = useRef(null);
  const providerRef = useRef(null);

  // 初始化 Y.js 文档和协作提供者
  useEffect(() => {
    // 创建 Y.js 文档
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // 创建 WebRTC 提供者
    const provider = new WebrtcProvider('tiptap-collaboration-room', ydoc, {
      signaling: ['wss://signaling.yjs.dev'],
    });
    providerRef.current = provider;

    // 等待连接建立
    provider.on('synced', () => {
      console.log('Collaboration synced');
      setIsCollabReady(true);
    });

    // 清理函数
    return () => {
      provider?.destroy();
      ydoc?.destroy();
    };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 禁用默认的 history，因为协作扩展会提供自己的 history
        history: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Color,
      TextStyle,
      Placeholder.configure({
        placeholder: '开始输入内容...',
      }),
      // 只有在协作准备就绪后才添加协作扩展
      ...(isCollabReady && ydocRef.current
        ? [
            Collaboration.configure({
              document: ydocRef.current,
            }),
            CollaborationCursor.configure({
              provider: providerRef.current,
              user: {
                name: userName,
                color: userColor,
              },
            }),
          ]
        : []),
    ],
    content: `
      <h1>欢迎使用 TipTap 编辑器</h1>
      <p>这是一个功能完善的富文本编辑器，支持：</p>
      <ul>
        <li>丰富的文本格式化选项</li>
        <li>多种标题级别</li>
        <li>列表和引用</li>
        <li>实时协作编辑</li>
      </ul>
      <p>试试各种格式化工具吧！</p>
    `,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[400px] px-8 py-6',
      },
    },
  }, [isCollabReady]); // 当协作状态改变时重新创建编辑器

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-xl">正在加载编辑器...</div>
      </div>
    );
  }

  const MenuButton = ({ onClick, active, children, title }) => (
    <button
      onClick={onClick}
      className={`p-2 rounded hover:bg-white/10 transition-all duration-200 ${
        active ? 'bg-white/20 text-amber-300' : 'text-white/80 hover:text-white'
      }`}
      title={title}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-6 bg-white/20 mx-1" />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-5xl mx-auto">
        {/* 标题区域 */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-pink-300 to-purple-300 mb-3">
            TipTap 协作编辑器
          </h1>
          <div className="flex items-center justify-center gap-3 text-white/60">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full animate-pulse" 
                style={{ backgroundColor: userColor }}
              />
              <span className="text-sm">{userName}</span>
            </div>
            <span>•</span>
            <span className="text-sm">
              {isCollabReady ? '✓ 已连接' : '⟳ 连接中...'}
            </span>
          </div>
        </div>

        {/* 编辑器容器 */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
          {/* 工具栏 */}
          <div className="bg-black/20 border-b border-white/10 p-3 flex flex-wrap gap-2 items-center">
            {/* 文本样式 */}
            <MenuButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive('bold')}
              title="粗体 (Ctrl+B)"
            >
              <Bold size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive('italic')}
              title="斜体 (Ctrl+I)"
            >
              <Italic size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive('underline')}
              title="下划线 (Ctrl+U)"
            >
              <UnderlineIcon size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              active={editor.isActive('strike')}
              title="删除线"
            >
              <Strikethrough size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              active={editor.isActive('highlight')}
              title="高亮"
            >
              <Highlighter size={18} />
            </MenuButton>

            <Divider />

            {/* 标题 */}
            {[1, 2, 3].map((level) => (
              <MenuButton
                key={level}
                onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                active={editor.isActive('heading', { level })}
                title={`标题 ${level}`}
              >
                <Type size={18 - level * 2} />
              </MenuButton>
            ))}

            <Divider />

            {/* 列表 */}
            <MenuButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive('bulletList')}
              title="无序列表"
            >
              <List size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive('orderedList')}
              title="有序列表"
            >
              <ListOrdered size={18} />
            </MenuButton>

            <Divider />

            {/* 对齐 */}
            <MenuButton
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              active={editor.isActive({ textAlign: 'left' })}
              title="左对齐"
            >
              <AlignLeft size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              active={editor.isActive({ textAlign: 'center' })}
              title="居中对齐"
            >
              <AlignCenter size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              active={editor.isActive({ textAlign: 'right' })}
              title="右对齐"
            >
              <AlignRight size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().setTextAlign('justify').run()}
              active={editor.isActive({ textAlign: 'justify' })}
              title="两端对齐"
            >
              <AlignJustify size={18} />
            </MenuButton>

            <Divider />

            {/* 其他 */}
            <MenuButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive('blockquote')}
              title="引用"
            >
              <Quote size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              active={editor.isActive('codeBlock')}
              title="代码块"
            >
              <Code size={18} />
            </MenuButton>

            <Divider />

            {/* 撤销/重做 */}
            <MenuButton
              onClick={() => editor.chain().focus().undo().run()}
              title="撤销 (Ctrl+Z)"
            >
              <Undo size={18} />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().redo().run()}
              title="重做 (Ctrl+Shift+Z)"
            >
              <Redo size={18} />
            </MenuButton>

            <Divider />

            {/* 颜色选择器 */}
            <div className="flex items-center gap-2">
              <Palette size={18} className="text-white/60" />
              <input
                type="color"
                onInput={(e) => editor.chain().focus().setColor(e.target.value).run()}
                value={editor.getAttributes('textStyle').color || '#000000'}
                className="w-8 h-8 rounded cursor-pointer bg-transparent"
                title="文字颜色"
              />
            </div>
          </div>

          {/* 编辑器内容区域 */}
          <div className="bg-white/95 backdrop-blur-sm">
            <EditorContent editor={editor} />
          </div>

          {/* 状态栏 */}
          <div className="bg-black/20 border-t border-white/10 px-4 py-2 flex justify-between items-center text-xs text-white/60">
            <div>
              {editor.storage.characterCount?.characters() || 0} 字符 • 
              {editor.storage.characterCount?.words() || 0} 单词
            </div>
            <div>
              {isCollabReady ? (
                <span className="text-green-400">● 协作已启用</span>
              ) : (
                <span className="text-yellow-400">○ 正在连接...</span>
              )}
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="mt-6 text-center text-white/40 text-sm">
          <p>支持实时协作编辑 • 在新窗口打开相同页面即可体验多人协作</p>
        </div>
      </div>

      <style>{`
        .ProseMirror {
          outline: none;
        }

        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }

        .ProseMirror h1 {
          font-size: 2em;
          font-weight: bold;
          margin-top: 0.67em;
          margin-bottom: 0.67em;
        }

        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: bold;
          margin-top: 0.83em;
          margin-bottom: 0.83em;
        }

        .ProseMirror h3 {
          font-size: 1.17em;
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 1em;
        }

        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 2em;
          margin: 1em 0;
        }

        .ProseMirror ul {
          list-style-type: disc;
        }

        .ProseMirror ol {
          list-style-type: decimal;
        }

        .ProseMirror li {
          margin: 0.5em 0;
        }

        .ProseMirror blockquote {
          border-left: 4px solid #ddd;
          padding-left: 1em;
          margin: 1em 0;
          color: #666;
          font-style: italic;
        }

        .ProseMirror code {
          background-color: #f4f4f4;
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.9em;
        }

        .ProseMirror pre {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 1em;
          border-radius: 8px;
          overflow-x: auto;
          margin: 1em 0;
        }

        .ProseMirror pre code {
          background: none;
          padding: 0;
          color: inherit;
          font-size: 0.875em;
        }

        .ProseMirror mark {
          background-color: #fff59d;
          padding: 0.125em 0;
        }

        /* 协作光标样式 */
        .collaboration-cursor__caret {
          border-left: 1px solid #0d0d0d;
          border-right: 1px solid #0d0d0d;
          margin-left: -1px;
          margin-right: -1px;
          pointer-events: none;
          position: relative;
          word-break: normal;
        }

        .collaboration-cursor__label {
          border-radius: 3px 3px 3px 0;
          color: #0d0d0d;
          font-size: 12px;
          font-style: normal;
          font-weight: 600;
          left: -1px;
          line-height: normal;
          padding: 0.1rem 0.3rem;
          position: absolute;
          top: -1.4em;
          user-select: none;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
};

export default TipTapEditor;