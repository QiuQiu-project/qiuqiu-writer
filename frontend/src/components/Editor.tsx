import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import { apiClient } from '../utils/api';
import Toolbar from './Toolbar';

interface EditorProps {
  docId: string | null;
  onDocChange?: (docId: string | null) => void;
}

const DEFAULT_USER_ID = 'planetwriter_user_1';
const SAVE_DEBOUNCE_MS = 2000; // 2 seconds

export default function Editor({ docId }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: '开始写作...',
      }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'editor-content',
      },
    },
  });

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDocIdRef = useRef<string | null>(null);

  const loadDocument = async (id: string) => {
    try {
      const doc = await apiClient.getDocument(id, DEFAULT_USER_ID);
      if (editor && doc.content) {
        editor.commands.setContent(doc.content);
      }
    } catch {
      // ignore
    }
  };

  const saveDocument = async (id: string, content: string) => {
    try {
      await apiClient.updateDocument(id, DEFAULT_USER_ID, { content });
    } catch {
      // ignore
    }
  };

  // Load document when docId changes
  useEffect(() => {
    if (editor && docId && docId !== currentDocIdRef.current) {
      currentDocIdRef.current = docId;
      loadDocument(docId);
    } else if (!docId && editor) {
      editor.commands.setContent('<p></p>');
      currentDocIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docId]);

  // Auto-save on content change
  useEffect(() => {
    if (!editor || !docId) return;

    const handleUpdate = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveDocument(docId, editor.getHTML());
      }, SAVE_DEBOUNCE_MS);
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editor, docId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-y-auto px-12 py-12 max-w-[800px] mx-auto w-full">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
