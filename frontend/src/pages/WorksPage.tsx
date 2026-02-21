import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, List, Plus, Upload, ChevronDown, Download, Link2, Trash2, RefreshCw } from 'lucide-react';
import { worksApi, type Work } from '../utils/worksApi';
import { exportAsText, exportAsWord, exportAsPdf } from '../utils/exportUtils';
import ImportWorkModal from '../components/ImportWorkModal';
import WorkRecoveryModal from '../components/WorkRecoveryModal';
import MessageModal from '../components/common/MessageModal';
import type { MessageType } from '../components/common/MessageModal';
import './WorksPage.css';

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // 消息提示状态
  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({
      isOpen: true,
      type,
      message,
      title,
      onConfirm,
    });
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
      // 关闭创建作品菜单
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
      
      // 关闭导出菜单
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
    // 查找作品信息以显示标题
    const workToDelete = works.find(w => String(w.id) === workId);
    const workTitle = workToDelete?.title || '这个作品';
    
    // 确认删除
    showMessage(
      `确定要删除作品《${workTitle}》吗？\n\n⚠️ 警告：此操作不可恢复！\n将永久删除作品及其所有章节、内容。`,
      'warning',
      '删除作品',
      async () => {
        try {
          setLoading(true);
          setError(null);
          
          // 调用删除API
          await worksApi.deleteWork(workId);
          
          // 显示成功提示
          showMessage(`作品《${workTitle}》已成功删除`, 'success');
          
          // 如果当前页只有这一个作品，且不是第一页，则返回上一页
          if (works.length === 1 && currentPage > 1) {
            setCurrentPage(prev => prev - 1);
          } else {
            // 重新加载作品列表
            await loadWorks();
          }
        } catch (err) {
          
                    const errorMessage = err instanceof Error ? err.message : '删除作品失败，请稍后重试';
          setError(errorMessage);
          showMessage(`删除失败：${errorMessage}`, 'error');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // 处理菜单项点击
  const handleMenuAction = async (action: string, workId: string, format?: string) => {
    
    // 先执行操作，再关闭菜单，避免菜单关闭导致事件丢失
    try {
      switch (action) {
        case 'delete':
          await handleDeleteWork(workId);
          break;
        case 'export':
          // 实现导出功能
          setLoading(true);
          
          
          try {
            // 获取作品信息
            
            const work = await worksApi.getWork(workId);
            
            
            // 根据格式调用相应的导出函数
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
                        showMessage(`❌ 导出失败\n\n错误：${errorMessage}\n\n请查看浏览器控制台（F12）获取更多信息。`, 'error');
            throw err; // 重新抛出错误，让调用者知道失败了
          } finally {
            setLoading(false);
          }
          break;
        case 'copy-link':
          {
            // 生成作品链接
            const workLink = `${window.location.origin}/novel/editor?workId=${workId}`;
            
            try {
              // 使用 Clipboard API 复制链接
              await navigator.clipboard.writeText(workLink);
              // 显示成功提示
              showMessage('链接已复制到剪贴板', 'success');
            } catch {
              // 如果 Clipboard API 不可用，使用备用方法
              
              
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
                  showMessage('链接已复制到剪贴板', 'success');
                } else {
                  // 如果复制失败，显示链接让用户手动复制
                  showMessage(
                    `无法自动复制链接，请手动复制：\n\n${workLink}\n\n点击"确定"打开链接`,
                    'warning',
                    '复制链接',
                    () => window.open(workLink, '_blank')
                  );
                }
              } catch {
                document.body.removeChild(textArea);
                // 最后的后备方案：显示链接并询问是否打开
                showMessage(
                  `无法复制链接，请手动复制：\n\n${workLink}\n\n点击"确定"打开链接`,
                  'warning',
                  '复制链接',
                  () => window.open(workLink, '_blank')
                );
              }
            }
          }
          break;
        default:
          
      }
    } catch (err) {
      
      showMessage(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  // 处理创建作品
  const handleCreateWork = async () => {
    try {
      
      setLoading(true);
      
      const workData = {
        title: '未命名作品',
        work_type: 'long' as const, // 统一使用long作为默认类型
        is_public: false,
      };
      
      
      
      const newWork = await worksApi.createWork(workData);
      
      
      
      if (!newWork || !newWork.id) {
        throw new Error('创建作品成功，但未返回作品ID');
      }
      
      // 重新加载作品列表
      await loadWorks();
      
      // 跳转到编辑器
      navigate(`/novel/editor?workId=${newWork.id}`);
    } catch (err) {
      
      const errorMessage = err instanceof Error ? err.message : '创建作品失败';
      showMessage(`创建作品失败: ${errorMessage}`, 'error');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 处理导入成功
  const handleImportSuccess = (_workId: string, _workTitle: string) => {
    // 重新加载作品列表
    loadWorks();
    showMessage(`导入成功：${_workTitle}`, 'success');
    // 可选：跳转到作品页面
    navigate(`/novel/editor?workId=${_workId}`);
  };

  return (
    <div className="works-page">
      <div className="works-header">
        <h1 className="works-title">我的作品</h1>
          <div className="works-actions">
          <button 
            className="action-btn"
            onClick={handleCreateWork}
          >
            <Plus size={16} />
            <span>创建作品</span>
          </button>
          <button className="action-btn" onClick={() => setShowImportModal(true)}>
            <Upload size={16} />
            <span>导入作品</span>
          </button>
          <button className="action-btn" onClick={() => setShowRecoveryModal(true)}>
            <RefreshCw size={16} />
            <span>恢复作品</span>
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


      {loading && <div className="works-loading">加载中...</div>}
      {error && <div className="works-error">错误: {error}</div>}
      {!loading && !error && (
        <div className={`works-content ${viewMode}`}>
          {works.length === 0 ? (
            <div className="works-empty">
              <p>暂无作品</p>
              <button className="action-btn" onClick={handleCreateWork}>
                <Plus size={16} />
                <span>创建第一个作品</span>
              </button>
            </div>
          ) : (
            works.map((work) => (
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
                    <h3 className="work-card-title">{work.title}</h3>
                    {work.description && (
                      <p className="work-description">{work.description}</p>
                    )}
                    <p className="work-date">{new Date(work.created_at).toLocaleString('zh-CN')}</p>
                  </div>
                )}
                <div 
                  className="work-actions" 
                  onClick={(e) => {
                    e.stopPropagation();
                    
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    
                  }}
                >
                  <div className="export-menu-wrapper" ref={(el) => { exportMenuRefs.current[String(work.id)] = el; }}>
                    <button
                      className={`work-action-btn ${openExportMenuId === String(work.id) ? 'active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const newState = openExportMenuId === String(work.id) ? null : String(work.id);
                        
                        setOpenExportMenuId(newState);
                      }}
                      title="导出作品"
                    >
                      <Download size={16} />
                      <ChevronDown size={14} />
                    </button>
                    {openExportMenuId === String(work.id) && (
                      <div 
                        className="export-menu"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                        }}
                        onMouseEnter={() => {
                          
                        }}
                        style={{ 
                          pointerEvents: 'auto',
                          zIndex: 1000
                        }}
                      >
                        <button
                          className="export-menu-item"
                          type="button"
                          onMouseDown={(e) => {
                            
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseUp={(e) => {
                            
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onMouseEnter={() => {
                            
                          }}
                          onMouseLeave={() => {
                            
                          }}
                          onClick={(e) => {
                            
                            e.preventDefault();
                            e.stopPropagation();
                            
                            
                            // 立即关闭菜单
                            setOpenExportMenuId(null);
                            
                            
                            // 使用立即执行函数处理异步操作
                            (async () => {
                              try {
                                setLoading(true);
                                
                                
                                
                                // 直接获取作品信息
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
                          className="export-menu-item"
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
                    className="work-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMenuAction('copy-link', String(work.id));
                    }}
                    title="复制链接"
                  >
                    <Link2 size={16} />
                  </button>
                  <button
                    className="work-action-btn danger"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleDeleteWork(String(work.id));
                    }}
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

      <WorkRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        onSuccess={(workId) => {
          // 恢复成功后，重新加载作品列表
          loadWorks();
          // 可选：跳转到恢复的作品
          navigate(`/novel/editor?workId=${workId}`);
        }}
      />
      
      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />
    </div>
  );
}
