import React, { useState, useRef, useEffect } from 'react';
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
import MessageModal from '../common/MessageModal';
import type { MessageType } from '../common/MessageModal';
import { parseError } from '../../utils/errorUtils';
// import GuideTip from '../common/GuideTip';
import './WorkInfoManager.css';

// Import refactored modules
import ComponentEditorModal from './work-info/ComponentEditorModal';
import DraggableResizableModal from '../common/DraggableResizableModal';
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
import { getDependencyCharacters, extractComponentDataFromTemplate } from './work-info/utils';
import type { 
  ComponentConfig, 
  WorkData, 
  PreviewItem,
  CharacterData
} from './work-info/types';

// 生成数据类型
// type GeneratedDataType = string | unknown[] | Record<string, unknown>;

// ============ 主组件 ============

// --- Guided Components for Auto-Focus ---

interface GuidedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isActiveGuide: boolean;
  tipsEnabled: boolean;
}

const GuidedInput: React.FC<GuidedInputProps> = ({ isActiveGuide, tipsEnabled, ...props }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isActiveGuide && tipsEnabled && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isActiveGuide, tipsEnabled]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (isActiveGuide && tipsEnabled && !props.value) {
      // Force focus back if empty and active guide
      // Use setTimeout to avoid conflict with other click events (like closing modal)
      // But we want to be strict as per user request
      requestAnimationFrame(() => {
         // Check if we are still active (in case it changed)
         if (document.activeElement !== inputRef.current) {
             inputRef.current?.focus();
         }
      });
    }
    props.onBlur?.(e);
  };

  return <input ref={inputRef} {...props} onBlur={handleBlur} />;
};

interface GuidedTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isActiveGuide: boolean;
  tipsEnabled: boolean;
}

const GuidedTextarea: React.FC<GuidedTextareaProps> = ({ isActiveGuide, tipsEnabled, ...props }) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    if (isActiveGuide && tipsEnabled && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isActiveGuide, tipsEnabled]);

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (isActiveGuide && tipsEnabled && !props.value) {
      requestAnimationFrame(() => {
         if (document.activeElement !== inputRef.current) {
             inputRef.current?.focus();
         }
      });
    }
    props.onBlur?.(e);
  };

  return <textarea ref={inputRef} {...props} onBlur={handleBlur} />;
};

// -----------------------------------------

interface WorkInfoManagerProps {
  workId?: string | null;
  workData?: WorkData;
  activeModuleId?: string;
  onActiveModuleChange?: (moduleId: string) => void;
  onPreviewDataChange?: (data: PreviewItem[]) => void;
  onWorkInfoUpdate?: (info: { title?: string; cover?: string; description?: string }) => void;
  readOnly?: boolean;
}

export default function WorkInfoManager(props: WorkInfoManagerProps = {}) {
  const { workId, workData, activeModuleId, onActiveModuleChange, onPreviewDataChange, onWorkInfoUpdate, readOnly } = props;
  
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

  // State for guide tips global toggle
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [isOnboardingActive, setIsOnboardingActive] = useState(() => {
    if (typeof window === 'undefined' || !workId) return false;
    return localStorage.getItem(`wawawriter_onboarding_${workId}`) !== 'true';
  });
  
  useEffect(() => {
    const checkOnboarding = () => {
      if (!workId) return;
      const hasShownOnboarding = localStorage.getItem(`wawawriter_onboarding_${workId}`) === 'true';
      setIsOnboardingActive(!hasShownOnboarding);
    };

    checkOnboarding();

    const handleOnboardingFinished = () => {
      setIsOnboardingActive(false);
    };

    window.addEventListener('wawawriter_onboarding_finished', handleOnboardingFinished);
    
    const checkTips = () => {
      const enabled = localStorage.getItem('wawawriter_guide_tips_enabled');
      setTipsEnabled(enabled === null || enabled === 'true');
    };
    checkTips();
    window.addEventListener('wawawriter_guide_tips_updated', checkTips);
    window.addEventListener('storage', checkTips);
    window.addEventListener('storage', checkOnboarding);
    
    return () => {
      window.removeEventListener('wawawriter_onboarding_finished', handleOnboardingFinished);
      window.removeEventListener('wawawriter_guide_tips_updated', checkTips);
      window.removeEventListener('storage', checkTips);
      window.removeEventListener('storage', checkOnboarding);
    };
  }, [workId]);

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
      } catch {
        // ignore
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

  // Helper to check if component has value
  const hasValue = (val: unknown): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return !!val;
  };

  // Recursive function to find first empty component
  const findFirstEmptyComponent = (components: ComponentConfig[], dismissed: Record<string, boolean>): { id: string; tabId?: string; parentId?: string } | null => {
    for (const comp of components) {
      if (comp.type === 'tabs' && comp.config?.tabs && comp.config.tabs.length > 0) {
          for (const tab of comp.config.tabs) {
              if (tab.components) {
                  const result = findFirstEmptyComponent(tab.components, dismissed);
                  if (result) {
                      return { ...result, tabId: tab.id, parentId: comp.id };
                  }
              }
          }
      } else {
          if (!hasValue(comp.value) && !dismissed[comp.id]) {
              return { id: comp.id };
          }
      }
    }
    return null;
  };

  const activeModuleSafe = template?.modules?.[activeModuleIndex];
  const [dismissedGuides, setDismissedGuides] = useState<Record<string, boolean>>({});
  const [manualTabSelection, setManualTabSelection] = useState<Record<string, boolean>>({});
  
  const firstEmptyInfo = activeModuleSafe && !isOnboardingActive ? findFirstEmptyComponent(activeModuleSafe.components, dismissedGuides) : null;
  const firstEmptyComponentId = firstEmptyInfo ? firstEmptyInfo.id : '';
  
  // Update firstEmptyComponentId logic to account for manual dismissal
  useEffect(() => {
    const handleGuideUpdate = () => {
      // Force re-calculation by checking localStorage
      const newDismissed: Record<string, boolean> = {};
      const safeGet = (key: string) => {
        try {
          return localStorage.getItem(key) ?? sessionStorage.getItem(key);
        } catch {
          return null;
        }
      };
      if (activeModuleSafe) {
        const checkComponents = (components: ComponentConfig[]) => {
          components.forEach(comp => {
            if (safeGet(`wawawriter_guide_tip_seen_guide-fill-${comp.id}`) === 'true') {
              newDismissed[comp.id] = true;
            }
            if (comp.type === 'tabs' && comp.config?.tabs) {
              comp.config.tabs.forEach(tab => {
                if (tab.components) {
                  checkComponents(tab.components);
                }
              });
            }
          });
        };
        checkComponents(activeModuleSafe.components);
      }
      setDismissedGuides(newDismissed);
    };

    window.addEventListener('wawawriter_guide_tips_updated', handleGuideUpdate);
    // Initial check
    handleGuideUpdate();
    return () => window.removeEventListener('wawawriter_guide_tips_updated', handleGuideUpdate);
  }, [activeModuleSafe]);
  
  // Auto-switch tabs to show the guided component
  useEffect(() => {
    if (tipsEnabled && firstEmptyInfo?.parentId && firstEmptyInfo?.tabId) {
      const { parentId, tabId } = firstEmptyInfo;
      // 只在用户尚未手动选择过该 Tabs 的情况下，自动切到引导项所在 Tab。
      // 一旦用户手动切换，则不再强制切回，避免“闪回”影响操作。
      if (!manualTabSelection[parentId]) {
        setActiveTabs(prev => (prev[parentId] === tabId ? prev : { ...prev, [parentId]: tabId }));
      }
    }
  }, [firstEmptyInfo, manualTabSelection, tipsEnabled]);

  if (loading) {
    return <div className="loading-container">加载中...</div>;
  }

  if (!template) {
    return <div className="error-container">无法加载模板数据</div>;
  }

  const activeModule = template.modules[activeModuleIndex];

  // 处理组件数据生成
  const handleGenerateData = async (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => {
    const prompt = comp.generatePrompt;
    // 不使用 comp.generatePromptId：模板配置中存储的 ID 可能是旧值（如指向章节分析 prompt），
    // 改为依赖后端通过 work_template_id + component_id 自动查找正确的 prompt。

    // 从当前模板的 templateId（如 "db-8"）解析出数字 ID，传给后端自动查找 prompt
    let workTemplateId: number | undefined;
    if (template?.templateId) {
      const parsed = parseInt(template.templateId.split('-').pop() || '', 10);
      if (!isNaN(parsed)) workTemplateId = parsed;
    }

    // 提取当前所有组件的值，传给后端拼接 prompt 上下文
    const currentComponentData = template ? extractComponentDataFromTemplate(template.modules) : undefined;

    setGeneratingComponents(prev => ({ ...prev, [comp.id]: true }));

    try {
       const result = await generateComponentData(
         workId || '',
         comp.id,
         comp.dataKey || comp.id,
         undefined,
         prompt,
         undefined,
         undefined,
         comp.type,
         workTemplateId,
         currentComponentData,
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
      
      showMessage(parseError(error), 'error', '生成失败');
    } finally {
      setGeneratingComponents(prev => ({ ...prev, [comp.id]: false }));
    }
  };

  const handlePreviewSave = (data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!previewData) return;
    const { target } = previewData;

    let finalData = data;

    // Attempt to find component type to handle data transformation
    let compType = '';
    
    const module = template.modules.find(m => m.id === target.moduleId);
    if (module) {
        const comp = module.components.find(c => c.id === target.componentId);
        if (comp) {
            compType = comp.type;
        } else {
            // Check nested in tabs
            for (const c of module.components) {
                if (c.type === 'tabs' && c.config.tabs) {
                    for (const tab of c.config.tabs) {
                        const subComp = tab.components?.find(sc => sc.id === target.componentId);
                        if (subComp) {
                            compType = subComp.type;
                            break;
                        }
                    }
                }
                if (compType) break;
            }
        }
    }

    // Transform data for specific types
    if (compType === 'keyvalue') {
        // If we received a plain object, convert to KeyValueItem[]
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            finalData = Object.entries(data).map(([key, value]) => ({
                key,
                value: typeof value === 'object' ? JSON.stringify(value) : String(value)
            }));
        }
    }

    updateComponentValue(target.componentId, finalData, target.moduleId);
  };


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

    // Auto-focus logic for the guided component
    const isActiveGuide = comp.id === firstEmptyComponentId;

    switch (comp.type) {
      case 'text':
        return (
          <GuidedInput
            id={`guided-comp-${comp.id}`}
            isActiveGuide={isActiveGuide}
            tipsEnabled={tipsEnabled}
            type="text"
            className="comp-input"
            value={(comp.value as string) || ''}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
            disabled={readOnly}
          />
        );
        
      case 'textarea':
        return (
          <GuidedTextarea
            id={`guided-comp-${comp.id}`}
            isActiveGuide={isActiveGuide}
            tipsEnabled={tipsEnabled}
            className="comp-textarea"
            value={(comp.value as string) || ''}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
            rows={5}
            disabled={readOnly}
          />
        );

      case 'select': {
        // 规范化 options：确保每项都有 value 和 label（模板/API 可能只含 label）
        const rawOptions = (comp.config.options || []) as { value?: string; label: string }[];
        const options: SelectOption[] = rawOptions.map(opt => ({
          value: opt.value ?? opt.label ?? '',
          label: opt.label ?? opt.value ?? '',
        })).filter(opt => opt.value !== '' || opt.label !== '');
        return (
          <CustomSelect
            id={`guided-comp-${comp.id}`}
            value={(comp.value as string) || ''}
            onChange={(val) => updateValue(val)}
            options={options}
            placeholder={comp.config.placeholder || '请选择'}
            disabled={readOnly}
          />
        );
      }

      case 'tags':
        return (
            <div className="comp-tags-container" id={`guided-comp-${comp.id}`}>
                 <div className="tags-list">
                    {Array.isArray(comp.value) && (comp.value as string[]).map((tag, i) => (
                        <span key={i} className="tag-item">
                            {tag}
                            {!readOnly && (
                              <button onClick={() => {
                                  const newTags = (comp.value as string[]).filter((_, idx) => idx !== i);
                                  updateValue(newTags);
                              }}><X size={12} /></button>
                            )}
                        </span>
                    ))}
                </div>
                 {!readOnly && (
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
                 )}
            </div>
        );

      case 'multiselect':
        return (
          <div id={`guided-comp-${comp.id}`} style={readOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
            <MultiSelectEditor
              value={(comp.value as string[]) || []}
              onChange={(val) => updateValue(val)}
              options={comp.config.options}
              maxCount={comp.config.maxCount}
              placeholder={comp.config.placeholder}
            />
          </div>
        );

      case 'list':
        return (
          <div id={`guided-comp-${comp.id}`} style={readOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
            <ListEditor
              value={(comp.value as string[]) || []}
              onChange={(val) => updateValue(val)}
              placeholder={comp.config.placeholder}
            />
          </div>
        );

      case 'keyvalue':
        return (
          <div id={`guided-comp-${comp.id}`} style={readOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
            <KeyValueEditor
              value={(comp.value as any[]) || []} // eslint-disable-line @typescript-eslint/no-explicit-any
              onChange={(val) => updateValue(val)}
            />
          </div>
        );

      case 'image':
        return (
          <div className="comp-image-uploader" id={`guided-comp-${comp.id}`}>
             {comp.value ? (
               <div className="image-preview">
                 <img src={comp.value as string} alt="Uploaded" />
                 {!readOnly && <button className="remove-btn" onClick={() => updateValue('')}><X size={14} /></button>}
               </div>
             ) : (
               !readOnly && (
                 <div className="upload-placeholder" onClick={() => {
                      setCurrentImageId(comp.id);
                      fileInputRef.current?.click();
                 }}>
                     <div className="icon"><span className="lucide lucide-image"></span></div>
                     <span>点击上传封面</span>
                 </div>
               )
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
            targetGuideId={firstEmptyComponentId}
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
            onActiveTabChange={(tId) => {
              setManualTabSelection(prev => ({ ...prev, [comp.id]: true }));
              setActiveTabs(prev => ({ ...prev, [comp.id]: tId }));
            }}
            isEditMode={isEditMode}
          />
        );

      case 'timeline':
        return (
          <div id={`guided-comp-${comp.id}`} style={readOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
            <TimelineEditor
              component={comp}
              onChange={(newEvents) => updateValue(newEvents)}
              availableCharacters={getDependencyCharacters(template.modules, comp.dataDependencies)}
              isEditMode={isEditMode}
            />
          </div>
        );

      case 'character-card':
        return (
          <div id={`guided-comp-${comp.id}`} style={readOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
            <CharacterCard
              component={comp}
              onChange={(newData) => updateValue(newData)}
              isEditMode={isEditMode}
            />
          </div>
        );
        
      case 'faction':
         return (
            <div id={`guided-comp-${comp.id}`} style={readOnly ? { pointerEvents: 'none', opacity: 0.7 } : {}}>
              <FactionEditor
                component={comp}
                onChange={(newData) => updateValue(newData)}
                isEditMode={isEditMode}
              />
            </div>
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
            <div className="comp-relation-graph" id={`guided-comp-${comp.id}`} style={{ width: '100%', height: '600px', minHeight: '600px' }}>
              <CharacterRelations 
                key={`relation-graph-${comp.id}`}
                data={graphData}
                dependencyKeys={comp.dataDependencies || []}
                onChange={readOnly ? undefined : (newData) => {
                  updateValue({
                    characters: newData.characters || [],
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
    
    showMessage(
      `确定要删除模块 "${activeModule.name}" 吗？此操作将删除该模块下的所有数据且不可恢复。`,
      'warning',
      '删除模块',
      () => {
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
        showToast('模块已删除');
      }
    );
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
          showToast('模板应用成功');
       } else {
         showMessage('该模板格式不正确，缺少模块配置', 'error');
       }
    } else {
      showMessage('无法加载模板配置', 'error');
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
             {/* <GuideTip
               id="work-info-template-market"
               content={
                 <div>
                   <h4>模板市场</h4>
                   <p>点击此处浏览和使用预设的作品信息模板，快速搭建世界观架构。</p>
                 </div>
               }
               placement="bottom"
             > */}
             <button 
               className="btn-secondary header-btn"
               onClick={() => setShowTemplateMarket(true)}
               title="模板市场"
               disabled={readOnly}
             >
               <LayoutGrid size={16} /> <span className="btn-text">模板市场</span>
             </button>
             {/* </GuideTip> */}
             <button 
               className="btn-secondary header-btn"
               onClick={saveData}
               disabled={isSaving || readOnly}
               title="保存数据"
             >
               <Save size={16} /> <span className="btn-text">{isSaving ? '保存中...' : '保存'}</span>
             </button>
             {/* <GuideTip
               id="work-info-edit-mode"
               content={
                 <div>
                   <h4>编辑模式</h4>
                   <p>点击此处开启编辑模式，可以自定义作品信息的模板结构，添加或删除模块和组件。</p>
                 </div>
               }
               placement="bottom"
             > */}
             <button 
               className={`edit-mode-btn header-btn ${isEditMode ? 'active' : ''}`}
               onClick={() => setIsEditMode(!isEditMode)}
               title = {isEditMode ? '完成编辑' : '编辑模板'}
               disabled={readOnly}
             >
               <Settings size={16} />
             </button>
             {/* </GuideTip> */}
             {isEditMode && (
               <>
                 <button 
                   className="btn-secondary header-btn"
                   onClick={() => setShowAddModule(true)}
                 >
                   <Plus size={16} /> <span className="btn-text">添加模块</span>
                 </button>
                 <button 
                   className="btn-secondary header-btn"
                   onClick={handleDeleteModule}
                   style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}
                   title="删除当前模块"
                 >
                   <Trash2 size={16} /> <span className="btn-text">删除模块</span>
                 </button>
               </>
             )}
           </div>
        </div>
        <div className="module-components">
          {activeModule?.components.map((comp, index) => {
             const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system', 'keyvalue'].includes(comp.type);
             
             // AI生成按钮
             const generateBtn = (
                <button 
                  className="icon-btn"
                  onClick={() => handleGenerateData(comp, activeModule.id)}
                  disabled={generatingComponents[comp.id] || readOnly}
                  title="AI生成内容"
                  style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6' }}
                >
                  {generatingComponents[comp.id] ? (
                    <span className="loading-spinner small" style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'block', animation: 'spin 1s linear infinite' }}></span>
                  ) : (
                    <Sparkles size={16} />
                  )}
                </button>
             );

             // 编辑按钮
             const settingsBtn = (
                <button 
                  className="comp-edit-btn"
                  title="编辑组件"
                  onClick={() => {
                  setEditingComponentId(comp.id);
                  setEditingComponentData(comp);
                  setShowAddComponent(true);
                }}
                disabled={readOnly}
                >
                  <Settings size={14} />
                </button>
             );

             return (
             <div key={comp.id} className="comp-wrapper">
                <div className="comp-header">
                  {/* Sequential Guide: Show tip only for the first empty component */}
                  {comp.id === firstEmptyComponentId ? (
                    //  <GuideTip
                    //    id={`guide-fill-${comp.id}`}
                    //    forceVisible={true}
                    //    content={
                    //      <div>
                    //        <h4>请填写{comp.label}</h4>
                    //        <p>为了完善作品设定，请填写这一项内容。完成后将自动提示下一项。</p>
                    //      </div>
                    //    }
                    //    placement="right"
                    //  >
                       <label>{comp.label}</label>
                    //  </GuideTip>
                  ) : (
                     <label>{comp.label}</label>
                  )}
                 <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {showGenerateBtn && (
                      index === 0 ? (
                        <>
                          {/* <GuideTip id="work-info-ai-generate" content={...} placement="left"> */}
                          {generateBtn}
                          {/* </GuideTip> */}
                        </>
                      ) : generateBtn
                    )}
                    {isEditMode && (
                      index === 0 ? (
                        <>
                          {/* <GuideTip id="work-info-comp-settings" content={...} placement="left"> */}
                          {settingsBtn}
                          {/* </GuideTip> */}
                        </>
                      ) : settingsBtn
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
      <DraggableResizableModal
        isOpen={showAddModule}
        onClose={() => setShowAddModule(false)}
        initialWidth={480}
        initialHeight={400}
        className="add-module-modal-content"
        handleClassName=".modal-header"
      >
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
      </DraggableResizableModal>

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
