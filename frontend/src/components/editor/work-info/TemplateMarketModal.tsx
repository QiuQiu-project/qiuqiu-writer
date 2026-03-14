import { useState, useEffect, useCallback } from 'react';
import DraggableResizableModal from '../../common/DraggableResizableModal';
import { X, Search, Save, Globe, User, Edit2, Trash2, MoreHorizontal, Download } from 'lucide-react';
import { templatesApi } from '../../../utils/templatesApi';
import type { WorkTemplate, TemplateConfig } from '../../../utils/templatesApi';
import { authApi } from '../../../utils/authApi';
import type { UserInfo } from '../../../utils/authApi';
import MessageModal from '../../common/MessageModal';
import type { MessageType } from '../../common/MessageModal';
import { parseError } from '../../../utils/errorUtils';

import './TemplateMarketModal.css';

interface TemplateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: WorkTemplate) => void;
  currentTemplateConfig?: TemplateConfig;
}

export default function TemplateMarketModal({
  isOpen,
  onClose,
  onSelectTemplate,
  currentTemplateConfig
}: TemplateMarketModalProps) {
  const [activeTab, setActiveTab] = useState<'market' | 'mine'>('market');
  const [templates, setTemplates] = useState<WorkTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveForm, setSaveForm] = useState({
    name: '',
    description: '',
    is_public: false
  });
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

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

  const showToast = (message: string, type: MessageType = 'success', autoCloseMs = 2000) => {
    setMessageState({ isOpen: true, type, message, toast: true, autoCloseMs });
  };

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (openMenuId === null) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.card-menu-wrap')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  useEffect(() => {
    const loadUserInfo = () => {
      try {
        const info = authApi.getUserInfo();
        setUserInfo(info);
      } catch {
        // ignore
      }
    };
    loadUserInfo();
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const isPublic = activeTab === 'market';
      const data = await templatesApi.listTemplates({
        is_public: isPublic ? true : undefined,
        search: searchQuery || undefined,
      });

      let filteredData = data;
      if (activeTab === 'mine' && userInfo) {
        filteredData = data.filter(t => t.creator_id !== undefined && String(t.creator_id) === String(userInfo.id));
      }

      setTemplates(filteredData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, userInfo]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen, fetchTemplates]);

  const [targetTemplateConfig, setTargetTemplateConfig] = useState<TemplateConfig | undefined>(undefined);
  const [sourceTemplateId, setSourceTemplateId] = useState<number | undefined>(undefined);
  const [editingTemplate, setEditingTemplate] = useState<WorkTemplate | null>(null);

  const handleSaveTemplate = async () => {
    if (editingTemplate) {
      if (!saveForm.name) return;
      try {
        await templatesApi.updateTemplate(editingTemplate.id, {
          name: saveForm.name,
          description: saveForm.description,
          is_public: saveForm.is_public
        });
        showToast('模板更新成功！');
        setShowSaveForm(false);
        setEditingTemplate(null);
        setSaveForm({ name: '', description: '', is_public: false });
        fetchTemplates();
      } catch (e) {
        showMessage(parseError(e), 'error', '更新失败');
      }
      return;
    }

    const configToSave = targetTemplateConfig || currentTemplateConfig;
    if (!configToSave || !saveForm.name) return;

    try {
      await templatesApi.createTemplate({
        name: saveForm.name,
        description: saveForm.description,
        work_type: 'novel',
        template_config: configToSave,
        is_public: saveForm.is_public,
        source_template_id: sourceTemplateId
      });

      showToast('模板保存成功！');
      setShowSaveForm(false);
      setSaveForm({ name: '', description: '', is_public: false });
      setTargetTemplateConfig(undefined);
      setSourceTemplateId(undefined);
      if (activeTab === 'mine') {
        fetchTemplates();
      }
    } catch (e) {
      showMessage(parseError(e), 'error', '保存失败');
    }
  };

  const openSaveForm = (config?: TemplateConfig, fromTemplateId?: number) => {
    setTargetTemplateConfig(config);
    setSourceTemplateId(fromTemplateId);
    setEditingTemplate(null);
    setSaveForm({ name: '', description: '', is_public: false });
    setShowSaveForm(true);
  };

  const openEditForm = (template: WorkTemplate) => {
    setEditingTemplate(template);
    setTargetTemplateConfig(undefined);
    setSaveForm({
      name: template.name,
      description: template.description || '',
      is_public: template.is_public || false
    });
    setShowSaveForm(true);
  };

  const handleDeleteTemplate = async (templateId: number) => {
    showMessage('确定要删除这个模板吗？此操作无法撤销。', 'warning', '确认删除', async () => {
      try {
        await templatesApi.deleteTemplate(templateId);
        showToast('模板删除成功');
        fetchTemplates();
      } catch (e) {
        showMessage(parseError(e), 'error', '删除失败');
      }
    });
  };

  const handleSaveAs = (tpl: WorkTemplate) => {
    let config: TemplateConfig | undefined;
    if (tpl.template_config) {
      if (Array.isArray(tpl.template_config)) {
        config = { modules: tpl.template_config };
      } else if (typeof tpl.template_config === 'object') {
        config = tpl.template_config as TemplateConfig;
      }
    }
    if (config) {
      openSaveForm(config, tpl.id);
    } else {
      showMessage('无法读取该模板配置', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={960}
      initialHeight={600}
      className="template-market-modal-content"
      handleClassName=".template-market-header"
    >
        <div className="template-market-header">
          <h3>模板市场</h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="market-toolbar">
          <div className="tab-group">
            <button
              className={`tab-btn ${activeTab === 'market' ? 'active' : ''}`}
              onClick={() => setActiveTab('market')}
            >
              <Globe size={16} /> 公共市场
            </button>
            <button
              className={`tab-btn ${activeTab === 'mine' ? 'active' : ''}`}
              onClick={() => setActiveTab('mine')}
            >
              <User size={16} /> 我的模板
            </button>
          </div>

          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="搜索模板..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className="save-template-btn"
            onClick={() => openSaveForm(undefined)}
            title="创建一个全新的模板（基于当前编辑的内容）"
          >
            <Save size={16} /> 创建新模板
          </button>
        </div>

        <div className="market-content">
          {loading ? (
            <div className="template-loading-state">加载中...</div>
          ) : (
            <div className="templates-grid">
              {templates.map(tpl => {
                const isCurrent = currentTemplateConfig?.templateId === tpl.id.toString();
                const canEditDelete = userInfo?.is_superuser ||
                  (!tpl.is_public && (activeTab === 'mine' || tpl.creator_id === userInfo?.id));

                return (
                  <div key={tpl.id} className={`template-card ${isCurrent ? 'active' : ''}`}>
                    {isCurrent && <div className="current-badge">当前使用</div>}

                    <div className="card-header">
                      <h4>{tpl.name}</h4>
                      {tpl.is_public && <span className="public-tag">公开</span>}
                    </div>

                    <p className="card-desc">{tpl.description || '暂无描述'}</p>

                    <div className="card-footer">
                      {!tpl.is_public && (
                        <button
                          className="card-use-btn"
                          onClick={() => onSelectTemplate(tpl)}
                        >
                          <Download size={13} /> 使用
                        </button>
                      )}

                      <button
                        className="card-saveas-btn"
                        onClick={() => handleSaveAs(tpl)}
                        title="基于此模板创建新模板"
                      >
                        <Save size={13} /> 另存为
                      </button>

                      {canEditDelete && (
                        <div className="card-menu-wrap">
                          <button
                            className="card-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === tpl.id ? null : tpl.id);
                            }}
                            title="更多操作"
                          >
                            <MoreHorizontal size={15} />
                          </button>

                          {openMenuId === tpl.id && (
                            <div className="card-dropdown">
                              <button
                                className="dropdown-item"
                                onClick={() => { openEditForm(tpl); setOpenMenuId(null); }}
                              >
                                <Edit2 size={13} /> 编辑
                              </button>
                              <button
                                className="dropdown-item danger"
                                onClick={() => { handleDeleteTemplate(tpl.id); setOpenMenuId(null); }}
                              >
                                <Trash2 size={13} /> 删除
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {templates.length === 0 && (
                <div className="template-empty-state">未找到相关模板</div>
              )}
            </div>
          )}
        </div>

      {showSaveForm && (
          <div className="save-form-overlay">
            <div className="save-form-content">
              <h3>{editingTemplate ? '编辑模板' : '保存为新模板'}</h3>
              <div className="form-group">
                <label>模板名称</label>
                <input
                  type="text"
                  value={saveForm.name}
                  onChange={e => setSaveForm({ ...saveForm, name: e.target.value })}
                  placeholder="请输入模板名称"
                />
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea
                  value={saveForm.description}
                  onChange={e => setSaveForm({ ...saveForm, description: e.target.value })}
                  placeholder="请输入模板描述"
                  rows={3}
                />
              </div>
              <div className="form-group form-group--inline">
                {userInfo?.is_superuser && (
                  <>
                    <input
                      type="checkbox"
                      id="is_public"
                      checked={saveForm.is_public}
                      onChange={e => setSaveForm({ ...saveForm, is_public: e.target.checked })}
                    />
                    <label htmlFor="is_public" style={{ margin: 0 }}>设为公开模板</label>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button onClick={() => setShowSaveForm(false)}>取消</button>
                <button className="primary" onClick={handleSaveTemplate}>
                  {editingTemplate ? '确认更新' : '确认保存'}
                </button>
              </div>
            </div>
          </div>
        )}

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
    </DraggableResizableModal>
  );
}
