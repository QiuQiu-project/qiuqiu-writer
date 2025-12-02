import { FileText, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';
import './Sidebar.css';

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
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="new-doc-button" onClick={handleNewDoc} disabled={loading}>
          <Plus size={18} />
          <span>新建文档</span>
        </button>
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="搜索文档..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="sidebar-content">
        {error && <div className="error-message">{error}</div>}
        {loading && documents.length === 0 ? (
          <div className="loading">加载中...</div>
        ) : (
          <div className="doc-list">
            {filteredDocuments.length === 0 ? (
              <div className="empty-state">暂无文档</div>
            ) : (
              filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`doc-item ${currentDoc === doc.id ? 'active' : ''}`}
                  onClick={() => onSelectDoc(doc.id)}
                >
                  <FileText size={16} />
                  <div className="doc-info">
                    <div className="doc-title">{doc.title}</div>
                    <div className="doc-meta">
                      {new Date(doc.updated_at).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
