import { Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiClient } from '../utils/api';
import './Header.css';

interface HeaderProps {
  currentDocId: string | null;
}

const DEFAULT_USER_ID = 'wawawriter_user_1';

export default function Header({ currentDocId }: HeaderProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const location = useLocation();

  const handleSave = async () => {
    if (!currentDocId) return;

    setSaving(true);
    try {
      // Get editor content from the editor instance
      // Note: This is a simplified approach. In a real app, you'd pass the editor instance
      const editorElement = document.querySelector('.editor-content');
      if (editorElement) {
        const content = editorElement.innerHTML;
        await apiClient.updateDocument(currentDocId, DEFAULT_USER_ID, { content });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to save document:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <Link to="/" className="logo-link">
          <h1 className="logo">WawaWriter</h1>
        </Link>
        <nav className="header-nav">
          <Link
            to="/"
            className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          >
            首页
          </Link>
          <Link
            to="/editor"
            className={`nav-link ${location.pathname === '/editor' ? 'active' : ''}`}
          >
            作品编辑
          </Link>
          <Link
            to="/ugc-plaza"
            className={`nav-link ${location.pathname === '/ugc-plaza' ? 'active' : ''}`}
          >
            内容广场
          </Link>
        </nav>
      </div>
      <div className="header-right">
        {currentDocId && (
          <button
            className={`save-button ${saved ? 'saved' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              '保存中...'
            ) : saved ? (
              <>
                <Save size={16} />
                <span>已保存</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>保存</span>
              </>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
