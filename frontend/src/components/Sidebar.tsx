import { FileText, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';
import { cn } from '@/lib/utils';

interface SidebarProps {
  isOpen: boolean;
  currentDoc: string | null;
  onSelectDoc: (docId: string | null) => void;
}

export default function Sidebar({ isOpen, currentDoc, onSelectDoc }: SidebarProps) {
  const { documents, loading, error, createDocument } = useDocuments();
  const [searchQuery, setSearchQuery] = useState('');

  const handleNewDoc = async () => {
    try {
      const newDoc = await createDocument('未命名文档', '');
      onSelectDoc(newDoc.id);
    } catch {
      // ignore
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <aside
      className="w-[280px] border-r flex flex-col h-full transition-transform max-md:fixed max-md:top-[60px] max-md:left-0 max-md:bottom-0 max-md:w-[85%] max-md:max-w-[300px] max-md:h-[calc(100vh-60px)] max-md:z-[100] max-md:shadow-[var(--shadow-xl)] max-md:[animation:slide-right_0.3s_ease-out]"
      style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
    >
      <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <button
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border text-sm font-medium rounded-[var(--radius-sm,6px)] cursor-pointer mb-3 transition-all hover:[background:var(--accent-hover)] hover:[border-color:var(--accent-hover)] disabled:opacity-50"
          style={{ background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', color: 'var(--text-inverse)' }}
          onClick={handleNewDoc}
          disabled={loading}
        >
          <Plus size={18} />
          <span>新建文档</span>
        </button>
        <div
          className="flex items-center gap-2 px-3 py-2 border rounded-[var(--radius-sm,6px)] transition-[border-color] focus-within:[border-color:var(--accent-primary)]"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Search size={16} />
          <input
            type="text"
            placeholder="搜索文档..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 border-none outline-none bg-transparent text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {error && (
          <div className="text-sm p-2" style={{ color: 'var(--error-color, #ef4444)' }}>{error}</div>
        )}
        {loading && documents.length === 0 ? (
          <div className="text-sm p-2" style={{ color: 'var(--text-tertiary)' }}>加载中...</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredDocuments.length === 0 ? (
              <div className="text-sm p-2 text-center" style={{ color: 'var(--text-tertiary)' }}>暂无文档</div>
            ) : (
              filteredDocuments.map((doc) => {
                const isActive = currentDoc === doc.id;
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm,6px)] cursor-pointer transition-[background-color]',
                      isActive ? 'text-[var(--text-inverse)]' : 'hover:[background:var(--bg-secondary)]'
                    )}
                    style={{
                      color: isActive ? 'var(--text-inverse)' : 'var(--text-primary)',
                      background: isActive ? 'var(--accent-primary)' : undefined,
                    }}
                    onClick={() => onSelectDoc(doc.id)}
                  >
                    <FileText size={16} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{doc.title}</div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)' }}
                      >
                        {new Date(doc.updated_at).toLocaleString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
