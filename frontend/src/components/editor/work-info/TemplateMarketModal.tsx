import React, { useState, useEffect } from 'react';
import { X, Search, LayoutTemplate, Save, Download, Globe, User } from 'lucide-react';
import { templatesApi } from '../../../utils/templatesApi';
import type { WorkTemplate, TemplateConfig } from '../../../utils/templatesApi';

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

  const fetchTemplates = async () => {
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
      
      // 简单的前端过滤（如果 API 不支持完全过滤）
      // 假设 market 显示所有公开的，mine 显示当前用户的（这里暂时无法区分当前用户 ID，假设 API 返回的就是合适的列表）
      // 如果 activeTab 是 'mine'，我们可能需要后端支持 filter by creator
      
      setTemplates(data);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen, activeTab, searchQuery]);

  const handleSaveTemplate = async () => {
    if (!currentTemplateConfig || !saveForm.name) return;
    
    try {
      await templatesApi.createTemplate({
        name: saveForm.name,
        description: saveForm.description,
        work_type: 'novel', // 默认类型
        template_config: currentTemplateConfig,
        is_public: saveForm.is_public
      });
      
      alert('模板保存成功！');
      setShowSaveForm(false);
      setSaveForm({ name: '', description: '', is_public: false });
      if (activeTab === 'mine') {
        fetchTemplates();
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('保存失败，请重试');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '900px', width: '90%', height: '80vh', display: 'flex', flexDirection: 'column' }}>
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
            onClick={() => setShowSaveForm(true)}
            style={{ 
              padding: '8px 16px', 
              borderRadius: '6px', 
              border: '1px solid #3b82f6', 
              background: 'white',
              color: '#3b82f6',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Save size={16} /> 保存当前为模板
          </button>
        </div>

        <div className="market-content" style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f8fafc' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>加载中...</div>
          ) : (
            <div className="templates-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {templates.map(tpl => (
                <div key={tpl.id} className="template-card" style={{ 
                  background: 'white', 
                  borderRadius: '8px', 
                  border: '1px solid #e2e8f0', 
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}>
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{tpl.name}</h4>
                    {tpl.is_public && <span style={{ fontSize: '10px', background: '#dbeafe', color: '#2563eb', padding: '2px 6px', borderRadius: '4px' }}>公开</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {tpl.description || '暂无描述'}
                  </p>
                  <div className="card-footer" style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
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
                      <Download size={14} /> 使用此模板
                    </button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  未找到相关模板
                </div>
              )}
            </div>
          )}
        </div>

        {showSaveForm && (
          <div className="modal-overlay" style={{ zIndex: 1001 }}>
            <div className="modal-content" style={{ maxWidth: '500px' }}>
              <h3>保存为新模板</h3>
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
                <input 
                  type="checkbox" 
                  id="is_public"
                  checked={saveForm.is_public}
                  onChange={e => setSaveForm({...saveForm, is_public: e.target.checked})}
                />
                <label htmlFor="is_public" style={{ margin: 0 }}>设为公开模板</label>
              </div>
              <div className="modal-footer">
                <button onClick={() => setShowSaveForm(false)}>取消</button>
                <button className="primary" onClick={handleSaveTemplate}>确认保存</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
