import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Grid, List, BookOpen, User, Calendar, FileText, Plus, Upload, ArrowUpDown } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import { authApi, type UserInfo } from '../utils/authApi';
import { getUserAvatarUrl } from '../utils/avatarUtils';
import ImportWorkModal from '../components/ImportWorkModal';
import './UserWorksPage.css';

export default function UserWorksPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated_desc' | 'updated_asc' | 'words_desc' | 'words_asc' | 'title_asc'>('updated_desc');
  const [editFormData, setEditFormData] = useState({
    display_name: '',
    bio: '',
  });
  const [saving, setSaving] = useState(false);
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

  const loadUserInfo = useCallback(async () => {
    if (!userId) return;
    
    try {
      // 如果是当前用户，从API获取最新用户信息
      if (isCurrentUser) {
        try {
          const currentUser = await authApi.getCurrentUser();
          
          if (currentUser) {
            setUserInfo(currentUser);
            return;
          }
        } catch {
          // ignore
          // 如果API失败，使用本地存储的用户信息
          const storedUser = authApi.getUserInfo();
          
          if (storedUser) {
            setUserInfo(storedUser);
            return;
          }
        }
      }
      
      // TODO: 添加获取其他用户信息的API调用
      // 目前使用占位符
      setUserInfo({
        id: userId,
        username: `user_${userId}`,
        email: '',
        display_name: `用户 ${userId}`,
        status: 'active',
      });
    } catch {
      // ignore
    }
  }, [userId, isCurrentUser]);

  useEffect(() => {
    if (userId) {
      loadUserWorks();
      loadUserInfo();
    }
  }, [userId, currentPage, loadUserWorks, loadUserInfo]);


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

  // 处理编辑资料
  const handleEditProfile = () => {
    if (userInfo) {
      setEditFormData({
        display_name: userInfo.display_name || '',
        bio: userInfo.bio || '',
      });
    }
    setShowEditProfile(true);
  };

  // 处理取消编辑
  const handleCancelEdit = () => {
    setShowEditProfile(false);
  };

  // 处理保存资料
  const handleSaveProfile = async () => {
    if (!userInfo) return;
    
    setSaving(true);
    try {
      const updatedUser = await authApi.updateProfile(editFormData);
      
      // 更新本地状态
      setUserInfo(updatedUser);
      // 重新加载用户信息以确保数据同步
      await loadUserInfo();
      setShowEditProfile(false);
    } catch (err) {
      
      alert(err instanceof Error ? err.message : '保存资料失败');
    } finally {
      setSaving(false);
    }
  };

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
        {/* 左侧个人信息栏 */}
        <aside className="user-sidebar">
          
          <div className="user-profile-card">
            <div className="user-avatar-large">
              {userInfo ? (
                <img 
                  src={getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name)} 
                  alt={userInfo.display_name || userInfo.username || '用户'}
                  className="user-avatar-img"
                />
              ) : (
                <User size={80} />
              )}
            </div>
            <h1 className="user-name-large">
              {userInfo?.display_name || userInfo?.username || `用户 ${userId}`}
            </h1>
            {userInfo?.username && (
              <p className="user-username">@{userInfo.username}</p>
            )}
            {isCurrentUser && (
              <>
                <button 
                  className="edit-profile-btn"
                  onClick={handleEditProfile}
                >
                  {showEditProfile ? '取消编辑' : '编辑资料'}
                </button>
                {/* 移动端：在个人信息下方显示操作按钮 */}
                <div className="mobile-actions">
                  <button 
                    className="action-btn mobile-action-btn"
                    onClick={handleCreateWork}
                  >
                    <Plus size={16} />
                    <span>创建作品</span>
                  </button>
                  <button 
                    className="action-btn mobile-action-btn"
                    onClick={() => setShowImportModal(true)}
                  >
                    <Upload size={16} />
                    <span>导入作品</span>
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* 编辑资料表单 */}
          {showEditProfile && isCurrentUser && (
            <div className="edit-profile-form">
              <div className="edit-profile-section">
                <label htmlFor="display_name" className="edit-profile-label">
                  姓名
                </label>
                <input
                  id="display_name"
                  type="text"
                  className="edit-profile-input"
                  placeholder="姓名"
                  value={editFormData.display_name}
                  onChange={(e) => setEditFormData({ ...editFormData, display_name: e.target.value })}
                />
              </div>

              <div className="edit-profile-section">
                <label htmlFor="bio" className="edit-profile-label">
                  简介
                </label>
                <textarea
                  id="bio"
                  className="edit-profile-textarea"
                  placeholder="添加简介"
                  rows={4}
                  value={editFormData.bio}
                  onChange={(e) => setEditFormData({ ...editFormData, bio: e.target.value })}
                />

              </div>

              <div className="edit-profile-actions">
                <button
                  type="button"
                  className="edit-profile-save-btn"
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  type="button"
                  className="edit-profile-cancel-btn"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </aside>

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
