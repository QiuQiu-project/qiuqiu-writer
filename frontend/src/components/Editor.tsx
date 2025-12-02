import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import { apiClient } from '../utils/api';
import Toolbar from './Toolbar';
import './Editor.css';

interface EditorProps {
  docId: string | null;
  onDocChange?: (docId: string | null) => void;
}

const DEFAULT_USER_ID = 'wawawriter_user_1';
const SAVE_DEBOUNCE_MS = 2000; // 2 seconds

export default function Editor({ docId, onDocChange: _onDocChange }: EditorProps) {
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

  // Load document when docId changes
  useEffect(() => {
    if (editor && docId && docId !== currentDocIdRef.current) {
      currentDocIdRef.current = docId;
      loadDocument(docId);
    } else if (!docId && editor) {
      editor.commands.setContent('<p></p>');
      currentDocIdRef.current = null;
    }
  }, [editor, docId]);

  // Auto-save on content change
  useEffect(() => {
    if (!editor || !docId) return;

    const handleUpdate = () => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for auto-save
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

  const loadDocument = async (id: string) => {
    try {
      const doc = await apiClient.getDocument(id, DEFAULT_USER_ID);
      if (editor && doc.content) {
        editor.commands.setContent(doc.content);
      }
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  };

  const saveDocument = async (id: string, content: string) => {
    try {
      await apiClient.updateDocument(id, DEFAULT_USER_ID, { content });
      console.log('Document saved successfully');
    } catch (error) {
      console.error('Failed to save document:', error);
    }
  };

  return (
    <div className="editor-container">
      <Toolbar editor={editor} />
      <div className="editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
