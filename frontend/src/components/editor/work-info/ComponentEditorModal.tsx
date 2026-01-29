import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { ComponentType, ComponentConfig, TemplateConfig } from './types';
import { DataDependenciesSelector } from './DataDependenciesSelector';
import CustomSelect from '../../CustomSelect';

interface ComponentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (componentData: any) => void;
  initialData?: ComponentConfig;
  template: TemplateConfig;
  isEditing?: boolean;
}

export default function ComponentEditorModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  template,
  isEditing = false
}: ComponentEditorModalProps) {
  const [step, setStep] = useState<'type' | 'config'>('type');
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

  const handleSave = () => {
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

              {(formData.type === 'select' || formData.type === 'multiselect') && (
                <div className="form-group">
                  <label>选项配置 (每行一个)</label>
                  <textarea
                    value={((formData.config.options as any[])?.map(o => o.label).join('\n')) || ''}
                    onChange={e => {
                      const options = e.target.value.split('\n').filter(Boolean).map(s => ({ label: s, value: s }));
                      setFormData({
                        ...formData,
                        config: { ...formData.config, options }
                      });
                    }}
                    placeholder="选项1&#10;选项2&#10;选项3"
                  />
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
              <h4>AI 配置</h4>
              
              <div className="form-group">
                <label>生成 Prompt (用于生成数据)</label>
                <textarea
                  value={formData.generatePrompt}
                  onChange={e => setFormData({ ...formData, generatePrompt: e.target.value })}
                  placeholder="输入用于生成该组件数据的 Prompt 模板..."
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
              </div>

              <div className="form-group">
                <label>校验 Prompt (用于校验数据)</label>
                <textarea
                  value={formData.validatePrompt}
                  onChange={e => setFormData({ ...formData, validatePrompt: e.target.value })}
                  placeholder="输入用于校验该组件数据的 Prompt 模板..."
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
              </div>

              <div className="form-group">
                <label>分析 Prompt (用于分析现有内容)</label>
                <textarea
                  value={formData.analysisPrompt}
                  onChange={e => setFormData({ ...formData, analysisPrompt: e.target.value })}
                  placeholder="输入用于从文本分析提取数据的 Prompt 模板..."
                  rows={4}
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
              </div>
              
              <div className="modal-footer">
                {!isEditing && (
                  <button onClick={() => setStep('type')}><ChevronLeft size={14} /> 上一步</button>
                )}
                <div style={{ flex: 1 }}></div>
                <button onClick={onClose}>取消</button>
                <button className="primary" onClick={handleSave}>保存</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
