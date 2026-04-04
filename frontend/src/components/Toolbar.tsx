import { Bold, Italic, Underline, List, ListOrdered, Quote } from 'lucide-react';
import { Editor as TipTapEditor } from '@tiptap/react';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  editor: TipTapEditor | null;
}

const btnClass = 'flex items-center justify-center w-8 h-8 border-none rounded-[4px] cursor-pointer transition-all bg-transparent hover:[background:var(--bg-primary)] hover:[color:var(--text-primary)]';

export default function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 border-b"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      <div className="flex items-center gap-1">
        {[
          { action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), icon: Bold, title: '粗体' },
          { action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), icon: Italic, title: '斜体' },
          { action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), icon: Underline, title: '下划线' },
        ].map(({ action, active, icon: Icon, title }) => (
          <button
            key={title}
            className={cn(btnClass, active && 'text-white')}
            style={active ? { background: 'var(--accent-color)', color: 'white' } : { color: 'var(--text-secondary)' }}
            onClick={action}
            title={title}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border-color)' }} />

      <div className="flex items-center gap-1">
        {[
          { action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), icon: List, title: '无序列表' },
          { action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), icon: ListOrdered, title: '有序列表' },
          { action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote'), icon: Quote, title: '引用' },
        ].map(({ action, active, icon: Icon, title }) => (
          <button
            key={title}
            className={cn(btnClass, active && 'text-white')}
            style={active ? { background: 'var(--accent-color)', color: 'white' } : { color: 'var(--text-secondary)' }}
            onClick={action}
            title={title}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}
