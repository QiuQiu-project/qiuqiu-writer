import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Undo2, Redo2, Type, Bold, Underline, ToggleLeft, ToggleRight } from 'lucide-react';

interface NovelEditorProps {
  smartCompletion?: boolean;
  onSmartCompletionChange?: (value: boolean) => void;
}

export default function NovelEditor({
  smartCompletion = false,
  onSmartCompletionChange,
}: NovelEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure(),
      UnderlineExtension,
      Placeholder.configure({
        placeholder: '开始写作...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
      }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'novel-editor-content',
      },
    },
    enableInputRules: true,
    enablePasteRules: true,
  });

  return (
    <div className="novel-editor">
      {/* 工具栏、AI按钮和设置栏 - 单行显示 */}
      <div className="editor-toolbar-row">
        {/* 文本编辑工具栏 */}
        <div className="novel-editor-toolbar">
          <div className="toolbar-group">
            <button
              className="toolbar-btn"
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={!editor?.can().undo()}
              title="撤销"
            >
              <Undo2 size={16} />
            </button>
            <button
              className="toolbar-btn"
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={!editor?.can().redo()}
              title="重做"
            >
              <Redo2 size={16} />
            </button>
          </div>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <button
              className="toolbar-btn"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              title="一级标题 (Markdown: # 标题)"
            >
              <Type size={16} />
              <span>H1</span>
            </button>
            <button
              className="toolbar-btn"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="粗体 (Markdown: **文本**)"
            >
              <Bold size={16} />
            </button>
            <button
              className="toolbar-btn"
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              title="下划线"
            >
              <Underline size={16} />
            </button>
          </div>
        </div>
        {/* 设置栏 */}
        <div className="editor-settings">
          <div className="setting-item">
            <span>智能补全</span>
            <button
              className="toggle-btn"
              onClick={() => onSmartCompletionChange?.(!smartCompletion)}
            >
              {smartCompletion ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* 文本编辑区域 */}
      <div className="novel-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

