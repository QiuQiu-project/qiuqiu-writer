import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, List, Plus, Upload, Video, FileText, MoreVertical, ChevronDown, Download, Link2, Trash2, ChevronRight } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import ImportWorkModal from '../components/ImportWorkModal';
import './WorksPage.css';

type WorkType = 'all' | 'short' | 'long' | 'script' | 'video';
type ViewMode = 'grid' | 'list';

export default function WorksPage() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<WorkType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);

  // 加载作品列表
  useEffect(() => {
    loadWorks();
  }, [currentPage, itemsPerPage, selectedType]);

  const loadWorks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await worksApi.listWorks({
        page: currentPage,
        size: itemsPerPage,
        work_type: selectedType === 'all' ? undefined : selectedType,
      });
      setWorks(response.works);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载作品失败');
      console.error('Error loading works:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredWorks = selectedType === 'all' 
    ? works 
    : works.filter(work => work.work_type === selectedType);

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
      
      // 关闭创建作品菜单
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
    };

    if (openMenuId || showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuId, showCreateMenu]);

  // 处理删除作品
  const handleDeleteWork = async (workId: string) => {
    // 查找作品信息以显示标题
    const workToDelete = works.find(w => String(w.id) === workId);
    const workTitle = workToDelete?.title || '这个作品';
    
    // 确认删除
    const confirmed = window.confirm(
      `确定要删除作品《${workTitle}》吗？\n\n⚠️ 警告：此操作不可恢复！\n将永久删除作品及其所有章节、内容。`
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      
      
      // 调用删除API
      await worksApi.deleteWork(Number(workId));
      
      
      
      // 显示成功提示
      alert(`作品《${workTitle}》已成功删除`);
      
      // 如果当前页只有这一个作品，且不是第一页，则返回上一页
      if (works.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      } else {
        // 重新加载作品列表
        await loadWorks();
      }
    } catch (err) {
      console.error('删除作品失败:', err);
      console.error('错误详情:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        workId,
      });
      const errorMessage = err instanceof Error ? err.message : '删除作品失败，请稍后重试';
      setError(errorMessage);
      alert(`删除失败：${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // 处理菜单项点击
  const handleMenuAction = async (action: string, workId: string, format?: string) => {
    
    
    // 先执行操作，再关闭菜单，避免菜单关闭导致事件丢失
    try {
      switch (action) {
        case 'delete':
          
          await handleDeleteWork(workId);
          // 删除成功后关闭菜单
          setOpenMenuId(null);
          setOpenSubMenu(null);
          break;
        case 'export':
          // TODO: 实现导出功能
          
          break;
        case 'copy-link':
          // 生成作品链接
          const workLink = `${window.location.origin}/novel/editor?workId=${workId}`;
          
          try {
            // 使用 Clipboard API 复制链接
            await navigator.clipboard.writeText(workLink);
            // 显示成功提示
            alert('链接已复制到剪贴板');
          } catch (clipboardErr) {
            // 如果 Clipboard API 不可用，使用备用方法
            console.warn('Clipboard API 不可用，使用备用方法:', clipboardErr);
            
            // 创建临时文本区域
            const textArea = document.createElement('textarea');
            textArea.value = workLink;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
              const successful = document.execCommand('copy');
              document.body.removeChild(textArea);
              
              if (successful) {
                alert('链接已复制到剪贴板');
              } else {
                // 如果复制失败，显示链接让用户手动复制
                const userConfirmed = window.confirm(
                  `无法自动复制链接，请手动复制：\n\n${workLink}\n\n点击"确定"打开链接`
                );
                if (userConfirmed) {
                  window.open(workLink, '_blank');
                }
              }
            } catch (fallbackErr) {
              document.body.removeChild(textArea);
              // 最后的后备方案：显示链接并询问是否打开
              const userConfirmed = window.confirm(
                `无法复制链接，请手动复制：\n\n${workLink}\n\n点击"确定"打开链接`
              );
              if (userConfirmed) {
                window.open(workLink, '_blank');
              }
            }
          }
          break;
        default:
          
      }
    } catch (err) {
      console.error('操作失败:', err);
      alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  // 处理创建作品
  const handleCreateWork = async (type: 'long' | 'short') => {
    setShowCreateMenu(false);
    try {
      const newWork = await worksApi.createWork({
        title: '未命名作品',
        work_type: type,
        is_public: false,
      });
      navigate(`/novel/editor?workId=${newWork.id}`);
    } catch (err) {
      console.error('创建作品失败:', err);
      alert(err instanceof Error ? err.message : '创建作品失败');
    }
  };

  // 处理导入成功
  const handleImportSuccess = (_workId: number, _workTitle: string) => {
    // 重新加载作品列表
    loadWorks();
    // 可选：跳转到作品页面
    // navigate(`/novel/editor?workId=${workId}`);
  };

  return (
    <div className="works-page">
      <div className="works-header">
        <h1 className="works-title">我的作品</h1>
          <div className="works-actions">
          <div className="action-btn-wrapper" ref={createMenuRef}>
            <button 
              className="action-btn primary"
              onClick={() => setShowCreateMenu(!showCreateMenu)}
            >
              <Plus size={16} />
              <span>创建作品</span>
              <ChevronDown size={14} />
            </button>
            {showCreateMenu && (
              <div className="create-work-menu">
                <button 
                  className="create-menu-item"
                  onClick={() => handleCreateWork('long')}
                >
                  创建长篇
                </button>
                <button 
                  className="create-menu-item"
                  onClick={() => handleCreateWork('short')}
                >
                  创建短篇
                </button>
              </div>
            )}
          </div>
          <button className="action-btn" onClick={() => setShowImportModal(true)}>
            <Upload size={16} />
            <span>导入作品</span>
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

      {loading && <div className="works-loading">加载中...</div>}
      {error && <div className="works-error">错误: {error}</div>}
      {!loading && !error && (
        <div className={`works-content ${viewMode}`}>
          {filteredWorks.length === 0 ? (
            <div className="works-empty">
              <p>暂无作品</p>
              <button className="action-btn primary" onClick={() => handleCreateWork('long')}>
                <Plus size={16} />
                <span>创建第一个作品</span>
              </button>
            </div>
          ) : (
            filteredWorks.map((work) => (
              <div 
                key={work.id} 
                className="work-card"
                onClick={() => navigate(`/novel/editor?workId=${work.id}`)}
                style={{ cursor: 'pointer' }}
              >
                {work.cover_image ? (
                  <div className="work-cover">
                    <img src={work.cover_image} alt={work.title} />
                  </div>
                ) : (
                  <div className="work-preview">
                    <span className="work-type-tag" style={{ backgroundColor: getTypeColor(work.work_type) }}>
                      {getTypeLabel(work.work_type)}
                    </span>
                    <h3 className="work-card-title">{work.title}</h3>
                    {work.description && (
                      <p className="work-description">{work.description}</p>
                    )}
                    <p className="work-date">{new Date(work.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                )}
                <div className="work-actions" onClick={(e) => e.stopPropagation()}>
                  {work.work_type !== 'video' && (
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
                  <div className="menu-wrapper" ref={(el) => { menuRefs.current[String(work.id)] = el; }}>
                    <button 
                      className="work-action-btn icon-only"
                      onClick={(e) => handleMenuToggle(String(work.id), e)}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === String(work.id) && (
                      <div className="context-menu">
                        <div
                          className="menu-item"
                          onMouseEnter={handleSubMenuToggle}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSubMenuToggle(e);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSubMenuToggle(e as any);
                            }
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
                                  handleMenuAction('export', String(work.id), 'text');
                                }}
                              >
                                Text
                              </button>
                              <button
                                className="sub-menu-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMenuAction('export', String(work.id), 'word');
                                }}
                              >
                                Word
                              </button>
                              <button
                                className="sub-menu-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMenuAction('export', String(work.id), 'pdf');
                                }}
                              >
                                Pdf
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          className="menu-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMenuAction('copy-link', String(work.id));
                          }}
                        >
                          <Link2 size={16} />
                          <span>复制链接</span>
                        </button>
                        <button
                          className="menu-item danger"
                          type="button"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            
                          }}
                          onClick={(e) => {
                            
                            
                            
                            
                            
                            
                            e.stopPropagation();
                            e.preventDefault();
                            
                            const workIdToDelete = String(work.id);
                            
                            
                            // 不立即关闭菜单，先执行删除操作
                            handleDeleteWork(workIdToDelete).then(() => {
                              
                              setOpenMenuId(null);
                              setOpenSubMenu(null);
                            }).catch((error) => {
                              console.error('删除失败:', error);
                              setOpenMenuId(null);
                              setOpenSubMenu(null);
                            });
                          }}
                          onMouseUp={(e) => {
                            e.stopPropagation();
                            
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
            ))
          )}
        </div>
      )}

      {total > 0 && (
        <div className="works-pagination">
          <button 
            className="pagination-btn" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            &lt;
          </button>
          <button className="pagination-btn active">{currentPage}</button>
          <button 
            className="pagination-btn" 
            disabled={currentPage * itemsPerPage >= total}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            &gt;
          </button>
          <select
            className="pagination-select"
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
          <span className="pagination-info">共 {total} 条</span>
        </div>
      )}

      <ImportWorkModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}

