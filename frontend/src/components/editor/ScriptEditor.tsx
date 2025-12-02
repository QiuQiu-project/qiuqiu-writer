import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Undo2, Redo2, Type, Bold, Italic, Code } from 'lucide-react';
import './ScriptEditor.css';

export default function ScriptEditor() {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'markdown-code-block',
          },
        },
      }),
      Placeholder.configure({
        placeholder: '开始编写剧本...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
      }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'script-editor-content',
      },
    },
    // 启用 Markdown 输入规则
    enableInputRules: true,
    enablePasteRules: true,
  });

  // 插入场景标题
  const insertScene = () => {
    if (!editor) return;
    const sceneText = '场景：\n地点：\n时间：';
    editor.chain().focus().insertContent(`<h2>${sceneText}</h2>`).run();
  };

  // 插入角色名称
  const insertCharacter = () => {
    if (!editor) return;
    editor.chain().focus().insertContent('<p class="character-name">角色名称</p>').run();
  };

  // 插入对话
  const insertDialogue = () => {
    if (!editor) return;
    editor.chain().focus().insertContent('<p class="dialogue">对话内容</p>').run();
  };

  // 插入动作指示
  const insertAction = () => {
    if (!editor) return;
    editor.chain().focus().insertContent('<p class="action">（动作指示）</p>').run();
  };

  // 插入转场
  const insertTransition = () => {
    if (!editor) return;
    editor.chain().focus().insertContent('<p class="transition">【转场：淡入/淡出/切】</p>').run();
  };

  return (
    <div className="script-editor">
      {/* 剧本格式工具栏 */}
      <div className="script-toolbar">
        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={insertScene} title="插入场景">
            <Type size={16} />
            <span>场景</span>
          </button>
          <button className="toolbar-btn" onClick={insertCharacter} title="插入角色">
            <span>角色</span>
          </button>
          <button className="toolbar-btn" onClick={insertDialogue} title="插入对话">
            <span>对话</span>
          </button>
          <button className="toolbar-btn" onClick={insertAction} title="插入动作">
            <span>动作</span>
          </button>
          <button className="toolbar-btn" onClick={insertTransition} title="插入转场">
            <span>转场</span>
          </button>
        </div>
        <div className="toolbar-divider" />
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
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="粗体 (Markdown: **文本**)"
          >
            <Bold size={16} />
          </button>
          <button
            className="toolbar-btn"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            title="斜体 (Markdown: *文本*)"
          >
            <Italic size={16} />
          </button>
          <button
            className="toolbar-btn"
            onClick={() => editor?.chain().focus().toggleCode().run()}
            title="行内代码 (Markdown: `代码`)"
          >
            <Code size={16} />
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
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            title="二级标题 (Markdown: ## 标题)"
          >
            <Type size={16} />
            <span>H2</span>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            title="三级标题 (Markdown: ### 标题)"
          >
            <Type size={16} />
            <span>H3</span>
          </button>
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            title="无序列表 (Markdown: - 或 *)"
          >
            <span>• 列表</span>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            title="有序列表 (Markdown: 1. )"
          >
            <span>1. 列表</span>
          </button>
          <button
            className="toolbar-btn"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            title="引用 (Markdown: > )"
          >
            <span>" 引用</span>
          </button>
        </div>
      </div>

      {/* 编辑区域 */}
      <div className="script-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

