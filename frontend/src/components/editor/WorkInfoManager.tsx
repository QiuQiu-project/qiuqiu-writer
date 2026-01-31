import { useState, useRef, useEffect } from 'react';
import { 
  Plus, X, Settings, LayoutGrid, Sparkles, Save, Trash2
} from 'lucide-react';
import CharacterRelations from './CharacterRelations';
import type { CharacterRelationsData } from './CharacterRelations';
import CustomSelect from '../CustomSelect';
import type { SelectOption } from '../CustomSelect';
import { templatesApi } from '../../utils/templatesApi';
import type { WorkTemplate } from '../../utils/templatesApi';
import { generateComponentData } from '../../utils/bookAnalysisApi';
import { GeneratedDataPreviewModal } from './work-info/GeneratedDataPreviewModal';
import './WorkInfoManager.css';

// Import refactored modules
import ComponentEditorModal from './work-info/ComponentEditorModal';
import { useWorkInfoData } from './work-info/useWorkInfoData';
import { TabsComponent } from './work-info/TabsComponent';
import TimelineEditor from './work-info/TimelineEditor';
import FactionEditor from './work-info/FactionEditor';
import CharacterCard from './work-info/CharacterCard';
import ListEditor from './work-info/ListEditor';
import KeyValueEditor from './work-info/KeyValueEditor';
import MultiSelectEditor from './work-info/MultiSelectEditor';
import TemplateMarketModal from './work-info/TemplateMarketModal';
import { IconMap } from './work-info/config';
import { getDependencyCharacters } from './work-info/utils';
import type { 
  ComponentConfig, 
  WorkData, 
  PreviewItem,
  CharacterData
} from './work-info/types';

// 生成数据类型
// type GeneratedDataType = string | unknown[] | Record<string, unknown>;

// ============ 主组件 ============

interface WorkInfoManagerProps {
  workId?: string | null;
  workData?: WorkData;
  activeModuleId?: string;
  onActiveModuleChange?: (moduleId: string) => void;
  onPreviewDataChange?: (data: PreviewItem[]) => void;
  onWorkInfoUpdate?: (info: { title?: string; cover?: string; description?: string }) => void;
}

export default function WorkInfoManager(props: WorkInfoManagerProps = {}) {
  const { workId, workData, activeModuleId, onActiveModuleChange, onPreviewDataChange, onWorkInfoUpdate } = props;
  
  // 模板管理状态
  const [userTemplates, setUserTemplates] = useState<WorkTemplate[]>([]);
  
  // 使用重构后的 Hook 管理数据
  const { 
    template, 
    isLoading: loading, 
    setTemplate, 
    updateComponentValue,
    saveData,
    isSaving
  } = useWorkInfoData(workId || null, workData || null, userTemplates);

  // UI 状态
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showTemplateMarket, setShowTemplateMarket] = useState(false);
  
  const [showAddModule, setShowAddModule] = useState(false);
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [addingToTab, setAddingToTab] = useState<{ tabId: string; componentId: string } | null>(null);
  const [newModuleForm, setNewModuleForm] = useState({ name: '', icon: 'LayoutGrid', color: '#64748b' });
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editingComponentData, setEditingComponentData] = useState<ComponentConfig | undefined>(undefined);
  const [editingComponentContext, setEditingComponentContext] = useState<{
    tabsComponentId?: string;
    tabId?: string;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setCurrentImageId] = useState<string | null>(null);
  const [generatingComponents, setGeneratingComponents] = useState<Record<string, boolean>>({});

  // 生成数据预览状态
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    rawData: string;
    dataKey?: string;
    target: {
      componentId: string;
      moduleId: string;
      tabsComponentId?: string;
      tabId?: string;
    };
  } | null>(null);

  // 处理 activeModuleId prop 变化
  useEffect(() => {
    if (activeModuleId && template?.modules) {
      const index = template.modules.findIndex(m => m.id === activeModuleId);
      if (index !== -1) {
        setActiveModuleIndex(index);
      }
    }
  }, [activeModuleId, template]);

  // 加载用户模板列表
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const templates = await templatesApi.listTemplates({
          work_type: 'novel',
          include_fields: false
        });
        setUserTemplates(templates);
      } catch (error) {
        console.warn('获取模板列表失败:', error);
      }
    };
    fetchTemplates();
  }, []);

  // 监听数据变化，更新预览数据
  useEffect(() => {
    if (!template) return;
    
    // 收集所有角色数据用于预览
    const previewItems: PreviewItem[] = [];
    
    // 递归查找角色组件数据
    const findCharacterData = (components: ComponentConfig[]) => {
      for (const comp of components) {
        if (comp.type === 'tabs' && comp.config?.tabs) {
          for (const tab of comp.config.tabs) {
            if (tab.components) {
              findCharacterData(tab.components);
            }
          }
        }
        
        // 检查是否是角色相关组件
        if (comp.type === 'character-card' || comp.dataKey === 'characters') {
          if (Array.isArray(comp.value)) {
            comp.value.forEach((char: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              if (char && (char.name || char.display_name)) {
                previewItems.push({
                  name: char.name || char.display_name,
                  gender: char.gender,
                  type: char.type || char.role,
                  description: char.description || char.summary
                });
              }
            });
          } else if (comp.value && typeof comp.value === 'object') {
             const char = comp.value as any; // eslint-disable-line @typescript-eslint/no-explicit-any
             if (char && (char.name || char.display_name)) {
                previewItems.push({
                  name: char.name || char.display_name,
                  gender: char.gender,
                  type: char.type || char.role,
                  description: char.description || char.summary
                });
             }
          }
        }
      }
    };
    
    template.modules.forEach(module => {
      findCharacterData(module.components);
    });
    
    onPreviewDataChange?.(previewItems);
    
    // 更新作品基础信息（如果包含特定字段）
    let workTitle: string | undefined;
    let workCover: string | undefined;
    let workDesc: string | undefined;
    
    const findWorkInfo = (components: ComponentConfig[]) => {
      for (const comp of components) {
        if (comp.label === '作品名称' || comp.id === 'title') {
          workTitle = comp.value as string;
        }
        if (comp.label === '封面' || comp.type === 'image') {
          workCover = comp.value as string;
        }
        if (comp.label === '简介' || comp.id === 'description') {
          workDesc = comp.value as string;
        }
      }
    };
    
    template.modules.forEach(module => {
      findWorkInfo(module.components);
    });
    
    if (workTitle || workCover || workDesc) {
      onWorkInfoUpdate?.({
        title: workTitle,
        cover: workCover,
        description: workDesc
      });
    }
    
  }, [template, onPreviewDataChange, onWorkInfoUpdate]);

  if (loading) {
    return <div className="loading-container">加载中...</div>;
  }

  if (!template) {
    return <div className="error-container">无法加载模板数据</div>;
  }

  const activeModule = template.modules[activeModuleIndex];

  // 处理组件数据生成
  const handleGenerateData = async (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => {
    // 检查是否有 prompt
    const prompt = comp.generatePrompt;
    const promptId = comp.generatePromptId;
    
    if (!prompt && !promptId) {
      alert('请先在组件配置中设置生成 Prompt');
      return;
    }
    
    setGeneratingComponents(prev => ({ ...prev, [comp.id]: true }));
    
    try {
       const result = await generateComponentData(
         workId ? parseInt(workId) : 0, 
         comp.id,
         comp.dataKey || comp.id,
         promptId,
         prompt
       );
       
       if (result && result.generated_data) {
           setPreviewData({
             rawData: result.generated_data,
             dataKey: result.data_key,
             target: {
               componentId: comp.id,
               moduleId,
               tabsComponentId,
               tabId
             }
           });
           setPreviewModalOpen(true);
       }
    } catch (error) {
      console.error('Generate failed', error);
      alert('生成失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setGeneratingComponents(prev => ({ ...prev, [comp.id]: false }));
    }
  };

  const handlePreviewSave = (data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!previewData) return;
    const { target } = previewData;
    updateComponentValue(target.componentId, data, target.moduleId);
  };

  // 这里需要保留 renderComponent 函数，因为它包含很多 UI 逻辑
  // 我将简化它，并使用 updateComponentValue 替代 updateValue
  
  const renderComponent = (
    comp: ComponentConfig, 
    moduleId: string, 
    tabsComponentId?: string, 
    tabId?: string
  ) => {
    // 这是一个简化的包装函数，用于更新值
    const updateValue = (newValue: unknown) => {
      // 如果是在 tabs 中
      if (tabsComponentId && tabId) {
        updateComponentValue(comp.id, newValue, moduleId);
      } else {
        updateComponentValue(comp.id, newValue, moduleId);
      }
    };

    switch (comp.type) {
      case 'text':
        return (
          <input
            type="text"
            className="comp-input"
            value={(comp.value as string) || ''}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
            disabled={!isEditMode && false} // 浏览模式也可以编辑值
          />
        );
        
      case 'textarea':
        return (
          <textarea
            className="comp-textarea"
            value={(comp.value as string) || ''}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
            rows={5}
          />
        );

      case 'select':
        return (
          <CustomSelect
            value={(comp.value as string) || ''}
            onChange={(val) => updateValue(val)}
            options={(comp.config.options || []) as SelectOption[]}
            placeholder={comp.config.placeholder || '请选择'}
          />
        );

      case 'tags':
        return (
            <div className="comp-tags-container">
                 <div className="tags-list">
                    {Array.isArray(comp.value) && (comp.value as string[]).map((tag, i) => (
                        <span key={i} className="tag-item">
                            {tag}
                            <button onClick={() => {
                                const newTags = (comp.value as string[]).filter((_, idx) => idx !== i);
                                updateValue(newTags);
                            }}><X size={12} /></button>
                        </span>
                    ))}
                </div>
                 <input 
                    type="text" 
                    placeholder="输入标签按回车添加"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const val = e.currentTarget.value.trim();
                            if (val) {
                                const currentTags = Array.isArray(comp.value) ? comp.value as string[] : [];
                                if (!currentTags.includes(val)) {
                                    updateValue([...currentTags, val]);
                                }
                                e.currentTarget.value = '';
                            }
                        }
                    }}
                    className="comp-input"
                 />
            </div>
        );

      case 'multiselect':
        return (
          <MultiSelectEditor
            value={(comp.value as string[]) || []}
            onChange={(val) => updateValue(val)}
            options={comp.config.options}
            maxCount={comp.config.maxCount}
            placeholder={comp.config.placeholder}
          />
        );

      case 'list':
        return (
          <ListEditor
            value={(comp.value as string[]) || []}
            onChange={(val) => updateValue(val)}
            placeholder={comp.config.placeholder}
          />
        );

      case 'keyvalue':
        return (
          <KeyValueEditor
            value={(comp.value as any[]) || []} // eslint-disable-line @typescript-eslint/no-explicit-any
            onChange={(val) => updateValue(val)}
          />
        );

      case 'image':
        return (
          <div className="comp-image-uploader">
             {comp.value ? (
               <div className="image-preview">
                 <img src={comp.value as string} alt="Uploaded" />
                 <button className="remove-btn" onClick={() => updateValue('')}><X size={14} /></button>
               </div>
             ) : (
               <div className="upload-placeholder" onClick={() => {
                    setCurrentImageId(comp.id);
                    fileInputRef.current?.click();
               }}>
                   <div className="icon"><span className="lucide lucide-image"></span></div>
                   <span>点击上传封面</span>
               </div>
             )}
          </div>
        );

      case 'tabs':
        if (!comp.config?.tabs) return null;
        return (
          <TabsComponent
            tabs={comp.config.tabs}
            moduleId={moduleId}
            tabsComponentId={comp.id}
            renderComponent={renderComponent}
            onUpdateTabs={(newTabs) => {
              setTemplate(prev => {
                if (!prev) return null;
                const newModules = prev.modules.map(m => {
                  if (m.id === moduleId) {
                    return {
                      ...m,
                      components: m.components.map(c => {
                        if (c.id === comp.id) {
                          return {
                            ...c,
                            config: { ...c.config, tabs: newTabs }
                          };
                        }
                        return c;
                      })
                    };
                  }
                  return m;
                });
                return { ...prev, modules: newModules };
              });
            }}
            onEditComponentInTab={(subComp, tId) => {
              setEditingComponentId(subComp.id);
              setEditingComponentContext({ tabsComponentId: comp.id, tabId: tId });
              setEditingComponentData(subComp);
              setShowAddComponent(true);
            }}
            onGenerateComponent={handleGenerateData}
            generatingComponents={generatingComponents}
            activeTabId={activeTabs[comp.id]}
            onActiveTabChange={(tId) => setActiveTabs(prev => ({ ...prev, [comp.id]: tId }))}
            isEditMode={isEditMode}
          />
        );

      case 'timeline':
        return (
          <TimelineEditor
            component={comp}
            onChange={(newEvents) => updateValue(newEvents)}
            availableCharacters={getDependencyCharacters(template.modules, comp.dataDependencies)}
            isEditMode={isEditMode}
          />
        );

      case 'character-card':
        return (
          <CharacterCard
             component={comp}
             onChange={(newData) => updateValue(newData)}
             isEditMode={isEditMode}
          />
        );
        
      case 'faction':
         return (
            <FactionEditor
                component={comp}
                onChange={(newData) => updateValue(newData)}
                isEditMode={isEditMode}
            />
         );

      case 'relation-graph': {
          const dependencyCharacters = getDependencyCharacters(template.modules, comp.dataDependencies);
          
          let relationData: { characters?: CharacterData[]; relations?: unknown[] } = { characters: [], relations: [] };
          if (Array.isArray(comp.value)) {
            relationData = { characters: [], relations: comp.value };
          } else if (comp.value && typeof comp.value === 'object') {
             relationData = comp.value as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          }
          
          const finalCharacters = dependencyCharacters.length > 0 ? dependencyCharacters : (relationData.characters || []);
           
          const graphData: CharacterRelationsData = {
            characters: finalCharacters as CharacterRelationsData['characters'],
            relations: (relationData.relations || []) as CharacterRelationsData['relations']
          };

          return (
            <div className="comp-relation-graph" style={{ width: '100%', height: '600px', minHeight: '600px' }}>
              <CharacterRelations 
                key={`relation-graph-${comp.id}`}
                data={graphData}
                onChange={(newData) => {
                  updateValue({
                    characters: [], 
                    relations: newData.relations || []
                  });
                }}
              />
            </div>
          );
      }

      default:
        return <div>未实现的组件类型: {comp.type}</div>;
    }
  };

  const handleSaveComponent = (componentData: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    setTemplate(prev => {
      if (!prev) return null;
      
      const newModules = prev.modules.map(m => {
        // Case 1: Edit/Add in Tab
         if (editingComponentContext || addingToTab) {
            const tabsCompId = editingComponentContext?.tabsComponentId || addingToTab?.componentId;
            const targetTabId = editingComponentContext?.tabId || addingToTab?.tabId;
            
            if (m.id === activeModule.id) { 
              return {
                ...m,
                components: m.components.map(c => {
                  if (c.id === tabsCompId) {
                     const newTabs = c.config.tabs?.map(tab => {
                       if (tab.id === targetTabId) {
                         let newComponents = [...(tab.components || [])];
                         if (editingComponentId) {
                           newComponents = newComponents.map(subC => 
                             subC.id === editingComponentId ? { ...componentData, id: subC.id, value: subC.value } : subC
                           );
                         } else {
                           newComponents.push({
                             id: crypto.randomUUID(),
                             ...componentData,
                             value: null
                           });
                         }
                         return { ...tab, components: newComponents };
                       }
                       return tab;
                     });
                     return { ...c, config: { ...c.config, tabs: newTabs } };
                  }
                  return c;
                })
              };
            }
         }
        
        // Case 2: Edit/Add in Module (Top level)
        if (m.id === activeModule.id) {
           let newComponents = [...m.components];
           if (editingComponentId) {
             newComponents = newComponents.map(c => 
               c.id === editingComponentId ? { ...componentData, id: c.id, value: c.value } : c
             );
           } else {
             newComponents.push({
                id: crypto.randomUUID(),
                ...componentData,
                value: null
             });
           }
           return { ...m, components: newComponents };
        }
        
        return m;
      });
      
      return { ...prev, modules: newModules };
    });
    
    setShowAddComponent(false);
    setEditingComponentId(null);
    setEditingComponentData(undefined);
    setAddingToTab(null);
    setEditingComponentContext(null);
  };

  const handleDeleteComponent = () => {
    if (!activeModule || !editingComponentId) return;
    
    setTemplate(prev => {
      if (!prev) return null;
      
      const newModules = prev.modules.map(m => {
         if (m.id === activeModule.id) {
            // Case 1: Component inside a Tab
            if (editingComponentContext) {
               const { tabsComponentId, tabId } = editingComponentContext;
               
               return {
                 ...m,
                 components: m.components.map(c => {
                   if (c.id === tabsComponentId) {
                      const newTabs = c.config.tabs?.map((tab: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                        if (tab.id === tabId) {
                          return {
                            ...tab,
                            components: (tab.components || []).filter((subC: any) => subC.id !== editingComponentId) // eslint-disable-line @typescript-eslint/no-explicit-any
                          };
                        }
                        return tab;
                      });
                      return { ...c, config: { ...c.config, tabs: newTabs } };
                   }
                   return c;
                 })
               };
            }
            
            // Case 2: Top-level Component in Module
            return {
              ...m,
              components: m.components.filter(c => c.id !== editingComponentId)
            };
         }
         return m;
      });
      
      return { ...prev, modules: newModules };
    });

    // Close modal and reset state
    setShowAddComponent(false);
    setEditingComponentId(null);
    setEditingComponentData(undefined);
    setAddingToTab(null);
    setEditingComponentContext(null);
  };

  const handleAddModule = () => {
    if (newModuleForm.name) {
      setTemplate(prev => {
        if (!prev) return null;
        return {
          ...prev,
          modules: [
            ...prev.modules,
            {
              id: crypto.randomUUID(),
              name: newModuleForm.name,
              icon: newModuleForm.icon,
              color: newModuleForm.color,
              components: []
            }
          ]
        };
      });
      setShowAddModule(false);
      setNewModuleForm({ name: '', icon: 'LayoutGrid', color: '#64748b' });
    }
  };

  const handleDeleteModule = () => {
    if (!activeModule) return;
    
    if (window.confirm(`确定要删除模块 "${activeModule.name}" 吗？此操作将删除该模块下的所有数据且不可恢复。`)) {
      setTemplate(prev => {
        if (!prev) return null;
        const newModules = prev.modules.filter(m => m.id !== activeModule.id);
        return {
          ...prev,
          modules: newModules
        };
      });
      // Reset index to 0
      setActiveModuleIndex(0);
    }
  };

  const handleSelectTemplate = (tpl: WorkTemplate) => {
    if (tpl.template_config && typeof tpl.template_config === 'object') {
       // 这里需要做一些类型适配，因为后端返回的结构可能需要转换
       // 假设 template_config 符合 TemplateConfig 接口
       // 如果 modules 存在，我们就直接使用它
       const config = tpl.template_config as any; // eslint-disable-line @typescript-eslint/no-explicit-any
       if (config.modules) {
          setTemplate({
            ...config,
            id: tpl.id.toString(),
            templateId: tpl.id.toString(), // Ensure templateId is set for identification
            name: tpl.name,
            description: tpl.description || ''
          });
          setShowTemplateMarket(false);
       } else {
         alert('该模板格式不正确，缺少模块配置');
       }
    } else {
      alert('无法加载模板配置');
    }
  };

  return (
    <div className="work-info-manager">
      <div className="work-info-sidebar">
        {template.modules.map((module, index) => (
          <button
            key={module.id}
            className={`module-btn ${activeModuleIndex === index ? 'active' : ''}`}
            onClick={() => {
              setActiveModuleIndex(index);
              if (onActiveModuleChange) {
                onActiveModuleChange(module.id);
              }
            }}
            style={{ borderColor: module.color }}
          >
            {IconMap[module.icon] || <LayoutGrid size={18} />}
            <span>{module.name}</span>
          </button>
        ))}
      </div>
      <div className="work-info-content">
        <div className="module-header">
           <h2>{activeModule?.name}</h2>
           <div className="header-actions">
             <button 
               className="icon-btn"
               onClick={saveData}
               disabled={isSaving}
               title="保存数据"
             >
               <Save size={16} /> {isSaving ? '保存中...' : '保存'}
             </button>
             <button 
               className="icon-btn"
               onClick={() => setShowTemplateMarket(true)}
               title="模板市场"
             >
               <LayoutGrid size={16} /> 模板市场
             </button>
             <button 
               className={`edit-mode-btn ${isEditMode ? 'active' : ''}`}
               onClick={() => setIsEditMode(!isEditMode)}
             >
               {isEditMode ? <Settings size={16} /> : <Settings size={16} />}
               {isEditMode ? '完成编辑' : '编辑模板'}
             </button>
             {isEditMode && (
               <>
                 <button 
                   className="btn-secondary"
                   onClick={() => setShowAddModule(true)}
                   style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                 >
                   <Plus size={16} /> 添加模块
                 </button>
                 <button 
                   className="btn-secondary"
                   onClick={handleDeleteModule}
                   style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}
                   title="删除当前模块"
                 >
                   <Trash2 size={16} /> 删除模块
                 </button>
               </>
             )}
           </div>
        </div>
        <div className="module-components">
          {activeModule?.components.map(comp => {
             const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system'].includes(comp.type);
             return (
             <div key={comp.id} className="comp-wrapper">
               <div className="comp-header">
                 <label>{comp.label}</label>
                 <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {showGenerateBtn && (
                        <button 
                          className="icon-btn"
                          onClick={() => handleGenerateData(comp, activeModule.id)}
                          disabled={generatingComponents[comp.id]}
                          title="AI生成内容"
                          style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6' }}
                        >
                          {generatingComponents[comp.id] ? (
                            <span className="loading-spinner small" style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'block', animation: 'spin 1s linear infinite' }}></span>
                          ) : (
                            <Sparkles size={16} />
                          )}
                        </button>
                    )}
                    {isEditMode && (
                      <button 
                        className="comp-edit-btn"
                        title="编辑组件"
                        onClick={() => {
                        setEditingComponentId(comp.id);
                        setEditingComponentData(comp);
                        setShowAddComponent(true);
                      }}>
                        <Settings size={14} />
                      </button>
                    )}
                 </div>
               </div>
               <div className="comp-content">
                 {renderComponent(comp, activeModule.id)}
               </div>
             </div>
             );
          })}
          {isEditMode && (
            <div className="add-comp-wrapper" onClick={() => {
                setEditingComponentId(null);
                setEditingComponentData(undefined);
                setShowAddComponent(true);
            }}>
                <Plus size={20} />
                <span>添加组件</span>
            </div>
          )}
        </div>
      </div>
      
      {/* 模块添加模态框 */}
      {showAddModule && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', maxHeight: '80vh' }}>
            <div className="modal-header">
              <h3>添加新模块</h3>
              <button className="close-btn" onClick={() => setShowAddModule(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>模块名称</label>
                <input
                  type="text"
                  value={newModuleForm.name}
                  onChange={(e) => setNewModuleForm({ ...newModuleForm, name: e.target.value })}
                  placeholder="例如：世界观、人物设定"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
                />
              </div>
              <div className="form-group">
                <label>图标</label>
                <div className="icon-selector">
                  {Object.keys(IconMap).map(iconName => (
                    <button
                      key={iconName}
                      className={`icon-btn ${newModuleForm.icon === iconName ? 'active' : ''}`}
                      onClick={() => setNewModuleForm({ ...newModuleForm, icon: iconName })}
                      title={iconName}
                    >
                      {IconMap[iconName]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddModule(false)}>取消</button>
              <button className="primary" onClick={handleAddModule}>确认添加</button>
            </div>
          </div>
        </div>
      )}

      <ComponentEditorModal
        isOpen={showAddComponent}
        onClose={() => {
            setShowAddComponent(false);
            setEditingComponentId(null);
            setEditingComponentData(undefined);
            setAddingToTab(null);
            setEditingComponentContext(null);
        }}
        onSave={handleSaveComponent}
        onDelete={handleDeleteComponent}
        initialData={editingComponentData}
        template={template}
        isEditing={!!editingComponentId}
      />
      
      <TemplateMarketModal 
        isOpen={showTemplateMarket}
        onClose={() => setShowTemplateMarket(false)}
        onSelectTemplate={handleSelectTemplate}
        currentTemplateConfig={template}
      />

      <GeneratedDataPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        onSave={handlePreviewSave}
        rawData={previewData?.rawData || ''}
        dataKey={previewData?.dataKey}
      />
    </div>
  );
}
