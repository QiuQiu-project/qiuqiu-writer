import { Bold, Italic, Underline, List, ListOrdered, Quote } from 'lucide-react';
import { Editor as TipTapEditor } from '@tiptap/react';
import './Toolbar.css';

interface ToolbarProps {
  editor: TipTapEditor | null;
}

export default function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'is-active' : ''}
          title="粗体"
        >
          <Bold size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'is-active' : ''}
          title="斜体"
        >
          <Italic size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'is-active' : ''}
          title="下划线"
        >
          <Underline size={18} />
        </button>
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'is-active' : ''}
          title="无序列表"
        >
          <List size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'is-active' : ''}
          title="有序列表"
        >
          <ListOrdered size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'is-active' : ''}
          title="引用"
        >
          <Quote size={18} />
        </button>
      </div>
    </div>
  );
}

