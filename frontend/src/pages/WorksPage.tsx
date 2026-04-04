import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, List, Plus, Upload, ChevronDown, Download, Link2, Trash2, RefreshCw, Users, Film } from 'lucide-react';
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
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';

export default function WorksPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [openExportMenuId, setOpenExportMenuId] = useState<string | null>(null);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [shareWork, setShareWork] = useState<Work | null>(null);

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

  const loadWorks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await worksApi.listWorks({
        page: currentPage,
        size: itemsPerPage,
        work_type: 'long',
      });
      setWorks(response.works);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载作品失败');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage]);

  // 加载作品列表
  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
      Object.values(exportMenuRefs.current).forEach((ref) => {
        if (ref && !ref.contains(event.target as Node)) {
          setOpenExportMenuId(null);
        }
      });
    };

    if (showCreateMenu || openExportMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCreateMenu, openExportMenuId]);

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
            const workLink = `${window.location.origin}/novel/editor?workId=${workId}`;
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
    setConvertingId(workId);
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
      setConvertingId(null);
    }
  };

  // 处理创建作品
  const handleCreateWork = async () => {
    try {
      setLoading(true);
      const workData = {
        title: '未命名作品',
        work_type: 'long' as const,
        is_public: false,
      };
      const newWork = await worksApi.createWork(workData);
      if (!newWork || !newWork.id) {
        throw new Error('创建作品成功，但未返回作品ID');
      }
      await loadWorks();
      navigate(`/novel/editor?workId=${newWork.id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建作品失败';
      showMessage(parseError(err), 'error', '创建失败');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 处理导入成功
  const handleImportSuccess = (_workId: string, _workTitle: string) => {
    loadWorks();
    showToast(`导入成功：${_workTitle}`);
    navigate(`/novel/editor?workId=${_workId}`);
  };

  const actionBtnClass = "flex items-center gap-1.5 px-4 py-2 border rounded text-sm font-medium cursor-pointer transition-all hover:[background:var(--bg-secondary)] hover:[border-color:var(--border-hover)]";
  const actionBtnStyle = { background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' };

  return (
    <div
      className="w-full min-h-[calc(100vh-62px)] p-6 [animation:fade-in_0.4s_ease-out] max-md:p-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-6 max-md:flex-col max-md:items-start max-md:gap-4">
        <h1 className="text-[28px] font-semibold m-0 tracking-[-0.5px]" style={{ color: 'var(--text-primary)' }}>我的作品</h1>
        <div className="flex items-center gap-3 max-md:w-full max-md:flex-wrap">
          <button className={actionBtnClass} style={actionBtnStyle} onClick={handleCreateWork}>
            <Plus size={16} />
            <span>创建作品</span>
          </button>
          <button className={actionBtnClass} style={actionBtnStyle} onClick={() => setShowImportModal(true)}>
            <Upload size={16} />
            <span>导入作品</span>
          </button>
          <button className={actionBtnClass} style={actionBtnStyle} onClick={() => setShowRecoveryModal(true)}>
            <RefreshCw size={16} />
            <span>恢复作品</span>
          </button>
          {/* View toggle */}
          <div className="flex gap-0.5 p-0.5 rounded ml-2" style={{ background: 'var(--bg-secondary)' }}>
            <button
              className={cn(
                'flex items-center justify-center w-8 h-8 border-none cursor-pointer rounded transition-all',
                viewMode === 'grid'
                  ? 'shadow-sm [background:var(--bg-primary)] [color:var(--text-primary)]'
                  : 'bg-transparent [color:var(--text-tertiary)] hover:[color:var(--text-secondary)]'
              )}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={18} />
            </button>
            <button
              className={cn(
                'flex items-center justify-center w-8 h-8 border-none cursor-pointer rounded transition-all',
                viewMode === 'list'
                  ? 'shadow-sm [background:var(--bg-primary)] [color:var(--text-primary)]'
                  : 'bg-transparent [color:var(--text-tertiary)] hover:[color:var(--text-secondary)]'
              )}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>加载中...</div>
      )}
      {error && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--error)' }}>错误: {error}</div>
      )}
      {!loading && !error && (
        <div
          className={cn(
            'grid gap-6 mb-8',
            viewMode === 'grid'
              ? 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-md:grid-cols-1 max-md:gap-4'
              : 'grid-cols-1'
          )}
        >
          {works.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>暂无作品</p>
              <button className={actionBtnClass} style={actionBtnStyle} onClick={handleCreateWork}>
                <Plus size={16} />
                <span>创建第一个作品</span>
              </button>
            </div>
          ) : (
            works.map((work) => (
              <div
                key={work.id}
                className="border rounded-xl p-4 cursor-pointer transition-colors hover:[border-color:var(--border-hover)] max-md:p-3"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                onClick={() => navigate(`/novel/editor?workId=${work.id}`)}
              >
                {work.cover_image ? (
                  <div
                    className="w-full h-[180px] mb-4 rounded overflow-hidden border max-md:h-[160px]"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
                  >
                    <img src={work.cover_image} alt={work.title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div>
                    <h3 className="text-base font-semibold m-0 mb-2" style={{ color: 'var(--text-primary)' }}>
                      {work.title}
                    </h3>
                    {work.description && (
                      <p
                        className="text-[13px] leading-[1.5] m-0 mb-4 line-clamp-2 h-10"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {work.description}
                      </p>
                    )}
                    <p className="text-xs m-0" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(work.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                )}
                {/* Work actions */}
                <div
                  className="flex gap-2 pt-4 border-t mt-auto"
                  style={{ borderColor: 'var(--border-light)' }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* Export menu */}
                  <div className="relative" ref={(el) => { exportMenuRefs.current[String(work.id)] = el; }}>
                    <button
                      className={cn(
                        'flex items-center justify-center gap-1 px-3 py-1.5 border border-transparent bg-transparent rounded text-xs cursor-pointer transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]',
                        openExportMenuId === String(work.id) ? '[background:var(--bg-secondary)] [color:var(--text-primary)]' : '[color:var(--text-secondary)]'
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenExportMenuId(openExportMenuId === String(work.id) ? null : String(work.id));
                      }}
                      title="导出作品"
                    >
                      <Download size={16} />
                      <ChevronDown size={14} />
                    </button>
                    {openExportMenuId === String(work.id) && (
                      <div
                        className="absolute top-[calc(100%+4px)] left-0 border rounded py-1 min-w-[160px]"
                        style={{
                          background: 'var(--bg-primary)',
                          borderColor: 'var(--border-color)',
                          boxShadow: 'var(--shadow-md)',
                          pointerEvents: 'auto',
                          zIndex: 1000,
                        }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      >
                        <button
                          className="flex items-center w-full gap-2 px-3 py-2 border-none bg-transparent text-sm text-left cursor-pointer rounded transition-colors hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]"
                          style={{ color: 'var(--text-secondary)' }}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
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
                          className="flex items-center w-full gap-2 px-3 py-2 border-none bg-transparent text-sm text-left cursor-pointer rounded transition-colors hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]"
                          style={{ color: 'var(--text-secondary)' }}
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

                  <button
                    className="flex items-center justify-center gap-1 px-3 py-1.5 border border-transparent bg-transparent rounded text-xs cursor-pointer transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)] [color:var(--text-secondary)]"
                    onClick={(e) => { e.stopPropagation(); handleMenuAction('copy-link', String(work.id)); }}
                    title="复制链接"
                  >
                    <Link2 size={16} />
                  </button>
                  <button
                    className="flex items-center justify-center gap-1 px-3 py-1.5 border border-transparent bg-transparent rounded text-xs cursor-pointer transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)] [color:var(--text-secondary)]"
                    onClick={(e) => { e.stopPropagation(); setShareWork(work); }}
                    title="共享作品"
                  >
                    <Users size={16} />
                  </button>
                  <button
                    className="flex items-center justify-center gap-1 px-3 py-1.5 border border-transparent bg-transparent rounded text-xs cursor-pointer transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)] [color:var(--text-secondary)] disabled:opacity-50"
                    onClick={(e) => { e.stopPropagation(); handleMenuAction('convert-to-drama', String(work.id)); }}
                    title="转换为剧本"
                    disabled={convertingId === String(work.id)}
                  >
                    <Film size={16} />
                  </button>
                  <button
                    className="flex items-center justify-center gap-1 px-3 py-1.5 border border-transparent bg-transparent rounded text-xs cursor-pointer transition-all hover:bg-red-500/10 hover:text-red-400"
                    style={{ color: 'var(--error)' }}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteWork(String(work.id)); }}
                    title="删除作品"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center gap-2 mt-6">
          <button
            className="px-3 py-1.5 border rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:[background:var(--bg-secondary)]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-primary)' }}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            &lt;
          </button>
          <button
            className="px-3 py-1.5 border rounded text-sm"
            style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', background: 'var(--bg-primary)' }}
          >
            {currentPage}
          </button>
          <button
            className="px-3 py-1.5 border rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:[background:var(--bg-secondary)]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-primary)' }}
            disabled={currentPage * itemsPerPage >= total}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            &gt;
          </button>
          <select
            className="px-2 py-1.5 border rounded text-sm cursor-pointer"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', background: 'var(--bg-primary)' }}
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10条/页</option>
            <option value={20}>20条/页</option>
            <option value={50}>50条/页</option>
          </select>
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>共 {total} 条</span>
        </div>
      )}

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
