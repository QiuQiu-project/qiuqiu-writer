import { type Editor, EditorContent } from '@tiptap/react';
import DramaScriptToolbar from './DramaScriptToolbar';

interface DramaScriptEditorProps {
  editor?: Editor | null;
}

export default function DramaScriptEditor({ editor }: DramaScriptEditorProps) {
  return (
    <div className="novel-editor-wrapper">
      <div className="chapter-content-wrapper">
        <div className="editor-with-header drama-script-mode">
          <div className="embedded-toolbar">
            <DramaScriptToolbar editor={editor ?? null} />
          </div>
          <div className="editor-scroll-container">
            <EditorContent editor={editor ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
