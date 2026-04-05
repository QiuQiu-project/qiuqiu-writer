import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Grid, List, Plus, Upload, Download, Trash2, RefreshCw, Users, Film, BookOpen, Sparkles } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import { chaptersApi } from '../utils/chaptersApi';
import { exportAsText, exportAsWord, exportAsPdf } from '../utils/exportUtils';
import { copyToClipboard } from '../utils/clipboard';
import ImportWorkModal from '../components/ImportWorkModal';
import WorkRecoveryModal from '../components/WorkRecoveryModal';
import ShareWorkModal from '../components/ShareWorkModal';
import MessageModal from '../components/common/MessageModal';
import type { MessageType } from '../components/common/MessageModal';
import { parseError } from '../utils/errorUtils';
import { templatesApi, type WorkTemplate } from '../utils/templatesApi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';
type WorkFilter = 'all' | 'long' | 'video';
type LibrarySection = 'workbench' | 'templates';

const PALETTE = {
  orange: '#ff8000',
  orangeSoft: '#fff2e5',
  jasmine: '#edb312',
  aqua: '#47b8ab',
  aquaSoft: '#edf8f7',
  indigo: '#6a58a7',
  indigoSoft: '#f0eef6',
};

export default function WorksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<WorkTemplate | null>(null);
  const [openExportMenuId, setOpenExportMenuId] = useState<string | null>(null);
  const exportMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [shareWork, setShareWork] = useState<Work | null>(null);
  const [templates, setTemplates] = useState<WorkTemplate[]>([]);

  // 消息提示状态
  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
    toast?: boolean;
    autoCloseMs?: number;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({ isOpen: true, type, message, title, onConfirm });
  };

  const showToast = (message: string, type: MessageType = 'success') => {
    setMessageState({ isOpen: true, type, message, toast: true, autoCloseMs: 2000 });
  };

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  const activeFilter = (searchParams.get('type') as WorkFilter) || 'all';
  const currentSection: LibrarySection =
    searchParams.get('section') === 'templates'
      ? 'templates'
      : 'workbench';

  const loadWorks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 100;
      let page = 1;
      let allWorks: Work[] = [];
      let total = 0;

      do {
        const response = await worksApi.listWorks({
          page,
          size: pageSize,
        });
        total = response.total;
        allWorks = [...allWorks, ...response.works];
        page += 1;
      } while (allWorks.length < total);

      setWorks(allWorks);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载作品失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载作品列表
  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await templatesApi.listTemplates({
        size: 100,
        sort_by: 'updated_at',
        sort_order: 'desc',
      });
      setTemplates(data);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (currentSection === 'templates') {
      loadTemplates();
    }
  }, [currentSection, loadTemplates]);

  // 检测 ?action=create URL param（侧边栏新建作品触发）
  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setShowCreateDialog(true);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('action');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.values(exportMenuRefs.current).forEach((ref) => {
        if (ref && !ref.contains(event.target as Node)) {
          setOpenExportMenuId(null);
        }
      });
    };

    if (openExportMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openExportMenuId]);
  const filteredWorks = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return works.filter((work) => {
      const typeMatched =
        activeFilter === 'all'
          ? work.work_type === 'long' || work.work_type === 'video'
          : work.work_type === activeFilter;
      if (!typeMatched) return false;
      if (!keyword) return true;
      const title = (work.title || '').toLowerCase();
      const description = (work.description || '').toLowerCase();
      return title.includes(keyword) || description.includes(keyword);
    });
  }, [activeFilter, searchQuery, works]);
  const visibleWorks = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredWorks.slice(start, start + itemsPerPage);
  }, [currentPage, filteredWorks, itemsPerPage]);
  const pageCount = Math.max(1, Math.ceil(filteredWorks.length / itemsPerPage));
  const filteredTemplates = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      if (!keyword) return true;
      const title = (template.name || '').toLowerCase();
      const description = (template.description || '').toLowerCase();
      const category = (template.category || '').toLowerCase();
      return title.includes(keyword) || description.includes(keyword) || category.includes(keyword);
    });
  }, [searchQuery, templates]);
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchQuery]);

  const getEditorPath = (work: Work) => {
    if (work.work_type === 'video') return `/drama/editor?workId=${work.id}`;
    return `/novel/editor?workId=${work.id}`;
  };

  const getWorkTypeMeta = (workType: Work['work_type']) => {
    if (workType === 'video') {
      return {
        label: '剧本',
        icon: <Film size={14} />,
        badgeStyle: { background: PALETTE.indigoSoft, color: PALETTE.indigo, borderColor: `${PALETTE.indigo}22` },
        coverStyle: { background: 'linear-gradient(135deg, rgba(106,88,167,0.12) 0%, rgba(71,184,171,0.08) 100%)' },
      };
    }
    return {
      label: '小说',
      icon: <BookOpen size={14} />,
      badgeStyle: { background: PALETTE.orangeSoft, color: PALETTE.orange, borderColor: `${PALETTE.orange}22` },
      coverStyle: { background: 'linear-gradient(135deg, rgba(255,128,0,0.10) 0%, rgba(237,179,18,0.08) 100%)' },
    };
  };
  const heroWork = visibleWorks[0] ?? null;
  const dashboardWorks = heroWork ? visibleWorks.slice(1) : visibleWorks;
  const longWorksCount = works.filter((work) => work.work_type === 'long').length;
  const videoWorksCount = works.filter((work) => work.work_type === 'video').length;

  const getStatusMeta = (work: Work) => {
    if (work.work_type === 'video') {
      return {
        label: '创意中',
        dot: PALETTE.jasmine,
        style: { background: `${PALETTE.jasmine}1A`, color: PALETTE.jasmine },
      };
    }

    return {
      label: '连载中',
      dot: PALETTE.aqua,
      style: { background: `${PALETTE.aqua}1A`, color: '#2b6e66' },
    };
  };
  const featuredTemplate = filteredTemplates[0] ?? null;
  const templateCards = featuredTemplate ? filteredTemplates.slice(1, 5) : filteredTemplates.slice(0, 4);
  const templateCategories = Array.from(
    new Set(
      templates
        .map((template) => template.category?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 4);

  const getTemplateCategoryLabel = (template: WorkTemplate) => {
    return template.category || (template.work_type === 'video' ? '剧本模板' : '小说模板');
  };

  // 处理删除作品
  const handleDeleteWork = async (workId: string) => {
    const workToDelete = works.find(w => String(w.id) === workId);
    const workTitle = workToDelete?.title || '这个作品';

    showMessage(
      `确定要删除作品《${workTitle}》吗？\n\n⚠️ 警告：此操作不可恢复！\n将永久删除作品及其所有章节、内容。`,
      'warning',
      '删除作品',
      async () => {
        try {
          setLoading(true);
          setError(null);
          await worksApi.deleteWork(workId);
          showToast(`作品《${workTitle}》已成功删除`);
          if (works.length === 1 && currentPage > 1) {
            setCurrentPage(prev => prev - 1);
          } else {
            await loadWorks();
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : '删除作品失败，请稍后重试';
          setError(errorMessage);
          showMessage(parseError(err, `删除作品失败：${errorMessage}`), 'error', '删除失败');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // 处理菜单项点击
  const handleMenuAction = async (action: string, workId: string, format?: string) => {
    try {
      switch (action) {
        case 'delete':
          await handleDeleteWork(workId);
          break;
        case 'export':
          setLoading(true);
          try {
            const work = await worksApi.getWork(workId);
            if (format === 'text') {
              await exportAsText(work);
              showMessage(`✅ 导出成功！\n\n文件：${work.title}.txt\n\n文件已开始下载，请查看浏览器下载文件夹。`, 'success');
            } else if (format === 'word') {
              await exportAsWord(work);
              showMessage(`✅ 导出成功！\n\n文件：${work.title}.doc\n\n文件已开始下载，请查看浏览器下载文件夹。`, 'success');
            } else if (format === 'pdf') {
              await exportAsPdf(work);
              showMessage(`✅ 导出成功！\n\n正在打开打印对话框，请选择"另存为 PDF"保存文件。`, 'success');
            } else {
              showMessage('❌ 不支持的导出格式', 'error');
            }
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '导出失败，请稍后重试';
            showMessage(parseError(err, `导出失败：${errorMessage}`), 'error', '导出失败');
            throw err;
          } finally {
            setLoading(false);
          }
          break;
        case 'copy-link':
          {
            const targetWork = works.find((item) => String(item.id) === String(workId));
            const editorPath = targetWork?.work_type === 'video' ? '/drama/editor' : '/novel/editor';
            const workLink = `${window.location.origin}${editorPath}?workId=${workId}`;
            const success = await copyToClipboard(workLink);
            if (success) {
              showToast('链接已复制到剪贴板');
            } else {
              showMessage(
                `无法自动复制链接，请手动复制：\n\n${workLink}\n\n点击"确定"打开链接`,
                'warning',
                '复制链接',
                () => window.open(workLink, '_blank')
              );
            }
          }
          break;
        case 'convert-to-drama':
          await handleConvertToDrama(workId);
          break;
        default:
          break;
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  // 小说转换为剧本
  const handleConvertToDrama = async (workId: string) => {
    try {
      const novel = await worksApi.getWork(workId);
      let allChapters: Awaited<ReturnType<typeof chaptersApi.listChapters>>['chapters'] = [];
      let chapPage = 1;
      let hasMore = true;
      while (hasMore) {
        const chapRes = await chaptersApi.listChapters({
          work_id: workId,
          page: chapPage,
          size: 100,
          sort_by: 'chapter_number',
          sort_order: 'asc',
          skipCache: true,
        });
        allChapters = [...allChapters, ...chapRes.chapters];
        hasMore = chapRes.chapters.length === 100;
        chapPage++;
      }

      const contentMap = new Map<number, string>();
      await Promise.allSettled(
        allChapters.map(async (ch) => {
          try {
            const doc = await chaptersApi.getChapterDocument(ch.id);
            if (doc.content) contentMap.set(ch.id, doc.content);
          } catch { /* 忽略单章拉取失败 */ }
        })
      );

      const genId = () => Math.random().toString(36).slice(2, 10);
      const rawChars = (novel.metadata?.characters as Record<string, unknown>[] | undefined) || [];
      const characters = rawChars.map((c, i) => ({
        id: genId(),
        name: (c.display_name as string) || (c.name as string) || `角色${i + 1}`,
        role: (c.role as string) || (i === 0 ? '主角' : '配角'),
        description: (c.description as string) || '',
        appearance: (c.appearance as string) || '',
        personality: (c.personality as string) || '',
      }));
      const episodes = allChapters.map((ch, i) => ({
        id: genId(),
        number: i + 1,
        title: ch.title || `第${i + 1}集`,
        synopsis: (ch.metadata?.outline as string) || contentMap.get(ch.id) || '',
        script: '',
        scenes: [],
        sourceChapterId: ch.id,
        sourceChapterTitle: ch.title,
      }));

      const dramaMeta = {
        genre: '',
        style: '',
        totalEpisodes: episodes.length,
        outline: novel.description || '',
        characters,
        episodes,
        sourceNovelId: novel.id,
        sourceNovelTitle: novel.title,
      };

      const drama = await worksApi.createWork({
        title: `${novel.title}（剧本）`,
        work_type: 'video',
        is_public: false,
      });
      await worksApi.updateWork(drama.id, { metadata: dramaMeta as unknown as Work['metadata'] });

      showToast(`已成功转换为剧本，共 ${episodes.length} 集`);
      navigate(`/drama/editor?workId=${drama.id}`);
    } catch (err) {
      showMessage(parseError(err, '转换失败，请重试'), 'error');
    } finally {
      // noop
    }
  };

  // 处理创建作品
  const handleCreateWork = async (workType: 'long' | 'video') => {
    try {
      setLoading(true);
      const template = pendingTemplate;
      const workData = {
        title: template ? template.name : (workType === 'video' ? '未命名剧本' : '未命名作品'),
        work_type: workType,
        is_public: false,
      };
      const newWork = await worksApi.createWork(workData);
      if (!newWork || !newWork.id) {
        throw new Error('创建作品成功，但未返回作品ID');
      }
      if (template) {
        await worksApi.updateWork(newWork.id, {
          metadata: { template_config: { templateId: template.id } },
        });
      }
      await loadWorks();
      setShowCreateDialog(false);
      setPendingTemplate(null);
      navigate(workType === 'video' ? `/drama/editor?workId=${newWork.id}` : `/novel/editor?workId=${newWork.id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建作品失败';
      showMessage(parseError(err), 'error', '创建失败');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setPendingTemplate(null);
    setShowCreateDialog(true);
  };

  const openCreateFromTemplate = (template: WorkTemplate) => {
    setPendingTemplate(template);
    setShowCreateDialog(true);
  };

  // 处理导入成功
  const handleImportSuccess = (_workId: string, _workTitle: string) => {
    loadWorks();
    showToast(`导入成功：${_workTitle}`);
    navigate(`/novel/editor?workId=${_workId}`);
  };

  return (
    <div
      className="relative min-h-[calc(100vh-62px)] overflow-hidden px-6 py-8 max-md:px-4 max-md:py-6"
      style={{ background: 'linear-gradient(180deg, #eef4ff 0%, #f6f8ff 35%, #fff9fd 100%)' }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-[-80px] h-[280px] w-[280px] rounded-full bg-sky-300/25 blur-[70px]" />
        <div className="absolute right-[-60px] top-[140px] h-[260px] w-[260px] rounded-full bg-fuchsia-200/30 blur-[80px]" />
        <div className="absolute bottom-[-80px] left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-cyan-200/25 blur-[90px]" />
        <div
          className="absolute right-8 top-10 h-48 w-48 rounded-full opacity-[0.08] blur-[1px] max-md:hidden"
          style={{
            backgroundImage: "url('/logo.svg')",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'contain',
          }}
        />
      </div>
      <div className="relative z-[1] mx-auto w-full max-w-[1320px]">
        <div className="min-w-0 overflow-hidden rounded-[32px] bg-[#fdf7ff] px-6 pb-8 pt-6 shadow-[0px_20px_40px_rgba(31,4,90,0.04)] md:px-8">
          <div className="space-y-8">
            {currentSection === 'templates' ? (
              <>
                <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <div className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-[#964900]">策展人精选</div>
                    <h1 className="mb-2 text-4xl font-bold tracking-tight text-[#1f045a]">模板库</h1>
                    <p className="text-sm leading-7 text-[#574235]">为小说与剧本创作准备的高质量模板集合，帮助你快速搭建结构与风格。</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-[#f2ebff] p-1">
                    {['全部', '最近', '收藏'].map((tab, index) => (
                      <Button
                        key={tab}
                        variant={index === 0 ? 'secondary' : 'ghost'}
                        className={cn('rounded-xl px-5', index === 0 && 'bg-white text-[#1f045a] shadow-sm')}
                      >
                        {tab}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button className="rounded-full bg-[#2b0c74] px-4 py-2 text-sm font-bold text-white">全部分类</button>
                  {templateCategories.map((category) => (
                    <button
                      key={category}
                      className="rounded-full bg-[#ede4ff] px-4 py-2 text-sm font-medium text-[#4a2a92] transition-colors hover:bg-[#e7deff]"
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="flex flex-col items-center rounded-[2rem] border-2 border-dashed border-[#dfc1af]/30 bg-white px-6 py-16 text-center">
                    <p className="mb-3 text-lg font-semibold text-[#1f045a]">暂无模板</p>
                    <p className="mb-5 text-sm text-[#574235]">后续你可以把常用写作模板沉淀到这里，形成球球写作的模板库。</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    {featuredTemplate && (
                      <div className="grid overflow-hidden rounded-[2rem] bg-white shadow-[0px_20px_40px_rgba(31,4,90,0.04)] xl:col-span-2 xl:grid-cols-[1.1fr_1fr]">
                        <div className="relative min-h-[280px] bg-[linear-gradient(135deg,#b58754_0%,#ead9c8_55%,#f7eee5_100%)]">
                          <div className="absolute left-4 top-4 rounded-full bg-[#ffc329] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#7a4b00]">热门</div>
                          <div className="absolute inset-0 flex items-center justify-center opacity-20">
                            <img src="/logo.svg" alt="球球" className="h-28 w-28 object-contain" />
                          </div>
                        </div>
                        <div className="flex flex-col p-6">
                          <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[#964900]">{getTemplateCategoryLabel(featuredTemplate)}</div>
                          <h3 className="mb-3 text-3xl font-bold leading-tight text-[#1f045a]">{featuredTemplate.name}</h3>
                          <p className="mb-6 text-sm leading-7 text-[#574235]">{featuredTemplate.description || '快速套用模板，构建章节结构、角色设定或剧本开发流程。'}</p>
                          <Button className="mt-auto rounded-xl bg-[#ff8000] text-white hover:bg-[#e87400]" onClick={() => openCreateFromTemplate(featuredTemplate)}>
                            使用模板
                          </Button>
                        </div>
                      </div>
                    )}

                    {templateCards.map((template) => (
                      <div key={template.id} className="flex flex-col rounded-[2rem] bg-white p-6 shadow-[0px_20px_40px_rgba(31,4,90,0.04)]">
                        <div className="mb-5 flex items-start justify-between gap-4">
                          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#edf8f7] text-[#2b6e66]">
                            {template.work_type === 'video' ? <Film size={22} /> : <BookOpen size={22} />}
                          </div>
                          <span className="rounded-full bg-[#edf8f7] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#2b6e66]">
                            {template.is_system ? '系统' : '自定义'}
                          </span>
                        </div>
                        <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[#964900]">{getTemplateCategoryLabel(template)}</div>
                        <h3 className="mb-3 text-2xl font-bold text-[#1f045a]">{template.name}</h3>
                        <p className="mb-6 line-clamp-4 text-sm leading-7 text-[#574235]">{template.description || '适合用于快速起稿、结构搭建和灵感扩展。'}</p>
                        <Button className="mt-auto rounded-xl bg-[#ff8000] text-white hover:bg-[#e87400]" onClick={() => openCreateFromTemplate(template)}>
                          使用模板
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <h1 className="mb-2 text-4xl font-bold tracking-tight text-[#1f045a]">创作空间</h1>
                    <p className="text-sm text-[#574235]">整理、管理并继续完善你的小说与剧本创作资产。</p>
                  </div>
                  <div className="flex w-full justify-end md:w-auto">
                    <div className="flex items-center gap-2 rounded-2xl bg-[#f2ebff] p-1">
                      <Button
                        variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                        className={cn('gap-2 rounded-xl px-5', viewMode === 'grid' && 'bg-[#e7deff] text-[#1f045a] shadow-sm')}
                        onClick={() => setViewMode('grid')}
                      >
                        <Grid size={16} />
                        卡片
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                        className={cn('gap-2 rounded-xl px-5', viewMode === 'list' && 'bg-[#e7deff] text-[#1f045a] shadow-sm')}
                        onClick={() => setViewMode('list')}
                      >
                        <List size={16} />
                        列表
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <Button variant="outline" className="rounded-full border-none bg-white px-4 text-[#1f045a] shadow-[0px_4px_12px_rgba(31,4,90,0.03)]">
                    <Sparkles size={16} className="text-[#964900]" />
                    全部分类
                  </Button>
                  <Button variant="outline" className="rounded-full border-none bg-white px-4 text-[#1f045a] shadow-[0px_4px_12px_rgba(31,4,90,0.03)]">
                    <RefreshCw size={16} className="text-[#964900]" />
                    时间范围
                  </Button>
                  <div className="mx-2 hidden h-6 w-px bg-[#dfc1af] opacity-40 md:block" />
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'all', label: `全部 · ${works.length}`, dot: PALETTE.indigo },
                      { key: 'long', label: `小说 · ${longWorksCount}`, dot: PALETTE.aqua },
                      { key: 'video', label: `剧本 · ${videoWorksCount}`, dot: PALETTE.jasmine },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all',
                          activeFilter === item.key ? 'ring-2 ring-offset-2 ring-offset-[#fdf7ff]' : 'opacity-85'
                        )}
                        style={{
                          background: `${item.dot}18`,
                          color: item.dot,
                          boxShadow: activeFilter === item.key ? `0 0 0 2px ${item.dot}33` : 'none',
                        }}
                        onClick={() => setSearchParams(item.key === 'all' ? {} : { type: item.key })}
                      >
                        <span className="size-1.5 rounded-full" style={{ background: item.dot }} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button className="rounded-xl bg-[#964900] text-white hover:bg-[#7a3c00]" onClick={() => openCreateDialog()}>
                      <Plus size={16} />
                      新建作品
                    </Button>
                    <Button variant="outline" className="rounded-xl border-[#dfc1af] bg-white text-[#1f045a]" onClick={() => setShowImportModal(true)}>
                      <Upload size={16} />
                      导入
                    </Button>
                    <Button variant="outline" className="rounded-xl border-[#dfc1af] bg-white text-[#1f045a]" onClick={() => setShowRecoveryModal(true)}>
                      <RefreshCw size={16} />
                      恢复
                    </Button>
                  </div>
                </div>

                {loading && (
                  <div className="rounded-[2rem] bg-white px-6 py-12 text-center text-sm text-[#574235] shadow-[0px_20px_40px_rgba(31,4,90,0.04)]">加载中...</div>
                )}
                {error && (
                  <div className="rounded-[2rem] border border-destructive/20 bg-destructive/5 px-6 py-12 text-center text-sm text-destructive shadow-[0px_20px_40px_rgba(31,4,90,0.04)]">错误: {error}</div>
                )}

                {!loading && !error && works.length === 0 && (
                  <div className="flex flex-col items-center rounded-[2rem] border-2 border-dashed border-[#dfc1af]/30 bg-[#f8f1ff] px-6 py-16 text-center">
                    <p className="mb-4 text-lg font-semibold text-[#1f045a]">还没有作品</p>
                    <p className="mb-6 text-sm text-[#574235]">点击下方按钮开始你的第一部长篇或剧本创作。</p>
                    <Button className="rounded-xl bg-[#964900] text-white hover:bg-[#7a3c00]" onClick={() => openCreateDialog()}>
                      <Plus size={16} />
                      创建第一个作品
                    </Button>
                  </div>
                )}

                {!loading && !error && works.length > 0 && filteredWorks.length === 0 && (
                  <div className="flex flex-col items-center rounded-[2rem] border-2 border-dashed border-[#dfc1af]/30 bg-[#f8f1ff] px-6 py-16 text-center">
                    <p className="mb-3 text-lg font-semibold text-[#1f045a]">没有找到匹配的作品</p>
                    <p className="mb-5 text-sm text-[#574235]">试试更换关键词，或切换作品类型筛选。</p>
                    <Button variant="outline" className="rounded-xl border-[#dfc1af] bg-white text-[#1f045a]" onClick={() => setSearchQuery('')}>
                      清除搜索
                    </Button>
                  </div>
                )}

                {!loading && !error && filteredWorks.length > 0 && viewMode === 'grid' && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                {heroWork && (
                  <div
                    className="group relative flex min-h-[320px] cursor-pointer flex-col overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#35216f_0%,#1f045a_100%)] p-8 text-white md:col-span-2"
                    onClick={() => navigate(getEditorPath(heroWork))}
                  >
                    <div className="absolute inset-0 opacity-20">
                      {heroWork.cover_image ? (
                        <img src={heroWork.cover_image} alt={heroWork.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <img src="/logo.svg" alt="球球" className="h-36 w-36 object-contain opacity-40" />
                        </div>
                      )}
                    </div>
                    <div className="relative z-10 flex h-full flex-col">
                      <div className="mb-auto">
                        <span className="mb-4 inline-block rounded-full bg-[#964900] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white">
                          最近修改
                        </span>
                        <h3 className="mb-2 text-3xl font-bold">{heroWork.title || '未命名作品'}</h3>
                        <p className="max-w-md text-sm leading-6 text-white/75">
                          {heroWork.description || '继续你的创作旅程，整理设定、章节和灵感碎片，让作品在球球写作中逐步成形。'}
                        </p>
                      </div>
                      <div className="mt-8 flex items-center justify-between gap-4">
                        <div className="flex -space-x-2">
                          <div className="size-8 rounded-full border-2 border-[#1f045a] bg-[#edf8f7]" />
                          <div className="size-8 rounded-full border-2 border-[#1f045a] bg-[#fdf7e7]" />
                          <div className="flex size-8 items-center justify-center rounded-full border-2 border-[#1f045a] bg-[#ff8000] text-[10px] font-bold text-white">
                            {Math.max(works.length - 1, 1)}+
                          </div>
                        </div>
                        <Button className="rounded-xl bg-[#ffc329] px-6 text-[#5b4300] hover:bg-[#f1c241]">
                          <Sparkles size={16} />
                          继续创作
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {dashboardWorks.map((work) => {
                  const typeMeta = getWorkTypeMeta(work.work_type);
                  const statusMeta = getStatusMeta(work);
                  return (
                    <div
                      key={work.id}
                      className="group flex cursor-pointer flex-col rounded-[2rem] bg-white p-6 shadow-[0px_20px_40px_rgba(31,4,90,0.04)] transition-all hover:shadow-[0px_30px_60px_rgba(31,4,90,0.08)]"
                      onClick={() => navigate(getEditorPath(work))}
                    >
                      <div className="mb-6">
                        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl" style={typeMeta.coverStyle}>
                          <div className="flex size-10 items-center justify-center rounded-xl" style={typeMeta.badgeStyle}>
                            {work.work_type === 'video' ? <Film size={22} /> : <BookOpen size={22} />}
                          </div>
                        </div>
                        <h3 className="truncate text-xl font-bold text-[#1f045a]">{work.title || '未命名作品'}</h3>
                        <p className="mt-1 text-sm text-[#574235]/70">
                          {typeMeta.label} • {new Date(work.updated_at).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                      <div className="mb-6 mt-auto flex items-center gap-2">
                        <span className="rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em]" style={statusMeta.style}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <Button className="flex-1 rounded-xl bg-[#964900] text-white hover:bg-[#7a3c00]" onClick={() => navigate(getEditorPath(work))}>
                          编辑
                        </Button>
                        {work.work_type === 'long' && (
                          <div className="relative" ref={(el) => { exportMenuRefs.current[String(work.id)] = el; }}>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="rounded-xl border-none bg-[#ede4ff] text-[#35216f] hover:bg-[#e7deff]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOpenExportMenuId(openExportMenuId === String(work.id) ? null : String(work.id));
                              }}
                            >
                              <Download size={16} />
                            </Button>
                            {openExportMenuId === String(work.id) && (
                              <div className="absolute left-0 top-[calc(100%+4px)] z-[1000] min-w-[170px] rounded-xl border border-border bg-background p-1 shadow-lg">
                                <button
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenExportMenuId(null);
                                    (async () => {
                                      try {
                                        setLoading(true);
                                        const workData = await worksApi.getWork(work.id);
                                        await exportAsText(workData);
                                        showMessage(`✅ 导出成功！\n\n文件：${workData.title}.txt\n\n文件已开始下载，请查看浏览器下载文件夹。`, 'success');
                                      } catch (err) {
                                        const errorMsg = err instanceof Error ? err.message : '未知错误';
                                        showMessage(`❌ 导出失败\n\n错误：${errorMsg}\n\n请查看浏览器控制台（F12）获取更多信息。`, 'error');
                                      } finally {
                                        setLoading(false);
                                      }
                                    })();
                                  }}
                                >
                                  导出为 Text
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setOpenExportMenuId(null);
                                    try {
                                      await handleMenuAction('export', String(work.id), 'word');
                                    } catch (err) {
                                      showMessage(`导出失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
                                    }
                                  }}
                                >
                                  导出为 Word
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-xl border-none bg-[#ede4ff] text-[#35216f] hover:bg-[#e7deff]"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShareWork(work); }}
                        >
                          <Users size={16} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="rounded-xl border-none bg-[#ffebe9] text-destructive hover:bg-[#ffdad6]"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteWork(String(work.id)); }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-[2rem] border-4 border-dashed border-[#e7deff] bg-[#f8f1ff]/70 text-[#574235] transition-all hover:border-[#ff8000]/20 hover:bg-white hover:text-[#964900]"
                  onClick={() => openCreateDialog()}
                >
                  <div className="flex size-16 items-center justify-center rounded-full bg-[#ede4ff] transition-colors group-hover:bg-[#ff8000] group-hover:text-white">
                    <Plus size={30} />
                  </div>
                  <span className="text-lg font-bold">创建新作品</span>
                </button>
              </div>
                )}

                {!loading && !error && filteredWorks.length > 0 && viewMode === 'list' && (
              <div className="space-y-4">
                {visibleWorks.map((work) => {
                  const typeMeta = getWorkTypeMeta(work.work_type);
                  return (
                    <div
                      key={work.id}
                      className="flex cursor-pointer items-center gap-4 rounded-[1.5rem] bg-white p-5 shadow-[0px_20px_40px_rgba(31,4,90,0.04)] transition-all hover:shadow-[0px_30px_60px_rgba(31,4,90,0.08)] max-md:flex-col max-md:items-start"
                      onClick={() => navigate(getEditorPath(work))}
                    >
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl" style={typeMeta.coverStyle}>
                        <div className="flex size-12 items-center justify-center rounded-xl" style={typeMeta.badgeStyle}>
                          {work.work_type === 'video' ? <Film size={22} /> : <BookOpen size={22} />}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="truncate text-lg font-bold text-[#1f045a]">{work.title || '未命名作品'}</h3>
                          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium" style={typeMeta.badgeStyle}>
                            {typeMeta.icon}
                            {typeMeta.label}
                          </span>
                        </div>
                        <p className="line-clamp-1 text-sm text-[#574235]/70">{work.description || '暂无简介，点击进入后可继续完善作品设定。'}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[#574235]/70 max-md:flex-wrap">
                        <span>{work.word_count || 0} 字</span>
                        <span>{new Date(work.updated_at).toLocaleDateString('zh-CN')}</span>
                        <Button className="rounded-xl bg-[#964900] text-white hover:bg-[#7a3c00]">编辑</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
                )}

                {!loading && !error && filteredWorks.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-[0px_20px_40px_rgba(31,4,90,0.04)]">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}>&lt;</Button>
                <Button variant="secondary" size="sm" className="min-w-10 bg-[#ede4ff] text-[#1f045a]">{currentPage}</Button>
                <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setCurrentPage(prev => Math.min(pageCount, prev + 1))}>&gt;</Button>
                <select
                  className="h-8 rounded-lg border border-[#dfc1af] bg-white px-2 text-sm text-[#1f045a]"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10条/页</option>
                  <option value={12}>12条/页</option>
                  <option value={20}>20条/页</option>
                </select>
                <span className="text-sm text-[#574235]">共 {filteredWorks.length} 条</span>
                {searchQuery && <span className="text-sm text-[#574235]">当前筛选 {filteredWorks.length} 条</span>}
              </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) setPendingTemplate(null); }}>
        <DialogContent showCloseButton={false} className="max-w-[820px] gap-0 overflow-hidden border-none bg-transparent p-0 shadow-none">
          <div className="max-h-[90dvh] overflow-y-auto rounded-[32px] border border-[#ede4ff] bg-[#fdf7ff] shadow-[0px_32px_80px_rgba(31,4,90,0.16)]">
            <DialogHeader className="border-b border-[#ede4ff] bg-[linear-gradient(180deg,#f8f1ff_0%,#fdf7ff_100%)] px-6 py-5">
              <DialogTitle className="text-2xl font-bold text-[#1f045a]">
                {pendingTemplate ? `使用模板：${pendingTemplate.name}` : '新建作品'}
              </DialogTitle>
              {pendingTemplate && (
                <p className="mt-1 text-sm text-[#574235]">选择创作类型，将以此模板创建新作品</p>
              )}
            </DialogHeader>
            <div className="grid gap-4 bg-[#fdf7ff] px-6 py-6 md:grid-cols-2">
              <button
                type="button"
                className="group flex flex-col items-start gap-4 rounded-[24px] border border-[#ede4ff] bg-white p-5 text-left shadow-[0px_20px_40px_rgba(31,4,90,0.04)] transition-all hover:-translate-y-1 hover:border-[#ff8000]/40 hover:bg-[#fffaf3] hover:shadow-[0px_28px_50px_rgba(255,128,0,0.08)]"
                onClick={() => handleCreateWork('long')}
              >
                <div className="flex size-12 items-center justify-center rounded-xl shadow-sm" style={{ background: PALETTE.orangeSoft, color: PALETTE.orange }}>
                  <BookOpen size={22} />
                </div>
                <div className="text-lg font-bold text-[#1f045a]">小说创作</div>
                <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#fff2e5] px-4 py-1.5 text-sm font-semibold text-[#964900] transition-colors group-hover:bg-[#ff8000] group-hover:text-white">
                  {pendingTemplate ? '用此模板写小说' : '开始写小说'}
                  <span>→</span>
                </div>
              </button>
              <button
                type="button"
                className="group flex flex-col items-start gap-4 rounded-[24px] border border-[#ede4ff] bg-white p-5 text-left shadow-[0px_20px_40px_rgba(31,4,90,0.04)] transition-all hover:-translate-y-1 hover:border-[#6a58a7]/35 hover:bg-[#f7f3ff] hover:shadow-[0px_28px_50px_rgba(106,88,167,0.08)]"
                onClick={() => handleCreateWork('video')}
              >
                <div className="flex size-12 items-center justify-center rounded-xl shadow-sm" style={{ background: PALETTE.indigoSoft, color: PALETTE.indigo }}>
                  <Film size={22} />
                </div>
                <div className="text-lg font-bold text-[#1f045a]">剧本创作</div>
                <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#f0eef6] px-4 py-1.5 text-sm font-semibold text-[#554686] transition-colors group-hover:bg-[#6a58a7] group-hover:text-white">
                  {pendingTemplate ? '用此模板写剧本' : '开始写剧本'}
                  <span>→</span>
                </div>
              </button>
            </div>
            <DialogFooter className="mx-0 mb-0 rounded-b-[32px] border-t border-[#ede4ff] bg-[#f8f1ff] px-6 py-4">
              <Button variant="outline" className="border-[#dfc1af] bg-white text-[#1f045a] hover:bg-[#fdf7ff]" onClick={() => { setShowCreateDialog(false); setPendingTemplate(null); }}>取消</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ShareWorkModal
        isOpen={shareWork !== null}
        workId={shareWork?.id ?? ''}
        workTitle={shareWork?.title ?? ''}
        onClose={() => setShareWork(null)}
      />

      <ImportWorkModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />

      <WorkRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        onSuccess={(workId) => {
          loadWorks();
          navigate(`/novel/editor?workId=${workId}`);
        }}
      />

      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        toast={messageState.toast}
        autoCloseMs={messageState.autoCloseMs}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />
    </div>
  );
}
