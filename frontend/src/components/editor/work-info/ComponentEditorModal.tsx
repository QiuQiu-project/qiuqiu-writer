import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, Maximize2, Trash2 } from 'lucide-react';
import type { ComponentType, ComponentConfig, TemplateConfig } from './types';
import { DataDependenciesSelector } from './DataDependenciesSelector';
import { promptTemplateApi } from '../../../utils/promptTemplateApi';

interface ComponentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (componentData: any) => void;
  onDelete?: () => void;
  initialData?: ComponentConfig;
  template: TemplateConfig;
  isEditing?: boolean;
}

export default function ComponentEditorModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  template,
  isEditing = false
}: ComponentEditorModalProps) {
  const [step, setStep] = useState<'type' | 'config'>('type');
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [expandedPromptField, setExpandedPromptField] = useState<'generatePrompt' | 'validatePrompt' | 'analysisPrompt' | null>(null);
  const [formData, setFormData] = useState<{
    type: ComponentType;
    label: string;
    config: Record<string, unknown>;
    generatePrompt: string;
    validatePrompt: string;
    analysisPrompt: string;
    tabsConfig: { id: string; label: string }[];
    cardFields: { key: string; label: string; type: 'text' | 'textarea' | 'image' }[];
    dataKey: string;
    dataDependencies: string[];
  }>({
    type: 'text',
    label: '',
    config: {},
    generatePrompt: '',
    validatePrompt: '',
    analysisPrompt: '',
    tabsConfig: [],
    cardFields: [],
    dataKey: '',
    dataDependencies: []
  });

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setStep('config');
        setFormData({
          type: initialData.type,
          label: initialData.label,
          config: initialData.config || {},
          generatePrompt: initialData.generatePrompt || '',
          validatePrompt: initialData.validatePrompt || '',
          analysisPrompt: initialData.analysisPrompt || '',
          tabsConfig: initialData.config?.tabs?.map((t: any) => ({ id: t.id, label: t.label })) || [],
          cardFields: initialData.config?.cardFields || [],
          dataKey: initialData.dataKey || '',
          dataDependencies: initialData.dataDependencies || []
        });

        // Load prompts from API if editing
        if (initialData.id) {
          const loadPrompts = async () => {
            setLoadingPrompts(true);
            try {
              const templateId = template.id;
              const prompts = await promptTemplateApi.getComponentPrompts(initialData.id, templateId);
              
              const gen = prompts.find(p => p.prompt_category === 'generate');
              const val = prompts.find(p => p.prompt_category === 'validate');
              const ana = prompts.find(p => p.prompt_category === 'analysis');
              
              setFormData(prev => ({
                ...prev,
                generatePrompt: gen?.prompt_content || prev.generatePrompt,
                validatePrompt: val?.prompt_content || prev.validatePrompt,
                analysisPrompt: ana?.prompt_content || prev.analysisPrompt
              }));
            } catch (e) {
              console.error("Failed to load prompts", e);
            } finally {
              setLoadingPrompts(false);
            }
          };
          loadPrompts();
        }
      } else {
        setStep('type');
        setFormData({
          type: 'text',
          label: '',
          config: {},
          generatePrompt: '',
          validatePrompt: '',
          analysisPrompt: '',
          tabsConfig: [],
          cardFields: [],
          dataKey: '',
          dataDependencies: []
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSave = async () => {
    // Construct the final component config
    const finalConfig: any = { ...formData.config };
    
    if (formData.type === 'tabs') {
      finalConfig.tabs = formData.tabsConfig.map(t => ({
        id: t.id,
        label: t.label,
        components: initialData?.config?.tabs?.find((oldT: any) => oldT.id === t.id)?.components || []
      }));
    }
    
    if (formData.type === 'character-card' || formData.type === 'faction') {
      finalConfig.cardFields = formData.cardFields;
    }

    // Save prompts to API if editing existing component
    if (isEditing && initialData?.id) {
      try {
        const templateId = template.id;
        
        const promises = [];
        if (formData.generatePrompt) {
          promises.push(promptTemplateApi.upsertComponentPrompt(
            initialData.id, formData.type, 'generate', formData.generatePrompt, templateId, formData.dataKey
          ));
        }
        if (formData.validatePrompt) {
          promises.push(promptTemplateApi.upsertComponentPrompt(
            initialData.id, formData.type, 'validate', formData.validatePrompt, templateId, formData.dataKey
          ));
        }
        if (formData.analysisPrompt) {
          promises.push(promptTemplateApi.upsertComponentPrompt(
            initialData.id, formData.type, 'analysis', formData.analysisPrompt, templateId, formData.dataKey
          ));
        }
        await Promise.all(promises);
      } catch (e) {
        console.error("Failed to save prompts to API", e);
      }
    }

    onSave({
      ...formData,
      config: finalConfig
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header">
          <h3>{isEditing ? '编辑组件' : '添加组件'}</h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        
        <div className="modal-body">
          {step === 'type' ? (
            <div className="component-type-selector">
              <h4>选择组件类型</h4>
              <div className="type-grid">
                {[
                  { type: 'text', label: '单行文本', icon: 'Type' },
                  { type: 'textarea', label: '多行文本', icon: 'AlignLeft' },
                  { type: 'select', label: '下拉选择', icon: 'List' },
                  { type: 'multiselect', label: '多选标签', icon: 'CheckSquare' },
                  { type: 'list', label: '简单列表', icon: 'ListOrdered' },
                  { type: 'keyvalue', label: '键值对', icon: 'Table' },
                  { type: 'tags', label: '标签组', icon: 'Tags' },
                  { type: 'image', label: '图片上传', icon: 'Image' },
                  { type: 'tabs', label: '选项卡', icon: 'Layers' },
                  { type: 'timeline', label: '时间轴', icon: 'Clock' },
                  { type: 'character-card', label: '角色卡片', icon: 'User' },
                  { type: 'faction', label: '势力/组织', icon: 'Users' },
                  { type: 'relation-graph', label: '关系图谱', icon: 'Share2' }
                ].map(item => (
                  <button
                    key={item.type}
                    className={`type-btn ${formData.type === item.type ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, type: item.type as ComponentType })}
                    onDoubleClick={() => setStep('config')}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="modal-footer">
                <button onClick={onClose}>取消</button>
                <button className="primary" onClick={() => setStep('config')}>下一步 <ChevronRight size={14} /></button>
              </div>
            </div>
          ) : (
            <div className="component-config-form">
              {/* ... existing config form fields ... */}
              {/* This is a placeholder for where the config fields start */}
              
              <div className="form-group">
                <label>组件名称</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={e => setFormData({ ...formData, label: e.target.value })}
                  placeholder="例如：角色姓名"
                />
              </div>

              <div className="form-group">
                <label>Data Key (用于数据引用)</label>
                <input
                  type="text"
                  value={formData.dataKey}
                  onChange={e => setFormData({ ...formData, dataKey: e.target.value })}
                  placeholder="唯一标识，如: character_name"
                />
                <small>其他组件可以通过此 Key 引用该组件的数据</small>
              </div>
              
              {/* ... rest of the form ... */}
              
              {(formData.type === 'select' || formData.type === 'multiselect') && (
                <div className="form-group">
                  <label>选项配置 (每行一个，支持设置颜色)</label>
                  <div className="options-config-container" style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                    {((formData.config.options as any[]) || []).map((option, index) => (
                      <div key={index} style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '8px', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={option.label}
                          onChange={e => {
                            const newOptions = [...((formData.config.options as any[]) || [])];
                            newOptions[index] = { ...newOptions[index], label: e.target.value, value: e.target.value };
                            setFormData({
                              ...formData,
                              config: { ...formData.config, options: newOptions }
                            });
                          }}
                          placeholder="选项名称"
                          className="comp-input"
                          style={{ flex: 1 }}
                        />
                        <input
                          type="color"
                          value={option.color || '#e2e8f0'}
                          onChange={e => {
                            const newOptions = [...((formData.config.options as any[]) || [])];
                            newOptions[index] = { ...newOptions[index], color: e.target.value };
                            setFormData({
                              ...formData,
                              config: { ...formData.config, options: newOptions }
                            });
                          }}
                          style={{ width: '30px', height: '30px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                          title="选择颜色"
                        />
                        <button
                          onClick={() => {
                            const newOptions = [...((formData.config.options as any[]) || [])];
                            newOptions.splice(index, 1);
                            setFormData({
                              ...formData,
                              config: { ...formData.config, options: newOptions }
                            });
                          }}
                          className="icon-btn"
                          style={{ color: '#ef4444' }}
                          title="删除选项"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <div style={{ padding: '8px', background: '#f8fafc' }}>
                      <button
                        onClick={() => {
                          const newOptions = [...((formData.config.options as any[]) || [])];
                          newOptions.push({ label: '', value: '', color: '#e2e8f0' });
                          setFormData({
                            ...formData,
                            config: { ...formData.config, options: newOptions }
                          });
                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px dashed #cbd5e1',
                          background: 'white',
                          borderRadius: '4px',
                          color: '#64748b',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        + 添加选项
                      </button>
                    </div>
                  </div>
                  
                  {/* Fallback for bulk add via text (optional, or keep both) */}
                  <div style={{ marginTop: '8px' }}>
                    <small style={{ color: '#64748b' }}>也可以通过下方文本框快速添加（每行一个）:</small>
                    <textarea
                        style={{ marginTop: '4px', height: '80px' }}
                        value=""
                        onChange={e => {
                          const lines = e.target.value.split('\n').filter(Boolean);
                          const newOptions = [...((formData.config.options as any[]) || [])];
                          
                          lines.forEach(line => {
                             // Check if already exists to avoid dupes if possible, or just add
                             if (!newOptions.find(o => o.label === line)) {
                               newOptions.push({ label: line, value: line, color: '#e2e8f0' });
                             }
                          });
                          
                          setFormData({
                            ...formData,
                            config: { ...formData.config, options: newOptions }
                          });
                        }}
                        placeholder="输入选项后回车添加..."
                    />
                  </div>
                </div>
              )}

              {formData.type === 'multiselect' && (
                 <div className="form-group">
                    <label>最大选择数量 (可选)</label>
                    <input 
                        type="number"
                        className="comp-input"
                        value={formData.config.maxCount as number || ''}
                        onChange={e => setFormData({
                            ...formData,
                            config: { ...formData.config, maxCount: parseInt(e.target.value) || undefined }
                        })}
                        placeholder="不限制"
                    />
                 </div>
              )}

              {(formData.type === 'timeline' || formData.type === 'relation-graph') && (
                <div className="form-group">
                  <label>数据依赖 (选择角色来源)</label>
                  <DataDependenciesSelector
                    value={formData.dataDependencies}
                    onChange={(deps) => setFormData({ ...formData, dataDependencies: deps })}
                    template={template}
                    currentComponentId={initialData?.id}
                  />
                </div>
              )}

              <div className="form-divider" style={{ margin: '20px 0', borderTop: '1px solid #e2e8f0' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <h4 style={{ margin: 0 }}>AI 配置</h4>
                {loadingPrompts && (
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', color: '#666' }}>
                    <Loader2 size={14} className="animate-spin" style={{ marginRight: '4px' }} />
                    正在加载...
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label>生成 Prompt (用于生成数据)</label>
                  <button 
                    className="icon-btn" 
                    onClick={() => setExpandedPromptField('generatePrompt')}
                    title="放大编辑"
                    style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
                <textarea
                  value={formData.generatePrompt}
                  onChange={e => setFormData({ ...formData, generatePrompt: e.target.value })}
                  placeholder="输入用于生成该组件数据的 Prompt 模板..."
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: '13px', width: '100%' }}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label>校验 Prompt (用于校验数据)</label>
                  <button 
                    className="icon-btn" 
                    onClick={() => setExpandedPromptField('validatePrompt')}
                    title="放大编辑"
                    style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
                <textarea
                  value={formData.validatePrompt}
                  onChange={e => setFormData({ ...formData, validatePrompt: e.target.value })}
                  placeholder="输入用于校验该组件数据的 Prompt 模板..."
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: '13px', width: '100%' }}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label>分析 Prompt (用于分析现有内容)</label>
                  <button 
                    className="icon-btn" 
                    onClick={() => setExpandedPromptField('analysisPrompt')}
                    title="放大编辑"
                    style={{ padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
                <textarea
                  value={formData.analysisPrompt}
                  onChange={e => setFormData({ ...formData, analysisPrompt: e.target.value })}
                  placeholder="输入用于从文本分析提取数据的 Prompt 模板..."
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: '13px', width: '100%' }}
                />
              </div>
              
              <div className="modal-footer">
                {!isEditing && (
                  <button onClick={() => setStep('type')}><ChevronLeft size={14} /> 上一步</button>
                )}
                
                {isEditing && onDelete && (
                  <button 
                    onClick={() => {
                      if (window.confirm('确定要删除这个组件吗？此操作不可恢复。')) {
                        onDelete();
                      }
                    }}
                    style={{ 
                      background: '#fff1f2', 
                      color: '#e11d48', 
                      border: '1px solid #fecdd3',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                )}

                <div style={{ flex: 1 }}></div>
                <button onClick={onClose}>取消</button>
                <button className="primary" onClick={handleSave}>保存</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Prompt Editor Modal */}
      {expandedPromptField && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '90vw', width: '800px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3>
                编辑
                {expandedPromptField === 'generatePrompt' ? '生成 Prompt' :
                 expandedPromptField === 'validatePrompt' ? '校验 Prompt' :
                 '分析 Prompt'}
              </h3>
              <button className="close-btn" onClick={() => setExpandedPromptField(null)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
              <textarea
                value={formData[expandedPromptField]}
                onChange={e => setFormData({ ...formData, [expandedPromptField]: e.target.value })}
                placeholder="输入 Prompt 模板..."
                style={{ 
                  flex: 1, 
                  fontFamily: 'monospace', 
                  fontSize: '14px', 
                  width: '100%', 
                  resize: 'none',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={() => setExpandedPromptField(null)}>完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
