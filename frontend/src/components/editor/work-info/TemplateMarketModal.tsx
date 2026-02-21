import { useState, useEffect, useCallback } from 'react';
import { X, Search, Save, Download, Globe, User, Edit2, Trash2 } from 'lucide-react';
import { templatesApi } from '../../../utils/templatesApi';
import type { WorkTemplate, TemplateConfig } from '../../../utils/templatesApi';
import { authApi } from '../../../utils/authApi';
import type { UserInfo } from '../../../utils/authApi';
import MessageModal from '../../common/MessageModal';
import type { MessageType } from '../../common/MessageModal';

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

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const info = await authApi.getUserInfo();
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
      // 注意：这里假设 listTemplates 支持这些参数过滤
      // 实际使用时可能需要根据 activeTab 调整参数，例如 'mine' 可能不需要 is_public=true，而是获取当前用户的
      // 但 API 定义中 listTemplates 似乎比较通用，我们暂时用 is_public 区分
      const data = await templatesApi.listTemplates({
        is_public: isPublic ? true : undefined, 
        search: searchQuery || undefined,
        // 如果是 'mine'，通常 API 会自动过滤当前用户，或者需要传 creator_id，这里先假设 API 会返回所有可见的
        // 实际上 listTemplates 可能返回所有我有权限看到的，我们需要在前端或后端过滤
      });
      
      // 简单的前端过滤
      let filteredData = data;
      if (activeTab === 'mine' && userInfo) {
        // 在“我的模板”中，只显示我自己创建的
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
    // If editing an existing template (metadata update)
    if (editingTemplate) {
      if (!saveForm.name) return;
      try {
        await templatesApi.updateTemplate(editingTemplate.id, {
          name: saveForm.name,
          description: saveForm.description,
          is_public: saveForm.is_public
        });
        showMessage('模板更新成功！', 'success');
        setShowSaveForm(false);
        setEditingTemplate(null);
        setSaveForm({ name: '', description: '', is_public: false });
        fetchTemplates();
      } catch {
        
        showMessage('更新失败，请重试', 'error');
      }
      return;
    }

    // Use targetTemplateConfig if set (for forking), otherwise use currentTemplateConfig (for saving current work)
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
      
      showMessage('模板保存成功！', 'success');
      setShowSaveForm(false);
      setSaveForm({ name: '', description: '', is_public: false });
      setTargetTemplateConfig(undefined);
      setSourceTemplateId(undefined);
      if (activeTab === 'mine') {
        fetchTemplates();
      }
    } catch {
        // ignore
        showMessage('保存失败，请重试', 'error');
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
        showMessage('模板删除成功', 'success');
        fetchTemplates();
      } catch {
        
        showMessage('删除失败，请重试', 'error');
      }
    });
  };


  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div className="modal-content" style={{ 
        maxWidth: '900px', 
        width: '90%', 
        height: '80vh', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        <div className="modal-header">
          <h3>模板市场</h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        
        <div className="market-toolbar" style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="tab-group" style={{ display: 'flex', gap: '8px' }}>
            <button 
              className={`tab-btn ${activeTab === 'market' ? 'active' : ''}`}
              onClick={() => setActiveTab('market')}
              style={{ 
                padding: '8px 16px', 
                borderRadius: '6px', 
                border: 'none', 
                background: activeTab === 'market' ? '#3b82f6' : '#f1f5f9',
                color: activeTab === 'market' ? 'white' : '#64748b',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <Globe size={16} /> 公共市场
            </button>
            <button 
              className={`tab-btn ${activeTab === 'mine' ? 'active' : ''}`}
              onClick={() => setActiveTab('mine')}
              style={{ 
                padding: '8px 16px', 
                borderRadius: '6px', 
                border: 'none', 
                background: activeTab === 'mine' ? '#3b82f6' : '#f1f5f9',
                color: activeTab === 'mine' ? 'white' : '#64748b',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <User size={16} /> 我的模板
            </button>
          </div>
          
          <div className="search-box" style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="搜索模板..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '8px 10px 8px 36px', 
                borderRadius: '6px', 
                border: '1px solid #e2e8f0',
                outline: 'none'
              }}
            />
          </div>
          
          <button 
            className="save-template-btn"
            onClick={() => openSaveForm(undefined)}
            style={{ 
              padding: '8px 16px', 
              borderRadius: '6px', 
              border: '1px solid #3b82f6', 
              background: 'white',
              color: '#3b82f6',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
            title="创建一个全新的模板（基于当前编辑的内容）"
          >
            <Save size={16} /> 创建新模板
          </button>
        </div>

        <div className="market-content" style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f8fafc' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>加载中...</div>
          ) : (
            <div className="templates-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {templates.map(tpl => {
                const isCurrent = currentTemplateConfig?.templateId === tpl.id.toString();
                return (
                <div key={tpl.id} className="template-card" style={{ 
                  background: isCurrent ? '#f0f9ff' : 'white', 
                  borderRadius: '8px', 
                  border: isCurrent ? '2px solid #3b82f6' : '1px solid #e2e8f0', 
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  position: 'relative'
                }}>
                  {isCurrent && (
                    <div style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '10px',
                      background: '#3b82f6',
                      color: 'white',
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(59,130,246,0.3)'
                    }}>
                      当前使用
                    </div>
                  )}
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{tpl.name}</h4>
                    {tpl.is_public && <span style={{ fontSize: '10px', background: '#dbeafe', color: '#2563eb', padding: '2px 6px', borderRadius: '4px' }}>公开</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {tpl.description || '暂无描述'}
                  </p>
                  <div className="card-footer" style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    {((userInfo?.is_superuser) || (!tpl.is_public && (activeTab === 'mine' || tpl.creator_id === userInfo?.id))) && (
                      <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditForm(tpl);
                        }}
                        style={{ 
                          padding: '6px 12px', 
                          borderRadius: '4px', 
                          background: 'white', 
                          color: '#64748b', 
                          border: '1px solid #e2e8f0', 
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                        title="编辑模板信息"
                      >
                        <Edit2 size={14} /> 编辑
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(tpl.id);
                        }}
                        style={{ 
                          padding: '6px 12px', 
                          borderRadius: '4px', 
                          background: 'white', 
                          color: '#ef4444', 
                          border: '1px solid #e2e8f0', 
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                        title="删除模板"
                      >
                        <Trash2 size={14} /> 删除
                      </button>
                      </>
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        // Extract modules/config from template
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
                      }}
                      style={{ 
                        padding: '6px 12px', 
                        borderRadius: '4px', 
                        background: tpl.is_public ? '#3b82f6' : 'white', 
                        color: tpl.is_public ? 'white' : '#64748b', 
                        border: tpl.is_public ? 'none' : '1px solid #e2e8f0', 
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                      title="基于此模板创建新模板"
                    >
                      <Save size={14} /> 另存为
                    </button>
                    {!tpl.is_public && (
                    <button 
                      onClick={() => onSelectTemplate(tpl)}
                      style={{ 
                        padding: '6px 12px', 
                        borderRadius: '4px', 
                        background: '#3b82f6', 
                        color: 'white', 
                        border: 'none', 
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <Download size={14} /> 使用
                    </button>
                    )}
                  </div>
                </div>
              );
              })}
              {templates.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  未找到相关模板
                </div>
              )}
            </div>
          )}
        </div>

        {showSaveForm && (
          <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1001
          }}>
            <div className="modal-content" style={{ 
              maxWidth: '500px',
              width: '90%',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <h3>{editingTemplate ? '编辑模板' : '保存为新模板'}</h3>
              <div className="form-group">
                <label>模板名称</label>
                <input 
                  type="text" 
                  value={saveForm.name} 
                  onChange={e => setSaveForm({...saveForm, name: e.target.value})}
                  placeholder="请输入模板名称"
                />
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea 
                  value={saveForm.description} 
                  onChange={e => setSaveForm({...saveForm, description: e.target.value})}
                  placeholder="请输入模板描述"
                  rows={3}
                />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                {userInfo?.is_superuser && (
                  <>
                    <input 
                      type="checkbox" 
                      id="is_public"
                      checked={saveForm.is_public}
                      onChange={e => setSaveForm({...saveForm, is_public: e.target.checked})}
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
          onConfirm={() => {
            closeMessage();
            if (messageState.onConfirm) messageState.onConfirm();
          }}
        />
      </div>
    </div>
  );
}
