import { useState } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import ChapterEditorToolbar from './ChapterEditorToolbar';

interface ScriptEditorProps {
  editor?: Editor | null;
}

export default function ScriptEditor({ editor: externalEditor }: ScriptEditorProps = {}) {
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  const editor = externalEditor ?? null;

  return (
    <div className="novel-editor-wrapper">
      <div className="chapter-content-wrapper">
        <div className="editor-with-header">
          <div className="embedded-toolbar">
            <ChapterEditorToolbar
              editor={editor}
              onManualSave={() => {}}
              headingMenuOpen={headingMenuOpen}
              setHeadingMenuOpen={setHeadingMenuOpen}
            />
          </div>
          <div className="editor-scroll-container">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
