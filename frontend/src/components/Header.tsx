import { Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiClient } from '../utils/api';
import { cn } from '@/lib/utils';

interface HeaderProps {
  currentDocId: string | null;
}

const DEFAULT_USER_ID = 'planetwriter_user_1';

export default function Header({ currentDocId }: HeaderProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const location = useLocation();

  const handleSave = async () => {
    if (!currentDocId) return;

    setSaving(true);
    try {
      const editorElement = document.querySelector('.editor-content');
      if (editorElement) {
        const content = editorElement.innerHTML;
        await apiClient.updateDocument(currentDocId, DEFAULT_USER_ID, { content });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <header
      className="flex items-center justify-between px-6 h-14 border-b sticky top-0 z-[100] shadow-[var(--shadow-sm)]"
      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-center gap-3">
        <Link to="/" className="no-underline text-inherit hover:opacity-80">
          <h1
            className="text-xl font-bold m-0 tracking-[-0.5px]"
            style={{ color: 'var(--text-primary)' }}
          >
            球球写作
          </h1>
        </Link>
        <nav className="flex items-center gap-2 ml-6">
          {[
            { to: '/', label: '首页' },
            { to: '/editor', label: '作品编辑' },
            { to: '/ugc-plaza', label: '内容广场' },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'px-3.5 py-2 no-underline text-sm font-medium rounded-[var(--radius,6px)] transition-all hover:[color:var(--text-primary)] hover:[background:var(--bg-secondary)]',
                location.pathname === to && 'font-semibold'
              )}
              style={{
                color: location.pathname === to ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: location.pathname === to ? 'var(--bg-secondary)' : undefined,
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        {currentDocId && (
          <button
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 border text-sm font-medium rounded-[var(--radius,6px)] cursor-pointer transition-all shadow-[var(--shadow-sm)] disabled:opacity-50 disabled:cursor-not-allowed',
              saved
                ? 'hover:[background:var(--bg-tertiary)]'
                : 'hover:[background:var(--accent-hover)] hover:[border-color:var(--accent-hover)] active:bg-black'
            )}
            style={
              saved
                ? { background: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }
                : { background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }
            }
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
