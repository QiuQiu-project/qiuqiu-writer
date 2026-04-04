import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, Clock, FileText, Trash2, MoreHorizontal, Search } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';

export default function DramaListPage() {
  const navigate = useNavigate();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadWorks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await worksApi.listWorks({ work_type: 'video', size: 50 });
      setWorks(res.works);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const handleCreate = async () => {
    try {
      const work = await worksApi.createWork({
        title: '未命名剧本',
        work_type: 'video',
        is_public: false,
      });
      navigate(`/drama/editor?workId=${work.id}`);
    } catch {
      alert('创建失败，请重试');
    }
  };

  const handleDelete = async (workId: string) => {
    if (!confirm('确定删除这个剧本吗？此操作不可撤销。')) return;
    setDeletingId(workId);
    try {
      await worksApi.deleteWork(workId);
      setWorks(prev => prev.filter(w => w.id !== workId));
    } catch {
      alert('删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const filtered = works.filter(w =>
    !searchQuery || (w.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="w-full min-h-[calc(100vh-62px)]"
      style={{ background: 'var(--page-gradient)', color: 'var(--text-primary)' }}
    >
      <div className="max-w-[1280px] mx-auto px-8 py-10 max-md:px-4 max-md:py-6">
        {/* 页头 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-5 max-md:flex-col max-md:items-start max-md:gap-3">
            <div className="flex items-center gap-3">
              <Film size={24} className="text-violet-400/85" />
              <h1
                className="text-2xl font-bold m-0 tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                剧本创作
              </h1>
              <span
                className="text-[13px] font-medium border rounded-full px-2.5 py-0.5"
                style={{
                  color: 'var(--text-tertiary)',
                  background: 'var(--glass-bg-strong, rgba(255,255,255,0.06))',
                  borderColor: 'var(--glass-border, rgba(255,255,255,0.08))',
                }}
              >
                {works.length}
              </span>
            </div>
            <button
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white rounded-lg border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(124,58,237,0.4)] hover:[background:linear-gradient(135deg,#8b5cf6_0%,#7c3aed_100%)]"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}
              onClick={handleCreate}
            >
              <Plus size={16} />
              新建剧本
            </button>
          </div>

          {/* Search */}
          <div className="relative max-w-[360px] max-md:max-w-full">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              className="w-full h-9 pl-9 pr-3.5 text-sm rounded-lg outline-none transition-all border focus:border-violet-500/50 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.12)]"
              type="text"
              placeholder="搜索剧本..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                color: 'var(--text-primary)',
                background: 'var(--glass-bg-input, rgba(255,255,255,0.05))',
                borderColor: 'var(--glass-border, rgba(255,255,255,0.1))',
              }}
            />
          </div>
        </div>

        {/* 内容区 */}
        {loading ? (
          <div className="text-center py-20 px-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 px-6 flex flex-col items-center gap-3">
            <div className="text-violet-600/30 mb-2">
              <Film size={48} />
            </div>
            <p className="text-base font-semibold m-0" style={{ color: 'var(--text-secondary)' }}>
              {searchQuery ? '没有找到匹配的剧本' : '还没有剧本'}
            </p>
            {!searchQuery && (
              <p className="text-sm m-0 mb-2" style={{ color: 'var(--text-tertiary)' }}>
                点击「新建剧本」开始你的第一个剧本创作
              </p>
            )}
            {!searchQuery && (
              <button
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white rounded-lg border-none cursor-pointer transition-all hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(124,58,237,0.4)] hover:[background:linear-gradient(135deg,#8b5cf6_0%,#7c3aed_100%)]"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}
                onClick={handleCreate}
              >
                <Plus size={16} />
                新建剧本
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] max-md:gap-3.5">
            {/* 新建卡片 */}
            <div
              className="border border-dashed rounded-2xl overflow-hidden cursor-pointer transition-all duration-[250ms] min-h-[200px] flex items-center justify-center bg-transparent hover:border-violet-600/50 hover:bg-violet-600/5 hover:-translate-y-1 group"
              style={{ borderColor: 'var(--glass-border-strong, rgba(255,255,255,0.12))' }}
              onClick={handleCreate}
            >
              <div
                className="flex flex-col items-center gap-2.5 text-sm font-medium transition-colors group-hover:text-violet-300/90"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <div
                  className="w-[52px] h-[52px] rounded-xl border flex items-center justify-center transition-all group-hover:bg-violet-600/15 group-hover:border-violet-600/30"
                  style={{
                    background: 'var(--glass-bg-strong, rgba(255,255,255,0.06))',
                    borderColor: 'var(--glass-border, rgba(255,255,255,0.1))',
                  }}
                >
                  <Plus size={28} />
                </div>
                <span>新建剧本</span>
              </div>
            </div>

            {filtered.map(work => (
              <div
                key={work.id}
                className="border rounded-2xl overflow-hidden cursor-pointer transition-all duration-[250ms] hover:-translate-y-1 hover:border-violet-600/35 hover:shadow-[0_12px_36px_rgba(0,0,0,0.25),0_0_0_1px_rgba(124,58,237,0.12)] group"
                style={{
                  background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                  borderColor: 'var(--glass-border, rgba(255,255,255,0.08))',
                }}
                onClick={() => navigate(`/drama/editor?workId=${work.id}`)}
              >
                {/* 封面区 */}
                <div
                  className="relative w-full overflow-hidden"
                  style={{ aspectRatio: '16/9', background: 'var(--glass-bg-strong, rgba(255,255,255,0.06))' }}
                >
                  {work.cover_image ? (
                    <img src={work.cover_image} alt={work.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-violet-600/30 bg-[linear-gradient(135deg,rgba(124,58,237,0.08)_0%,rgba(109,40,217,0.04)_100%)]">
                      <Film size={32} />
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="text-[11px] font-semibold text-violet-300/90 bg-violet-600/20 border border-violet-600/30 rounded-full px-2 py-0.5">
                      剧本
                    </span>
                  </div>
                </div>

                {/* 信息区 */}
                <div className="p-4">
                  <div className="flex items-start gap-2 mb-1.5 relative">
                    <h3
                      className="flex-1 text-[15px] font-semibold m-0 truncate transition-colors group-hover:text-violet-300/95"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {work.title || '未命名剧本'}
                    </h3>
                    <button
                      className="shrink-0 w-7 h-7 flex items-center justify-center border-none rounded-[6px] cursor-pointer transition-all -mt-0.5 bg-transparent hover:[background:var(--glass-bg-strong)] hover:[color:var(--text-secondary)]"
                      style={{ color: 'var(--text-tertiary)' }}
                      onClick={e => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === work.id ? null : work.id);
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenuId === work.id && (
                      <div
                        className="absolute top-full right-0 min-w-[130px] rounded-[10px] border p-1 z-[100] backdrop-blur-xl"
                        style={{
                          background: 'var(--glass-dropdown-bg, rgba(10,20,45,0.95))',
                          borderColor: 'var(--glass-border-strong, rgba(255,255,255,0.1))',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <button
                          className="flex items-center gap-2 w-full px-2.5 py-2 text-[13px] bg-transparent border-none rounded-[7px] cursor-pointer text-left transition-all hover:bg-red-500/[0.12] hover:text-red-400 disabled:opacity-50"
                          style={{ color: 'var(--text-secondary)' }}
                          onClick={e => {
                            e.stopPropagation();
                            setOpenMenuId(null);
                            handleDelete(work.id);
                          }}
                          disabled={deletingId === work.id}
                        >
                          <Trash2 size={14} />
                          {deletingId === work.id ? '删除中...' : '删除'}
                        </button>
                      </div>
                    )}
                  </div>

                  {work.description && (
                    <p
                      className="text-[13px] m-0 mb-2.5 leading-[1.5] line-clamp-2"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {work.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3.5">
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <FileText size={12} />
                      {work.word_count || 0} 字
                    </span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <Clock size={12} />
                      {formatDate(work.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
