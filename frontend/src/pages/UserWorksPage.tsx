import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Grid, List, BookOpen, Calendar, FileText, Plus, Upload, ArrowUpDown } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import { authApi } from '../utils/authApi';
import ImportWorkModal from '../components/ImportWorkModal';
import { cn } from '@/lib/utils';

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
          work_type: 'long',
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

  const stateClass = "w-full min-h-[calc(100vh-62px)] flex items-center justify-center";

  if (loading && works.length === 0) {
    return (
      <div className={stateClass} style={{ background: 'var(--page-gradient)', color: 'var(--text-primary)' }}>
        <div className="text-center py-20 px-6" style={{ color: 'var(--text-tertiary)' }}>加载中...</div>
      </div>
    );
  }

  if (error && works.length === 0) {
    return (
      <div className={stateClass} style={{ background: 'var(--page-gradient)', color: 'var(--text-primary)' }}>
        <div className="text-center py-20 px-6" style={{ color: 'var(--text-tertiary)' }}>错误: {error}</div>
      </div>
    );
  }

  const sortOptions: { key: typeof sortBy; label: string }[] = [
    { key: 'updated_desc', label: '更新时间（新 → 旧）' },
    { key: 'updated_asc', label: '更新时间（旧 → 新）' },
    { key: 'words_desc', label: '字数（多 → 少）' },
    { key: 'words_asc', label: '字数（少 → 多）' },
    { key: 'title_asc', label: '标题（A → Z）' },
  ];

  return (
    <div
      className="w-full min-h-[calc(100vh-62px)]"
      style={{ background: 'var(--page-gradient)', color: 'var(--text-primary)' }}
    >
      <div className="max-w-[1280px] mx-auto px-8 py-10 flex gap-8 items-start w-full max-md:flex-col max-md:px-4 max-md:py-5 max-md:gap-5 max-[544px]:px-3 max-[544px]:py-4">
        {/* 右侧作品列表 */}
        <main className="flex-1 min-w-0 w-full">
          {/* Header */}
          <div
            className="flex items-center justify-between mb-7 pb-5 border-b gap-3 max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:mb-5"
            style={{ borderColor: 'var(--glass-border, rgba(255,255,255,0.07))' }}
          >
            {/* Filters: search + sort */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0 max-md:flex-col max-md:items-stretch max-md:w-full">
              {/* Search */}
              <div className="flex-1 min-w-[160px] max-w-[560px] max-md:w-full max-md:max-w-none max-md:min-w-0">
                <input
                  className="w-full h-9 px-3.5 text-sm rounded-lg outline-none transition-all border focus:border-blue-500/45 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
                  type="text"
                  placeholder="查找作品..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  style={{
                    color: 'var(--text-primary)',
                    background: 'var(--glass-bg-input, rgba(255,255,255,0.05))',
                    borderColor: 'var(--glass-border, rgba(255,255,255,0.1))',
                  }}
                />
              </div>

              {/* Sort */}
              <div className="relative flex items-center max-md:w-full">
                <button
                  type="button"
                  className="w-9 h-9 min-w-[36px] p-0 rounded-lg flex items-center justify-center cursor-pointer transition-all border hover:[background:var(--glass-bg-hover)] hover:[border-color:var(--glass-border-hover)] hover:[color:var(--text-primary)] max-md:w-full max-md:justify-center"
                  style={{
                    background: 'var(--glass-bg-input, rgba(255,255,255,0.05))',
                    borderColor: 'var(--glass-border, rgba(255,255,255,0.1))',
                    color: 'var(--text-secondary)',
                  }}
                  title="排序"
                  onClick={() => setShowSortMenu((prev) => !prev)}
                >
                  <ArrowUpDown size={14} />
                </button>
                {showSortMenu && (
                  <div
                    className="absolute top-[calc(100%+8px)] left-0 min-w-[190px] rounded-xl p-1.5 flex flex-col gap-0.5 z-[10010] backdrop-blur-xl border"
                    style={{
                      background: 'var(--glass-dropdown-bg, rgba(10,20,45,0.95))',
                      borderColor: 'var(--glass-border-strong, rgba(255,255,255,0.1))',
                      boxShadow: 'var(--shadow-lg)',
                    }}
                  >
                    {sortOptions.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={cn(
                          'flex items-center w-full px-3 py-2 text-[13px] border-none rounded-lg cursor-pointer text-left transition-all',
                          sortBy === opt.key
                            ? 'bg-blue-500/15 text-blue-300 font-semibold'
                            : '[color:var(--text-secondary)] bg-transparent hover:[background:var(--glass-bg-hover)] hover:[color:var(--text-primary)]'
                        )}
                        onClick={() => {
                          setSortBy(opt.key);
                          setShowSortMenu(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: view toggle + create */}
            <div className="flex items-center gap-3 max-md:justify-between max-md:w-full">
              {/* View toggle */}
              <div
                className="flex gap-0.5 border rounded-lg p-0.5 h-9 items-center"
                style={{
                  background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                  borderColor: 'var(--glass-border, rgba(255,255,255,0.1))',
                }}
              >
                <button
                  className={cn(
                    'px-[7px] h-full flex items-center justify-center rounded-[6px] border-none cursor-pointer transition-all',
                    viewMode === 'list'
                      ? 'bg-blue-500/20 text-blue-300'
                      : '[color:var(--text-tertiary)] bg-transparent hover:[background:var(--glass-bg-strong)] hover:[color:var(--text-secondary)]'
                  )}
                  onClick={() => setViewMode('list')}
                  title="列表视图"
                >
                  <List size={14} />
                </button>
                <button
                  className={cn(
                    'px-[7px] h-full flex items-center justify-center rounded-[6px] border-none cursor-pointer transition-all',
                    viewMode === 'grid'
                      ? 'bg-blue-500/20 text-blue-300'
                      : '[color:var(--text-tertiary)] bg-transparent hover:[background:var(--glass-bg-strong)] hover:[color:var(--text-secondary)]'
                  )}
                  onClick={() => setViewMode('grid')}
                  title="网格视图"
                >
                  <Grid size={14} />
                </button>
              </div>

              {/* Create menu */}
              {isCurrentUser && (
                <div className="relative">
                  <button
                    className="flex items-center gap-[5px] h-9 px-3 text-[13px] font-medium rounded-lg cursor-pointer transition-all border hover:[background:var(--glass-bg-hover)] hover:[border-color:var(--glass-border-hover)] hover:[color:var(--text-primary)]"
                    style={{
                      background: 'var(--glass-bg-strong, rgba(255,255,255,0.06))',
                      borderColor: 'var(--glass-border-strong, rgba(255,255,255,0.12))',
                      color: 'var(--text-secondary)',
                    }}
                    onClick={() => setShowCreateMenu((prev) => !prev)}
                    title="创建/导入"
                    type="button"
                  >
                    <Plus size={14} />
                    <span>New</span>
                  </button>
                  {showCreateMenu && (
                    <div
                      className="absolute top-[calc(100%+8px)] left-0 min-w-[160px] rounded-xl border py-1.5 z-[10010] backdrop-blur-xl flex flex-col gap-0.5 p-1.5"
                      style={{
                        background: 'var(--glass-dropdown-bg, rgba(10,20,45,0.95))',
                        borderColor: 'var(--glass-border-strong, rgba(255,255,255,0.1))',
                        boxShadow: 'var(--shadow-lg)',
                      }}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2 w-full px-3 py-2 text-[13px] border-none rounded-lg cursor-pointer text-left transition-all hover:[background:var(--glass-bg-hover)] hover:[color:var(--text-primary)]"
                        style={{ color: 'var(--text-secondary)' }}
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
                        className="flex items-center gap-2 w-full px-3 py-2 text-[13px] border-none rounded-lg cursor-pointer text-left transition-all hover:[background:var(--glass-bg-hover)] hover:[color:var(--text-primary)]"
                        style={{ color: 'var(--text-secondary)' }}
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

          {/* Content */}
          {works.length === 0 ? (
            <div className="text-center py-20 px-6" style={{ color: 'var(--text-tertiary)' }}>
              <BookOpen size={48} className="mx-auto mb-5 text-blue-500/30 opacity-60" />
              <p>暂无作品</p>
              {isCurrentUser && (
                <p className="text-sm mt-2.5" style={{ color: 'var(--text-tertiary)' }}>开始创建你的第一个作品吧！</p>
              )}
            </div>
          ) : (
            <>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[18px] mb-6 max-sm:grid-cols-1">
                  {filteredWorks.map((work) => (
                    <div
                      key={work.id}
                      className="p-[22px] backdrop-blur-xl border rounded-2xl cursor-pointer transition-all duration-[250ms] hover:-translate-y-1 hover:border-blue-500/32 hover:shadow-[0_12px_36px_rgba(0,0,0,0.2),0_0_0_1px_rgba(59,130,246,0.1)] group"
                      style={{
                        background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                        borderColor: 'var(--glass-border, rgba(255,255,255,0.08))',
                      }}
                      onClick={() => handleWorkClick(work)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <h3
                          className="text-[15px] font-semibold m-0 flex-1 truncate transition-colors group-hover:text-blue-300"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {work.title}
                        </h3>
                      </div>
                      {work.description && (
                        <p
                          className="text-[13px] leading-[1.5] line-clamp-2 mb-2.5 m-0"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {work.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <div className="flex items-center gap-3.5">
                          <span className="flex items-center gap-1">
                            <FileText size={14} />
                            {work.word_count || 0} 字
                          </span>
                        </div>
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {formatDate(work.updated_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="list-none m-0 p-0 flex flex-col mb-6">
                  {filteredWorks.map((work) => (
                    <li
                      key={work.id}
                      className="flex flex-col gap-1.5 px-2.5 py-4 cursor-pointer transition-all border-b hover:[background:var(--glass-bg)] hover:rounded-lg max-md:gap-2"
                      style={{ borderColor: 'var(--glass-border, rgba(255,255,255,0.06))' }}
                      onClick={() => handleWorkClick(work)}
                    >
                      <div className="flex-1 mr-4 max-md:mr-0 max-md:w-full max-md:mb-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3
                            className="text-[15px] font-semibold m-0 flex-1 truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {work.title}
                          </h3>
                        </div>
                        {work.description && (
                          <p
                            className="text-[13px] leading-[1.5] line-clamp-1 m-0"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {work.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs w-full mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        <div className="flex items-center gap-3.5">
                          <span className="flex items-center gap-1">
                            <FileText size={14} />
                            {work.word_count || 0} 字
                          </span>
                        </div>
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {formatDate(work.updated_at)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Pagination */}
              <div
                className="flex items-center justify-center gap-2 mt-6 pt-4 border-t"
                style={{ borderColor: 'var(--glass-border, rgba(255,255,255,0.07))' }}
              >
                <button
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-lg bg-transparent border-none cursor-pointer transition-all text-blue-500/85 hover:not-disabled:text-blue-500 disabled:[color:var(--text-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  Previous
                </button>
                <button
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-lg bg-transparent border-none cursor-pointer transition-all text-blue-500/85 hover:not-disabled:text-blue-500 disabled:[color:var(--text-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed"
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
