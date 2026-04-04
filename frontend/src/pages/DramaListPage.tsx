import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, Clock, FileText, Trash2, MoreHorizontal, Search } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <div className="min-h-[calc(100vh-62px)] bg-[var(--page-gradient)] px-8 py-10 max-md:px-4 max-md:py-6">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <div className="rounded-2xl border border-white/10 bg-background/90 p-6 shadow-sm backdrop-blur max-md:p-4">
          <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col max-md:items-start">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Film size={24} className="text-violet-400/85" />
                <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">剧本创作</h1>
                <Badge variant="secondary" className="h-6 px-2.5 text-xs">{works.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">集中管理剧本项目，继续编辑、搜索和删除已有剧本。</p>
            </div>
            <Button
              className="bg-[linear-gradient(135deg,#7c3aed_0%,#6d28d9_100%)] text-white hover:bg-[linear-gradient(135deg,#8b5cf6_0%,#7c3aed_100%)] hover:text-white"
              onClick={handleCreate}
            >
              <Plus size={16} />
              新建剧本
            </Button>
          </div>

          <div className="relative max-w-[360px] max-md:max-w-full">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 bg-background pl-9"
              type="text"
              placeholder="搜索剧本..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-background/90 px-6 py-20 text-center text-sm text-muted-foreground shadow-sm backdrop-blur">
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-background/90 px-6 py-20 text-center shadow-sm backdrop-blur">
            <div className="mb-2 text-violet-600/30">
              <Film size={48} />
            </div>
            <p className="m-0 text-base font-semibold text-foreground">
              {searchQuery ? '没有找到匹配的剧本' : '还没有剧本'}
            </p>
            {!searchQuery && (
              <p className="m-0 mb-2 text-sm text-muted-foreground">
                点击「新建剧本」开始你的第一个剧本创作
              </p>
            )}
            {!searchQuery && (
              <Button
                className="bg-[linear-gradient(135deg,#7c3aed_0%,#6d28d9_100%)] text-white hover:bg-[linear-gradient(135deg,#8b5cf6_0%,#7c3aed_100%)] hover:text-white"
                onClick={handleCreate}
              >
                <Plus size={16} />
                新建剧本
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,220px))] justify-center gap-5 max-md:grid-cols-[repeat(auto-fit,minmax(150px,180px))] max-md:gap-3.5">
            <div
              className="group flex aspect-[3/4] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-background/60 transition-all duration-[250ms] hover:-translate-y-1 hover:border-violet-600/50 hover:bg-violet-600/5"
              onClick={handleCreate}
            >
              <div className="flex flex-col items-center gap-2.5 text-sm font-medium text-muted-foreground transition-colors group-hover:text-violet-300/90">
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-white/10 bg-background/80 transition-all group-hover:border-violet-600/30 group-hover:bg-violet-600/15">
                  <Plus size={28} />
                </div>
                <span>新建剧本</span>
              </div>
            </div>

            {filtered.map(work => (
              <div
                key={work.id}
                className="group flex aspect-[3/4] w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/90 transition-all duration-[250ms] hover:-translate-y-1 hover:border-violet-600/35 hover:shadow-[0_12px_36px_rgba(0,0,0,0.25),0_0_0_1px_rgba(124,58,237,0.12)]"
                onClick={() => navigate(`/drama/editor?workId=${work.id}`)}
              >
                <div
                  className="relative h-[58%] w-full overflow-hidden"
                >
                  {work.cover_image ? (
                    <img src={work.cover_image} alt={work.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-violet-600/30 bg-[linear-gradient(135deg,rgba(124,58,237,0.08)_0%,rgba(109,40,217,0.04)_100%)]">
                      <Film size={32} />
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5">
                    <Badge className="bg-violet-600/20 text-violet-200 hover:bg-violet-600/20">剧本</Badge>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start gap-2 mb-1.5 relative">
                    <h3
                      className="m-0 flex-1 truncate text-[15px] font-semibold text-foreground transition-colors group-hover:text-violet-300/95"
                    >
                      {work.title || '未命名剧本'}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-mt-0.5 shrink-0 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      onClick={e => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === work.id ? null : work.id);
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </Button>
                    {openMenuId === work.id && (
                      <div
                        className="absolute right-0 top-full z-[100] min-w-[130px] rounded-[10px] border border-white/10 bg-background/95 p-1 shadow-xl backdrop-blur-xl"
                        onMouseDown={e => e.stopPropagation()}
                      >
                        <button
                          className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-all hover:bg-red-500/[0.12] hover:text-red-400 disabled:opacity-50"
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
                      className="m-0 mb-2.5 line-clamp-3 text-[13px] leading-[1.5] text-muted-foreground"
                    >
                      {work.description}
                    </p>
                  )}

                  <div className="mt-auto flex flex-col gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText size={12} />
                      {work.word_count || 0} 字
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
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
