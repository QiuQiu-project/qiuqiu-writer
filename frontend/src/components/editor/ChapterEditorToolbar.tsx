import { useRef, useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Undo2, Redo2, Save, Heading, Bold, Underline, ChevronDown, Settings, History, Copy, Check } from 'lucide-react';

interface ChapterEditorToolbarProps {
  editor: Editor | null;
  onManualSave: () => void;
  onEditChapter?: () => void;
  onOpenHistory?: () => void;
  headingMenuOpen: boolean;
  setHeadingMenuOpen: (open: boolean) => void;
}

export default function ChapterEditorToolbar({
  editor,
  onManualSave,
  onEditChapter,
  onOpenHistory,
  headingMenuOpen,
  setHeadingMenuOpen,
}: ChapterEditorToolbarProps) {
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const headingButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="novel-editor-toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
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
          className="toolbar-btn"
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
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        {/* 标题下拉菜单 */}
        <div className="toolbar-dropdown" ref={headingMenuRef}>
          <button
            ref={headingButtonRef}
            className="toolbar-btn"
            onClick={(e) => {
              e.stopPropagation();
              const newState = !headingMenuOpen;
              setHeadingMenuOpen(newState);
              // 动态计算下拉菜单位置（移动端和桌面端都需要）
              if (newState && headingButtonRef.current) {
                setTimeout(() => {
                  if (headingButtonRef.current && dropdownMenuRef.current) {
                    const rect = headingButtonRef.current.getBoundingClientRect();
                    // 统一使用 fixed 定位，避免被父容器 overflow 裁剪
                    dropdownMenuRef.current.style.position = 'fixed';
                    dropdownMenuRef.current.style.left = `${rect.left}px`;
                    dropdownMenuRef.current.style.top = `${rect.bottom + 4}px`;
                    dropdownMenuRef.current.style.transform = 'none';
                    dropdownMenuRef.current.style.zIndex = '1001'; // 确保高于工具栏
                  }
                }, 0);
              }
            }}
            title="标题样式"
          >
            <Heading size={16} />
            <span className="heading-text">{currentHeading}</span>
            <ChevronDown size={14} className="dropdown-arrow" />
          </button>
          {headingMenuOpen && (
            <div 
              ref={dropdownMenuRef}
              className="toolbar-dropdown-menu"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={`toolbar-dropdown-item ${editor?.isActive('heading', { level: 1 }) ? 'active' : ''}`}
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 1 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="一级标题 (Markdown: # 标题)"
              >
                <span className="heading-label">H1</span>
                <span className="heading-preview">一级标题</span>
              </button>
              <button
                className={`toolbar-dropdown-item ${editor?.isActive('heading', { level: 2 }) ? 'active' : ''}`}
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 2 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="二级标题 (Markdown: ## 标题)"
              >
                <span className="heading-label">H2</span>
                <span className="heading-preview">二级标题</span>
              </button>
              <button
                className={`toolbar-dropdown-item ${editor?.isActive('heading', { level: 3 }) ? 'active' : ''}`}
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 3 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="三级标题 (Markdown: ### 标题)"
              >
                <span className="heading-label">H3</span>
                <span className="heading-preview">三级标题</span>
              </button>
              <button
                className={`toolbar-dropdown-item ${editor?.isActive('heading', { level: 4 }) ? 'active' : ''}`}
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 4 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="四级标题 (Markdown: #### 标题)"
              >
                <span className="heading-label">H4</span>
                <span className="heading-preview">四级标题</span>
              </button>
              <button
                className={`toolbar-dropdown-item ${editor?.isActive('heading', { level: 5 }) ? 'active' : ''}`}
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 5 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="五级标题 (Markdown: ##### 标题)"
              >
                <span className="heading-label">H5</span>
                <span className="heading-preview">五级标题</span>
              </button>
              <button
                className={`toolbar-dropdown-item ${editor?.isActive('heading', { level: 6 }) ? 'active' : ''}`}
                onClick={() => {
                  editor?.chain().focus().toggleHeading({ level: 6 }).run();
                  setHeadingMenuOpen(false);
                }}
                title="六级标题 (Markdown: ###### 标题)"
              >
                <span className="heading-label">H6</span>
                <span className="heading-preview">六级标题</span>
              </button>
              <div className="toolbar-dropdown-divider" />
              <button
                className={`toolbar-dropdown-item ${editor?.isActive('paragraph') && !editor?.isActive('heading') ? 'active' : ''}`}
                onClick={() => {
                  editor?.chain().focus().setParagraph().run();
                  setHeadingMenuOpen(false);
                }}
                title="普通段落"
              >
                <span className="heading-label">P</span>
                <span className="heading-preview">普通段落</span>
              </button>
            </div>
          )}
        </div>
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
      <div className="toolbar-divider" />
      <div className="toolbar-group toolbar-group-end">
        <button
          type="button"
          className={`toolbar-btn ${copyJustDone ? 'toolbar-btn-copy-done' : ''}`}
          onClick={async () => {
            if (!editor) return;
            const text = editor.getText();
            try {
              await navigator.clipboard.writeText(text);
              setCopyJustDone(true);
              setTimeout(() => setCopyJustDone(false), 1500);
            } catch {
              setCopyJustDone(true);
              setTimeout(() => setCopyJustDone(false), 1500);
            }
          }}
          title={copyJustDone ? '已复制到剪贴板' : '复制全文'}
        >
          {copyJustDone ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onManualSave()}
          title="保存当前章节"
        >
          <Save size={16} />
        </button>
        {onEditChapter && (
          <button
            className="toolbar-btn"
            onClick={onEditChapter}
            title="章节设置"
          >
            <Settings size={16} />
          </button>
        )}
        {onOpenHistory && (
          <button
            type="button"
            className="toolbar-btn"
            onClick={onOpenHistory}
            title="历史记录"
          >
            <History size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

