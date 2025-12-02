import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, List, Plus, BookOpen, Upload, Video, FileText, MoreVertical, ChevronDown, Download, Link2, Trash2, ChevronRight } from 'lucide-react';
import './WorksPage.css';

type WorkType = 'all' | 'short' | 'long' | 'script' | 'video';
type ViewMode = 'grid' | 'list';

interface Work {
  id: string;
  type: 'long' | 'short' | 'script' | 'video';
  title: string;
  description?: string;
  date: string;
  coverImage?: string;
}

const mockWorks: Work[] = [
  {
    id: '1',
    type: 'long',
    title: '回响之声',
    description: '苏逸飞猛地从噩梦中挣扎起身,旧神那不可名状的轮廓和触手撕裂血肉的触感仿佛还残留在身上。他环顾四周,发现自己不在冰冷的末日废墟...',
    date: '2025-11-29 10:57:30',
  },
  {
    id: '2',
    type: 'long',
    title: '昆虫之主',
    date: '2025-11-28 20:24:49',
  },
  {
    id: '3',
    type: 'long',
    title: '未命名',
    date: '2025-11-25 22:20:26',
  },
  {
    id: '4',
    type: 'video',
    title: '第一章',
    date: '2025-11-25 22:20:31',
    coverImage: 'placeholder',
  },
];

export default function WorksPage() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<WorkType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filteredWorks = selectedType === 'all' 
    ? mockWorks 
    : mockWorks.filter(work => work.type === selectedType);

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      long: '长篇',
      short: '短篇',
      script: '剧本',
      video: '视频',
    };
    return labels[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      long: '#10b981',
      short: '#10b981',
      script: '#10b981',
      video: '#8b5cf6',
    };
    return colors[type] || '#10b981';
  };

  // 处理菜单切换
  const handleMenuToggle = (workId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === workId ? null : workId);
    setOpenSubMenu(null);
  };

  // 处理子菜单切换
  const handleSubMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenSubMenu(openSubMenu ? null : 'export');
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.values(menuRefs.current).forEach((ref) => {
        if (ref && !ref.contains(event.target as Node)) {
          setOpenMenuId(null);
          setOpenSubMenu(null);
        }
      });
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId]);

  // 处理菜单项点击
  const handleMenuAction = (action: string, workId: string, format?: string) => {
    console.log(`Action: ${action}, Work ID: ${workId}, Format: ${format || 'N/A'}`);
    setOpenMenuId(null);
    setOpenSubMenu(null);
    // 这里可以添加实际的操作逻辑
  };

  return (
    <div className="works-page">
      <div className="works-header">
        <h1 className="works-title">我的作品</h1>
        <div className="works-actions">
          <button className="action-btn primary">
            <Plus size={16} />
            <span>创建作品</span>
            <ChevronDown size={14} />
          </button>
          <button className="action-btn">
            <BookOpen size={16} />
            <span>拆书</span>
          </button>
          <button className="action-btn">
            <Upload size={16} />
            <span>导入</span>
          </button>
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={18} />
            </button>
            <button
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="works-filters">
        {(['all', 'short', 'long', 'script', 'video'] as WorkType[]).map((type) => (
          <button
            key={type}
            className={`filter-tab ${selectedType === type ? 'active' : ''}`}
            onClick={() => setSelectedType(type)}
          >
            {type === 'all' ? '全部' : getTypeLabel(type)}
          </button>
        ))}
      </div>

      <div className={`works-content ${viewMode}`}>
        {filteredWorks.map((work) => (
          <div 
            key={work.id} 
            className="work-card"
            onClick={() => navigate('/novel/editor')}
            style={{ cursor: 'pointer' }}
          >
            {work.coverImage ? (
              <div className="work-cover">
                <div className="cover-placeholder">
                  <span className="frog-icon">🐸</span>
                </div>
              </div>
            ) : (
              <div className="work-preview">
                <span className="work-type-tag" style={{ backgroundColor: getTypeColor(work.type) }}>
                  {getTypeLabel(work.type)}
                </span>
                <h3 className="work-card-title">{work.title}</h3>
                {work.description && (
                  <p className="work-description">{work.description}</p>
                )}
                <p className="work-date">{work.date}</p>
              </div>
            )}
            <div className="work-actions" onClick={(e) => e.stopPropagation()}>
              {work.type !== 'video' && (
                <>
                  <button className="work-action-btn">
                    <Video size={14} />
                    <span>生成视频</span>
                  </button>
                  <button className="work-action-btn">
                    <FileText size={14} />
                    <span>转为剧本</span>
                  </button>
                </>
              )}
              <div className="menu-wrapper" ref={(el) => { menuRefs.current[work.id] = el; }}>
                <button 
                  className="work-action-btn icon-only"
                  onClick={(e) => handleMenuToggle(work.id, e)}
                >
                  <MoreVertical size={16} />
                </button>
                {openMenuId === work.id && (
                  <div className="context-menu">
                    <button
                      className="menu-item"
                      onMouseEnter={handleSubMenuToggle}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubMenuToggle(e);
                      }}
                    >
                      <Download size={16} />
                      <span>导出作品</span>
                      <ChevronRight size={14} />
                      {openSubMenu === 'export' && (
                        <div className="sub-menu">
                          <button
                            className="sub-menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMenuAction('export', work.id, 'text');
                            }}
                          >
                            Text
                          </button>
                          <button
                            className="sub-menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMenuAction('export', work.id, 'word');
                            }}
                          >
                            Word
                          </button>
                          <button
                            className="sub-menu-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMenuAction('export', work.id, 'pdf');
                            }}
                          >
                            Pdf
                          </button>
                        </div>
                      )}
                    </button>
                    <button
                      className="menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuAction('copy-link', work.id);
                      }}
                    >
                      <Link2 size={16} />
                      <span>复制链接</span>
                    </button>
                    <button
                      className="menu-item danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuAction('delete', work.id);
                      }}
                    >
                      <Trash2 size={16} />
                      <span>删除作品</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="works-pagination">
        <button className="pagination-btn" disabled={currentPage === 1}>
          &lt;
        </button>
        <button className="pagination-btn active">{currentPage}</button>
        <button className="pagination-btn" disabled={filteredWorks.length < itemsPerPage}>
          &gt;
        </button>
        <select
          className="pagination-select"
          value={itemsPerPage}
          onChange={(e) => setItemsPerPage(Number(e.target.value))}
        >
          <option value={10}>10条/页</option>
          <option value={20}>20条/页</option>
          <option value={50}>50条/页</option>
        </select>
      </div>
    </div>
  );
}

