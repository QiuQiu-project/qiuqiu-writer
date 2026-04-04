import { useRef, useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Undo2, Redo2, Save, Heading, Bold, Underline, ChevronDown, Settings, History, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';
import { cn } from '@/lib/utils';

interface ChapterEditorToolbarProps {
  editor: Editor | null;
  onManualSave: () => void;
  onEditChapter?: () => void;
  onOpenHistory?: () => void;
  headingMenuOpen: boolean;
  setHeadingMenuOpen: (open: boolean) => void;
  readOnly?: boolean;
}

export default function ChapterEditorToolbar({
  editor,
  onManualSave,
  onEditChapter,
  onOpenHistory,
  headingMenuOpen,
  setHeadingMenuOpen,
  readOnly,
}: ChapterEditorToolbarProps) {
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const [currentHeading, setCurrentHeading] = useState<string>('P');
  const [copyJustDone, setCopyJustDone] = useState(false);

  // 点击外部关闭标题下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (headingMenuRef.current && !headingMenuRef.current.contains(event.target as Node)) {
        setHeadingMenuOpen(false);
      }
    };

    if (headingMenuOpen) {
      // 使用 setTimeout 确保事件监听器在点击事件之后添加
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [headingMenuOpen, setHeadingMenuOpen]);

  // 监听编辑器状态变化，更新当前标题类型显示
  useEffect(() => {
    if (!editor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentHeading('P');
      return;
    }

    const updateHeading = () => {
      // 检查当前选中的节点类型
      if (editor.isActive('heading', { level: 1 })) {
        setCurrentHeading('H1');
      } else if (editor.isActive('heading', { level: 2 })) {
        setCurrentHeading('H2');
      } else if (editor.isActive('heading', { level: 3 })) {
        setCurrentHeading('H3');
      } else if (editor.isActive('heading', { level: 4 })) {
        setCurrentHeading('H4');
      } else if (editor.isActive('heading', { level: 5 })) {
        setCurrentHeading('H5');
      } else if (editor.isActive('heading', { level: 6 })) {
        setCurrentHeading('H6');
      } else if (editor.isActive('paragraph')) {
        setCurrentHeading('P');
      } else {
        // 默认显示段落
        setCurrentHeading('P');
      }
    };

    // 延迟初始更新，确保编辑器完全初始化
    const timer = setTimeout(() => {
      updateHeading();
    }, 100);

    // 监听选择变化和更新事件
    editor.on('selectionUpdate', updateHeading);
    editor.on('update', updateHeading);
    editor.on('transaction', updateHeading);

    return () => {
      clearTimeout(timer);
      editor.off('selectionUpdate', updateHeading);
      editor.off('update', updateHeading);
      editor.off('transaction', updateHeading);
    };
  }, [editor]);

  // Collaboration extension replaces built-in History, so undo/redo may not exist.
  // Safely check capabilities to avoid runtime errors.
  const canUndo = (() => {
    try { return editor?.can().undo() ?? false; } catch { return false; }
  })();
  const canRedo = (() => {
    try { return editor?.can().redo() ?? false; } catch { return false; }
  })();

  if (readOnly) return null;

  const toolbarButtonClassName =
    'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border border-transparent bg-transparent px-3 text-sm text-[#1f045a] transition-colors hover:bg-[#f8f1ff] hover:text-[#1f045a] disabled:cursor-not-allowed disabled:opacity-40';
  const dropdownItemClassName =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#1f045a] transition-colors hover:bg-[#f8f1ff]';
  const toolbarGroupClassName =
    'flex items-center gap-1 rounded-full border border-[#ede4ff] bg-white px-2 py-1';

  return (
    <div className="sticky top-4 z-20 flex justify-center px-6 max-md:px-4">
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-[28px] border border-[#ede4ff] bg-white/95 px-3 py-2 shadow-[0px_18px_40px_rgba(31,4,90,0.10)] backdrop-blur-xl">
        <div className={toolbarGroupClassName}>
          <button
            className={toolbarButtonClassName}
            onClick={() => {
              if (!editor) return;
              try { editor.chain().focus().undo().run(); } catch { /* no history */ }
            }}
            disabled={!canUndo}
            title="撤销"
          >
            <Undo2 size={16} />
          </button>
          <button
            className={toolbarButtonClassName}
            onClick={() => {
              if (!editor) return;
              try { editor.chain().focus().redo().run(); } catch { /* no history */ }
            }}
            disabled={!canRedo}
            title="重做"
          >
            <Redo2 size={16} />
          </button>
        </div>
        <div className={toolbarGroupClassName}>
          <div className="relative" ref={headingMenuRef}>
            <button
              className={cn(toolbarButtonClassName, 'min-w-[92px] justify-between px-4')}
              onClick={(e) => {
                e.stopPropagation();
                setHeadingMenuOpen(!headingMenuOpen);
              }}
              title="标题样式"
            >
              <Heading size={16} />
              <span className="text-xs font-medium">{currentHeading}</span>
              <ChevronDown size={14} className="opacity-70" />
            </button>
            {headingMenuOpen && (
              <div 
                className="absolute left-0 top-[calc(100%+10px)] z-[1200] min-w-[180px] rounded-xl border border-[#ede4ff] bg-white p-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className={cn(dropdownItemClassName, editor?.isActive('heading', { level: 1 }) && 'bg-[#fff2e5] text-[#ff8000]')}
                  onClick={() => {
                    editor?.chain().focus().toggleHeading({ level: 1 }).run();
                    setHeadingMenuOpen(false);
                  }}
                  title="一级标题 (Markdown: # 标题)"
                >
                  <span className="w-8 text-xs font-semibold">H1</span>
                  <span className="text-sm">一级标题</span>
                </button>
                <button
                  className={cn(dropdownItemClassName, editor?.isActive('heading', { level: 2 }) && 'bg-[#fff2e5] text-[#ff8000]')}
                  onClick={() => {
                    editor?.chain().focus().toggleHeading({ level: 2 }).run();
                    setHeadingMenuOpen(false);
                  }}
                  title="二级标题 (Markdown: ## 标题)"
                >
                  <span className="w-8 text-xs font-semibold">H2</span>
                  <span className="text-sm">二级标题</span>
                </button>
                <button
                  className={cn(dropdownItemClassName, editor?.isActive('heading', { level: 3 }) && 'bg-[#fff2e5] text-[#ff8000]')}
                  onClick={() => {
                    editor?.chain().focus().toggleHeading({ level: 3 }).run();
                    setHeadingMenuOpen(false);
                  }}
                  title="三级标题 (Markdown: ### 标题)"
                >
                  <span className="w-8 text-xs font-semibold">H3</span>
                  <span className="text-sm">三级标题</span>
                </button>
                <button
                  className={cn(dropdownItemClassName, editor?.isActive('heading', { level: 4 }) && 'bg-[#fff2e5] text-[#ff8000]')}
                  onClick={() => {
                    editor?.chain().focus().toggleHeading({ level: 4 }).run();
                    setHeadingMenuOpen(false);
                  }}
                  title="四级标题 (Markdown: #### 标题)"
                >
                  <span className="w-8 text-xs font-semibold">H4</span>
                  <span className="text-sm">四级标题</span>
                </button>
                <button
                  className={cn(dropdownItemClassName, editor?.isActive('heading', { level: 5 }) && 'bg-[#fff2e5] text-[#ff8000]')}
                  onClick={() => {
                    editor?.chain().focus().toggleHeading({ level: 5 }).run();
                    setHeadingMenuOpen(false);
                  }}
                  title="五级标题 (Markdown: ##### 标题)"
                >
                  <span className="w-8 text-xs font-semibold">H5</span>
                  <span className="text-sm">五级标题</span>
                </button>
                <button
                  className={cn(dropdownItemClassName, editor?.isActive('heading', { level: 6 }) && 'bg-[#fff2e5] text-[#ff8000]')}
                  onClick={() => {
                    editor?.chain().focus().toggleHeading({ level: 6 }).run();
                    setHeadingMenuOpen(false);
                  }}
                  title="六级标题 (Markdown: ###### 标题)"
                >
                  <span className="w-8 text-xs font-semibold">H6</span>
                  <span className="text-sm">六级标题</span>
                </button>
                <div className="my-1 h-px bg-[#ede4ff]" />
                <button
                  className={cn(dropdownItemClassName, editor?.isActive('paragraph') && !editor?.isActive('heading') && 'bg-[#fff2e5] text-[#ff8000]')}
                  onClick={() => {
                    editor?.chain().focus().setParagraph().run();
                    setHeadingMenuOpen(false);
                  }}
                  title="普通段落"
                >
                  <span className="w-8 text-xs font-semibold">P</span>
                  <span className="text-sm">普通段落</span>
                </button>
              </div>
            )}
          </div>
          <button
            className={cn(toolbarButtonClassName, editor?.isActive('bold') && 'bg-[#fff2e5] text-[#ff8000]')}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="粗体 (Markdown: **文本**)"
          >
            <Bold size={16} />
          </button>
          <button
            className={cn(toolbarButtonClassName, editor?.isActive('underline') && 'bg-[#fff2e5] text-[#ff8000]')}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            title="下划线"
          >
            <Underline size={16} />
          </button>
        </div>
        <div className={toolbarGroupClassName}>
          <button
            type="button"
            className={cn(toolbarButtonClassName, copyJustDone && 'bg-[#edf8f7] text-[#2b6e66]')}
            onClick={async () => {
              if (!editor) return;
              const text = editor.getText();
              const success = await copyToClipboard(text);
              if (success) {
                setCopyJustDone(true);
                setTimeout(() => setCopyJustDone(false), 1500);
              }
            }}
            title={copyJustDone ? '已复制到剪贴板' : '复制全文'}
          >
            {copyJustDone ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button
            className={cn(toolbarButtonClassName, 'bg-[#ffc329] px-4 text-[#5b4300] hover:bg-[#f1c241] hover:text-[#5b4300]')}
            onClick={() => onManualSave()}
            title="保存当前章节"
          >
            <Save size={16} />
            <span className="max-md:hidden">保存</span>
          </button>
          {onEditChapter && (
            <button
              className={toolbarButtonClassName}
              onClick={onEditChapter}
              title="章节设置"
            >
              <Settings size={16} />
            </button>
          )}
          {onOpenHistory && (
            <button
              type="button"
              className={toolbarButtonClassName}
              onClick={onOpenHistory}
              title="历史记录"
            >
              <History size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
