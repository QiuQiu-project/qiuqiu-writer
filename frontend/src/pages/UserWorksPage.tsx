import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Grid, List, BookOpen, Calendar, FileText, Plus, Upload, ArrowUpDown } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import { authApi } from '../utils/authApi';
import ImportWorkModal from '../components/ImportWorkModal';
import './UserWorksPage.css';

export default function UserWorksPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated_desc' | 'updated_asc' | 'words_desc' | 'words_asc' | 'title_asc'>('updated_desc');
  const itemsPerPage = 10;
  const isCurrentUser = authApi.isAuthenticated() && 
    authApi.getUserInfo()?.id === userId;

  const loadUserWorks = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      // 如果是当前用户，使用listWorks获取所有作品（包括私有）
      // 否则，只显示公开作品
      if (isCurrentUser) {
        const response = await worksApi.listWorks({
          page: currentPage,
          size: itemsPerPage,
        });
        setWorks(response.works);
        setTotal(response.total);
      } else {
        // 对于其他用户，只显示公开作品
        // 注意：这里需要后端支持按用户ID筛选公开作品
        // 暂时使用公开作品API，然后在前端过滤
        const response = await worksApi.getPublicWorks({
          page: currentPage,
          size: itemsPerPage,
        });
        // 过滤出该用户的作品
        const userWorks = response.works.filter(w => w.owner_id === userId);
        setWorks(userWorks);
        setTotal(userWorks.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载作品失败');
      // ignore
    } finally {
      setLoading(false);
    }
  }, [userId, currentPage, isCurrentUser, itemsPerPage]);

  useEffect(() => {
    if (userId) {
      loadUserWorks();
    }
  }, [userId, currentPage, loadUserWorks]);


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleWorkClick = (work: Work) => {
    navigate(`/novel/editor?workId=${work.id}`);
  };

  // 处理创建作品
  const handleCreateWork = async () => {
    try {
      
      
      const workData = {
        title: '未命名作品',
        work_type: 'long' as const,
        is_public: false,
      };
      
      const newWork = await worksApi.createWork(workData);
      
      if (!newWork || !newWork.id) {
        throw new Error('创建作品成功，但未返回作品ID');
      }
      
      // 重新加载作品列表
      await loadUserWorks();
      
      // 跳转到编辑器
      navigate(`/novel/editor?workId=${newWork.id}`);
    } catch (err) {
      
      const errorMessage = err instanceof Error ? err.message : '创建作品失败';
      alert(`创建作品失败: ${errorMessage}`);
    }
  };

  // 处理导入成功
  const handleImportSuccess = () => {
    loadUserWorks();
    setShowImportModal(false);
  };

  const filteredWorks = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    const filtered = keyword
      ? works.filter((work) => (work.title || '').toLowerCase().includes(keyword))
      : works;

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '', 'zh-CN');
      }
      if (sortBy === 'words_desc') {
        return (b.word_count || 0) - (a.word_count || 0);
      }
      if (sortBy === 'words_asc') {
        return (a.word_count || 0) - (b.word_count || 0);
      }
      const timeA = new Date(a.updated_at).getTime();
      const timeB = new Date(b.updated_at).getTime();
      return sortBy === 'updated_asc' ? timeA - timeB : timeB - timeA;
    });

    return sorted;
  }, [works, searchQuery, sortBy]);

  if (loading && works.length === 0) {
    return (
      <div className="user-works-page">
        <div className="loading-state">加载中...</div>
      </div>
    );
  }

  if (error && works.length === 0) {
    return (
      <div className="user-works-page">
        <div className="error-state">错误: {error}</div>
      </div>
    );
  }

  return (
    <div className="user-works-page">
      <div className="user-works-container">
        {/* 右侧作品列表 */}
        <main className="works-main">
          <div className="works-header">
            <div className="works-header-filters">
              <div className="works-search">
                <input
                  className="works-search-input"
                  type="text"
                  placeholder="查找作品..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="works-sort">
                <button
                  type="button"
                  className="header-btn icon-only works-sort-trigger"
                  title="排序"
                  onClick={() => setShowSortMenu((prev) => !prev)}
                >
                  <ArrowUpDown size={18} />
                </button>
                {showSortMenu && (
                  <div className="works-sort-dropdown">
                    <button
                      type="button"
                      className={`works-sort-item ${sortBy === 'updated_desc' ? 'active' : ''}`}
                      onClick={() => {
                        setSortBy('updated_desc');
                        setShowSortMenu(false);
                      }}
                    >
                      更新时间（新 → 旧）
                    </button>
                    <button
                      type="button"
                      className={`works-sort-item ${sortBy === 'updated_asc' ? 'active' : ''}`}
                      onClick={() => {
                        setSortBy('updated_asc');
                        setShowSortMenu(false);
                      }}
                    >
                      更新时间（旧 → 新）
                    </button>
                    <button
                      type="button"
                      className={`works-sort-item ${sortBy === 'words_desc' ? 'active' : ''}`}
                      onClick={() => {
                        setSortBy('words_desc');
                        setShowSortMenu(false);
                      }}
                    >
                      字数（多 → 少）
                    </button>
                    <button
                      type="button"
                      className={`works-sort-item ${sortBy === 'words_asc' ? 'active' : ''}`}
                      onClick={() => {
                        setSortBy('words_asc');
                        setShowSortMenu(false);
                      }}
                    >
                      字数（少 → 多）
                    </button>
                    <button
                      type="button"
                      className={`works-sort-item ${sortBy === 'title_asc' ? 'active' : ''}`}
                      onClick={() => {
                        setSortBy('title_asc');
                        setShowSortMenu(false);
                      }}
                    >
                      标题（A → Z）
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="works-header-right">
              <div className="view-toggle">
                <button
                  className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="列表视图"
                >
                  <List size={18} />
                </button>
                <button
                  className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="网格视图"
                >
                  <Grid size={18} />
                </button>
              </div>
              {isCurrentUser && (
                <div className="works-create-menu">
                  <button
                    className="header-btn works-create-trigger"
                    onClick={() => setShowCreateMenu((prev) => !prev)}
                    title="创建/导入"
                    type="button"
                  >
                    <Plus size={14} />
                    <span>New</span>
                  </button>
                  {showCreateMenu && (
                    <div className="header-create-dropdown">
                      <button
                        type="button"
                        className="header-create-item"    
                        onClick={() => {
                          setShowCreateMenu(false);
                          handleCreateWork();
                        }}
                      >
                        <Plus size={16} />

                        创建作品
                      </button>
                      <button
                        type="button"
                        className="works-create-item"
                        onClick={() => {
                          setShowCreateMenu(false);
                          setShowImportModal(true);
                        }}
                      >
                        <Upload size={16} />
                        导入作品
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        {works.length === 0 ? (
          <div className="empty-state">
            <BookOpen size={48} />
            <p>暂无作品</p>
            {isCurrentUser && (
              <p className="empty-hint">开始创建你的第一个作品吧！</p>
            )}
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="works-content grid">
                {filteredWorks.map((work) => (
                  <div
                    key={work.id}
                    className="work-item"
                    onClick={() => handleWorkClick(work)}
                  >
                    <div className="work-item-header">
                      <h3 className="work-item-title">{work.title}</h3>
                    </div>
                    {work.description && (
                      <p className="work-item-description">{work.description}</p>
                    )}
                    <div className="work-item-footer">
                      <div className="work-item-stats">
                        <span className="stat-item">
                          <FileText size={14} />
                          {work.word_count || 0} 字
                        </span>
                      </div>
                      <span className="work-item-date">
                        <Calendar size={14} />
                        {formatDate(work.updated_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="works-content list">
                {filteredWorks.map((work) => (
                  <li
                    key={work.id}
                    className="work-item"
                    onClick={() => handleWorkClick(work)}
                  >
                    <div className="work-item-main">
                      <div className="work-item-header">
                        <h3 className="work-item-title">{work.title}</h3>
                      </div>
                      {work.description && (
                        <p className="work-item-description">{work.description}</p>
                      )}
                    </div>
                    <div className="work-item-meta">
                      <div className="work-item-stats">
                        <span className="stat-item">
                          <FileText size={14} />
                          {work.word_count || 0} 字
                        </span>
                      </div>
                      <span className="work-item-date">
                        <Calendar size={14} />
                        {formatDate(work.updated_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="pagination">
              <button
                className={`pagination-nav-btn${currentPage === 1 ? ' disabled' : ''}`}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                Previous
              </button>
              <button
                className={`pagination-nav-btn${works.length < itemsPerPage || currentPage * itemsPerPage >= total ? ' disabled' : ''}`}
                disabled={works.length < itemsPerPage || currentPage * itemsPerPage >= total}
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                Next
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </>
        )}
        </main>
      </div>

      {/* 导入作品弹窗 */}
      {isCurrentUser && (
        <ImportWorkModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}
