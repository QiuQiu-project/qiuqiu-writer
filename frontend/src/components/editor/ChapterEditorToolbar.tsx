import { useRef, useEffect, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Undo2, Redo2, Save, Heading, Bold, Underline, ChevronDown, Settings } from 'lucide-react';

interface ChapterEditorToolbarProps {
  editor: Editor | null;
  onManualSave: () => void;
  onEditChapter?: () => void;
  headingMenuOpen: boolean;
  setHeadingMenuOpen: (open: boolean) => void;
}

export default function ChapterEditorToolbar({
  editor,
  onManualSave,
  onEditChapter,
  headingMenuOpen,
  setHeadingMenuOpen,
}: ChapterEditorToolbarProps) {
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const headingButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const [currentHeading, setCurrentHeading] = useState<string>('P');

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

  return (
    <div className="novel-editor-toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => {
            // 关键修复：每个章节有独立的编辑器实例，直接执行撤销即可
            if (!editor) return;
            editor.chain().focus().undo().run();
          }}
          disabled={!editor?.can().undo()}
          title="撤销"
        >
          <Undo2 size={16} />
        </button>
        <button
          className="toolbar-btn"
          onClick={() => {
            // 关键修复：每个章节有独立的编辑器实例，直接执行重做即可
            if (!editor) return;
            editor.chain().focus().redo().run();
          }}
          disabled={!editor?.can().redo()}
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
                    const isMobile = window.innerWidth <= 768;
                    if (isMobile) {
                      // 移动端使用 fixed 定位
                      dropdownMenuRef.current.style.position = 'fixed';
                      dropdownMenuRef.current.style.left = `${rect.left}px`;
                      dropdownMenuRef.current.style.top = `${rect.bottom + 4}px`;
                      dropdownMenuRef.current.style.transform = 'none';
                    } else {
                      // 桌面端使用 absolute 定位（相对于按钮）
                      dropdownMenuRef.current.style.position = 'absolute';
                      dropdownMenuRef.current.style.left = '0';
                      dropdownMenuRef.current.style.top = '100%';
                      dropdownMenuRef.current.style.transform = 'none';
                    }
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
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={onManualSave}
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
      </div>
    </div>
  );
}

