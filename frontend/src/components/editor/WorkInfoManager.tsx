import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Plus, X, ChevronLeft, ChevronRight, ChevronDown, Trash2, 
  Settings, Tag, Users, Building2, Map, FileText,
  Image, List, LayoutGrid, Heart, Zap, Sparkles,
  LayoutTemplate, Check, GitBranch, Clock, Table2,
  CheckSquare, Type, AlignLeft, Save, TrendingUp, Search
} from 'lucide-react';
import CharacterRelations from './CharacterRelations';
import type { CharacterRelationsData } from './CharacterRelations';
import CustomSelect from '../CustomSelect';
import type { SelectOption } from '../CustomSelect';
import { templatesApi } from '../../utils/templatesApi';
import { worksApi } from '../../utils/worksApi';
import { promptTemplateApi } from '../../utils/promptTemplateApi';
import type { WorkTemplate } from '../../utils/templatesApi';
import { generateComponentData } from '../../utils/bookAnalysisApi';
import './WorkInfoManager.css';

// 预览数据项接口
interface PreviewItem {
  [key: string]: unknown;
  name?: string;
  gender?: string;
  type?: string;
  description?: string;
}

// 角色数据接口
export interface CharacterData {
  id: string;
  name: string;
  gender: string;
  [key: string]: unknown;
}

// 生成数据类型
type GeneratedDataType = string | unknown[] | Record<string, unknown>;


// 为模板的所有组件加载 prompt 内容
// 注意：已移除批量获取 prompt 的请求，直接返回 modules
const loadPromptsForComponents = async (
  modules: ModuleConfig[]
): Promise<ModuleConfig[]> => {
  // 不再批量获取 prompt 内容，直接返回 modules
  return modules;
};

// 势力数据类型
interface FactionData {
  id: string;
  name: string;
  summary?: string;
  details?: string;
  levels: string[];
  parentId?: string;
  children?: FactionData[];
}

// ============ 组件类型定义 ============

// 基础组件类型
type ComponentType = 
  | 'text'           // 单行文本
  | 'textarea'       // 多行文本
  | 'image'          // 图片上传
  | 'select'         // 单选下拉
  | 'multiselect'    // 多选标签
  | 'list'           // 简单列表
  | 'keyvalue'       // 键值对列表
  | 'table'          // 表格
  | 'tabs'           // 分页标签（内嵌多个子组件）
  | 'relation-graph' // 关系图组件
  | 'timeline'       // 时间线组件
  | 'card-list'      // 卡片列表
  | 'character-card' // 角色卡片（预设字段）
  | 'rank-system'    // 等级体系
  | 'faction';       // 势力组件

// 组件配置接口
export interface ComponentConfig {
  id: string;
  type: ComponentType;
  label: string;
  // 数据存储键（用于在 component_data 中存储数据）
  dataKey?: string;
  // 数据依赖（组件需要引用其他组件的数据，如时间线需要角色列表）
  dataDependencies?: string[]; // 依赖的其他组件的 dataKey 列表
  // 组件特定配置
  config: {
    placeholder?: string;
    options?: { label: string; value: string; color?: string }[];  // select/multiselect
    maxCount?: number;           // multiselect 最大选择数
    columns?: { key: string; label: string; width?: string }[];    // table 列配置
    tabs?: { id: string; label: string; components: ComponentConfig[] }[]; // tabs 子组件
    cardFields?: { key: string; label: string; type: 'text' | 'textarea' | 'image' }[]; // card-list
    nodeTypes?: { type: string; label: string; color: string }[];  // relation-graph 节点类型
    relationTypes?: { type: string; label: string; color: string }[]; // relation-graph 关系类型
  };
  // AI Prompt 配置（支持两种方式：直接存储内容或存储 prompt_templates 表的 id）
  generatePrompt?: string;   // 用于生成内容的提示词（向后兼容：直接存储内容）
  generatePromptId?: number; // prompt_templates 表的 id（新方式）
  validatePrompt?: string;   // 用于检验内容的提示词（向后兼容：直接存储内容）
  validatePromptId?: number; // prompt_templates 表的 id（新方式）
  analysisPrompt?: string;   // 用于分析内容的提示词（向后兼容：直接存储内容）
  analysisPromptId?: number; // prompt_templates 表的 id（新方式）
  // 组件数据
  value: unknown;
}

// 模块定义
export interface ModuleConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  components: ComponentConfig[];
}

// 模板定义
interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  modules: ModuleConfig[];
}

interface WorkMetadata {
  template_config?: {
    templateId?: string;
    modules?: ModuleConfig[];
    lastModified?: number;
  };
  component_data?: Record<string, unknown>;
}

interface WorkData {
  metadata?: WorkMetadata;
}

interface TimelineEditForm {
  characterIds: string[];
  characters: string[];
  time: string;
  event: string;
  description: string;
  location: string;
}

const getModulesFromTemplateConfig = (templateConfig?: unknown): ModuleConfig[] => {
  if (!templateConfig) return [];
  if (Array.isArray(templateConfig)) return templateConfig as ModuleConfig[];
  if (typeof templateConfig === 'object' && templateConfig !== null) {
    const maybeModules = (templateConfig as { modules?: unknown }).modules;
    if (Array.isArray(maybeModules)) {
      return maybeModules as ModuleConfig[];
    }
  }
  return [];
};

const extractComponentDataFromTemplate = (modules: ModuleConfig[]): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  const collectFromComponents = (components: ComponentConfig[]) => {
    for (const comp of components) {
      if (comp.type === 'tabs' && comp.config?.tabs) {
        for (const tab of comp.config.tabs) {
          collectFromComponents(tab.components || []);
        }
        continue;
      }
      const storageKey = comp.dataKey || comp.id;
      if (comp.value !== undefined) {
        data[storageKey] = comp.value;
      }
    }
  };

  for (const module of modules) {
    collectFromComponents(module.components || []);
  }

  return data;
};

const writeComponentDataToTemplate = (
  modules: ModuleConfig[],
  data: Record<string, unknown>
): ModuleConfig[] => {
  const applyDataToComponents = (components: ComponentConfig[]): ComponentConfig[] => {
    return components.map(comp => {
      if (comp.type === 'tabs' && comp.config?.tabs) {
        return {
          ...comp,
          config: {
            ...comp.config,
            tabs: comp.config.tabs.map(tab => ({
              ...tab,
              components: applyDataToComponents(tab.components || [])
            }))
          }
        };
      }
      const storageKey = comp.dataKey || comp.id;
      if (Object.prototype.hasOwnProperty.call(data, storageKey)) {
        return { ...comp, value: data[storageKey] };
      }
      return comp;
    });
  };

  return modules.map(module => ({
    ...module,
    components: applyDataToComponents(module.components || [])
  }));
};

const cleanTemplateStructure = (modules: ModuleConfig[]): ModuleConfig[] => {
  const cleanComponents = (components: ComponentConfig[]): ComponentConfig[] => {
    return components.map(comp => {
      if (comp.type === 'tabs' && comp.config?.tabs) {
        return {
          ...comp,
          value: undefined,
          config: {
            ...comp.config,
            tabs: comp.config.tabs.map(tab => ({
              ...tab,
              components: cleanComponents(tab.components || [])
            }))
          }
        };
      }
      return { ...comp, value: undefined };
    });
  };

  return modules.map(module => ({
    ...module,
    components: cleanComponents(module.components || [])
  }));
};

// ============ 缓存管理 ============

// 获取基于 workId 的缓存键
const getCacheKey = (workId: string | null): string => {
  if (workId) {
    return `planetwriter_workinfo_cache_${workId}`;
  }
  // 如果没有 workId，使用旧的全局缓存键（向后兼容）
  return 'planetwriter_workinfo_cache';
};

interface CacheData {
  templateId: string;
  modules: ModuleConfig[];
  lastModified: number;
}

// 从 localStorage 读取缓存（基于 workId 和可选的 templateId）
const loadFromCache = (workId: string | null, templateId?: string): CacheData | null => {
  // 如果有 templateId，优先从模板特定的缓存加载
  if (templateId) {
    const templateKey = workId ? `planetwriter_workinfo_cache_${workId}_${templateId}` : `planetwriter_workinfo_cache_${templateId}`;
    try {
      const cached = localStorage.getItem(templateKey);
      if (cached) {
        const data = JSON.parse(cached);
        return data;
      }
    } catch (e) {
      console.warn('Failed to load template-specific cache:', e);
    }
  }
  
  // 回退到通用缓存
  try {
    const CACHE_KEY = getCacheKey(workId);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Failed to load cache:', e);
  }
  return null;
};

// 保存到 localStorage 缓存（基于 workId 和可选的 templateId）
const saveToCache = (data: CacheData, workId: string | null, templateId?: string) => {
  // 如果有 templateId，保存到模板特定的缓存
  if (templateId) {
    const templateKey = workId ? `planetwriter_workinfo_cache_${workId}_${templateId}` : `planetwriter_workinfo_cache_${templateId}`;
    try {
      localStorage.setItem(templateKey, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save template-specific cache:', e);
    }
  }
  
  // 同时保存到通用缓存（向后兼容）
  try {
    const CACHE_KEY = getCacheKey(workId);
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save cache:', e);
  }
};

// ============ 组件注册表 ============

interface ComponentDefinition {
  type: ComponentType;
  name: string;
  icon: React.ReactNode;
  category: 'basic' | 'advanced' | 'interactive';
  description: string;
  defaultConfig: Partial<ComponentConfig['config']>;
  configFields?: {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'options' | 'columns' | 'nodeTypes';
    required?: boolean;
  }[];
}

const componentRegistry: ComponentDefinition[] = [
  // 基础组件
  {
    type: 'text',
    name: '单行文本',
    icon: <Type size={16} />,
    category: 'basic',
    description: '简短的文本输入，适合名称、标题',
    defaultConfig: { placeholder: '请输入...' },
  },
  {
    type: 'textarea',
    name: '多行文本',
    icon: <AlignLeft size={16} />,
    category: 'basic',
    description: '长段落输入，适合描述、背景',
    defaultConfig: { placeholder: '请输入详细内容...' },
  },
  {
    type: 'image',
    name: '图片',
    icon: <Image size={16} />,
    category: 'basic',
    description: '上传图片，适合封面、地图',
    defaultConfig: {},
  },
  {
    type: 'select',
    name: '单选',
    icon: <CheckSquare size={16} />,
    category: 'basic',
    description: '从选项中选择一个',
    defaultConfig: { options: [] },
    configFields: [
      { key: 'options', label: '选项列表', type: 'options', required: true },
    ],
  },
  {
    type: 'multiselect',
    name: '多选标签',
    icon: <Tag size={16} />,
    category: 'basic',
    description: '从标签中选择多个',
    defaultConfig: { options: [], maxCount: 5 },
    configFields: [
      { key: 'options', label: '标签选项', type: 'options', required: true },
      { key: 'maxCount', label: '最大选择数', type: 'text' },
    ],
  },
  // 高级组件
  {
    type: 'list',
    name: '列表',
    icon: <List size={16} />,
    category: 'advanced',
    description: '有序的项目列表',
    defaultConfig: {},
  },
  {
    type: 'keyvalue',
    name: '键值对',
    icon: <FileText size={16} />,
    category: 'advanced',
    description: '标题+描述的列表',
    defaultConfig: {},
  },
  {
    type: 'table',
    name: '表格',
    icon: <Table2 size={16} />,
    category: 'advanced',
    description: '多列数据表格',
    defaultConfig: { columns: [] },
    configFields: [
      { key: 'columns', label: '列配置', type: 'columns', required: true },
    ],
  },
  {
    type: 'card-list',
    name: '卡片列表',
    icon: <LayoutGrid size={16} />,
    category: 'advanced',
    description: '卡片式的项目列表',
    defaultConfig: { cardFields: [] },
    configFields: [
      { key: 'cardFields', label: '卡片字段', type: 'columns' },
    ],
  },
  {
    type: 'character-card',
    name: '角色卡片',
    icon: <Users size={16} />,
    category: 'advanced',
    description: '预设的角色信息卡片（与角色列表样式一致）',
    defaultConfig: {}, // 使用专用渲染，无需cardFields配置
    configFields: [], // 预设字段，无需配置
  },
  {
    type: 'rank-system',
    name: '等级体系',
    icon: <TrendingUp size={16} />,
    category: 'advanced',
    description: '设定世界观的等级/境界体系',
    defaultConfig: {},
    configFields: [],
  },
  {
    type: 'faction',
    name: '势力',
    icon: <Building2 size={16} />,
    category: 'advanced',
    description: '管理势力/组织，支持层级结构',
    defaultConfig: {},
    configFields: [],
  },
  // 交互组件
  {
    type: 'tabs',
    name: '分页标签',
    icon: <LayoutGrid size={16} />,
    category: 'interactive',
    description: '多个标签页，每页可放置不同组件',
    defaultConfig: { tabs: [] },
  },
  {
    type: 'relation-graph',
    name: '关系图',
    icon: <GitBranch size={16} />,
    category: 'interactive',
    description: '节点和关系的可视化图谱',
    defaultConfig: { nodeTypes: [], relationTypes: [] },
    configFields: [
      { key: 'nodeTypes', label: '节点类型', type: 'nodeTypes' },
      { key: 'relationTypes', label: '关系类型', type: 'nodeTypes' },
    ],
  },
  {
    type: 'timeline',
    name: '时间线',
    icon: <Clock size={16} />,
    category: 'interactive',
    description: '按时间顺序的事件列表',
    defaultConfig: {},
  },
];

// ============ 预设模板 ============
// 注意：默认模板现在从数据库加载，不再在代码中定义
// 如果需要回退模板，可以从数据库加载系统模板（is_system=true）

// 从数据库加载默认模板的辅助函数
const loadDefaultTemplate = async (userTemplates?: WorkTemplate[]): Promise<TemplateConfig | null> => {
  try {
    // 先尝试从 userTemplates 中查找（如果已提供）
    let templates = userTemplates || [];
    let defaultTemplate = templates.find(t => t.id === 8) || templates.find(t => t.is_system) || templates[0];
    
    // 如果 userTemplates 中没有找到，再调用 API 获取
    if (!defaultTemplate) {
      templates = await templatesApi.listTemplates({
        work_type: 'novel',
        include_fields: false
      });
      
      // 优先查找模板ID为8的小说标准模板，如果没有则查找第一个系统模板
      defaultTemplate = templates.find(t => t.id === 8) || templates.find(t => t.is_system) || templates[0];
    }
    if (defaultTemplate) {
      console.log('📥 加载默认模板数据:', {
        id: defaultTemplate.id,
        name: defaultTemplate.name,
        has_template_config: !!defaultTemplate.template_config,
        template_config: defaultTemplate.template_config
      });
      
      // 检查 template_config 的结构
      let modules: ModuleConfig[] = [];
      
      if (defaultTemplate.template_config) {
        // 如果 template_config 直接是 modules 数组（向后兼容）
        if (Array.isArray(defaultTemplate.template_config)) {
          modules = defaultTemplate.template_config as ModuleConfig[];
        }
        // 如果 template_config 是对象，包含 modules 字段
        else if (defaultTemplate.template_config.modules && Array.isArray(defaultTemplate.template_config.modules)) {
          modules = defaultTemplate.template_config.modules as ModuleConfig[];
        }
      }
      
      if (modules.length > 0) {
        return {
          id: `db-${defaultTemplate.id}`,
          name: defaultTemplate.name,
          description: defaultTemplate.description || '',
          modules: modules
        };
      } else {
        console.warn('⚠️ 默认模板没有 modules，template_config:', defaultTemplate.template_config);
      }
    }
  } catch (error) {
    console.warn('加载默认模板失败:', error);
  }
  return null;
};

// 不再使用硬编码的模板，所有模板从数据库加载

// ============ 图标映射 ============

const IconMap: Record<string, React.ReactNode> = {
  'FileText': <FileText size={18} />,
  'Map': <Map size={18} />,
  'Users': <Users size={18} />,
  'Building2': <Building2 size={18} />,
  'Heart': <Heart size={18} />,
  'Zap': <Zap size={18} />,
  'Sparkles': <Sparkles size={18} />,
  'List': <List size={18} />,
  'Tag': <Tag size={18} />,
  'LayoutGrid': <LayoutGrid size={18} />,
  'GitBranch': <GitBranch size={18} />,
  'Clock': <Clock size={18} />,
};

// ============ 分页标签子组件 ============

interface TabsComponentProps {
  tabs: { id: string; label: string; components: ComponentConfig[] }[];
  moduleId: string;
  tabsComponentId: string;  // tabs组件的ID
  renderComponent: (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => React.ReactNode;
  onUpdateTabs?: (tabs: { id: string; label: string; components: ComponentConfig[] }[]) => void;
  onAddComponentToTab?: (tabId: string) => void;
  onEditComponentInTab?: (comp: ComponentConfig, tabId: string) => void;
  onGenerateComponent?: (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => void;
  generatingComponents?: Record<string, boolean>;
  isEditMode?: boolean;  // 是否处于编辑模式
}

function TabsComponent({ tabs, moduleId, tabsComponentId, renderComponent, onUpdateTabs, onAddComponentToTab, onEditComponentInTab, onGenerateComponent, generatingComponents = {}, isEditMode = false }: TabsComponentProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '');

  if (tabs.length === 0) {
    return <div className="comp-empty">暂无标签页</div>;
  }

  const activeTabData = tabs.find(t => t.id === activeTab);
  const activeTabIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="comp-tabs">
      <div className="tabs-header">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tabs-content">
        {activeTabData && (
          <>
            {activeTabData.components.map(subComp => {
              const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system'].includes(subComp.type);
              return (
                <div key={subComp.id} className="comp-wrapper">
                  <div className="comp-header">
                    <label className="comp-label">{subComp.label}</label>
                    <div className="comp-header-actions">
                      {showGenerateBtn && onGenerateComponent && (
                        <button 
                          className="comp-generate-btn" 
                          onClick={() => {
                            onGenerateComponent(subComp, moduleId, tabsComponentId, activeTab);
                          }}
                          disabled={generatingComponents[`${moduleId}-${subComp.id}-${tabsComponentId}-${activeTab}`]}
                          title={subComp.generatePrompt || '生成内容'}
                        >
                          <Sparkles size={14} />
                          <span>{generatingComponents[`${moduleId}-${subComp.id}-${tabsComponentId}-${activeTab}`] ? '生成中...' : '生成'}</span>
                        </button>
                      )}
                      {isEditMode && (
                        <>
                          <button
                            className="comp-edit-btn"
                            onClick={() => {
                              if (onEditComponentInTab) {
                                onEditComponentInTab(subComp, activeTab);
                              }
                            }}
                            title="编辑组件"
                          >
                            <Settings size={14} />
                          </button>
                          <button
                            className="comp-delete-btn"
                            onClick={() => {
                              if (onUpdateTabs && activeTabData) {
                                const newTabs = [...tabs];
                                newTabs[activeTabIndex] = {
                                  ...activeTabData,
                                  components: activeTabData.components.filter(c => c.id !== subComp.id)
                                };
                                onUpdateTabs(newTabs);
                              }
                            }}
                            title="删除组件"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {renderComponent(subComp, moduleId, tabsComponentId, activeTab)}
                </div>
              );
            })}
            {isEditMode && onAddComponentToTab && (
              <div className="tabs-add-component">
                <button
                  className="tabs-add-component-btn"
                  onClick={() => onAddComponentToTab(activeTab)}
                  title="在此分页中添加组件"
                >
                  <Plus size={16} />
                  <span>添加组件</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============ 数据依赖选择器组件 ============

interface DataDependenciesSelectorProps {
  value: string[];
  onChange: (deps: string[]) => void;
  template: TemplateConfig;
  currentComponentId?: string;
}

function DataDependenciesSelector({ value, onChange, template, currentComponentId }: DataDependenciesSelectorProps) {
  // 收集所有组件的 dataKey（排除当前组件）
  const availableDataKeys = useCallback(() => {
    const keys: { key: string; label: string; componentId: string }[] = [];
    
    const collectFromComponents = (components: ComponentConfig[], moduleName: string) => {
      for (const comp of components) {
        if (comp.dataKey && comp.id !== currentComponentId) {
          keys.push({
            key: comp.dataKey,
            label: `${moduleName} - ${comp.label} (${comp.dataKey})`,
            componentId: comp.id
          });
        }
        
        // 递归处理 tabs 中的组件
        if (comp.type === 'tabs' && comp.config?.tabs) {
          for (const tab of comp.config.tabs) {
            if (tab.components) {
              collectFromComponents(tab.components, `${moduleName} > ${tab.label}`);
            }
          }
        }
      }
    };
    
    for (const module of template.modules) {
      collectFromComponents(module.components, module.name);
    }
    
    return keys;
  }, [template, currentComponentId]);
  
  const dataKeys = availableDataKeys();
  const [newDepKey, setNewDepKey] = useState('');
  
  const handleAddDep = () => {
    if (newDepKey.trim() && !value.includes(newDepKey.trim())) {
      onChange([...value, newDepKey.trim()]);
      setNewDepKey('');
    }
  };
  
  const handleRemoveDep = (key: string) => {
    onChange(value.filter(k => k !== key));
  };
  
  return (
    <div className="data-dependencies-selector">
      <div className="deps-list">
        {value.map((key) => {
          const keyInfo = dataKeys.find(k => k.key === key);
          return (
            <div key={key} className="dep-tag">
              <span className="dep-key">{key}</span>
              {keyInfo && <span className="dep-label">{keyInfo.label}</span>}
              <button
                className="dep-remove"
                onClick={() => handleRemoveDep(key)}
                title="移除依赖"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      
      <div className="deps-add-row">
        {dataKeys.length > 0 ? (
          <select
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            className="deps-select"
          >
            <option value="">选择数据键...</option>
            {dataKeys
              .filter(k => !value.includes(k.key))
              .map(k => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
          </select>
        ) : (
          <input
            type="text"
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            placeholder="手动输入 dataKey"
            className="deps-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDepKey.trim() && !value.includes(newDepKey.trim())) {
                handleAddDep();
              }
            }}
          />
        )}
        {dataKeys.length > 0 && (
          <span className="deps-separator">或</span>
        )}
        {dataKeys.length > 0 && (
          <input
            type="text"
            value={newDepKey}
            onChange={(e) => setNewDepKey(e.target.value)}
            placeholder="手动输入 dataKey"
            className="deps-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDepKey.trim() && !value.includes(newDepKey.trim())) {
                handleAddDep();
              }
            }}
          />
        )}
        <button
          className="deps-add-btn"
          onClick={handleAddDep}
          disabled={!newDepKey.trim() || value.includes(newDepKey.trim())}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      
      {dataKeys.length === 0 && (
        <div className="deps-hint">暂无其他组件定义了 dataKey</div>
      )}
    </div>
  );
}

// ============ 主组件 ============

interface WorkInfoManagerProps {
  workId?: string | null;
  workData?: WorkData; // 可选的 workData，如果提供则避免重复请求
}

// 时间线角色选择器组件
interface TimelineCharacterSelectorProps {
  availableCharacters: Array<{ id: string; name: string }>;
  selectedCharacterIds: string[];
  selectedCharacters: string[];
  onSelectionChange: (characterIds: string[], characters: string[]) => void;
}

function TimelineCharacterSelector({
  availableCharacters,
  selectedCharacterIds,
  selectedCharacters,
  onSelectionChange
}: TimelineCharacterSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  
  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    }
    
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);
  
  // 过滤角色
  const filteredCharacters = availableCharacters.filter(char => {
    const matchesSearch = char.name.toLowerCase().includes(searchQuery.toLowerCase());
    const notSelected = !selectedCharacterIds.includes(char.id);
    return matchesSearch && notSelected;
  });
  
  // 计算下拉菜单位置（如果需要向上展开）
  useEffect(() => {
    if (isDropdownOpen && triggerRef.current && dropdownRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const dropdown = dropdownRef.current;
      const dropdownHeight = 300;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      
      // 如果下方空间不足且上方空间更大，则向上展开
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        dropdown.classList.add('timeline-character-dropdown-upward');
      } else {
        dropdown.classList.remove('timeline-character-dropdown-upward');
      }
    }
  }, [isDropdownOpen, filteredCharacters.length]);
  
  const handleRemoveCharacter = (charId: string) => {
    const newCharacterIds = selectedCharacterIds.filter(id => id !== charId);
    const newCharacters = selectedCharacters.filter((name, idx) => 
      selectedCharacterIds[idx] !== charId
    );
    onSelectionChange(newCharacterIds, newCharacters);
  };
  
  const handleAddCharacter = (char: { id: string; name: string }) => {
    onSelectionChange([...selectedCharacterIds, char.id], [...selectedCharacters, char.name]);
    setSearchQuery('');
  };
  
  return (
    <div className="timeline-characters-selector">
      <label className="timeline-characters-label">关联角色：</label>
      <div className="timeline-characters-tags">
        {selectedCharacterIds.map((charId) => {
          const char = availableCharacters.find(c => c.id === charId);
          if (!char) return null;
          return (
            <span key={charId} className="timeline-character-tag">
              {char.name}
              <button
                type="button"
                className="timeline-character-tag-remove"
                onClick={() => handleRemoveCharacter(charId)}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
      </div>
      <div className="timeline-character-dropdown-wrapper">
        <div
          ref={triggerRef}
          className="timeline-character-dropdown-trigger"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <span className="timeline-character-dropdown-text">
            {selectedCharacterIds.length > 0 ? `已选择 ${selectedCharacterIds.length} 个角色` : '选择角色'}
          </span>
          <ChevronDown size={16} className={`timeline-character-dropdown-arrow ${isDropdownOpen ? 'open' : ''}`} />
        </div>
        {isDropdownOpen && (
          <div ref={dropdownRef} className="timeline-character-dropdown">
            <div className="timeline-character-search">
              <Search size={16} className="timeline-character-search-icon" />
              <input
                type="text"
                className="timeline-character-search-input"
                placeholder="搜索角色..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  className="timeline-character-search-clear"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="timeline-character-dropdown-options">
              {filteredCharacters.length > 0 ? (
                filteredCharacters.map(char => (
                  <button
                    key={char.id}
                    type="button"
                    className="timeline-character-dropdown-option"
                    onClick={() => handleAddCharacter(char)}
                  >
                    <span>{char.name}</span>
                    <Plus size={14} />
                  </button>
                ))
              ) : (
                <div className="timeline-character-dropdown-empty">
                  {searchQuery ? '未找到匹配的角色' : '所有角色已选择'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkInfoManager(props: WorkInfoManagerProps = {}) {
  const { workId, workData } = props;
  // 初始化时尝试从缓存加载（基于 workId）
  const [template, setTemplate] = useState<TemplateConfig>(() => {
    // 初始状态：使用空模板，等待从数据库加载
    return {
      id: '',
      name: '加载中...',
      description: '',
      modules: []
    };
  });
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  // 保存进入编辑模式时的原始模板结构快照（用于比较是否有修改）
  const [originalTemplateSnapshot, setOriginalTemplateSnapshot] = useState<string | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [createTemplateForm, setCreateTemplateForm] = useState({
    name: '',
    description: '',
    work_type: 'novel',
    category: '',
    is_public: false
  });
  const [userTemplates, setUserTemplates] = useState<WorkTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showAddComponent, setShowAddComponent] = useState(false);
  const [addingToTab, setAddingToTab] = useState<{ tabId: string; componentId: string } | null>(null);
  // 跟踪每个时间线组件中正在编辑的事件ID：key 是组件ID，value 是正在编辑的事件ID
  const [editingTimelineEvents, setEditingTimelineEvents] = useState<{ [componentId: string]: string | null }>({});
  // 跟踪每个时间线事件的编辑表单数据：key 是 "组件ID-事件ID"，value 是编辑表单数据
  const [timelineEditForms, setTimelineEditForms] = useState<Record<string, TimelineEditForm>>({});
  const [newModuleForm, setNewModuleForm] = useState({ name: '', icon: 'LayoutGrid', color: '#64748b' });
  const [newComponentForm, setNewComponentForm] = useState<{
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
  }>({ type: 'text', label: '', config: {}, generatePrompt: '', validatePrompt: '', analysisPrompt: '', tabsConfig: [], cardFields: [], dataKey: '', dataDependencies: [] });
  const [addComponentStep, setAddComponentStep] = useState<'type' | 'config'>('type');
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editingComponentContext, setEditingComponentContext] = useState<{
    tabsComponentId?: string;
    tabId?: string;
  } | null>(null);
  const [newTabName, setNewTabName] = useState('');
  const [newCardFieldForm, setNewCardFieldForm] = useState({ label: '', type: 'text' as 'text' | 'textarea' | 'image' });
  const [newTagOption, setNewTagOption] = useState({ label: '', color: '#64748b' });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // 保存原始作品数据快照（用于比较是否有修改）
  const [originalWorkDataSnapshot, setOriginalWorkDataSnapshot] = useState<string | null>(null);
  
  // 角色编辑弹窗状态
  const [characterModal, setCharacterModal] = useState<{
    isOpen: boolean;
    compId: string;
    moduleId: string;
    editIndex: number | null;
    form: { name: string; gender: string; type: string; description: string };
    tabsComponentId?: string;  // 如果组件在分页中，保存分页组件的ID
    tabId?: string;  // 如果组件在分页中，保存分页ID
  }>({
    isOpen: false,
    compId: '',
    moduleId: '',
    editIndex: null,
    form: { name: '', gender: '男', type: '主要角色', description: '' }
  });
  
  // 势力编辑弹窗状态
  const [factionModal, setFactionModal] = useState<{
    isOpen: boolean;
    compId: string;
    moduleId: string;
    editId: string | null; // null表示新建
    parentId: string | null; // 父级势力ID
    form: { name: string; summary: string; details: string; levels: string[] };
    newLevel: string;
  }>({
    isOpen: false,
    compId: '',
    moduleId: '',
    editId: null,
    parentId: null,
    form: { name: '', summary: '', details: '', levels: [] },
    newLevel: ''
  });
  
  // 势力展开状态
  const [expandedFactions, setExpandedFactions] = useState<Record<string, boolean>>({});
  
  // 生成状态：key 是组件ID，value 是是否正在生成
  const [generatingComponents, setGeneratingComponents] = useState<Record<string, boolean>>({});
  
  // 生成数据预览弹窗状态
  const [generatePreviewModal, setGeneratePreviewModal] = useState<{
    isOpen: boolean;
    comp: ComponentConfig | null;
    moduleId: string;
    tabId?: string;
    generatedData: GeneratedDataType;
    existingData: GeneratedDataType;
    editingIndex: number | null; // 正在编辑的角色索引
    isGeneratingMore: boolean; // 是否正在继续生成
  }>({
    isOpen: false,
    comp: null,
    moduleId: '',
    generatedData: [],
    existingData: [],
    editingIndex: null,
    isGeneratingMore: false
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);

  const activeModule = template.modules[activeModuleIndex];

  // 当 workId 变化时，从数据库加载模板配置
  useEffect(() => {
    const loadTemplate = async () => {
      if (!workId) {
        // 如果没有 workId，从本地缓存加载，或从数据库加载默认模板
        const cached = loadFromCache(null);
        if (cached) {
          // 尝试从数据库加载对应的模板
          if (cached.templateId.startsWith('db-')) {
            try {
              const dbTemplateId = parseInt(cached.templateId.replace('db-', ''));
              // 先尝试从 userTemplates 中查找（如果已加载）
              let dbTemplate = userTemplates.find(t => t.id === dbTemplateId);
              
              // 如果 userTemplates 中找不到，再调用 API 获取
              if (!dbTemplate) {
                const templates = await templatesApi.listTemplates({
                  work_type: 'novel',
                  include_fields: false
                });
                dbTemplate = templates.find(t => t.id === dbTemplateId);
              }
              if (dbTemplate) {
                console.log('📥 从缓存加载时获取的模板数据:', {
                  id: dbTemplate.id,
                  name: dbTemplate.name,
                  has_template_config: !!dbTemplate.template_config,
                  template_config: dbTemplate.template_config
                });
                
                // 提取 modules
                let dbModules: ModuleConfig[] = [];
                if (dbTemplate.template_config) {
                  if (Array.isArray(dbTemplate.template_config)) {
                    dbModules = dbTemplate.template_config as ModuleConfig[];
                  } else if (dbTemplate.template_config.modules && Array.isArray(dbTemplate.template_config.modules)) {
                    dbModules = dbTemplate.template_config.modules as ModuleConfig[];
                  }
                }
                
                if (dbModules.length > 0) {
                  setTemplate({
                    id: `db-${dbTemplate.id}`,
                    name: dbTemplate.name,
                    description: dbTemplate.description || '',
                    modules: writeComponentDataToTemplate(
                      dbModules,
                      cached.modules ? extractComponentDataFromTemplate(cached.modules) : {}
                    )
                  });
                  return;
                } else {
                  console.warn('⚠️ 数据库模板没有 modules，template_config:', dbTemplate.template_config);
                }
              }
            } catch (error) {
              console.warn('从数据库加载缓存模板失败:', error);
            }
          }
        }
        
        // 如果没有缓存或加载失败，从数据库加载默认模板
        const defaultTemplate = await loadDefaultTemplate(userTemplates);
        if (defaultTemplate) {
          setTemplate(defaultTemplate);
        } else {
          // 如果数据库也没有，使用空模板
          setTemplate({
            id: '',
            name: '无模板',
            description: '请从数据库加载模板',
            modules: []
          });
        }
        return;
      }

      try {
        // 从作品的 metadata 字段加载模板配置
        // 必须提供 workData prop，不再调用 API
        if (!workData) {
          console.warn('WorkInfoManager: workData 未提供，跳过模板配置加载');
          return;
        }
        const templateConfig = workData.metadata?.template_config;
        const componentData = workData.metadata?.component_data || {};
        
        // 初始化原始作品数据快照（用于比较是否有修改）
        // 注意：这里保存的是从数据库加载的原始数据，用于后续比较
        const initialDataStr = JSON.stringify({
          component_data: componentData
        });
        setOriginalWorkDataSnapshot(initialDataStr);
        console.log('📸 初始化原始数据快照:', {
          componentDataKeys: Object.keys(componentData),
          snapshotLength: initialDataStr.length
        });
        
        if (templateConfig && 
            templateConfig.templateId && 
            templateConfig.modules &&
            Array.isArray(templateConfig.modules)) {
          // 从作品 metadata 加载成功
          
          
          
          
          // 所有模板都从数据库加载（不再使用预设模板）
          let baseTemplate: TemplateConfig | null = null;
          
          // 如果是数据库模板（db-*），从 work_template 表加载（包含完整的 dataKey 配置）
          if (templateConfig.templateId && templateConfig.templateId.startsWith('db-')) {
            try {
              const dbTemplateId = parseInt(templateConfig.templateId.replace('db-', ''));
              // 尝试从 userTemplates 中查找（如果已加载）
              let dbTemplate = userTemplates.find(t => t.id === dbTemplateId);
              
              // 如果 userTemplates 中找不到，直接调用 API 获取
              if (!dbTemplate) {
                try {
                  const templates = await templatesApi.listTemplates({
                    work_type: 'novel',
                    include_fields: false
                  });
                  dbTemplate = templates.find(t => t.id === dbTemplateId);
                } catch (error) {
                  console.warn('从 API 获取模板失败:', error);
                }
              }
              
              if (dbTemplate) {
                console.log('📥 从数据库获取的模板数据:', {
                  id: dbTemplate.id,
                  name: dbTemplate.name,
                  has_template_config: !!dbTemplate.template_config,
                  template_config_keys: dbTemplate.template_config ? Object.keys(dbTemplate.template_config) : [],
                  template_config: dbTemplate.template_config
                });
                
                // 检查 template_config 的结构
                // template_config 可能直接包含 modules，或者是一个对象包含 modules
                let dbModules: ModuleConfig[] = [];
                
                if (dbTemplate.template_config) {
                  // 如果 template_config 直接是 modules 数组（向后兼容）
                  if (Array.isArray(dbTemplate.template_config)) {
                    dbModules = dbTemplate.template_config as ModuleConfig[];
                  }
                  // 如果 template_config 是对象，包含 modules 字段
                  else if (dbTemplate.template_config.modules && Array.isArray(dbTemplate.template_config.modules)) {
                    dbModules = dbTemplate.template_config.modules as ModuleConfig[];
                  }
                  // 如果 template_config 是对象但没有 modules，可能是旧格式
                  else if (typeof dbTemplate.template_config === 'object') {
                    console.warn('⚠️ template_config 存在但不是预期的格式:', dbTemplate.template_config);
                  }
                }
                
                if (dbModules.length > 0) {
                  // 加载 prompt 内容（支持取消）
                  const modulesWithPrompts = await loadPromptsForComponents(dbModules);
                  // 从 work_template 表加载模板结构（包含 dataKey）
                  baseTemplate = {
                    id: `db-${dbTemplate.id}`,
                    name: dbTemplate.name,
                    description: dbTemplate.description || '',
                    modules: modulesWithPrompts
                  };
                  console.log(`✅ 从 work_template 表加载模板结构: ${dbTemplate.name}，包含 ${dbModules.length} 个模块`);
                  // 使用 work_template 表中的模板结构，而不是 metadata 中的
                  templateConfig.modules = modulesWithPrompts;
                } else {
                  console.warn('⚠️ work_template 表中没有找到 modules，template_config:', dbTemplate.template_config);
                }
              } else {
                console.warn('⚠️ 未找到数据库模板，templateId:', templateConfig.templateId);
              }
            } catch (error) {
              console.warn('从 work_template 表加载模板失败:', error);
            }
          }
          
          // 如果 templateId 不是 db-* 格式，但 templateConfig.modules 存在，使用它
          if (!baseTemplate && templateConfig.modules && Array.isArray(templateConfig.modules) && templateConfig.modules.length > 0) {
            console.log(`📥 使用 templateConfig.modules（templateId: ${templateConfig.templateId}），共 ${templateConfig.modules.length} 个模块`);
            // 加载 prompt 内容
            const modulesWithPrompts = await loadPromptsForComponents(templateConfig.modules);
            baseTemplate = {
              id: templateConfig.templateId,
              name: '作品模板',
              description: '',
              modules: modulesWithPrompts
            };
          }
          
          // 如果还是找不到，从数据库加载默认模板
          if (!baseTemplate) {
            const defaultTemplate = await loadDefaultTemplate(userTemplates);
            if (defaultTemplate) {
              // 加载 prompt 内容
              const modulesWithPrompts = await loadPromptsForComponents(defaultTemplate.modules);
              baseTemplate = {
                ...defaultTemplate,
                modules: modulesWithPrompts
              };
            } else {
              // 最后的回退：使用空模板（应该不会发生，因为数据库应该有默认模板）
              console.warn('⚠️ 无法从数据库加载默认模板，使用空模板');
              baseTemplate = {
                id: '',
                name: '无模板',
                description: '请从数据库加载模板',
                modules: []
              };
            }
          }
          
          // 使用 component_data 中的组件数据
          const dataToWrite: Record<string, unknown> = { ...componentData };
          const charactersValue = dataToWrite['characters'];
          const charactersCount = Array.isArray(charactersValue) ? charactersValue.length : 0;
          
          console.log('📥 准备写入的组件数据:', {
            componentDataKeys: Object.keys(componentData),
            dataToWriteKeys: Object.keys(dataToWrite),
            charactersCount,
            componentDataSample: Object.keys(componentData).slice(0, 3).reduce((acc, key) => {
              acc[key] = Array.isArray(componentData[key]) 
                ? `数组(${componentData[key].length}项)` 
                : typeof componentData[key] === 'object' 
                  ? `对象(${Object.keys(componentData[key] || {}).length}键)` 
                  : componentData[key];
              return acc;
            }, {} as Record<string, unknown>)
          });
          
          // 将简化格式的组件数据写入模板格式
          // 优先使用 baseTemplate（从数据库加载的模板结构），如果没有则使用 templateConfig.modules
          let modules: ModuleConfig[] = [];
          if (baseTemplate && baseTemplate.modules) {
            modules = baseTemplate.modules;
            console.log(`📥 使用 baseTemplate 的模块结构，共 ${modules.length} 个模块`);
          } else if (templateConfig.modules && Array.isArray(templateConfig.modules)) {
            // 加载 prompt 内容
            modules = await loadPromptsForComponents(templateConfig.modules);
            console.log(`📥 使用 templateConfig.modules，共 ${modules.length} 个模块`);
          } else {
            console.warn('⚠️ 没有找到模块结构，baseTemplate:', baseTemplate, 'templateConfig.modules:', templateConfig.modules);
            modules = [];
          }
          
          // 确保 modules 中的 prompt 内容已加载（如果 baseTemplate 已经加载过，这里不会重复加载）
          await loadPromptsForComponents(modules);
          
          // 不再使用预设模板补充，所有配置都应该在数据库中
          // 如果数据库模板缺少配置，需要重新运行初始化脚本或更新数据库
          
          // 验证加载的模块配置中是否包含 dataKey 和 dataDependencies
          const validateLoadedModules = (components: ComponentConfig[], path: string = ''): void => {
            for (const comp of components) {
              const currentPath = path ? `${path} > ${comp.label || comp.id}` : comp.label || comp.id;
              if (comp.dataKey) {
                console.log(`✅ 加载 - 组件 "${currentPath}": dataKey="${comp.dataKey}", dataDependencies=${JSON.stringify(comp.dataDependencies || [])}`);
              }
              // 递归检查 tabs 中的组件
              if (comp.type === 'tabs' && comp.config?.tabs) {
                for (const tab of comp.config.tabs) {
                  if (tab.components) {
                    validateLoadedModules(tab.components, `${currentPath} > ${tab.label || tab.id}`);
                  }
                }
              }
            }
          };
          
          console.log('🔍 验证从数据库加载的模板配置中的 dataKey 和 dataDependencies:');
          for (const module of modules) {
            validateLoadedModules(module.components, module.name);
          }
          
          if (Object.keys(dataToWrite).length > 0) {
            console.log('📤 开始写入组件数据到模板');
            console.log('   数据键:', Object.keys(dataToWrite));
            console.log('   模块数量:', modules.length);
            console.log('   每个模块的组件数量:', modules.map(m => ({ name: m.name, componentCount: m.components.length })));
            
            modules = writeComponentDataToTemplate(modules, dataToWrite);
            console.log('✅ 从 metadata 将', Object.keys(dataToWrite).length, '个组件的数据写入模板格式');
            
            // 验证写入后的数据
            const verifyDataWritten = (components: ComponentConfig[], path: string = ''): void => {
              for (const comp of components) {
                const currentPath = path ? `${path} > ${comp.label || comp.id}` : comp.label || comp.id;
                const storageKey = comp.dataKey || comp.id;
                if (dataToWrite[storageKey] !== undefined) {
                  const hasValue = comp.value !== undefined && comp.value !== null;
                  const valueType = Array.isArray(comp.value) 
                    ? `数组(${comp.value.length}项)` 
                    : typeof comp.value === 'object' 
                      ? `对象(${Object.keys(comp.value || {}).length}键)` 
                      : typeof comp.value;
                  console.log(`✅ 数据已写入 - 组件 "${currentPath}" (dataKey: ${storageKey}): ${hasValue ? valueType : '无值'}`);
                }
                // 递归检查 tabs 中的组件
                if (comp.type === 'tabs' && comp.config?.tabs) {
                  for (const tab of comp.config.tabs) {
                    if (tab.components) {
                      verifyDataWritten(tab.components, `${currentPath} > ${tab.label || tab.id}`);
                    }
                  }
                }
              }
            };
            console.log('🔍 验证写入后的数据:');
            for (const module of modules) {
              verifyDataWritten(module.components, module.name);
            }
            
            // 再次验证写入后的模块配置
            console.log('🔍 验证写入数据后的模板配置中的 dataKey 和 dataDependencies:');
            for (const module of modules) {
              validateLoadedModules(module.components, module.name);
            }
          }
          
          setTemplate({
            ...baseTemplate,
            modules: modules
          });
          
          // 同时更新本地缓存（使用模板ID作为key的一部分）
          saveToCache({
            templateId: templateConfig.templateId,
            modules: modules,
            lastModified: Date.now()
          }, workId, templateConfig.templateId);
        } else {
          
          // 数据库中没有，尝试从本地缓存加载，或从数据库加载默认模板
          const cached = loadFromCache(workId);
          if (cached) {
            // 尝试从数据库加载对应的模板
            if (cached.templateId.startsWith('db-')) {
              try {
                const dbTemplateId = parseInt(cached.templateId.replace('db-', ''));
                // 先尝试从 userTemplates 中查找（如果已加载）
                let dbTemplate = userTemplates.find(t => t.id === dbTemplateId);
                
                // 如果 userTemplates 中找不到，再调用 API 获取
                if (!dbTemplate) {
                  const templates = await templatesApi.listTemplates({
                    work_type: 'novel',
                    include_fields: false
                  });
                  dbTemplate = templates.find(t => t.id === dbTemplateId);
                }
                if (dbTemplate) {
                  console.log('📥 从缓存加载时获取的模板数据:', {
                    id: dbTemplate.id,
                    name: dbTemplate.name,
                    has_template_config: !!dbTemplate.template_config,
                    template_config: dbTemplate.template_config
                  });
                  
                  // 提取 modules
                  let dbModules: ModuleConfig[] = [];
                  if (dbTemplate.template_config) {
                    if (Array.isArray(dbTemplate.template_config)) {
                      dbModules = dbTemplate.template_config as ModuleConfig[];
                    } else if (dbTemplate.template_config.modules && Array.isArray(dbTemplate.template_config.modules)) {
                      dbModules = dbTemplate.template_config.modules as ModuleConfig[];
                    }
                  }
                  
                  if (dbModules.length > 0) {
                    // 加载 prompt 内容
                    const modulesWithPrompts = await loadPromptsForComponents(dbModules);
                    setTemplate({
                      id: `db-${dbTemplate.id}`,
                      name: dbTemplate.name,
                      description: dbTemplate.description || '',
                      modules: writeComponentDataToTemplate(
                        modulesWithPrompts,
                        cached.modules ? extractComponentDataFromTemplate(cached.modules) : {}
                      )
                    });
                    saveToCache(cached, workId, cached.templateId);
                    return;
                  } else {
                    console.warn('⚠️ 数据库模板没有 modules，template_config:', dbTemplate.template_config);
                  }
                }
              } catch (error) {
                console.warn('从数据库加载缓存模板失败:', error);
              }
            }
          }
          
          // 如果没有缓存或加载失败，从数据库加载默认模板
          const defaultTemplate = await loadDefaultTemplate();
          if (defaultTemplate) {
            setTemplate(defaultTemplate);
          } else {
            setTemplate({
              id: '',
              name: '无模板',
              description: '请从数据库加载模板',
              modules: []
            });
          }
        }
      } catch (error) {
        // 静默处理模板配置加载失败，回退到本地缓存
        // 只在开发模式下输出详细错误信息
        if (import.meta.env.DEV) {
          console.warn('加载模板配置失败（使用本地缓存）:', error instanceof Error ? error.message : error);
        }
        // 加载失败，从本地缓存加载，或从数据库加载默认模板
        const cached = loadFromCache(workId);
        if (cached) {
          // 尝试从数据库加载对应的模板
          if (cached.templateId.startsWith('db-')) {
            try {
              const dbTemplateId = parseInt(cached.templateId.replace('db-', ''));
              // 先尝试从 userTemplates 中查找（如果已加载）
              let dbTemplate = userTemplates.find(t => t.id === dbTemplateId);
              
              // 如果 userTemplates 中找不到，再调用 API 获取
              if (!dbTemplate) {
                const templates = await templatesApi.listTemplates({
                  work_type: 'novel',
                  include_fields: false
                });
                dbTemplate = templates.find(t => t.id === dbTemplateId);
              }
              if (dbTemplate) {
                console.log('📥 从缓存加载时获取的模板数据:', {
                  id: dbTemplate.id,
                  name: dbTemplate.name,
                  has_template_config: !!dbTemplate.template_config,
                  template_config: dbTemplate.template_config
                });
                
                // 提取 modules
                let dbModules: ModuleConfig[] = [];
                if (dbTemplate.template_config) {
                  if (Array.isArray(dbTemplate.template_config)) {
                    dbModules = dbTemplate.template_config as ModuleConfig[];
                  } else if (dbTemplate.template_config.modules && Array.isArray(dbTemplate.template_config.modules)) {
                    dbModules = dbTemplate.template_config.modules as ModuleConfig[];
                  }
                }
                
                if (dbModules.length > 0) {
                  setTemplate({
                    id: `db-${dbTemplate.id}`,
                    name: dbTemplate.name,
                    description: dbTemplate.description || '',
                    modules: writeComponentDataToTemplate(
                      dbModules,
                      cached.modules ? extractComponentDataFromTemplate(cached.modules) : {}
                    )
                  });
                  return;
                } else {
                  console.warn('⚠️ 数据库模板没有 modules，template_config:', dbTemplate.template_config);
                }
              }
            } catch (error) {
              console.warn('从数据库加载缓存模板失败:', error);
            }
          }
        }
        
        // 如果没有缓存或加载失败，从数据库加载默认模板
        const defaultTemplate = await loadDefaultTemplate(userTemplates);
        if (defaultTemplate) {
          setTemplate(defaultTemplate);
        } else {
          setTemplate({
            id: '',
            name: '无模板',
            description: '请从数据库加载模板',
            modules: []
          });
        }
      }
    };

    loadTemplate();
  }, [workId, workData, extractComponentDataFromTemplate, userTemplates, writeComponentDataToTemplate]);





  // 保存作品信息到 metadata（包括模板配置和所有组件数据）
  const saveWorkInfoToMetadata = useCallback(async (template: TemplateConfig, originalSnapshot: string | null) => {
    if (!workId) {
      return false;
    }

    try {
      // 直接从模板格式中提取所有组件数据（简化格式），不请求数据库
      const componentDataFromTemplate = extractComponentDataFromTemplate(template.modules);
      console.log('📥 从模板中提取到组件数据:', Object.keys(componentDataFromTemplate).length, '个组件');
      
      // 使用模板中的组件数据（不再合并数据库数据，直接保存当前模板中的数据）
      const mergedComponentData: Record<string, unknown> = { ...componentDataFromTemplate };
      
      console.log('✅ 共有', Object.keys(mergedComponentData).length, '个组件的数据');
      
      // 将合并后的组件数据写回模板格式
      const modulesWithData = writeComponentDataToTemplate(template.modules, mergedComponentData);
      
      // 验证 dataKey 和 dataDependencies 是否被保留
      const validateComponentConfig = (components: ComponentConfig[]): void => {
        for (const comp of components) {
          if (comp.type === 'tabs' && comp.config?.tabs) {
            for (const tab of comp.config.tabs) {
              if (tab.components) {
                validateComponentConfig(tab.components);
              }
            }
          } else {
            // 检查有 dataKey 的组件是否保留了 dataKey 和 dataDependencies
            if (comp.dataKey) {
              console.log(`✅ 组件 "${comp.label}" (${comp.id}): dataKey="${comp.dataKey}", dataDependencies=${JSON.stringify(comp.dataDependencies || [])}`);
            }
          }
        }
      };
      
      // 验证所有模块的组件配置
      console.log('🔍 验证保存的模板配置中的 dataKey 和 dataDependencies:');
      for (const module of modulesWithData) {
        validateComponentConfig(module.components);
      }
      
      // 清理模板结构（移除 value 字段，只保留配置信息，包括 dataKey 和 dataDependencies）
      const cleanedModules = cleanTemplateStructure(template.modules);
      
      // 注意：模板结构的更新由 saveTemplateStructure 函数单独处理，这里不再更新
      // 这样可以避免重复保存模板结构
      
      // 构建要更新的 metadata
      const metadataUpdate: Record<string, unknown> = {
        // 保存模板配置（包括 templateId 和完整的 modules 结构，确保 dataKey 和 dataDependencies 被保存）
        template_config: {
          templateId: template.id, // 指向 work_template 的 ID（如 db-1 表示 work_template 表中 id=1）
          modules: cleanedModules, // 保存完整的模块结构，包括所有组件的 dataKey 和 dataDependencies
          lastModified: Date.now()
        },
        // 保存简化格式的组件数据（使用 dataKey 作为键）
        component_data: mergedComponentData
      };

      // 如果有原始快照，比较是否有修改（只比较 component_data，因为 template_config 由 saveTemplateStructure 处理）
      if (originalSnapshot) {
        const currentDataStr = JSON.stringify({
          component_data: mergedComponentData
        });
        
        console.log('🔍 比较数据变化:');
        console.log('   原始快照长度:', originalSnapshot.length);
        console.log('   当前数据长度:', currentDataStr.length);
        
        try {
          const originalData = JSON.parse(originalSnapshot) as { component_data?: Record<string, unknown> };
          console.log('   原始 component_data keys:', originalData.component_data ? Object.keys(originalData.component_data) : []);
          console.log('   当前 component_data keys:', Object.keys(mergedComponentData));
          
          if (currentDataStr === originalSnapshot) {
            console.log('ℹ️ 作品数据未修改，跳过保存');
            return false; // 没有修改，不需要保存
          } else {
            console.log('✅ 检测到数据变化，需要保存');
            // 显示变化的详细信息
            const originalKeys = Object.keys(originalData.component_data || {});
            const currentKeys = Object.keys(mergedComponentData);
            const addedKeys = currentKeys.filter(k => !originalKeys.includes(k));
            const removedKeys = originalKeys.filter(k => !currentKeys.includes(k));
            if (addedKeys.length > 0) console.log('   新增的键:', addedKeys);
            if (removedKeys.length > 0) console.log('   删除的键:', removedKeys);
            // 比较每个键的值
            currentKeys.forEach(key => {
              if (originalKeys.includes(key) && originalData.component_data) {
                const originalValue = JSON.stringify(originalData.component_data[key]);
                const currentValue = JSON.stringify(mergedComponentData[key]);
                if (originalValue !== currentValue) {
                  console.log(`   键 "${key}" 的值已变化`);
                }
              }
            });
          }
        } catch (e) {
          console.warn('比较数据时出错:', e);
          // 如果解析出错，假设数据已变化
        }
      }

      // 直接保存到数据库（PUT 请求会返回更新后的作品信息，后端会合并 metadata）
      await worksApi.updateWork(Number(workId), {
        metadata: metadataUpdate
      });

      console.log('✅ 作品信息已保存：模板结构（含 dataKey 和 dataDependencies）保存在 template_config.modules，组件数据保存在 component_data');
      
      // 验证保存的 dataKey
      const savedDataKeys: string[] = [];
      const extractDataKeys = (components: ComponentConfig[]): void => {
        for (const comp of components) {
          if (comp.dataKey) {
            savedDataKeys.push(`${comp.label || comp.id}: ${comp.dataKey}`);
          }
          if (comp.type === 'tabs' && comp.config?.tabs) {
            for (const tab of comp.config.tabs) {
              if (tab.components) {
                extractDataKeys(tab.components);
              }
            }
          }
        }
      };
      for (const module of cleanedModules) {
        extractDataKeys(module.components);
      }
      if (savedDataKeys.length > 0) {
        console.log(`✅ 已保存 ${savedDataKeys.length} 个组件的 dataKey:`, savedDataKeys);
      } else {
        console.warn('⚠️ 未找到任何 dataKey，请检查组件配置');
      }
      
      // 返回 true 表示保存成功
      return true;
    } catch (error) {
      console.error('❌ 保存作品信息到 metadata 失败:', error);
      throw error; // 重新抛出错误，让调用者处理
    }
  }, [workId, extractComponentDataFromTemplate, writeComponentDataToTemplate, cleanTemplateStructure]);

  // 递归保存组件 prompt 到 prompt_templates 表，并返回更新后的组件配置（只包含 prompt id）
  const saveComponentPrompts = useCallback(async (
    components: ComponentConfig[],
    templateId?: number
  ): Promise<ComponentConfig[]> => {
    const updatedComponents: ComponentConfig[] = [];
    
    for (const comp of components) {
      // 处理 tabs 组件的子组件
      if (comp.type === 'tabs' && comp.config?.tabs) {
        const updatedTabs = await Promise.all(
          comp.config.tabs.map(async (tab) => ({
            ...tab,
            components: await saveComponentPrompts(tab.components || [], templateId)
          }))
        );
        updatedComponents.push({
          ...comp,
          config: {
            ...comp.config,
            tabs: updatedTabs
          }
        });
        continue;
      }
      
      // 处理普通组件的 prompt
      const updatedComp: ComponentConfig = { ...comp };
      
      // 保存 generatePrompt
      if (comp.generatePrompt && comp.generatePrompt.trim()) {
        try {
          const promptTemplate = await promptTemplateApi.upsertComponentPrompt(
            comp.id,
            comp.type,
            'generate',
            comp.generatePrompt.trim(),
            templateId,
            comp.dataKey
          );
          updatedComp.generatePromptId = promptTemplate.id;
          // 保留 prompt 内容用于显示，但数据库中只存储 id
          // updatedComp.generatePrompt = undefined; // 不移除内容，保留用于显示
          console.log(`✅ 保存组件 ${comp.id} 的 generatePrompt 到 prompt_templates (id: ${promptTemplate.id})`);
        } catch (error) {
          console.error(`❌ 保存组件 ${comp.id} 的 generatePrompt 失败:`, error);
          // 如果保存失败，保留原始内容（向后兼容）
        }
      }
      
      // 保存 validatePrompt
      if (comp.validatePrompt && comp.validatePrompt.trim()) {
        try {
          const promptTemplate = await promptTemplateApi.upsertComponentPrompt(
            comp.id,
            comp.type,
            'validate',
            comp.validatePrompt.trim(),
            templateId,
            comp.dataKey
          );
          updatedComp.validatePromptId = promptTemplate.id;
          // 保留 prompt 内容用于显示，但数据库中只存储 id
          // updatedComp.validatePrompt = undefined; // 不移除内容，保留用于显示
          console.log(`✅ 保存组件 ${comp.id} 的 validatePrompt 到 prompt_templates (id: ${promptTemplate.id})`);
        } catch (error) {
          console.error(`❌ 保存组件 ${comp.id} 的 validatePrompt 失败:`, error);
          // 如果保存失败，保留原始内容（向后兼容）
        }
      }
      
      // 保存 analysisPrompt
      if (comp.analysisPrompt && comp.analysisPrompt.trim()) {
        try {
          const promptTemplate = await promptTemplateApi.upsertComponentPrompt(
            comp.id,
            comp.type,
            'analysis',
            comp.analysisPrompt.trim(),
            templateId,
            comp.dataKey
          );
          updatedComp.analysisPromptId = promptTemplate.id;
          // 保留 prompt 内容用于显示，但数据库中只存储 id
          // updatedComp.analysisPrompt = undefined; // 不移除内容，保留用于显示
          console.log(`✅ 保存组件 ${comp.id} 的 analysisPrompt 到 prompt_templates (id: ${promptTemplate.id})`);
        } catch (error) {
          console.error(`❌ 保存组件 ${comp.id} 的 analysisPrompt 失败:`, error);
          // 如果保存失败，保留原始内容（向后兼容）
        }
      }
      
      updatedComponents.push(updatedComp);
    }
    
    return updatedComponents;
  }, []);

  // 保存模板结构到数据库（所有数据库模板都可以保存）
  const saveTemplateStructure = useCallback(async (originalSnapshot: string | null) => {
    if (!template || !template.id || !template.id.startsWith('db-')) {
      console.log('ℹ️ 模板 ID 不是数据库模板格式，跳过保存');
      return false; // 返回 false 表示没有保存
    }

    try {
      const dbTemplateId = parseInt(template.id.replace('db-', ''));
      if (isNaN(dbTemplateId)) {
        console.warn(`⚠️ 无法解析模板 ID: ${template.id}`);
        return false;
      }

      // 先保存所有组件的 prompt 到 prompt_templates 表，并获取更新后的组件配置（只包含 prompt id）
      console.log('📤 保存组件 prompt 到 prompt_templates 表...');
      const modulesWithPromptIds = await Promise.all(
        template.modules.map(async (module) => ({
          ...module,
          components: await saveComponentPrompts(module.components, dbTemplateId)
        }))
      );
      
      // 更新 template state，保留 prompt 内容用于显示（但数据库中只存储 id）
      setTemplate(prev => ({
        ...prev,
        modules: modulesWithPromptIds
      }));
      
      // 清理模板结构（移除 value 字段，只保留配置信息，包括 dataKey 和 dataDependencies）
      const cleanedModules = cleanTemplateStructure(modulesWithPromptIds);
      const currentModulesStr = JSON.stringify(cleanedModules);
      
      // 如果有原始快照，比较是否有修改
      if (originalSnapshot && currentModulesStr === originalSnapshot) {
        console.log('ℹ️ 模板结构未修改，跳过保存');
        return false; // 没有修改，不需要保存
      }
      
      // 有修改，保存模板结构
      console.log(`📤 保存模板 ${dbTemplateId} 的结构到数据库`);
      await templatesApi.updateTemplate(dbTemplateId, {
        template_config: {
          templateId: template.id,
          modules: cleanedModules
        }
      });
      console.log(`✅ 模板 ${dbTemplateId} 的结构已保存到数据库`);
      return true; // 返回 true 表示已保存
    } catch (error) {
      console.error('❌ 保存模板结构失败:', error);
      throw error;
    }
  }, [template, cleanTemplateStructure, saveComponentPrompts]);

  // 不再自动保存，改为手动保存
  // 当模板变化时，只标记为未保存状态
  useEffect(() => {
    // 如果模板为空或没有模块，不标记
    if (!template || !template.modules || template.modules.length === 0) {
      return;
    }

    // 标记为未保存状态，但不自动保存
    setHasUnsavedChanges(true);
  }, [template]);


  // 更新组件值
  const updateComponentValue = (moduleId: string, componentId: string, value: unknown, parentTabId?: string) => {
    setTemplate(prev => {
      const updated = {
        ...prev,
        modules: prev.modules.map(m => {
          if (m.id !== moduleId) return m;
          return {
            ...m,
            components: updateComponentInList(m.components, componentId, value, parentTabId)
          };
        })
      };
      // 如果是关系图谱组件，添加调试信息
      if (value && typeof value === 'object' && Array.isArray((value as { relations?: unknown[] }).relations)) {
        console.log(`✅ updateComponentValue: 更新关系图谱组件 ${componentId}，${(value as { relations: unknown[] }).relations.length} 个关系`, value);
      }
      
      // 不再自动保存，只标记为未保存状态
      // 用户需要手动点击保存按钮来保存
      
      return updated;
    });
  };

  const updateComponentInList = (components: ComponentConfig[], targetId: string, value: unknown, parentTabId?: string): ComponentConfig[] => {
    return components.map(comp => {
      if (comp.id === targetId) {
        return { ...comp, value };
      }
      // 递归处理 tabs 组件
      if (comp.type === 'tabs' && comp.config.tabs) {
        return {
          ...comp,
          config: {
            ...comp.config,
            tabs: comp.config.tabs.map(tab => ({
              ...tab,
              components: updateComponentInList(tab.components, targetId, value, parentTabId)
            }))
          }
        };
      }
      return comp;
    });
  };

  // 继续生成更多数据（在预览弹窗中）
  const handleContinueGenerate = async () => {
    if (!workId || !generatePreviewModal.comp) {
      return;
    }

    const comp = generatePreviewModal.comp;
    
    // 检查是否有生成prompt
    if (!comp.generatePromptId && !comp.generatePrompt) {
      alert('该组件未配置生成prompt，无法生成内容');
      return;
    }

    try {
      // 设置生成状态
      setGeneratePreviewModal(prev => ({ ...prev, isGeneratingMore: true }));

      // 调用生成API
      const result = await generateComponentData(
        Number(workId),
        comp.id,
        comp.dataKey || '',
        comp.generatePromptId,
        comp.generatePrompt,
        undefined, // chapterId，暂时不传
        undefined  // settings，使用默认设置
      );

      // 解析生成的数据
      let newGeneratedValue: GeneratedDataType = result.generated_data as GeneratedDataType;
      
      // 根据组件类型处理生成的数据
      if (comp.type === 'text' || comp.type === 'textarea') {
        // 文本类型：追加到现有生成数据
        const existingText = typeof generatePreviewModal.generatedData === 'string' 
          ? generatePreviewModal.generatedData 
          : '';
        newGeneratedValue = existingText + '\n\n' + (newGeneratedValue as string).trim();
      } else if (comp.type === 'list') {
        // 列表类型：尝试解析为数组，如果失败则按行分割
        try {
          const parsed = JSON.parse(String(newGeneratedValue || ''));
          if (Array.isArray(parsed)) {
            newGeneratedValue = parsed;
          } else {
            newGeneratedValue = (newGeneratedValue as string).split('\n').filter((line: string) => line.trim());
          }
        } catch {
          newGeneratedValue = (newGeneratedValue as string).split('\n').filter((line: string) => line.trim());
        }
        // 追加到现有生成数据
        const existingList = Array.isArray(generatePreviewModal.generatedData) 
          ? generatePreviewModal.generatedData 
          : [];
        const appended = Array.isArray(newGeneratedValue) ? newGeneratedValue : [];
        newGeneratedValue = [...existingList, ...appended];
      } else if (comp.type === 'character-card') {
        // 角色卡片类型：尝试解析为对象数组
        try {
          const parsed = JSON.parse(newGeneratedValue as string);
          if (Array.isArray(parsed)) {
            newGeneratedValue = parsed;
          } else {
            newGeneratedValue = [parsed];
          }
        } catch {
          alert('生成的数据格式不正确，无法解析为角色列表。生成的内容：\n' + (newGeneratedValue as string).substring(0, 200));
          setGeneratePreviewModal(prev => ({ ...prev, isGeneratingMore: false }));
          return;
        }
        // 追加到现有生成数据
        const existingChars = Array.isArray(generatePreviewModal.generatedData) 
          ? generatePreviewModal.generatedData 
          : [];
        const appended = Array.isArray(newGeneratedValue) ? newGeneratedValue : [];
        newGeneratedValue = [...existingChars, ...appended];
      } else if (comp.type === 'rank-system') {
        // 等级体系类型：尝试解析为对象数组
        try {
          const parsed = JSON.parse(newGeneratedValue as string);
          if (Array.isArray(parsed)) {
            newGeneratedValue = parsed;
          } else {
            newGeneratedValue = [parsed];
          }
        } catch {
          alert('生成的数据格式不正确，无法解析为等级体系。生成的内容：\n' + String(newGeneratedValue || '').substring(0, 200));
          setGeneratePreviewModal(prev => ({ ...prev, isGeneratingMore: false }));
          return;
        }
        // 追加到现有生成数据
        const existingRanks: unknown[] = Array.isArray(generatePreviewModal.generatedData) 
          ? generatePreviewModal.generatedData 
          : [];
        const appended = Array.isArray(newGeneratedValue) ? newGeneratedValue : [];
        newGeneratedValue = [...existingRanks, ...appended];
      }

      // 更新生成数据，保持弹窗打开
      setGeneratePreviewModal(prev => ({
        ...prev,
        generatedData: newGeneratedValue,
        isGeneratingMore: false,
        editingIndex: null // 关闭编辑模式
      }));
      
      console.log(`✅ 继续生成完成，已追加到现有生成数据`);
    } catch (error) {
      console.error('继续生成失败:', error);
      alert(`继续生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setGeneratePreviewModal(prev => ({ ...prev, isGeneratingMore: false }));
    }
  };

  // 处理组件生成
  const handleGenerateComponent = async (
    comp: ComponentConfig,
    moduleId: string,
    tabsComponentId?: string,
    tabId?: string
  ) => {
    if (!workId) {
      alert('请先选择作品');
      return;
    }

    // 检查是否有生成prompt
    if (!comp.generatePromptId && !comp.generatePrompt) {
      alert('该组件未配置生成prompt，无法生成内容');
      return;
    }

    // 检查dataKey
    if (!comp.dataKey) {
      alert('该组件未配置dataKey，无法保存生成的数据');
      return;
    }

    const componentKey = `${moduleId}-${comp.id}${tabsComponentId ? `-${tabsComponentId}-${tabId}` : ''}`;
    
    try {
      // 设置生成状态
      setGeneratingComponents(prev => ({ ...prev, [componentKey]: true }));

      // 调用生成API
      const result = await generateComponentData(
        Number(workId),
        comp.id,
        comp.dataKey,
        comp.generatePromptId,
        comp.generatePrompt,
        undefined, // chapterId，暂时不传
        undefined  // settings，使用默认设置
      );

      // 解析生成的数据
      let generatedValue: GeneratedDataType = result.generated_data as GeneratedDataType;
      
      // 根据组件类型处理生成的数据
      if (comp.type === 'text' || comp.type === 'textarea') {
        // 文本类型直接使用生成的字符串
        generatedValue = typeof generatedValue === 'string' ? generatedValue.trim() : String(generatedValue || '').trim();
      } else if (comp.type === 'list') {
        // 列表类型：尝试解析为数组，如果失败则按行分割
        try {
          const parsed = JSON.parse(String(generatedValue || ''));
          if (Array.isArray(parsed)) {
            generatedValue = parsed;
          } else {
            // 如果不是数组，尝试按行分割
            generatedValue = (generatedValue as string).split('\n').filter((line: string) => line.trim());
          }
        } catch {
          // 解析失败，按行分割
          generatedValue = String(generatedValue || '').split('\n').filter((line: string) => line.trim());
        }
      } else if (comp.type === 'character-card') {
        // 角色卡片类型：尝试解析为对象数组
        try {
          const parsed = JSON.parse(String(generatedValue || ''));
          if (Array.isArray(parsed)) {
            generatedValue = parsed;
          } else {
            // 如果不是数组，尝试包装成数组
            generatedValue = [parsed];
          }
        } catch {
          // 解析失败，提示用户
          alert('生成的数据格式不正确，无法解析为角色列表。生成的内容：\n' + String(generatedValue || '').substring(0, 200));
          return;
        }
      } else if (comp.type === 'rank-system') {
        // 等级体系类型：尝试解析为对象数组
        try {
          const parsed = JSON.parse(String(generatedValue || ''));
          if (Array.isArray(parsed)) {
            generatedValue = parsed;
          } else {
            generatedValue = [parsed];
          }
        } catch {
          alert('生成的数据格式不正确，无法解析为等级体系。生成的内容：\n' + String(generatedValue || '').substring(0, 200));
          return;
        }
      }

      // 获取现有数据
      const existingValue: GeneratedDataType = comp.type === 'list' || comp.type === 'character-card' || comp.type === 'rank-system'
        ? (Array.isArray(comp.value) ? comp.value : [])
        : (typeof comp.value === 'string' ? comp.value : '');

      // 显示预览弹窗，让用户确认后再更新
      setGeneratePreviewModal({
        isOpen: true,
        comp: comp,
        moduleId: moduleId,
        tabId: tabId,
        generatedData: generatedValue,
        existingData: existingValue,
        editingIndex: null,
        isGeneratingMore: false
      });
      
      console.log(`✅ 组件 ${comp.label} 生成完成，等待用户确认`);
    } catch (error) {
      console.error('生成组件数据失败:', error);
      alert(`生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      // 清除生成状态
      setGeneratingComponents(prev => {
        const next = { ...prev };
        delete next[componentKey];
        return next;
      });
    }
  };

  // 加载用户模板列表
  useEffect(() => {
    const loadUserTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const templates = await templatesApi.listTemplates({
          work_type: 'novel',
          include_fields: false
        });
        
        setUserTemplates(templates || []);
      } catch (error) {
        // 静默处理模板列表加载失败，不影响主要功能
        // 只在开发模式下输出详细错误信息
        if (import.meta.env.DEV) {
          console.warn('加载模板列表失败（不影响使用）:', error instanceof Error ? error.message : error);
        }
        setUserTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };
    
    loadUserTemplates();
  }, []);

  // 当 userTemplates 加载完成后，重新加载模板配置（以便匹配数据库模板）
  useEffect(() => {
    if (workId && userTemplates.length > 0) {
      const reloadTemplate = async () => {
        try {
          // 从作品的 metadata 字段加载模板配置
          // 必须提供 workData prop，不再调用 API
          if (!workData) {
            console.warn('WorkInfoManager: workData 未提供，跳过模板配置重新加载');
            return;
          }
          const templateConfig = workData.metadata?.template_config;
          const templateId = typeof templateConfig === 'object' && templateConfig !== null && !Array.isArray(templateConfig)
            ? (templateConfig as { templateId?: string }).templateId
            : undefined;
          const modulesFromMetadata = getModulesFromTemplateConfig(templateConfig);
          
          if (templateId && modulesFromMetadata.length > 0) {
            // 检查是否是数据库模板
            if (templateId.startsWith('db-')) {
              const dbTemplateId = parseInt(templateId.replace('db-', ''));
              const dbTemplate = userTemplates.find(t => t.id === dbTemplateId);
              if (dbTemplate) {
                
                setTemplate({
                  id: `db-${dbTemplate.id}`,
                  name: dbTemplate.name,
                  description: dbTemplate.description || '',
                  modules: modulesFromMetadata
                });
              }
            }
          }
        } catch (error) {
          console.error('重新加载模板配置失败:', error);
        }
      };
      reloadTemplate();
    }
  }, [workId, workData, userTemplates, userTemplates.length]);

  // 应用模板 - 已移除未使用函数

  // 应用数据库模板
  const applyDatabaseTemplate = async (dbTemplate: { id: number; name: string; description?: string; template_config?: unknown }) => {
    try {
      
      
      // 如果有 workId，先保存当前编辑的内容（通过metadata保存）
      if (workId && template && template.modules) {
        try {
          await saveWorkInfoToMetadata(template, null);
        } catch (error) {
          console.error('切换模板前保存失败:', error);
          // 即使保存失败，也继续切换模板
        }
      }
      
      // 从数据库模板的 template_config 中提取配置
      const templateConfig = dbTemplate.template_config;
      const modules = getModulesFromTemplateConfig(templateConfig);
      
      
      
      const newTemplate: TemplateConfig = {
        id: `db-${dbTemplate.id}`,
        name: dbTemplate.name || '未命名模板',
        description: dbTemplate.description || '',
        modules: modules
      };
      
      
      
      // 如果有 workId，尝试从本地缓存加载该模板的保存内容
      if (workId && workData) {
        try {
          // 先检查当前作品使用的模板ID是否与新模板匹配
          // 必须提供 workData prop，不再调用 API
          const templateConfig = workData.metadata?.template_config;
          
          // 只有当模板ID匹配时，才加载保存的内容
          if (templateConfig && templateConfig.templateId === newTemplate.id) {
            // 优先从本地缓存加载（每个模板独立保存）
            const cached = loadFromCache(workId, newTemplate.id);
            if (cached && cached.modules && Array.isArray(cached.modules) && cached.modules.length > 0) {
              
              newTemplate.modules = cached.modules;
            } else {
              // 如果本地缓存没有，从 work 的 metadata 加载数据
              const componentData = workData.metadata?.component_data || {};
              
              // 使用 component_data 中的组件数据
              const dataToWrite = { ...componentData };
              
              // 从 work_template 获取结构（modules 应该只包含结构，不包含数据）
              let modules = newTemplate.modules; // 从模板获取结构
              
              // 如果 template_config 中有 modules，使用它（向后兼容）
              if (templateConfig.modules && 
                  Array.isArray(templateConfig.modules) &&
                  templateConfig.modules.length > 0) {
                // 使用保存的结构（应该不包含数据）
                modules = templateConfig.modules;
              }
              
              // 从 work 的 component_data 获取数据，然后合并到结构中
              if (Object.keys(dataToWrite).length > 0) {
                modules = writeComponentDataToTemplate(modules, dataToWrite);
                console.log('✅ 从 work 的 component_data 将', Object.keys(dataToWrite).length, '个组件的数据写入模板结构');
              }
              
              newTemplate.modules = modules;
              
              // 同时保存到本地缓存
              saveToCache({
                templateId: newTemplate.id,
                modules: modules,
                lastModified: Date.now()
              }, workId, newTemplate.id);
            }
          } else {
            // 模板ID不匹配，使用新模板的默认内容
            console.log('🔄 切换到新模板，使用模板默认内容');
          }
        } catch (error) {
          console.error('加载保存的模板内容失败:', error);
          // 加载失败，使用模板默认内容
        }
      }
      
      // 应用模板
      const copiedTemplate = JSON.parse(JSON.stringify(newTemplate));
      
      // 确保 modules 是数组
      if (!Array.isArray(copiedTemplate.modules)) {
        console.warn('模板 modules 不是数组，设置为空数组');
        copiedTemplate.modules = [];
      }
      
      setTemplate(copiedTemplate);
      setActiveModuleIndex(0);
      setShowTemplateSelector(false);
      
      
    } catch (error) {
      console.error('应用数据库模板失败:', error);
      alert('应用模板失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 创建新模板
  const handleCreateTemplate = async () => {
    if (!createTemplateForm.name.trim()) {
      alert('请输入模板名称');
      return;
    }

    try {
      // 验证模板配置中是否包含 dataKey 和 dataDependencies
      const validateTemplateConfig = (components: ComponentConfig[]): void => {
        for (const comp of components) {
          if (comp.type === 'tabs' && comp.config?.tabs) {
            for (const tab of comp.config.tabs) {
              if (tab.components) {
                validateTemplateConfig(tab.components);
              }
            }
          } else {
            if (comp.dataKey) {
              console.log(`✅ 创建模板 - 组件 "${comp.label}" (${comp.id}): dataKey="${comp.dataKey}", dataDependencies=${JSON.stringify(comp.dataDependencies || [])}`);
            }
          }
        }
      };
      
      console.log('🔍 验证创建模板时的 dataKey 和 dataDependencies:');
      for (const module of template.modules) {
        validateTemplateConfig(module.components);
      }
      
      // 清理模板结构，移除所有 value，只保留结构（包括 dataKey 和 dataDependencies）
      const cleanModules = cleanTemplateStructure(template.modules);
      
      const templateData = {
        name: createTemplateForm.name,
        description: createTemplateForm.description || undefined,
        work_type: createTemplateForm.work_type,
        category: createTemplateForm.category || undefined,
        is_public: createTemplateForm.is_public,
        template_config: {
          templateId: `custom-${Date.now()}`,
          modules: cleanModules  // 只保存结构（包括 dataKey 和 dataDependencies），不保存数据
        },
        settings: {},
        tags: []
      };

      console.log('📤 发送创建模板请求，template_config.modules 包含', template.modules.length, '个模块');
      const createdTemplate = await templatesApi.createTemplate(templateData);
      console.log('✅ 模板创建成功，ID:', createdTemplate.id);
      
      // 更新当前模板的 ID
      const newTemplate = {
        ...template,
        id: `db-${createdTemplate.id || Date.now()}`,
        name: createTemplateForm.name,
        description: createTemplateForm.description
      };
      setTemplate(newTemplate);
      
      // 重新加载模板列表
      try {
        const templates = await templatesApi.listTemplates({
          work_type: 'novel',
          include_fields: false
        });
        setUserTemplates(templates);
      } catch (error) {
        console.error('重新加载模板列表失败:', error);
      }
      
      // 关闭弹窗并重置表单
      setShowCreateTemplate(false);
      setShowTemplateSelector(false);
      setCreateTemplateForm({
        name: '',
        description: '',
        work_type: 'novel',
        category: '',
        is_public: false
      });
      
      alert('模板创建成功！');
    } catch (error) {
      console.error('创建模板失败:', error);
      alert('创建模板失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 添加模块
  const addModule = () => {
    if (!newModuleForm.name.trim()) return;
    const newModule: ModuleConfig = {
      id: `module-${Date.now()}`,
      name: newModuleForm.name.trim(),
      icon: newModuleForm.icon,
      color: newModuleForm.color,
      components: []
    };
    setTemplate(prev => ({ ...prev, modules: [...prev.modules, newModule] }));
    setActiveModuleIndex(template.modules.length);
    setShowAddModule(false);
    setNewModuleForm({ name: '', icon: 'LayoutGrid', color: '#64748b' });
  };

  // 删除模块
  const deleteModule = (index: number) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.filter((_, i) => i !== index)
    }));
    if (activeModuleIndex >= template.modules.length - 1) {
      setActiveModuleIndex(Math.max(0, activeModuleIndex - 1));
    }
  };

  // 添加组件到当前模块
  const addComponentToModule = () => {
    if (!newComponentForm.label.trim() || !activeModule) return;
    
    // 如果是 tabs 类型，必须至少有一个分页
    if (newComponentForm.type === 'tabs' && newComponentForm.tabsConfig.length === 0) {
      return;
    }
    
    // 如果是 card-list 类型，必须至少有一个字段
    if (newComponentForm.type === 'card-list' && newComponentForm.cardFields.length === 0) {
      return;
    }
    
    const compDef = componentRegistry.find(c => c.type === newComponentForm.type);
    
    // 构建配置
    const finalConfig = { ...compDef?.defaultConfig, ...newComponentForm.config };
    
    // 如果是 tabs 类型，转换 tabsConfig 为实际的 tabs 配置
    if (newComponentForm.type === 'tabs') {
      finalConfig.tabs = newComponentForm.tabsConfig.map(t => ({
        id: t.id,
        label: t.label,
        components: []
      }));
    }
    
    // 如果是 card-list 类型，设置 cardFields 配置
    if (newComponentForm.type === 'card-list') {
      finalConfig.cardFields = newComponentForm.cardFields.map(f => ({
        key: f.label.toLowerCase().replace(/\s+/g, '_'),
        label: f.label,
        type: f.type
      }));
    }
    
    const newComp: ComponentConfig = {
      id: `comp-${Date.now()}`,
      type: newComponentForm.type,
      label: newComponentForm.label.trim(),
      config: finalConfig,
      generatePrompt: newComponentForm.generatePrompt.trim() || undefined,
      validatePrompt: newComponentForm.validatePrompt.trim() || undefined,
      analysisPrompt: newComponentForm.analysisPrompt.trim() || undefined,
      // tabs 组件不需要 dataKey 和 dataDependencies
      dataKey: newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataKey.trim() || undefined),
      dataDependencies: newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataDependencies.length > 0 ? newComponentForm.dataDependencies : undefined),
      value: getDefaultValue(newComponentForm.type),
    };
    
    // 如果是要添加到分页中
    if (addingToTab) {
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map(m => {
          return {
            ...m,
            components: m.components.map(comp => {
              if (comp.id === addingToTab.componentId && comp.type === 'tabs' && comp.config.tabs) {
                return {
                  ...comp,
                  config: {
                    ...comp.config,
                    tabs: comp.config.tabs.map(tab => {
                      if (tab.id === addingToTab.tabId) {
                        return {
                          ...tab,
                          components: [...tab.components, newComp]
                        };
                      }
                      return tab;
                    })
                  }
                };
              }
              return comp;
            })
          };
        })
      }));
      setAddingToTab(null);
    } else {
      // 添加到模块中
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map((m, i) => 
          i === activeModuleIndex 
            ? { ...m, components: [...m.components, newComp] }
            : m
        )
      }));
    }
    closeAddComponentModal();
  };

  // 关闭添加/编辑组件弹窗
  const closeAddComponentModal = () => {
    setShowAddComponent(false);
    setAddComponentStep('type');
    setEditingComponentId(null);
    setEditingComponentContext(null);
    setAddingToTab(null);
    setNewComponentForm({ type: 'text', label: '', config: {}, generatePrompt: '', validatePrompt: '', analysisPrompt: '', tabsConfig: [], cardFields: [], dataKey: '', dataDependencies: [] });
    setNewTabName('');
    setNewCardFieldForm({ label: '', type: 'text' });
    setNewTagOption({ label: '', color: '#64748b' });
  };

  // 关闭添加模块弹窗
  const closeAddModuleModal = () => {
    setShowAddModule(false);
    setNewModuleForm({ name: '', icon: 'LayoutGrid', color: '#64748b' });
  };

  // 选择组件类型后进入配置步骤
  const selectComponentType = (type: ComponentType) => {
    const compDef = componentRegistry.find(c => c.type === type);
    setNewComponentForm(prev => ({ 
      ...prev, 
      type, 
      config: { ...compDef?.defaultConfig } 
    }));
    setAddComponentStep('config');
  };

  // 开始编辑组件
  const startEditComponent = async (comp: ComponentConfig, tabsComponentId?: string, tabId?: string) => {
    setEditingComponentId(comp.id);
    setEditingComponentContext(tabsComponentId && tabId ? { tabsComponentId, tabId } : null);
    
    // 如果是 tabs 类型，提取 tabsConfig
    const tabsConfig = comp.type === 'tabs' && comp.config.tabs
      ? comp.config.tabs.map((t: { id: string; label: string }) => ({ id: t.id, label: t.label }))
      : [];
    
    // 如果是 card-list 类型，提取 cardFields
    const cardFields: Array<{ key: string; label: string; type: 'text' | 'textarea' | 'image' }> = comp.type === 'card-list' && comp.config.cardFields
      ? comp.config.cardFields.map((f: { key: string; label: string; type: string }) => {
          const type: 'text' | 'textarea' | 'image' = f.type === 'text' || f.type === 'textarea' || f.type === 'image' ? f.type : 'text';
          return { key: f.key, label: f.label, type };
        })
      : [];
    
    // 按需加载 prompt 内容（如果有 promptId 但没有 prompt 内容）
    let generatePrompt = comp.generatePrompt || '';
    let validatePrompt = comp.validatePrompt || '';
    let analysisPrompt = comp.analysisPrompt || '';
    
    // 收集需要加载的 promptId
    const promptIdsToLoad: number[] = [];
    if (comp.generatePromptId && !generatePrompt) {
      promptIdsToLoad.push(comp.generatePromptId);
    }
    if (comp.validatePromptId && !validatePrompt) {
      promptIdsToLoad.push(comp.validatePromptId);
    }
    if (comp.analysisPromptId && !analysisPrompt) {
      promptIdsToLoad.push(comp.analysisPromptId);
    }
    
    // 如果有需要加载的 prompt，批量获取
    if (promptIdsToLoad.length > 0) {
      try {
        const promptMap = await promptTemplateApi.getPromptTemplatesByIds(promptIdsToLoad);
        
        if (comp.generatePromptId && !generatePrompt) {
          const prompt = promptMap.get(comp.generatePromptId);
          if (prompt) {
            generatePrompt = prompt.prompt_content || '';
          }
        }
        if (comp.validatePromptId && !validatePrompt) {
          const prompt = promptMap.get(comp.validatePromptId);
          if (prompt) {
            validatePrompt = prompt.prompt_content || '';
          }
        }
        if (comp.analysisPromptId && !analysisPrompt) {
          const prompt = promptMap.get(comp.analysisPromptId);
          if (prompt) {
            analysisPrompt = prompt.prompt_content || '';
          }
        }
      } catch (error) {
        console.error('加载组件 prompt 内容失败:', error);
      }
    }
    
    setNewComponentForm({
      type: comp.type,
      label: comp.label,
      config: { ...comp.config },
      generatePrompt,
      validatePrompt,
      analysisPrompt,
      tabsConfig,
      cardFields,
      dataKey: comp.dataKey || '',
      dataDependencies: comp.dataDependencies || [],
    });
    setAddComponentStep('config');
    setShowAddComponent(true);
  };

  // 保存编辑的组件
  const saveEditedComponent = async () => {
    if (!editingComponentId || !newComponentForm.label.trim() || !activeModule) return;
    
    // 如果是 tabs 类型，必须至少有一个分页
    if (newComponentForm.type === 'tabs' && newComponentForm.tabsConfig.length === 0) {
      return;
    }
    
    // 如果是 card-list 类型，必须至少有一个字段
    if (newComponentForm.type === 'card-list' && newComponentForm.cardFields.length === 0) {
      return;
    }
    
    // 获取 templateId（如果是数据库模板）
    let dbTemplateId: number | undefined;
    if (template?.id && template.id.startsWith('db-')) {
      const parsedId = parseInt(template.id.replace('db-', ''));
      if (!isNaN(parsedId)) {
        dbTemplateId = parsedId;
      }
    }
    
    // 获取组件的 dataKey
    const componentDataKey = newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataKey.trim() || undefined);
    
    // 如果是在 tabs 中的组件
    if (editingComponentContext?.tabsComponentId && editingComponentContext?.tabId) {
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map((m, i) => 
          i === activeModuleIndex 
            ? { 
                ...m, 
                components: m.components.map(c => {
                  // 找到 tabs 组件
                  if (c.id === editingComponentContext.tabsComponentId && c.type === 'tabs') {
                    const updatedTabs = (c.config.tabs || []).map((tab: { id: string; label: string; components: ComponentConfig[] }) => {
                      if (tab.id === editingComponentContext.tabId) {
                        // 更新该 tab 中的组件
                        return {
                          ...tab,
                          components: tab.components.map((subComp: ComponentConfig) => {
                            if (subComp.id === editingComponentId) {
                              return {
                                ...subComp,
                                label: newComponentForm.label.trim(),
                                config: { ...newComponentForm.config },
                                generatePrompt: newComponentForm.generatePrompt.trim() || undefined,
                                validatePrompt: newComponentForm.validatePrompt.trim() || undefined,
                                analysisPrompt: newComponentForm.analysisPrompt.trim() || undefined,
                                // tabs 组件不需要 dataKey 和 dataDependencies
                                dataKey: componentDataKey,
                                dataDependencies: newComponentForm.type === 'tabs' ? undefined : (newComponentForm.dataDependencies.length > 0 ? newComponentForm.dataDependencies : undefined),
                              };
                            }
                            return subComp;
                          })
                        };
                      }
                      return tab;
                    });
                    return {
                      ...c,
                      config: {
                        ...c.config,
                        tabs: updatedTabs
                      }
                    };
                  }
                  return c;
                })
              }
            : m
        )
      }));
      
      // 保存 prompt 到数据库
      if (dbTemplateId && componentDataKey) {
        try {
          if (newComponentForm.generatePrompt.trim()) {
            await promptTemplateApi.upsertComponentPrompt(
              editingComponentId,
              newComponentForm.type,
              'generate',
              newComponentForm.generatePrompt.trim(),
              dbTemplateId,
              componentDataKey
            );
          }
          if (newComponentForm.validatePrompt.trim()) {
            await promptTemplateApi.upsertComponentPrompt(
              editingComponentId,
              newComponentForm.type,
              'validate',
              newComponentForm.validatePrompt.trim(),
              dbTemplateId,
              componentDataKey
            );
          }
          if (newComponentForm.analysisPrompt.trim()) {
            await promptTemplateApi.upsertComponentPrompt(
              editingComponentId,
              newComponentForm.type,
              'analysis',
              newComponentForm.analysisPrompt.trim(),
              dbTemplateId,
              componentDataKey
            );
          }
        } catch (error) {
          console.error('保存组件 prompt 失败:', error);
        }
      }
    } else {
      // 普通组件
      setTemplate(prev => ({
        ...prev,
        modules: prev.modules.map((m, i) => 
          i === activeModuleIndex 
            ? { 
                ...m, 
                components: m.components.map(c => {
                  if (c.id !== editingComponentId) return c;
                  
                  const newConfig = { ...newComponentForm.config };
                  
                  // 如果是 tabs 类型，更新 tabs 配置（保留已有的 components）
                  if (newComponentForm.type === 'tabs') {
                    const existingTabs = c.config.tabs || [];
                    newConfig.tabs = newComponentForm.tabsConfig.map(t => {
                      const existingTab = existingTabs.find((et: { id: string }) => et.id === t.id);
                      return {
                        id: t.id,
                        label: t.label,
                        components: existingTab?.components || []
                      };
                    });
                  }
                  
                  // 如果是 card-list 类型，更新 cardFields 配置
                  if (newComponentForm.type === 'card-list') {
                    newConfig.cardFields = newComponentForm.cardFields.map(f => ({
                      key: f.label.toLowerCase().replace(/\s+/g, '_'),
                      label: f.label,
                      type: f.type
                    }));
                  }
                  
                  return {
                    ...c,
                    label: newComponentForm.label.trim(),
                    config: newConfig,
                    generatePrompt: newComponentForm.generatePrompt.trim() || undefined,
                    validatePrompt: newComponentForm.validatePrompt.trim() || undefined,
                    analysisPrompt: newComponentForm.analysisPrompt.trim() || undefined,
                    dataKey: componentDataKey,
                    dataDependencies: newComponentForm.dataDependencies.length > 0 ? newComponentForm.dataDependencies : undefined,
                  };
                })
              }
            : m
        )
      }));
      
      // 保存 prompt 到数据库
      if (dbTemplateId && componentDataKey) {
        try {
          if (newComponentForm.generatePrompt.trim()) {
            await promptTemplateApi.upsertComponentPrompt(
              editingComponentId,
              newComponentForm.type,
              'generate',
              newComponentForm.generatePrompt.trim(),
              dbTemplateId,
              componentDataKey
            );
          }
          if (newComponentForm.validatePrompt.trim()) {
            await promptTemplateApi.upsertComponentPrompt(
              editingComponentId,
              newComponentForm.type,
              'validate',
              newComponentForm.validatePrompt.trim(),
              dbTemplateId,
              componentDataKey
            );
          }
          if (newComponentForm.analysisPrompt.trim()) {
            await promptTemplateApi.upsertComponentPrompt(
              editingComponentId,
              newComponentForm.type,
              'analysis',
              newComponentForm.analysisPrompt.trim(),
              dbTemplateId,
              componentDataKey
            );
          }
        } catch (error) {
          console.error('保存组件 prompt 失败:', error);
        }
      }
    }
    closeAddComponentModal();
  };

  // 删除组件
  const deleteComponent = (componentId: string) => {
    setTemplate(prev => ({
      ...prev,
      modules: prev.modules.map((m, i) => 
        i === activeModuleIndex 
          ? { ...m, components: m.components.filter(c => c.id !== componentId) }
          : m
      )
    }));
  };

  // 获取默认值
  const getDefaultValue = (type: ComponentType): unknown => {
    switch (type) {
      case 'multiselect':
      case 'list':
      case 'keyvalue':
      case 'table':
      case 'timeline':
      case 'card-list':
      case 'character-card':
      case 'rank-system':
      case 'faction':
        return [];
      case 'relation-graph':
        return { characters: [], relations: [] };
      case 'tabs':
        return null;
      default:
        return '';
    }
  };

  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentImageId || !activeModule) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      updateComponentValue(activeModule.id, currentImageId, event.target?.result as string);
      setCurrentImageId(null);
    };
    reader.readAsDataURL(file);
  };

  // ============ 组件渲染器 ============
  
  const renderComponent = (comp: ComponentConfig, moduleId: string, tabsComponentId?: string, tabId?: string) => {
    const updateValue = (value: unknown) => updateComponentValue(moduleId, comp.id, value);

    switch (comp.type) {
      case 'text': {
        const inputValue = typeof comp.value === 'string' ? comp.value : '';
        return (
          <div className="comp-input-wrapper">
          <input
            type="text"
            className="comp-input"
            value={inputValue}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
          />
          </div>
        );
      }

      case 'textarea': {
        const textareaValue = typeof comp.value === 'string' ? comp.value : '';
        return (
          <div className="comp-textarea-wrapper">
          <textarea
            className="comp-textarea"
            value={textareaValue}
            onChange={(e) => updateValue(e.target.value)}
            placeholder={comp.config.placeholder}
            rows={4}
          />
          </div>
        );
      }

      case 'image': {
        const imageSrc = typeof comp.value === 'string' ? comp.value : '';
        return (
          <div className="comp-image">
            {imageSrc ? (
              <div className="image-preview">
                <img src={imageSrc} alt={comp.label} />
                <div className="image-overlay">
                  <button onClick={() => { setCurrentImageId(comp.id); fileInputRef.current?.click(); }}>更换</button>
                  <button onClick={() => updateValue('')}>删除</button>
                </div>
              </div>
            ) : (
              <button className="image-upload-btn" onClick={() => { setCurrentImageId(comp.id); fileInputRef.current?.click(); }}>
                <Image size={24} />
                <span>点击上传</span>
              </button>
            )}
          </div>
        );
      }

      case 'select': {
        const selectOptions: SelectOption[] = comp.config.options?.map(opt => ({
          value: opt.value,
          label: opt.label,
          // removed `disabled` as it's not part of SelectOption type
        })) || [];
        return (
          <CustomSelect
            value={(comp.value as string) || ''}
            onChange={updateValue}
            options={selectOptions}
            placeholder="请选择..."
            className="comp-select"
            fullWidth
          />
        );
      }

      case 'multiselect': {
        const selected = (comp.value as string[]) || [];
        const maxCount = comp.config.maxCount || 5;
        return (
          <div className="comp-multiselect">
            <div className="selected-tags">
              {selected.map(val => {
                const opt = comp.config.options?.find(o => o.value === val);
                return (
                  <span key={val} className="tag-item" style={{ background: opt?.color || '#64748b' }}>
                    {opt?.label || val}
                    <button onClick={() => updateValue(selected.filter(v => v !== val))}><X size={12} /></button>
                  </span>
                );
              })}
              {selected.length === 0 && <span className="placeholder">点击下方标签选择</span>}
            </div>
            {selected.length < maxCount && (
              <div className="available-tags">
                {comp.config.options?.filter(o => !selected.includes(o.value)).map(opt => (
                  <button
                    key={opt.value}
                    className="tag-option"
                    style={{ borderColor: opt.color, color: opt.color }}
                    onClick={() => updateValue([...selected, opt.value])}
                  >
                    + {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      }

      case 'list': {
        const listItems = (comp.value as string[]) || [];
        return (
          <div className="comp-list">
            {listItems.map((item, i) => (
              <div key={i} className="list-row">
                <span className="list-num">{i + 1}</span>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const newList = [...listItems];
                    newList[i] = e.target.value;
                    updateValue(newList);
                  }}
                  placeholder="输入内容..."
                />
                <button className="list-del" onClick={() => updateValue(listItems.filter((_, idx) => idx !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <button className="list-add" onClick={() => updateValue([...listItems, ''])}>
              <Plus size={14} /> 添加项目
            </button>
          </div>
        );
      }

      case 'keyvalue': {
        const kvItems = (comp.value as { key: string; value: string }[]) || [];
        return (
          <div className="comp-keyvalue">
            {kvItems.map((item, i) => (
              <div key={i} className="kv-card">
                <div className="kv-header">
                  <span className="kv-num">{i + 1}</span>
                  <input
                    type="text"
                    className="kv-key"
                    value={item.key}
                    onChange={(e) => {
                      const newItems = [...kvItems];
                      newItems[i] = { ...item, key: e.target.value };
                      updateValue(newItems);
                    }}
                    placeholder="标题"
                  />
                  <button onClick={() => updateValue(kvItems.filter((_, idx) => idx !== i))}><X size={14} /></button>
                </div>
                <textarea
                  className="kv-value"
                  value={item.value}
                  onChange={(e) => {
                    const newItems = [...kvItems];
                    newItems[i] = { ...item, value: e.target.value };
                    updateValue(newItems);
                  }}
                  placeholder="详细描述..."
                  rows={2}
                />
              </div>
            ))}
            <button className="list-add" onClick={() => updateValue([...kvItems, { key: '', value: '' }])}>
              <Plus size={14} /> 添加项目
            </button>
          </div>
        );
      }

      case 'table': {
        const tableData = (comp.value as Record<string, string>[]) || [];
        const columns = comp.config.columns || [];
        return (
          <div className="comp-table">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {columns.map(col => <th key={col.key} style={{ width: col.width }}>{col.label}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => (
                    <tr key={i}>
                      <td className="row-num">{i + 1}</td>
                      {columns.map(col => (
                        <td key={col.key}>
                          <input
                            type="text"
                            value={row[col.key] || ''}
                            onChange={(e) => {
                              const newData = [...tableData];
                              newData[i] = { ...row, [col.key]: e.target.value };
                              updateValue(newData);
                            }}
                          />
                        </td>
                      ))}
                      <td>
                        <button onClick={() => updateValue(tableData.filter((_, idx) => idx !== i))}><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="list-add" onClick={() => {
              const newRow: Record<string, string> = {};
              columns.forEach(c => newRow[c.key] = '');
              updateValue([...tableData, newRow]);
            }}>
              <Plus size={14} /> 添加行
            </button>
          </div>
        );
      }

      case 'tabs': {
        const tabs = comp.config.tabs || [];
        const handleUpdateTabs = (newTabs: { id: string; label: string; components: ComponentConfig[] }[]) => {
          const updatedConfig = {
            ...comp.config,
            tabs: newTabs
          };
          setTemplate(prev => ({
            ...prev,
            modules: prev.modules.map(m => {
              if (m.id !== moduleId) return m;
              return {
                ...m,
                components: m.components.map(c => {
                  if (c.id === comp.id) {
                    return { ...c, config: updatedConfig };
                  }
                  return c;
                })
              };
            })
          }));
        };
        const handleAddComponentToTab = (tabId: string) => {
          // 打开添加组件弹窗，并标记是要添加到分页中
          setAddingToTab({ tabId, componentId: comp.id });
          setShowAddComponent(true);
          setAddComponentStep('type');
        };
        const handleEditComponentInTab = (subComp: ComponentConfig, tabId: string) => {
          // 编辑 tabs 中的组件
          startEditComponent(subComp, comp.id, tabId);
        };
        return (
          <TabsComponent 
            tabs={tabs} 
            moduleId={moduleId}
            tabsComponentId={comp.id}
            renderComponent={renderComponent}
            onUpdateTabs={handleUpdateTabs}
            onGenerateComponent={handleGenerateComponent}
            generatingComponents={generatingComponents}
            onAddComponentToTab={handleAddComponentToTab}
            onEditComponentInTab={handleEditComponentInTab}
            isEditMode={isEditMode}
          />
        );
      }

      case 'relation-graph': {
        // 转换数据格式
        // 兼容新格式（直接是数组）和旧格式（对象包含 relations）
        interface CharacterData {
          id: string;
          name: string;
          gender: string;
          [key: string]: unknown;
        }

        let relationData: { characters?: CharacterData[]; relations?: unknown[] } = { characters: [], relations: [] };
        
        if (Array.isArray(comp.value)) {
          // 新格式：直接是 relations 数组
          relationData = {
            characters: [],
            relations: comp.value as unknown[]
          };
        } else if (comp.value && typeof comp.value === 'object') {
          // 旧格式：对象包含 characters 和 relations
          const val = comp.value as { characters?: CharacterData[]; relations?: unknown[] };
          relationData = {
            characters: Array.isArray(val.characters) ? val.characters : [],
            relations: Array.isArray(val.relations) ? val.relations : []
          };
        }
        
        // 如果组件有依赖，尝试从依赖中获取角色数据
        if (comp.dataDependencies && comp.dataDependencies.length > 0) {
          // 重要：如果关系图谱组件有依赖，角色数据应该完全来自依赖，而不是 comp.value.characters
          // 因为 comp.value.characters 在保存时被设置为空数组（避免数据翻倍）
          // 所以这里应该忽略 comp.value.characters，只从依赖中获取角色数据
          
          // 从模板中查找依赖的组件数据
          const findDependencyData = (depKey: string): unknown[] => {
            for (const module of template.modules) {
              const findInComponents = (components: ComponentConfig[], path: string = ''): unknown[] | null => {
                for (const compItem of components) {
                  // 检查当前组件是否匹配
                  if (compItem.dataKey === depKey) {
                    // 即使 value 是空数组，也应该返回（这样关系图谱至少能显示，只是没有角色）
                    if (compItem.value !== undefined && compItem.value !== null) {
                      if (Array.isArray(compItem.value)) {
                        return compItem.value as unknown[]; // 即使为空数组也返回
                      } else if (typeof compItem.value === 'object' && compItem.value !== null) {
                        // 如果是对象，尝试提取数组字段
                        const obj = compItem.value as { characters?: unknown[] };
                        if (Array.isArray(obj.characters)) {
                          return obj.characters;
                        }
                      }
                    } else {
                      return []; // 返回空数组而不是 null
                    }
                  }
                  
                  // 递归查找 tabs 中的组件
                  if (compItem.type === 'tabs' && compItem.config?.tabs) {
                    for (const tab of compItem.config.tabs) {
                      if (tab.components) {
                        const found = findInComponents(tab.components, `${path} > ${tab.label || tab.id}`);
                        if (found) return found;
                      }
                    }
                  }
                }
                return null;
              };
              const found = findInComponents(module.components, module.name);
              if (found) {
                return found;
              }
            }
            return [];
          };
          
          // 重要：如果关系图谱组件有依赖，角色数据应该完全来自依赖
          // 初始值应该为空数组，而不是 relationData.characters（因为保存时被设置为空）
          let mergedCharacters: CharacterData[] = [];
          
          // 收集所有依赖的角色数据并去重
          const allDependencyCharacters: CharacterData[] = [];
          for (const depKey of comp.dataDependencies) {
            const depData = findDependencyData(depKey);
            if (depData && Array.isArray(depData) && depData.length > 0) {
              // 转换角色数据格式
              // 注意：保持角色ID稳定，如果角色没有ID，使用 name 作为稳定的标识
              const convertedCharacters = depData.map((char: unknown, index: number) => {
                const c = char as { id?: string; name?: string; gender?: string; display_name?: string };
                if (c.id && c.name && (c.gender === '男' || c.gender === '女')) {
                  return {
                    id: c.id,
                    name: c.name,
                    gender: c.gender
                  } as CharacterData;
                }
                // 如果没有ID，使用 name 作为ID（更稳定，不包含时间戳）
                const stableId = c.id || c.name || `char-${index}`;
                return {
                  id: stableId,
                  name: c.name || c.display_name || '',
                  gender: (c.gender === '男' || c.gender === '女') ? c.gender : '男'
                } as CharacterData;
              });
              
              allDependencyCharacters.push(...convertedCharacters);
            }
          }
          
          // 去重：使用 id 或 name 作为唯一标识
          const charMap: Record<string, CharacterData> = {};
          allDependencyCharacters.forEach((char) => {
            const key = char.id || char.name;
            if (key && !charMap[key]) {
              charMap[key] = char;
            }
          });
          mergedCharacters = Object.values(charMap);
          
          relationData = {
            ...relationData,
            characters: mergedCharacters,  // 角色数据完全来自依赖的角色列表
            relations: relationData.relations || []  // 关系数据来自 comp.value
          };
        } else {
          // 如果没有依赖配置，仍然只使用关系数据，角色为空（因为角色应该来自角色列表）
          // 注意：关系图谱应该总是配置了依赖，如果没有配置，角色列表将为空
          relationData = {
            characters: [], // 即使没有依赖配置，也不使用 comp.value.characters（因为角色应该来自角色列表）
            relations: Array.isArray(relationData.relations) ? relationData.relations : []
          };
        }
        
        const graphData: CharacterRelationsData = {
          characters: (relationData.characters || []) as CharacterRelationsData['characters'],
          relations: (relationData.relations || []) as CharacterRelationsData['relations']
        };
        
        // 调试信息：检查关系数据
        if (graphData.relations.length > 0) {
          console.log(`🔗 关系图谱渲染: ${graphData.characters.length} 个角色, ${graphData.relations.length} 个关系`, graphData.relations);
        }
        
        return (
          <div className="comp-relation-graph" style={{ width: '100%', height: '600px', minHeight: '600px' }}>
            <CharacterRelations 
              key={`relation-graph-${comp.id}`}
              data={graphData}
              onChange={(newData) => {
                // 关系图谱只保存关系，角色始终从角色列表中获取（不保存）
                const valueToSave = {
                  characters: [], // 角色来自依赖的角色列表，不保存
                  relations: newData.relations || [] // 只保存关系
                };
                console.log(`💾 关系图谱 onChange 触发: 保存 ${valueToSave.relations.length} 个关系`, valueToSave.relations);
                updateValue(valueToSave);
              }}
            />
          </div>
        );
      }

      case 'timeline': {
        // 支持两种格式：数组格式（旧格式）和对象格式（新格式，包含依赖数据）
        let timelineData: Record<string, unknown>[] = [];
        let dependencies: Record<string, unknown> = {};
        
        if (Array.isArray(comp.value)) {
          // 旧格式：直接是数组
          timelineData = comp.value as Record<string, unknown>[];
        } else if (comp.value && typeof comp.value === 'object' && 'events' in comp.value) {
          // 新格式：包含 events 和 _dependencies
          const val = comp.value as { events: Record<string, unknown>[]; _dependencies: Record<string, unknown> };
          timelineData = val.events || [];
          dependencies = val._dependencies || {};
        } else {
          timelineData = [];
        }
        
        // 从依赖中获取角色列表
        let availableCharacters: { id: string; name: string; gender: string }[] = [];
        if (comp.dataDependencies && comp.dataDependencies.length > 0) {
          const findDependencyData = (depKey: string): unknown[] => {
            for (const module of template.modules) {
              const findInComponents = (components: ComponentConfig[]): unknown[] | null => {
                for (const compItem of components) {
                  if (compItem.dataKey === depKey) {
                    if (compItem.value !== undefined && compItem.value !== null) {
                      if (Array.isArray(compItem.value)) {
                        return compItem.value;
                      } else if (typeof compItem.value === 'object' && compItem.value !== null) {
                        const obj = compItem.value as { characters?: unknown[] };
                        if (Array.isArray(obj.characters)) {
                          return obj.characters;
                        }
                      }
                    }
                    return [];
                  }
                  if (compItem.type === 'tabs' && compItem.config?.tabs) {
                    for (const tab of compItem.config.tabs) {
                      if (tab.components) {
                        const found = findInComponents(tab.components);
                        if (found) return found;
                      }
                    }
                  }
                }
                return null;
              };
              const found = findInComponents(module.components);
              if (found) return found;
            }
            return [];
          };
          
          // 收集所有依赖的角色数据并去重
          const allDependencyCharacters: Record<string, unknown>[] = [];
          for (const depKey of comp.dataDependencies) {
            const depData = findDependencyData(depKey);
            if (depData && Array.isArray(depData) && depData.length > 0) {
              allDependencyCharacters.push(...(depData as Record<string, unknown>[]));
            }
          }
          
          // 去重
          const charMap: Record<string, { id: string; name: string; gender: string }> = {};
          allDependencyCharacters.forEach((char) => {
            const key = (char.id as string) || (char.name as string);
            if (key && !charMap[key]) {
              charMap[key] = {
                id: (char.id as string) || key,
                name: (char.name as string) || (char.display_name as string) || '',
                gender: (char.gender as string) || '男'
              };
            }
          });
          availableCharacters = Object.values(charMap);
        }
        
        // 确保时间线数据格式正确（支持多个角色，向后兼容单个角色）
        const ensureEventFormat = (item: Record<string, unknown>) => {
          // 兼容旧格式：如果存在 characterId/character，转换为数组格式
          let characterIds: string[] = [];
          let characters: string[] = [];
          
          if (item.characterIds && Array.isArray(item.characterIds)) {
            characterIds = item.characterIds as string[];
          } else if (item.characterId) {
            characterIds = [item.characterId as string];
          }
          
          if (item.characters && Array.isArray(item.characters)) {
            characters = item.characters as string[];
          } else if (item.character) {
            characters = [item.character as string];
          }
          
          return {
            id: (item.id as string) || `event-${Date.now()}-${Math.random()}`,
            characterIds: characterIds,
            characters: characters,
            time: (item.time as string) || '',
            event: (item.event as string) || '',
            description: (item.description as string) || '',
            location: (item.location as string) || ''
          };
        };
        
        const normalizedTimelineData = timelineData.map(item => ensureEventFormat(item));
        
        return (
          <div className="comp-timeline">
            <div className="timeline-header-section">
              <h4 className="timeline-title">{comp.label || '时间线'}</h4>
              {availableCharacters.length > 0 && (
                <div className="timeline-filter">
                  <label>可用角色：</label>
                  <span className="character-count">{availableCharacters.length} 个角色</span>
                </div>
              )}
            </div>
            
            <div className="timeline-events-list">
              {normalizedTimelineData.map((item, i) => {
                const isEditing = editingTimelineEvents[comp.id] === item.id;
                const editFormKey = `${comp.id}-${item.id}`;
                const editForm = timelineEditForms[editFormKey] || {
                  characterIds: item.characterIds || [],
                  characters: item.characters || [],
                  time: item.time || '',
                  event: item.event || '',
                  description: item.description || '',
                  location: item.location || ''
                };

                return (
                  <div key={item.id || i} className="timeline-event-item">
                    <div className="timeline-marker" />
                    <div className="timeline-event-content">
                      {isEditing ? (
                        // 编辑模式
                        <>
                          <div className="timeline-event-header">
                            <div className="timeline-event-meta">
                              {availableCharacters.length > 0 && (
                                <TimelineCharacterSelector
                                  availableCharacters={availableCharacters}
                                  selectedCharacterIds={editForm.characterIds || []}
                                  selectedCharacters={editForm.characters || []}
                                  onSelectionChange={(characterIds, characters) => {
                                    setTimelineEditForms(prev => ({
                                      ...prev,
                                      [editFormKey]: {
                                        ...editForm,
                                        characterIds,
                                        characters
                                      }
                                    }));
                                  }}
                                />
                              )}
                              <input
                                type="text"
                                className="timeline-time-input"
                                value={editForm.time}
                                onChange={(e) => setTimelineEditForms(prev => ({
                                  ...prev,
                                  [editFormKey]: { ...editForm, time: e.target.value }
                                }))}
                                placeholder="时间/章节（如：第一卷 第1章 或 2024年1月）"
                              />
                            </div>
                            <div className="timeline-event-actions">
                              <button
                                className="timeline-save-btn"
                                onClick={() => {
                                  const newData = [...normalizedTimelineData];
                                  newData[i] = {
                                    ...item,
                                    ...editForm
                                  };
                                  if (comp.value && typeof comp.value === 'object' && '_dependencies' in comp.value) {
                                    updateValue({ events: newData, _dependencies: dependencies });
                                  } else {
                                    updateValue(newData);
                                  }
                                  setEditingTimelineEvents(prev => ({ ...prev, [comp.id]: null }));
                                  // 清除编辑表单数据
                                  setTimelineEditForms(prev => {
                                    const newForms = { ...prev };
                                    delete newForms[editFormKey];
                                    return newForms;
                                  });
                                }}
                              >
                                保存
                              </button>
                              <button
                                className="timeline-cancel-btn"
                                onClick={() => {
                                  setEditingTimelineEvents(prev => ({ ...prev, [comp.id]: null }));
                                  // 清除编辑表单数据
                                  setTimelineEditForms(prev => {
                                    const newForms = { ...prev };
                                    delete newForms[editFormKey];
                                    return newForms;
                                  });
                                }}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                          <input
                            type="text"
                            className="timeline-event-title"
                            value={editForm.event}
                            onChange={(e) => setTimelineEditForms(prev => ({
                              ...prev,
                              [editFormKey]: { ...editForm, event: e.target.value }
                            }))}
                            placeholder="事件标题"
                          />
                          <textarea
                            className="timeline-event-description"
                            value={editForm.description}
                            onChange={(e) => setTimelineEditForms(prev => ({
                              ...prev,
                              [editFormKey]: { ...editForm, description: e.target.value }
                            }))}
                            placeholder="事件描述..."
                            rows={2}
                          />
                          <input
                            type="text"
                            className="timeline-location-input"
                            value={editForm.location}
                            onChange={(e) => setTimelineEditForms(prev => ({
                              ...prev,
                              [editFormKey]: { ...editForm, location: e.target.value }
                            }))}
                            placeholder="地点（可选）"
                          />
                        </>
                      ) : (
                        // 只读模式
                        <>
                          <div className="timeline-event-header">
                            <div className="timeline-event-meta">
                              {item.characters && item.characters.length > 0 && (
                                <div className="timeline-characters-display">
                                  {item.characters.map((charName: string, idx: number) => (
                                    <span key={idx} className="timeline-character-name">{charName}</span>
                                  ))}
                                </div>
                              )}
                              {item.time && (
                                <span className="timeline-time">{item.time}</span>
                              )}
                            </div>
                            <div className="timeline-event-actions">
                              <button
                                className="timeline-edit-btn"
                                onClick={() => {
                                  // 初始化编辑表单数据
                                  setTimelineEditForms(prev => ({
                                    ...prev,
                                    [editFormKey]: {
                                      characterIds: item.characterIds || [],
                                      characters: item.characters || [],
                                      time: item.time || '',
                                      event: item.event || '',
                                      description: item.description || '',
                                      location: item.location || ''
                                    }
                                  }));
                                  setEditingTimelineEvents(prev => ({ ...prev, [comp.id]: item.id }));
                                }}
                              >
                                编辑
                              </button>
                              <button
                                className="timeline-delete-btn"
                                onClick={() => {
                                  const newData = normalizedTimelineData.filter((_, idx) => idx !== i);
                                  if (comp.value && typeof comp.value === 'object' && '_dependencies' in comp.value) {
                                    updateValue({ events: newData, _dependencies: dependencies });
                                  } else {
                                    updateValue(newData);
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          {item.event && (
                            <div className="timeline-event-title-readonly">{item.event}</div>
                          )}
                          {item.description && (
                            <div className="timeline-event-description-readonly">{item.description}</div>
                          )}
                          {item.location && (
                            <div className="timeline-location-readonly">📍 {item.location}</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <button 
              className="timeline-add-btn"
              onClick={() => {
                const newEvent = {
                  id: `event-${Date.now()}-${Math.random()}`,
                  characterIds: [],
                  characters: [],
                  time: '',
                  event: '',
                  description: '',
                  location: ''
                };
                const newData = [...normalizedTimelineData, newEvent];
                if (comp.value && typeof comp.value === 'object' && '_dependencies' in comp.value) {
                  updateValue({ events: newData, _dependencies: dependencies });
                } else {
                  updateValue(newData);
                }
              }}
            >
              <Plus size={16} />
              <span>添加时间线事件</span>
            </button>
          </div>
        );
      }

      case 'character-card': {
        // 角色卡片 - 只读展示 + 弹窗编辑
        // 当前组件的数据（用于显示和编辑）
        const characterData = (comp.value as { name: string; gender: string; type: string; description: string }[]) || [];
        const mainChars = characterData.filter(c => c.type === '主要角色');
        const secondaryChars = characterData.filter(c => c.type === '次要角色');
        
        // 收集所有角色组件中的角色数据（包括当前组件和其他组件）
        interface MergedCharacter {
          name: string;
          gender: string;
          type: string;
          description: string;
          componentId: string;
          componentIndex: number;
        }
        
        const findAllCharactersInModule = (): MergedCharacter[] => {
          const allChars: MergedCharacter[] = [];
          
          // 查找当前模块中的所有character-card组件
          const findCharacterCards = (components: ComponentConfig[]): void => {
            for (const c of components) {
              if (c.type === 'character-card' && c.value) {
                const chars = (c.value as { name: string; gender: string; type: string; description: string }[]) || [];
                chars.forEach((char, idx) => {
                  allChars.push({
                    name: char.name || '',
                    gender: char.gender || '',
                    type: char.type || '',
                    description: char.description || '',
                    componentId: c.id,
                    componentIndex: idx
                  });
                });
              }
              // 递归查找tabs中的组件
              if (c.type === 'tabs' && c.config.tabs) {
                for (const tab of c.config.tabs) {
                  if (tab.components) {
                    findCharacterCards(tab.components);
                  }
                }
              }
            }
          };
          
          const module = template.modules.find(m => m.id === moduleId);
          if (module) {
            findCharacterCards(module.components);
          }
          
          return allChars;
        };
        
        // 获取所有角色并去重合并（以name为唯一标识）
        const allCharactersInModule = findAllCharactersInModule();
        const characterMapObj: Record<string, MergedCharacter> = {};
        
        for (const char of allCharactersInModule) {
          const existing = characterMapObj[char.name];
          if (!existing) {
            characterMapObj[char.name] = char;
          } else {
            // 合并数据，保留更完整的信息
            const merged: MergedCharacter = {
              name: char.name,
              gender: char.gender || existing.gender,
              description: char.description || existing.description,
              type: char.type || existing.type,
              // 保留第一个找到的组件ID和索引（用于编辑）
              componentId: existing.componentId,
              componentIndex: existing.componentIndex
            };
            characterMapObj[char.name] = merged;
          }
        }
        
        // 合并后的所有角色（去重）
        const mergedCharacters = Object.values(characterMapObj);
        const mergedMainChars = mergedCharacters.filter(c => c.type === '主要角色');
        const mergedSecondaryChars = mergedCharacters.filter(c => c.type === '次要角色');
        
        const openCharacterModal = (char: { name: string; gender: string; type: string; description: string } | null, idx: number | null) => {
          setCharacterModal({
            isOpen: true,
            compId: comp.id,
            moduleId: moduleId,
            editIndex: idx,
            form: char ? { ...char } : { name: '', gender: '男', type: '主要角色', description: '' },
            tabsComponentId: tabsComponentId,
            tabId: tabId
          });
        };
        
        // 打开合并视图的角色编辑（从合并列表中）
        const openMergedCharacterModal = (char: MergedCharacter) => {
          // 找到该角色在当前组件中的位置，如果存在
          const localIdx = characterData.findIndex(c => c.name === char.name);
          if (localIdx !== -1) {
            // 如果当前组件中有该角色，编辑当前组件的
            openCharacterModal(characterData[localIdx], localIdx);
          } else {
            // 如果当前组件中没有，创建一个新的
            openCharacterModal(null, null);
            // 设置表单数据为合并后的角色信息
            setTimeout(() => {
              setCharacterModal(prev => ({
                ...prev,
                form: { 
                  name: char.name,
                  gender: char.gender,
                  type: char.type,
                  description: char.description
                }
              }));
            }, 0);
          }
        };
        
        const renderCharCard = (char: typeof characterData[0], realIdx: number) => (
          <div 
            key={realIdx} 
            className="character-card-item clickable"
            onClick={() => openCharacterModal(char, realIdx)}
          >
            <div className="character-card-header">
              <div className="character-name-row">
                <span className="character-name-display">{char.name || '未命名角色'}</span>
                <span className="character-gender-tag">{char.gender}</span>
              </div>
              <button 
                className="character-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  updateValue(characterData.filter((_, i) => i !== realIdx));
                }}
                title="删除角色"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="character-desc-display">
              {char.description || '暂无简介'}
            </div>
          </div>
        );
        
        return (
          <div className="comp-character-cards">
            {mainChars.length > 0 && (
              <div className="character-section">
                <h4 className="character-section-title">主要角色</h4>
                <div className="character-grid">
                  {mainChars.map((char) => {
                    const realIdx = characterData.indexOf(char);
                    return renderCharCard(char, realIdx);
                  })}
                </div>
              </div>
            )}
            {secondaryChars.length > 0 && (
              <div className="character-section">
                <h4 className="character-section-title">次要角色</h4>
                <div className="character-grid">
                  {secondaryChars.map((char) => {
                    const realIdx = characterData.indexOf(char);
                    return renderCharCard(char, realIdx);
                  })}
                </div>
              </div>
            )}
            {characterData.length === 0 && (
              <div className="character-empty">
                <Users size={32} />
                <span>暂无角色，点击添加</span>
              </div>
            )}
            <button 
              className="character-add-btn"
              onClick={() => openCharacterModal(null, null)}
            >
              <Plus size={16} />
              <span>添加角色</span>
            </button>
            
            {/* 合并视图：显示所有角色组件中的角色（如果有多个组件） */}
            {mergedCharacters.length > 0 && mergedCharacters.length !== characterData.length && (
              <div className="character-merged-view">
                <div className="character-merged-header">
                  <h4 className="character-section-title">合并视图（所有角色组件）</h4>
                  <span className="character-merged-count">
                    {mergedCharacters.length} 个角色（来自 {new Set(mergedCharacters.map(c => c.componentId)).size} 个组件）
                  </span>
                </div>
                {mergedMainChars.length > 0 && (
                  <div className="character-section">
                    <h5 className="character-subsection-title">主要角色（合并）</h5>
                    <div className="character-grid">
                      {mergedMainChars.map((char) => (
                        <div
                          key={`merged-${char.name}`}
                          className="character-card-item clickable merged"
                          onClick={() => openMergedCharacterModal(char)}
                          title={`来自组件: ${char.componentId}`}
                        >
                          <div className="character-card-header">
                            <div className="character-name-row">
                              <span className="character-name-display">{char.name || '未命名角色'}</span>
                              <span className="character-gender-tag">{char.gender}</span>
                            </div>
                            {characterData.findIndex(c => c.name === char.name) === -1 && (
                              <span className="character-source-badge" title="来自其他组件">其他</span>
                            )}
                          </div>
                          <div className="character-desc-display">
                            {char.description || '暂无简介'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mergedSecondaryChars.length > 0 && (
                  <div className="character-section">
                    <h5 className="character-subsection-title">次要角色（合并）</h5>
                    <div className="character-grid">
                      {mergedSecondaryChars.map((char) => (
                        <div
                          key={`merged-${char.name}`}
                          className="character-card-item clickable merged"
                          onClick={() => openMergedCharacterModal(char)}
                          title={`来自组件: ${char.componentId}`}
                        >
                          <div className="character-card-header">
                            <div className="character-name-row">
                              <span className="character-name-display">{char.name || '未命名角色'}</span>
                              <span className="character-gender-tag">{char.gender}</span>
                            </div>
                            {characterData.findIndex(c => c.name === char.name) === -1 && (
                              <span className="character-source-badge" title="来自其他组件">其他</span>
                            )}
                          </div>
                          <div className="character-desc-display">
                            {char.description || '暂无简介'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      case 'card-list': {
        // 通用卡片列表
        const cardFields = comp.config.cardFields || [
          { key: 'name', label: '名称', type: 'text' },
          { key: 'description', label: '描述', type: 'textarea' },
        ];
        const cardData = (comp.value as Record<string, unknown>[]) || [];
        return (
          <div className="comp-card-list">
            <div className="card-grid">
              {cardData.map((card, cardIndex) => (
                <div key={cardIndex} className="card-item">
                  <div className="card-header">
                    <span className="card-number">#{cardIndex + 1}</span>
                    <button 
                      className="card-delete"
                      onClick={() => updateValue(cardData.filter((_, i) => i !== cardIndex))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="card-body">
                    {cardFields.map((field: { key: string; label: string; type: string }) => (
                      <div key={field.key} className="card-field">
                        <label className="card-field-label">{field.label}</label>
                        {field.type === 'image' ? (
                          <div className="card-field-image">
                            {card[field.key] ? (
                              <div className="card-image-preview">
                                <img src={card[field.key] as string} alt={field.label} />
                                <div className="card-image-overlay">
                                  <button onClick={() => {
                                    setCurrentImageId(`card-${cardIndex}-${field.key}`);
                                    fileInputRef.current?.click();
                                  }}>更换</button>
                                  <button onClick={() => {
                                    const newData = [...cardData];
                                    newData[cardIndex] = { ...card, [field.key]: '' };
                                    updateValue(newData);
                                  }}>删除</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="card-image-upload"
                                onClick={() => {
                                  setCurrentImageId(`card-${cardIndex}-${field.key}`);
                                  fileInputRef.current?.click();
                                }}
                              >
                                <Image size={20} />
                                <span>上传图片</span>
                              </button>
                            )}
                          </div>
                        ) : field.type === 'textarea' ? (
                          <textarea
                            className="card-field-textarea"
                            value={(card[field.key] as string) || ''}
                            onChange={(e) => {
                              const newData = [...cardData];
                              newData[cardIndex] = { ...card, [field.key]: e.target.value };
                              updateValue(newData);
                            }}
                            placeholder={`输入${field.label}...`}
                            rows={2}
                          />
                        ) : (
                          <input
                            type="text"
                            className="card-field-input"
                            value={(card[field.key] as string) || ''}
                            onChange={(e) => {
                              const newData = [...cardData];
                              newData[cardIndex] = { ...card, [field.key]: e.target.value };
                              updateValue(newData);
                            }}
                            placeholder={`输入${field.label}...`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button 
              className="card-add-btn"
              onClick={() => {
                const newCard: Record<string, unknown> = {};
                cardFields.forEach((f: { key: string }) => newCard[f.key] = '');
                updateValue([...cardData, newCard]);
              }}
            >
              <Plus size={16} />
              <span>添加卡片</span>
            </button>
          </div>
        );
      }

      case 'rank-system': {
        // 等级体系组件
        const rankData = (comp.value as { level: number; name: string; description: string }[]) || [];
        return (
          <div className="comp-rank-system">
            <div className="rank-list">
              {rankData.map((rank, idx) => (
                <div key={idx} className="rank-item">
                  <div className="rank-level">
                    <span className="level-badge">{rank.level || idx + 1}</span>
                  </div>
                  <div className="rank-content">
                    <input
                      type="text"
                      className="rank-name-input"
                      value={rank.name || ''}
                      onChange={(e) => {
                        const newData = [...rankData];
                        newData[idx] = { ...rank, name: e.target.value };
                        updateValue(newData);
                      }}
                      placeholder="等级名称（如：炼气期、筑基期）"
                    />
                    <textarea
                      className="rank-desc-input"
                      value={rank.description || ''}
                      onChange={(e) => {
                        const newData = [...rankData];
                        newData[idx] = { ...rank, description: e.target.value };
                        updateValue(newData);
                      }}
                      placeholder="等级描述、特征、能力..."
                      rows={2}
                    />
                  </div>
                  <button 
                    className="rank-delete-btn"
                    onClick={() => {
                      const newData = rankData.filter((_, i) => i !== idx);
                      // 重新计算等级序号
                      newData.forEach((r, i) => r.level = i + 1);
                      updateValue(newData);
                    }}
                    title="删除等级"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {rankData.length === 0 && (
              <div className="rank-empty">
                <TrendingUp size={32} />
                <span>暂无等级，点击添加</span>
              </div>
            )}
            <button 
              className="rank-add-btn"
              onClick={() => {
                updateValue([...rankData, { 
                  level: rankData.length + 1, 
                  name: '', 
                  description: '' 
                }]);
              }}
            >
              <Plus size={16} />
              <span>添加等级</span>
            </button>
          </div>
        );
      }

      case 'faction': {
        // 势力组件
        const factionData = (comp.value as FactionData[]) || [];
        
        // 切换势力展开状态
        const toggleFaction = (factionId: string) => {
          setExpandedFactions(prev => ({
            ...prev,
            [factionId]: !prev[factionId]
          }));
        };
        
        // 打开势力编辑弹窗
        const openFactionModal = (faction: FactionData | null, parentId: string | null = null) => {
          setFactionModal({
            isOpen: true,
            compId: comp.id,
            moduleId: moduleId,
            editId: faction?.id || null,
            parentId: parentId,
            form: faction 
              ? { name: faction.name, summary: faction.summary || '', details: faction.details || '', levels: [...faction.levels] }
              : { name: '', summary: '', details: '', levels: [] },
            newLevel: ''
          });
        };
        
        // 删除势力（递归）
        const deleteFaction = (factions: FactionData[], targetId: string): FactionData[] => {
          return factions
            .filter(f => f.id !== targetId)
            .map(f => ({
              ...f,
              children: f.children ? deleteFaction(f.children, targetId) : undefined
            }));
        };
        
        // 渲染势力树
        const renderFactionTree = (factions: FactionData[], level: number = 0): React.ReactNode => {
          return factions.map(faction => {
            const hasChildren = faction.children && faction.children.length > 0;
            const isExpanded = expandedFactions[faction.id];
            
            return (
              <div key={faction.id} className="faction-tree-item">
                <div className="faction-tree-row" style={{ paddingLeft: `${level * 24}px` }}>
                  {hasChildren ? (
                    <button
                      className="faction-toggle-btn"
                      onClick={() => toggleFaction(faction.id)}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  ) : (
                    <div className="faction-toggle-placeholder" />
                  )}
                  <div className="faction-tree-content">
                    <div className="faction-display">
                      <div className="faction-name-display">{faction.name}</div>
                      {faction.summary && (
                        <div className="faction-summary-display">
                          <span className="faction-info-label-text">简述</span>
                          <p className="faction-info-text">{faction.summary}</p>
                        </div>
                      )}
                      {faction.details && (
                        <div className="faction-details-display">
                          <span className="faction-info-label-text">详细信息</span>
                          <p className="faction-info-text">{faction.details}</p>
                        </div>
                      )}
                      {faction.levels.length > 0 && (
                        <div className="faction-levels-display">
                          {faction.levels.map((lvl, idx) => (
                            <div key={idx} className="level-badge">
                              <span className="level-order-small">{idx + 1}</span>
                              <span>{lvl}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="faction-actions-display">
                        <button
                          className="edit-faction-btn"
                          onClick={() => openFactionModal(faction)}
                          title="编辑"
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          className="add-child-btn"
                          onClick={() => openFactionModal(null, faction.id)}
                          title="添加子势力"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="delete-faction-btn"
                          onClick={() => {
                            if (confirm('确定要删除这个势力吗？删除后其子势力也会被删除。')) {
                              updateValue(deleteFaction(factionData, faction.id));
                            }
                          }}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {hasChildren && isExpanded && (
                  <div className="faction-children">
                    {renderFactionTree(faction.children!, level + 1)}
                  </div>
                )}
              </div>
            );
          });
        };
        
        return (
          <div className="comp-faction">
            {factionData.length === 0 ? (
              <div className="faction-empty">
                <Building2 size={32} />
                <span>暂无势力，点击添加</span>
              </div>
            ) : (
              <div className="faction-tree">
                {renderFactionTree(factionData)}
              </div>
            )}
            <button 
              className="faction-add-btn"
              onClick={() => openFactionModal(null)}
            >
              <Plus size={16} />
              <span>添加势力</span>
            </button>
          </div>
        );
      }

      default:
        return <div className="comp-unsupported">不支持的组件类型: {comp.type}</div>;
    }
  };

  // ============ 渲染 ============

  return (
    <div className="work-info-manager">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      {/* 顶部工具栏 */}
      <div className="wim-toolbar">
        <div className="toolbar-left">
          <button className="template-btn" onClick={() => setShowTemplateSelector(!showTemplateSelector)}>
            <LayoutTemplate size={16} />
            <span>{template.name}</span>
            <ChevronRight size={14} className={showTemplateSelector ? 'rotated' : ''} />
          </button>
          <span className={`save-status ${hasUnsavedChanges ? 'unsaved' : 'saved'}`}>
            {hasUnsavedChanges ? '未保存' : '已保存'}
          </span>
        </div>
        <div className="toolbar-right">
          {workId && (
            <button 
              className="save-btn" 
              onClick={async () => {
                try {
                  // 先保存到本地缓存
                  const templateData = {
                    templateId: template.id,
                    modules: template.modules,
                    lastModified: Date.now()
                  };
                  try {
                    saveToCache(templateData, workId || null, template.id);
                  } catch (error) {
                    console.error('保存到本地缓存失败:', error);
                  }

                  // 保存作品信息到数据库（如果有修改）
                  const workSaved = await saveWorkInfoToMetadata(template, originalWorkDataSnapshot);
                  if (workSaved) {
                    // 更新快照为当前数据
                    const componentDataFromTemplate = extractComponentDataFromTemplate(template.modules);
                    const currentDataStr = JSON.stringify({
                      component_data: componentDataFromTemplate
                    });
                    setOriginalWorkDataSnapshot(currentDataStr);
                    setHasUnsavedChanges(false);
                    alert('保存成功！');
                  } else {
                    // 即使没有修改，也更新缓存
                    setHasUnsavedChanges(false);
                    alert('数据未修改，无需保存');
                  }
                } catch (error) {
                  console.error('手动保存失败:', error);
                  alert('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
                }
              }}
              title="保存"
            >
              <Save size={16} />
            </button>
          )}
          <button 
            className={`edit-btn ${isEditMode ? 'active' : ''}`} 
            onClick={async () => {
              const wasEditMode = isEditMode;
              
              if (!wasEditMode) {
                // 进入编辑模式：保存原始模板结构快照
                const cleanedModules = cleanTemplateStructure(template.modules);
                const snapshot = JSON.stringify(cleanedModules);
                setOriginalTemplateSnapshot(snapshot);
                setIsEditMode(true);
              } else {
                // 退出编辑模式：保存模板结构（如果有修改）
                setIsEditMode(false);
                try {
                  const templateSaved = await saveTemplateStructure(originalTemplateSnapshot);
                  if (templateSaved) {
                    console.log('✅ 模板结构已保存');
                  } else {
                    console.log('ℹ️ 模板结构未修改，未保存');
                  }
                  // 清除快照
                  setOriginalTemplateSnapshot(null);
                } catch (error) {
                  console.error('保存失败:', error);
                  alert('保存模板失败: ' + (error instanceof Error ? error.message : '未知错误'));
                }
              }
            }}
            title={isEditMode ? '完成编辑并保存模板' : '编辑模板结构'}
          >
            {isEditMode ? <Check size={16} /> : <Settings size={16} />}
          </button>
        </div>
      </div>

      {/* 模板选择器 */}
      {showTemplateSelector && (
        <div className="template-panel">
          <div className="panel-header">
            <h4>选择模板</h4>
            <button onClick={() => setShowTemplateSelector(false)}><X size={16} /></button>
          </div>
          <div className="template-grid">
            {/* 模板列表 */}
            {loadingTemplates ? (
              <div className="template-loading">加载中...</div>
            ) : userTemplates.length > 0 ? (
              userTemplates.map(dbTemplate => {
                // 将数据库模板转换为 TemplateConfig 格式
                const templateConfig: TemplateConfig = {
                  id: `db-${dbTemplate.id}`,
                  name: dbTemplate.name,
                  description: dbTemplate.description || '',
                  modules: (dbTemplate.template_config && dbTemplate.template_config.modules) ? (dbTemplate.template_config.modules as ModuleConfig[]) : []
                };
                
                return (
                  <button 
                    key={`db-${dbTemplate.id}`} 
                    className={`template-card ${template.id === templateConfig.id ? 'active' : ''}`} 
                    onClick={() => applyDatabaseTemplate(dbTemplate)}
                  >
                    <div className="card-name">{dbTemplate.name || '未命名模板'}</div>
                    <div className="card-desc">{dbTemplate.description || '用户自定义模板'}</div>
                    {dbTemplate.is_public && <div className="card-badge">公开</div>}
                    {dbTemplate.is_system && <div className="card-badge system">系统</div>}
                  </button>
                );
              })
            ) : (
              <div className="template-empty">暂无模板</div>
            )}
            
            {/* 创建新模板按钮 */}
            <button 
              className="template-card create-template-card" 
              onClick={() => {
                setShowTemplateSelector(false);
                setShowCreateTemplate(true);
              }}
            >
              <Plus size={24} />
              <div className="card-name">创建新模板</div>
              <div className="card-desc">基于当前配置创建新模板</div>
            </button>
          </div>
        </div>
      )}

      {/* 创建模板弹窗 */}
      {showCreateTemplate && (
        <div className="modal-overlay" onClick={() => setShowCreateTemplate(false)}>
          <div className="modal-content create-template-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建新模板</h3>
              <button className="modal-close" onClick={() => setShowCreateTemplate(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>模板名称 <span className="required">*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={createTemplateForm.name}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, name: e.target.value })}
                  placeholder="请输入模板名称"
                />
              </div>
              <div className="form-group">
                <label>模板描述</label>
                <textarea
                  className="form-input"
                  value={createTemplateForm.description}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, description: e.target.value })}
                  placeholder="请输入模板描述（可选）"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>作品类型</label>
                <select
                  className="form-input"
                  value={createTemplateForm.work_type}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, work_type: e.target.value })}
                >
                  <option value="novel">小说</option>
                  <option value="script">剧本</option>
                  <option value="short_story">短篇</option>
                  <option value="film_script">影视剧本</option>
                </select>
              </div>
              <div className="form-group">
                <label>分类</label>
                <input
                  type="text"
                  className="form-input"
                  value={createTemplateForm.category}
                  onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, category: e.target.value })}
                  placeholder="请输入分类（可选）"
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={createTemplateForm.is_public}
                    onChange={(e) => setCreateTemplateForm({ ...createTemplateForm, is_public: e.target.checked })}
                  />
                  <span>公开模板（其他用户可以使用）</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateTemplate(false)}>
                取消
              </button>
              <div className="footer-spacer" />
              <button className="btn-primary" onClick={handleCreateTemplate}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 模块标签栏 */}
      <div className="module-tabs">
        {template.modules.map((m, i) => (
          <button
            key={m.id}
            className={`module-tab ${i === activeModuleIndex ? 'active' : ''}`}
            onClick={() => setActiveModuleIndex(i)}
            style={{ '--tab-color': m.color } as React.CSSProperties}
          >
            <span className="tab-icon" style={{ color: m.color }}>{IconMap[m.icon] || <LayoutGrid size={16} />}</span>
            <span>{m.name}</span>
            {isEditMode && template.modules.length > 1 && (
              <button className="tab-del" onClick={(e) => { e.stopPropagation(); deleteModule(i); }}><X size={12} /></button>
            )}
          </button>
        ))}
        {isEditMode && (
          <button className="module-tab add-tab" onClick={() => setShowAddModule(true)}>
            <Plus size={16} />
          </button>
        )}
      </div>


      {/* 模块内容 */}
      <div className="module-content">
        {template.modules.length === 0 ? (
          <div className="empty-state">
            <LayoutTemplate size={48} />
            <h3>暂无模块</h3>
            <p>点击"编辑"添加模块</p>
          </div>
        ) : activeModule ? (
          <div className="module-page">
            <div className="page-header">
              <div className="page-title">
                <div className="title-icon" style={{ background: activeModule.color }}>{IconMap[activeModule.icon] || <LayoutGrid size={20} />}</div>
                <h2>{activeModule.name}</h2>
              </div>
              <div className="page-nav">
                <button disabled={activeModuleIndex === 0} onClick={() => setActiveModuleIndex(activeModuleIndex - 1)}><ChevronLeft size={18} /></button>
                <span>{activeModuleIndex + 1}/{template.modules.length}</span>
                <button disabled={activeModuleIndex === template.modules.length - 1} onClick={() => setActiveModuleIndex(activeModuleIndex + 1)}><ChevronRight size={18} /></button>
              </div>
            </div>

            <div className="page-body">
              {activeModule.components.map(comp => {
                // 文本框、列表、角色卡片、等级体系显示生成按钮（固定选项的不需要）
                const showGenerateBtn = ['text', 'textarea', 'list', 'character-card', 'rank-system'].includes(comp.type);
                return (
                  <div key={comp.id} className="comp-wrapper">
                    <div className="comp-header">
                      <label className="comp-label">{comp.label}</label>
                      <div className="comp-header-actions">
                        {showGenerateBtn && (
                          <button 
                            className="comp-generate-btn" 
                            onClick={() => handleGenerateComponent(comp, activeModule.id)}
                            disabled={generatingComponents[`${activeModule.id}-${comp.id}`]}
                            title={comp.generatePrompt || '生成内容'}
                          >
                            <Sparkles size={14} />
                            <span>{generatingComponents[`${activeModule.id}-${comp.id}`] ? '生成中...' : '生成'}</span>
                          </button>
                        )}
                        {isEditMode && (
                          <div className="comp-actions">
                            <button className="comp-edit" onClick={() => startEditComponent(comp)} title="编辑组件">
                              <Settings size={14} />
                            </button>
                            <button className="comp-del" onClick={() => deleteComponent(comp.id)} title="删除组件">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {renderComponent(comp, activeModule.id)}
                  </div>
                );
              })}

              {isEditMode && (
                <div className="add-comp-area">
                  <button className="add-comp-btn" onClick={() => setShowAddComponent(true)}>
                    <Plus size={16} />
                    <span>添加组件</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* 添加/编辑组件弹窗 */}
      {showAddComponent && (
        <div className="modal-overlay" onClick={closeAddComponentModal}>
          <div className="modal-content add-component-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingComponentId 
                  ? '编辑组件' 
                  : (addComponentStep === 'type' ? '选择组件类型' : '配置组件')
                }
              </h3>
              <button className="modal-close" onClick={closeAddComponentModal}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {addComponentStep === 'type' && !editingComponentId ? (
                // 第一步：选择组件类型（仅新增时显示）
                <div className="component-type-selector">
                  <div className="type-category">
                    <div className="category-label">基础组件</div>
                    <div className="type-grid">
                      {componentRegistry.filter(c => c.category === 'basic').map(c => (
                        <button
                          key={c.type}
                          className="type-card"
                          onClick={() => selectComponentType(c.type)}
                        >
                          <div className="type-icon">{c.icon}</div>
                          <div className="type-info">
                            <div className="type-name">{c.name}</div>
                            <div className="type-desc">{c.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="type-category">
                    <div className="category-label">高级组件</div>
                    <div className="type-grid">
                      {componentRegistry.filter(c => c.category === 'advanced').map(c => (
                        <button
                          key={c.type}
                          className="type-card"
                          onClick={() => selectComponentType(c.type)}
                        >
                          <div className="type-icon">{c.icon}</div>
                          <div className="type-info">
                            <div className="type-name">{c.name}</div>
                            <div className="type-desc">{c.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="type-category">
                    <div className="category-label">交互组件</div>
                    <div className="type-grid">
                      {componentRegistry.filter(c => c.category === 'interactive').map(c => (
                        <button
                          key={c.type}
                          className="type-card"
                          onClick={() => selectComponentType(c.type)}
                        >
                          <div className="type-icon">{c.icon}</div>
                          <div className="type-info">
                            <div className="type-name">{c.name}</div>
                            <div className="type-desc">{c.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // 第二步：配置组件详情
                <div className="component-config-form">
                  <div className="selected-type-info">
                    <span className="selected-type-icon">
                      {componentRegistry.find(c => c.type === newComponentForm.type)?.icon}
                    </span>
                    <span className="selected-type-name">
                      {componentRegistry.find(c => c.type === newComponentForm.type)?.name}
                    </span>
                    {!editingComponentId && (
                      <button 
                        className="change-type-btn"
                        onClick={() => setAddComponentStep('type')}
                      >
                        更换类型
                      </button>
                    )}
                  </div>

                  <div className="form-section">
                    <div className="section-title">基本信息</div>
                    <div className="form-group">
                      <label>组件名称 <span className="required">*</span></label>
                      <input 
                        type="text" 
                        value={newComponentForm.label} 
                        onChange={(e) => setNewComponentForm({ ...newComponentForm, label: e.target.value })} 
                        placeholder="例如：作品简介、角色列表..."
                        autoFocus
                      />
                    </div>

                    {/* 组件特定配置 */}
                    {newComponentForm.type === 'multiselect' && (
                      <>
                      <div className="form-group">
                        <label>标签选项 <span className="required">*</span></label>
                        <div className="tag-options-config">
                          {(Array.isArray(newComponentForm.config.options) ? newComponentForm.config.options : []).map((opt: { label: string; value: string; color: string }, index: number) => (
                            <div key={index} className="tag-option-item">
                              <span className="tag-preview" style={{ background: opt.color }}>{opt.label}</span>
                              <input
                                type="text"
                                value={opt.label}
                                onChange={(e) => {
                                  const newOptions = [...(Array.isArray(newComponentForm.config.options) ? newComponentForm.config.options : [])];
                                  newOptions[index] = { ...opt, label: e.target.value, value: e.target.value.toLowerCase() };
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                }}
                                placeholder="标签名称"
                                className="tag-label-input"
                              />
                              <input
                                type="color"
                                className="tag-color-input"
                                value={opt.color}
                                onChange={(e) => {
                                  const newOptions = [...(Array.isArray(newComponentForm.config.options) ? newComponentForm.config.options : [])];
                                  newOptions[index] = { ...opt, color: e.target.value };
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                }}
                                title="选择颜色"
                              />
                              <button
                                className="tag-remove-btn"
                                onClick={() => {
                                  const newOptions = (Array.isArray(newComponentForm.config.options) ? newComponentForm.config.options : []).filter((_: unknown, i: number) => i !== index);
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="tag-add-row">
                            <input
                              type="text"
                              value={newTagOption.label}
                              onChange={(e) => setNewTagOption({ ...newTagOption, label: e.target.value })}
                              placeholder="新标签名称"
                              className="tag-label-input"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newTagOption.label.trim()) {
                                  const newOptions = [...(Array.isArray(newComponentForm.config.options) ? newComponentForm.config.options : []), {
                                    label: newTagOption.label.trim(),
                                    value: newTagOption.label.trim().toLowerCase(),
                                    color: newTagOption.color
                                  }];
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                  setNewTagOption({ label: '', color: '#64748b' });
                                }
                              }}
                            />
                            <input
                              type="color"
                              className="tag-color-input"
                              value={newTagOption.color}
                              onChange={(e) => setNewTagOption({ ...newTagOption, color: e.target.value })}
                              title="选择颜色"
                            />
                            <button
                              className="tag-add-btn"
                              onClick={() => {
                                if (newTagOption.label.trim()) {
                                  const newOptions = [...(Array.isArray(newComponentForm.config.options) ? newComponentForm.config.options : []), {
                                    label: newTagOption.label.trim(),
                                    value: newTagOption.label.trim().toLowerCase(),
                                    color: newTagOption.color
                                  }];
                                  setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, options: newOptions } });
                                  setNewTagOption({ label: '', color: '#64748b' });
                                }
                              }}
                              disabled={!newTagOption.label.trim()}
                            >
                              <Plus size={14} />
                              添加
                            </button>
                          </div>
                        </div>
                        {(Array.isArray(newComponentForm.config.options) ? newComponentForm.config.options.length === 0 : true) && (
                          <div className="tabs-hint">请至少添加一个标签选项</div>
                        )}
                      </div>
                      <div className="form-group">
                        <label>最大可选数量</label>
                        <div className="max-count-config">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            className="max-count-input"
                            value={typeof newComponentForm.config.maxCount === 'number' ? newComponentForm.config.maxCount : 5}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 5;
                              setNewComponentForm({ 
                                ...newComponentForm, 
                                config: { ...newComponentForm.config, maxCount: Math.max(1, Math.min(20, val)) } 
                              });
                            }}
                          />
                          <span className="max-count-hint">用户最多可选择 {typeof newComponentForm.config.maxCount === 'number' ? newComponentForm.config.maxCount : 5} 个标签</span>
                        </div>
                      </div>
                      </>
                    )}
                    
                    {newComponentForm.type === 'table' && (
                      <div className="form-group">
                        <label>表格列名</label>
                        <textarea
                          rows={4}
                          placeholder="每行一个列名&#10;例如：&#10;姓名&#10;身份&#10;简介"
                          defaultValue={(Array.isArray(newComponentForm.config.columns) ? newComponentForm.config.columns : [])
                            .map((c: { label: string }) => c.label)
                            .join('\n')}
                          onChange={(e) => {
                            const columns = e.target.value.split('\n').filter(Boolean).map(label => ({
                              key: label.trim().toLowerCase(),
                              label: label.trim()
                            }));
                            setNewComponentForm({ ...newComponentForm, config: { ...newComponentForm.config, columns } });
                          }}
                        />
                      </div>
                    )}
                    
                    {newComponentForm.type === 'tabs' && (
                      <div className="form-group">
                        <label>分页标签 <span className="required">*</span></label>
                        <div className="tabs-config-list">
                          {newComponentForm.tabsConfig.map((tab, index) => (
                            <div key={tab.id} className="tab-config-item">
                              <span className="tab-order">{index + 1}</span>
                              <input
                                type="text"
                                value={tab.label}
                                onChange={(e) => {
                                  const newTabs = [...newComponentForm.tabsConfig];
                                  newTabs[index] = { ...tab, label: e.target.value };
                                  setNewComponentForm({ ...newComponentForm, tabsConfig: newTabs });
                                }}
                                placeholder="分页名称"
                              />
                              <button
                                className="tab-remove-btn"
                                onClick={() => {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    tabsConfig: newComponentForm.tabsConfig.filter((_, i) => i !== index)
                                  });
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="tab-add-row">
                            <input
                              type="text"
                              value={newTabName}
                              onChange={(e) => setNewTabName(e.target.value)}
                              placeholder="输入新分页名称"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newTabName.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    tabsConfig: [...newComponentForm.tabsConfig, { id: `tab-${Date.now()}`, label: newTabName.trim() }]
                                  });
                                  setNewTabName('');
                                }
                              }}
                            />
                            <button
                              className="tab-add-btn"
                              onClick={() => {
                                if (newTabName.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    tabsConfig: [...newComponentForm.tabsConfig, { id: `tab-${Date.now()}`, label: newTabName.trim() }]
                                  });
                                  setNewTabName('');
                                }
                              }}
                              disabled={!newTabName.trim()}
                            >
                              <Plus size={14} />
                              添加
                            </button>
                          </div>
                        </div>
                        {newComponentForm.tabsConfig.length === 0 && (
                          <div className="tabs-hint">请至少添加一个分页</div>
                        )}
                      </div>
                    )}
                    
                    {newComponentForm.type === 'card-list' && (
                      <div className="form-group">
                        <label>卡片字段 <span className="required">*</span></label>
                        <p className="field-hint">定义每个卡片包含的字段，例如：头像、姓名、描述等</p>
                        <div className="card-fields-config">
                          {newComponentForm.cardFields.map((field, index) => (
                            <div key={index} className="card-field-config-item">
                              <span className="field-order">{index + 1}</span>
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => {
                                  const newFields = [...newComponentForm.cardFields];
                                  newFields[index] = { ...field, label: e.target.value };
                                  setNewComponentForm({ ...newComponentForm, cardFields: newFields });
                                }}
                                placeholder="字段名称"
                                className="field-label-input"
                              />
                              <select
                                value={field.type}
                                onChange={(e) => {
                                  const newFields = [...newComponentForm.cardFields];
                                  newFields[index] = { ...field, type: e.target.value as 'text' | 'textarea' | 'image' };
                                  setNewComponentForm({ ...newComponentForm, cardFields: newFields });
                                }}
                                className="field-type-select"
                              >
                                <option value="text">单行文本</option>
                                <option value="textarea">多行文本</option>
                                <option value="image">图片</option>
                              </select>
                              <button
                                className="field-remove-btn"
                                onClick={() => {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    cardFields: newComponentForm.cardFields.filter((_, i) => i !== index)
                                  });
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <div className="card-field-add-row">
                            <input
                              type="text"
                              value={newCardFieldForm.label}
                              onChange={(e) => setNewCardFieldForm({ ...newCardFieldForm, label: e.target.value })}
                              placeholder="新字段名称"
                              className="field-label-input"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newCardFieldForm.label.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    cardFields: [...newComponentForm.cardFields, { 
                                      key: newCardFieldForm.label.toLowerCase().replace(/\s+/g, '_'),
                                      label: newCardFieldForm.label.trim(), 
                                      type: newCardFieldForm.type 
                                    }]
                                  });
                                  setNewCardFieldForm({ label: '', type: 'text' });
                                }
                              }}
                            />
                            <select
                              value={newCardFieldForm.type}
                              onChange={(e) => setNewCardFieldForm({ ...newCardFieldForm, type: e.target.value as 'text' | 'textarea' | 'image' })}
                              className="field-type-select"
                            >
                              <option value="text">单行文本</option>
                              <option value="textarea">多行文本</option>
                              <option value="image">图片</option>
                            </select>
                            <button
                              className="field-add-btn"
                              onClick={() => {
                                if (newCardFieldForm.label.trim()) {
                                  setNewComponentForm({
                                    ...newComponentForm,
                                    cardFields: [...newComponentForm.cardFields, { 
                                      key: newCardFieldForm.label.toLowerCase().replace(/\s+/g, '_'),
                                      label: newCardFieldForm.label.trim(), 
                                      type: newCardFieldForm.type 
                                    }]
                                  });
                                  setNewCardFieldForm({ label: '', type: 'text' });
                                }
                              }}
                              disabled={!newCardFieldForm.label.trim()}
                            >
                              <Plus size={14} />
                              添加
                            </button>
                          </div>
                        </div>
                        {newComponentForm.cardFields.length === 0 && (
                          <div className="tabs-hint">请至少添加一个字段</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* tabs 组件不需要数据绑定配置 */}
                  {newComponentForm.type !== 'tabs' && (
                    <div className="form-section">
                      <div className="section-title">
                        数据绑定配置
                        <span className="section-hint">配置组件数据的存储键和依赖关系</span>
                      </div>
                      
                      <div className="form-group">
                        <label>
                          数据存储键 (dataKey) <span style={{ color: 'var(--error, #666666)' }}>*</span>
                          <span className="label-hint">用于在 component_data 中存储和读取数据，建议使用小写字母和下划线，如：characters、character_timeline。必填项，确保组件数据能够正确保存。</span>
                        </label>
                        <input
                          type="text"
                          value={newComponentForm.dataKey}
                          onChange={(e) => setNewComponentForm({ ...newComponentForm, dataKey: e.target.value.trim() })}
                          placeholder="例如：characters、character_timeline、world_locations（必填）"
                          style={{ fontFamily: 'monospace', borderColor: !newComponentForm.dataKey ? 'var(--error, #666666)' : undefined }}
                          required
                        />
                        {!newComponentForm.dataKey && (
                          <div style={{ color: 'var(--error, #666666)', fontSize: '12px', marginTop: '4px' }}>
                            ⚠️ 请填写 dataKey，否则组件数据无法正确保存
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label>
                          数据依赖 (dataDependencies)
                          <span className="label-hint">选择此组件需要依赖的其他组件数据键，例如时间线组件可以依赖角色列表的数据</span>
                        </label>
                        <DataDependenciesSelector
                          value={newComponentForm.dataDependencies}
                          onChange={(deps) => setNewComponentForm({ ...newComponentForm, dataDependencies: deps })}
                          template={template}
                          currentComponentId={editingComponentId || undefined}
                        />
                      </div>
                    </div>
                  )}

                  <div className="form-section">
                    <div className="section-title">
                      AI 提示词配置
                      <span className="section-hint">用于 AI 辅助生成和校验内容</span>
                    </div>
                    
                    <div className="form-group">
                      <label>
                        生成 Prompt
                        <span className="label-hint">AI 根据此提示词生成内容</span>
                      </label>
                      <textarea
                        rows={3}
                        value={newComponentForm.generatePrompt}
                        onChange={(e) => setNewComponentForm({ ...newComponentForm, generatePrompt: e.target.value })}
                        placeholder="例如：请根据小说的题材和背景，生成一段吸引读者的作品简介，包含主要角色和核心冲突..."
                      />
                    </div>

                    <div className="form-group">
                      <label>
                        检验 Prompt
                        <span className="label-hint">AI 根据此提示词检查内容质量</span>
                      </label>
                      <textarea
                        rows={3}
                        value={newComponentForm.validatePrompt}
                        onChange={(e) => setNewComponentForm({ ...newComponentForm, validatePrompt: e.target.value })}
                        placeholder="例如：请检查这段简介是否：1. 吸引读者兴趣 2. 包含核心冲突 3. 不剧透关键情节..."
                      />
                    </div>

                    <div className="form-group">
                      <label>
                        分析 Prompt
                        <span className="label-hint">AI 根据此提示词分析内容</span>
                      </label>
                      <textarea
                        rows={3}
                        value={newComponentForm.analysisPrompt}
                        onChange={(e) => setNewComponentForm({ ...newComponentForm, analysisPrompt: e.target.value })}
                        placeholder="例如：请分析这段内容的特点、风格、主题等..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {(addComponentStep === 'config' || editingComponentId) && (
              <div className="modal-footer">
                {!editingComponentId && (
                  <button
                    className="btn-secondary"
                    onClick={() => setAddComponentStep('type')}
                  >
                    上一步
                  </button>
                )}
                {editingComponentId && (
                  <button
                    className="btn-secondary"
                    onClick={closeAddComponentModal}
                  >
                    取消
                  </button>
                )}
                <div className="footer-spacer" />
                <button
                  className="btn-primary"
                  onClick={editingComponentId ? saveEditedComponent : addComponentToModule}
                  disabled={
                    !newComponentForm.label.trim() || 
                    (newComponentForm.type === 'tabs' && newComponentForm.tabsConfig.length === 0) || 
                    (newComponentForm.type === 'card-list' && newComponentForm.cardFields.length === 0) ||
                    (newComponentForm.type !== 'tabs' && !newComponentForm.dataKey?.trim()) // tabs 组件不需要 dataKey，其他组件必填
                  }
                >
                  {editingComponentId ? '保存修改' : '添加组件'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 添加模块弹窗 */}
      {showAddModule && (
        <div className="modal-overlay" onClick={closeAddModuleModal}>
          <div className="modal-content add-module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加模块</h3>
              <button className="modal-close" onClick={closeAddModuleModal}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>模块名称 <span className="required">*</span></label>
                <input 
                  type="text" 
                  value={newModuleForm.name} 
                  onChange={(e) => setNewModuleForm({ ...newModuleForm, name: e.target.value })} 
                  placeholder="例如：角色设定、世界观、剧情线..."
                  autoFocus
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>选择图标</label>
                  <div className="icon-grid">
                    {Object.keys(IconMap).map(icon => (
                      <button 
                        key={icon} 
                        className={`icon-btn ${newModuleForm.icon === icon ? 'active' : ''}`} 
                        onClick={() => setNewModuleForm({ ...newModuleForm, icon })} 
                        style={{ color: newModuleForm.color }}
                      >
                        {IconMap[icon]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label>选择颜色</label>
                  <div className="color-grid">
                    {['#000000', '#333333', '#666666', '#999999', '#cccccc', '#444444', '#222222', '#111111'].map(c => (
                      <button 
                        key={c} 
                        className={`color-btn ${newModuleForm.color === c ? 'active' : ''}`} 
                        style={{ background: c }} 
                        onClick={() => setNewModuleForm({ ...newModuleForm, color: c })} 
                      />
                    ))}
                  </div>
                </div>
              </div>
              
              {/* 预览 */}
              <div className="module-preview">
                <div className="preview-icon" style={{ background: newModuleForm.color }}>
                  {IconMap[newModuleForm.icon] || <LayoutGrid size={20} />}
                </div>
                <span className="preview-name">{newModuleForm.name || '模块名称'}</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeAddModuleModal}>
                取消
              </button>
              <div className="footer-spacer" />
              <button 
                className="btn-primary" 
                onClick={addModule} 
                disabled={!newModuleForm.name.trim()}
              >
                创建模块
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 角色编辑弹窗 */}
      {characterModal.isOpen && (
        <div className="modal-overlay" onClick={() => setCharacterModal({ ...characterModal, isOpen: false })}>
          <div className="modal-content character-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{characterModal.editIndex !== null ? '编辑角色' : '添加角色'}</h3>
              <button className="modal-close" onClick={() => setCharacterModal({ ...characterModal, isOpen: false })}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>角色名称 <span className="required">*</span></label>
                <input
                  type="text"
                  value={characterModal.form.name}
                  onChange={(e) => setCharacterModal({
                    ...characterModal,
                    form: { ...characterModal.form, name: e.target.value }
                  })}
                  placeholder="请输入角色名称"
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group half">
                  <label>性别</label>
                  <select
                    value={characterModal.form.gender}
                    onChange={(e) => setCharacterModal({
                      ...characterModal,
                      form: { ...characterModal.form, gender: e.target.value }
                    })}
                  >
                    <option value="男">男</option>
                    <option value="女">女</option>
                  </select>
                </div>
                <div className="form-group half">
                  <label>角色类型</label>
                  <select
                    value={characterModal.form.type}
                    onChange={(e) => setCharacterModal({
                      ...characterModal,
                      form: { ...characterModal.form, type: e.target.value }
                    })}
                  >
                    <option value="主要角色">主要角色</option>
                    <option value="次要角色">次要角色</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>角色简介</label>
                <textarea
                  value={characterModal.form.description}
                  onChange={(e) => setCharacterModal({
                    ...characterModal,
                    form: { ...characterModal.form, description: e.target.value }
                  })}
                  placeholder="请输入角色简介、性格特点、背景故事等..."
                  rows={5}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setCharacterModal({ ...characterModal, isOpen: false })}>
                取消
              </button>
              <div className="footer-spacer" />
              <button 
                className="btn-primary" 
                onClick={() => {
                  const module = template.modules.find(m => m.id === characterModal.moduleId);
                  if (!module) return;
                  
                  // 如果组件在分页中
                  if (characterModal.tabsComponentId && characterModal.tabId) {
                    const tabsComp = module.components.find(c => c.id === characterModal.tabsComponentId);
                    if (!tabsComp || tabsComp.type !== 'tabs' || !tabsComp.config.tabs) return;
                    
                    const tab = tabsComp.config.tabs.find(t => t.id === characterModal.tabId);
                    if (!tab) return;
                    
                    const subComp = tab.components.find(c => c.id === characterModal.compId);
                    if (!subComp) return;
                    
                    const currentData = (subComp.value as { name: string; gender: string; type: string; description: string }[]) || [];
                    let newData: typeof currentData;
                    
                    if (characterModal.editIndex !== null) {
                      // 编辑现有角色
                      newData = [...currentData];
                      newData[characterModal.editIndex] = { ...characterModal.form };
                    } else {
                      // 添加新角色
                      newData = [...currentData, { ...characterModal.form }];
                    }
                    
                    // 更新分页中的组件
                    const updatedTabs = tabsComp.config.tabs.map(t => {
                      if (t.id === characterModal.tabId) {
                        return {
                          ...t,
                          components: t.components.map(c => {
                            if (c.id === characterModal.compId) {
                              return { ...c, value: newData };
                            }
                            return c;
                          })
                        };
                      }
                      return t;
                    });
                    
                    const updatedTemplate = {
                      ...template,
                      modules: template.modules.map(m => {
                        if (m.id !== characterModal.moduleId) return m;
                        return {
                          ...m,
                          components: m.components.map(c => {
                            if (c.id === characterModal.tabsComponentId) {
                              return {
                                ...c,
                                config: {
                                  ...c.config,
                                  tabs: updatedTabs
                                }
                              };
                            }
                            return c;
                          })
                        };
                      })
                    };
                    
                    setTemplate(updatedTemplate);
                    
                    // 保存作品信息到 metadata
                    if (workId) {
                      saveWorkInfoToMetadata(updatedTemplate, null).catch(console.error);
                    }
                  } else {
                    // 组件不在分页中，直接更新
                    const comp = module.components.find(c => c.id === characterModal.compId);
                    if (!comp) return;
                    
                    const currentData = (comp.value as { name: string; gender: string; type: string; description: string }[]) || [];
                    let newData: typeof currentData;
                    
                    if (characterModal.editIndex !== null) {
                      // 编辑现有角色
                      newData = [...currentData];
                      newData[characterModal.editIndex] = { ...characterModal.form };
                    } else {
                      // 添加新角色
                      newData = [...currentData, { ...characterModal.form }];
                    }
                    
                    const updatedTemplate = {
                      ...template,
                      modules: template.modules.map(m => {
                        if (m.id === characterModal.moduleId) {
                          return {
                            ...m,
                            components: m.components.map(c => 
                              c.id === characterModal.compId ? { ...c, value: newData } : c
                            )
                          };
                        }
                        return m;
                      })
                    };
                    
                    updateComponentValue(characterModal.moduleId, characterModal.compId, newData);
                    
                    // 保存作品信息到 metadata
                    if (workId) {
                      saveWorkInfoToMetadata(updatedTemplate, null).catch(console.error);
                    }
                  }
                  
                  setCharacterModal({ ...characterModal, isOpen: false });
                }}
                disabled={!characterModal.form.name.trim()}
              >
                {characterModal.editIndex !== null ? '保存修改' : '添加角色'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 势力编辑弹窗 */}
      {factionModal.isOpen && (
        <div className="modal-overlay" onClick={() => setFactionModal({ ...factionModal, isOpen: false })}>
          <div className="modal-content faction-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{factionModal.editId ? '编辑势力' : (factionModal.parentId ? '添加子势力' : '添加势力')}</h3>
              <button className="modal-close" onClick={() => setFactionModal({ ...factionModal, isOpen: false })}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>势力名称 <span className="required">*</span></label>
                <input
                  type="text"
                  value={factionModal.form.name}
                  onChange={(e) => setFactionModal({
                    ...factionModal,
                    form: { ...factionModal.form, name: e.target.value }
                  })}
                  placeholder="请输入势力名称"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>势力简述</label>
                <textarea
                  value={factionModal.form.summary}
                  onChange={(e) => setFactionModal({
                    ...factionModal,
                    form: { ...factionModal.form, summary: e.target.value }
                  })}
                  placeholder="请输入势力简述..."
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>详细信息</label>
                <textarea
                  value={factionModal.form.details}
                  onChange={(e) => setFactionModal({
                    ...factionModal,
                    form: { ...factionModal.form, details: e.target.value }
                  })}
                  placeholder="请输入详细信息、背景故事等..."
                  rows={6}
                />
              </div>

              <div className="form-group">
                <label>等级阶梯</label>
                <div className="faction-levels-section">
                  <div className="levels-list">
                    {factionModal.form.levels.map((level, index) => (
                      <div key={index} className="level-item">
                        <span className="level-order">{index + 1}</span>
                        <span className="level-name">{level}</span>
                        <button
                          className="remove-level-btn"
                          onClick={() => {
                            setFactionModal({
                              ...factionModal,
                              form: {
                                ...factionModal.form,
                                levels: factionModal.form.levels.filter((_, i) => i !== index)
                              }
                            });
                          }}
                          title="删除"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="add-level-row">
                    <input
                      type="text"
                      value={factionModal.newLevel}
                      onChange={(e) => setFactionModal({ ...factionModal, newLevel: e.target.value })}
                      placeholder="输入等级名称"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && factionModal.newLevel.trim()) {
                          setFactionModal({
                            ...factionModal,
                            form: {
                              ...factionModal.form,
                              levels: [...factionModal.form.levels, factionModal.newLevel.trim()]
                            },
                            newLevel: ''
                          });
                        }
                      }}
                    />
                    <button
                      className="add-level-btn"
                      onClick={() => {
                        if (factionModal.newLevel.trim()) {
                          setFactionModal({
                            ...factionModal,
                            form: {
                              ...factionModal.form,
                              levels: [...factionModal.form.levels, factionModal.newLevel.trim()]
                            },
                            newLevel: ''
                          });
                        }
                      }}
                      disabled={!factionModal.newLevel.trim()}
                    >
                      <Plus size={14} />
                      添加
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setFactionModal({ ...factionModal, isOpen: false })}>
                取消
              </button>
              <div className="footer-spacer" />
              <button 
                className="btn-primary" 
                onClick={() => {
                  const module = template.modules.find(m => m.id === factionModal.moduleId);
                  const comp = module?.components.find(c => c.id === factionModal.compId);
                  if (!comp) return;
                  
                  const currentData = (comp.value as FactionData[]) || [];
                  let newData: FactionData[];
                  
                  // 递归查找并添加/更新势力
                  const addOrUpdateFaction = (
                    factions: FactionData[], 
                    targetParentId: string | null, 
                    newFaction: FactionData,
                    editId: string | null
                  ): FactionData[] => {
                    if (editId) {
                      // 编辑现有势力
                      return factions.map(f => {
                        if (f.id === editId) {
                          return { ...f, ...newFaction, children: f.children };
                        }
                        if (f.children) {
                          return { ...f, children: addOrUpdateFaction(f.children, targetParentId, newFaction, editId) };
                        }
                        return f;
                      });
                    } else if (targetParentId) {
                      // 添加到父级势力
                      return factions.map(f => {
                        if (f.id === targetParentId) {
                          return { ...f, children: [...(f.children || []), newFaction] };
                        }
                        if (f.children) {
                          return { ...f, children: addOrUpdateFaction(f.children, targetParentId, newFaction, editId) };
                        }
                        return f;
                      });
                    }
                    return factions;
                  };
                  
                  const newFaction: FactionData = {
                    id: factionModal.editId || `faction-${Date.now()}`,
                    name: factionModal.form.name,
                    summary: factionModal.form.summary,
                    details: factionModal.form.details,
                    levels: factionModal.form.levels,
                    parentId: factionModal.parentId || undefined
                  };
                  
                  if (factionModal.editId) {
                    // 编辑现有势力
                    newData = addOrUpdateFaction(currentData, null, newFaction, factionModal.editId);
                  } else if (factionModal.parentId) {
                    // 添加子势力
                    newData = addOrUpdateFaction(currentData, factionModal.parentId, newFaction, null);
                  } else {
                    // 添加顶级势力
                    newData = [...currentData, newFaction];
                  }
                  
                  updateComponentValue(factionModal.moduleId, factionModal.compId, newData);
                  setFactionModal({ 
                    isOpen: false, 
                    compId: '', 
                    moduleId: '', 
                    editId: null, 
                    parentId: null,
                    form: { name: '', summary: '', details: '', levels: [] },
                    newLevel: ''
                  });
                }}
                disabled={!factionModal.form.name.trim()}
              >
                {factionModal.editId ? '保存修改' : '添加势力'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 生成数据预览弹窗 */}
      {generatePreviewModal.isOpen && generatePreviewModal.comp && (() => {
        const comp = generatePreviewModal.comp;
        return (
        <div className="modal-overlay" onClick={() => setGeneratePreviewModal({ ...generatePreviewModal, isOpen: false })}>
          <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>预览生成的数据 - {comp.label}</h3>
              <button className="modal-close" onClick={() => setGeneratePreviewModal({ ...generatePreviewModal, isOpen: false })}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ overflow: 'auto', maxHeight: '60vh' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                  生成的数据：
                </label>
                {comp.type === 'character-card' && Array.isArray(generatePreviewModal.generatedData) ? (
                  // 角色卡片类型：以卡片形式展示，支持编辑
                  <div className="comp-character-cards" style={{ marginTop: '12px' }}>
                    {(generatePreviewModal.generatedData as PreviewItem[]).map((char: PreviewItem, idx: number) => (
                      <div key={idx} style={{ marginBottom: '12px' }}>
                        {generatePreviewModal.editingIndex === idx ? (
                          // 编辑模式
                          <div style={{ padding: '12px', border: '2px solid var(--info, #999999)', borderRadius: '8px', backgroundColor: 'var(--bg-secondary, #f8f8f8)' }}>
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 500 }}>角色名称</label>
                              <input
                                type="text"
                                value={char.name || ''}
                                onChange={(e) => {
                                  const newData = [...(generatePreviewModal.generatedData as PreviewItem[])];
                                  newData[idx] = { ...char, name: e.target.value };
                                  setGeneratePreviewModal({ ...generatePreviewModal, generatedData: newData });
                                }}
                                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ddd' }}
                                placeholder="角色名称"
                              />
                            </div>
                            <div style={{ marginBottom: '12px', display: 'flex', gap: '12px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 500 }}>性别</label>
                                <select
                                  value={char.gender || '男'}
                                  onChange={(e) => {
                                    const newData = [...(generatePreviewModal.generatedData as PreviewItem[])];
                                    newData[idx] = { ...char, gender: e.target.value };
                                    setGeneratePreviewModal({ ...generatePreviewModal, generatedData: newData });
                                  }}
                                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ddd' }}
                                >
                                  <option value="男">男</option>
                                  <option value="女">女</option>
                                  <option value="其他">其他</option>
                                </select>
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 500 }}>类型</label>
                                <select
                                  value={char.type || '主要角色'}
                                  onChange={(e) => {
                                    const newData = [...(generatePreviewModal.generatedData as PreviewItem[])];
                                    newData[idx] = { ...char, type: e.target.value };
                                    setGeneratePreviewModal({ ...generatePreviewModal, generatedData: newData });
                                  }}
                                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ddd' }}
                                >
                                  <option value="主要角色">主要角色</option>
                                  <option value="次要角色">次要角色</option>
                                  <option value="配角">配角</option>
                                  <option value="反派">反派</option>
                                </select>
                              </div>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 500 }}>描述</label>
                              <textarea
                                value={char.description || ''}
                                onChange={(e) => {
                                  const newData = [...(generatePreviewModal.generatedData as PreviewItem[])];
                                  newData[idx] = { ...char, description: e.target.value };
                                  setGeneratePreviewModal({ ...generatePreviewModal, generatedData: newData });
                                }}
                                style={{ width: '100%', minHeight: '80px', padding: '6px', borderRadius: '4px', border: '1px solid #ddd', resize: 'vertical' }}
                                placeholder="角色描述"
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => {
                                  // 删除角色
                                  const currentData = generatePreviewModal.generatedData as PreviewItem[];
                                  const newData = currentData.filter((_: unknown, i: number) => i !== idx);
                                  setGeneratePreviewModal({ 
                                    ...generatePreviewModal, 
                                    generatedData: newData,
                                    editingIndex: null
                                  });
                                }}
                                style={{ padding: '6px 12px', backgroundColor: 'var(--error, #666666)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                删除
                              </button>
                              <button
                                onClick={() => setGeneratePreviewModal({ ...generatePreviewModal, editingIndex: null })}
                                style={{ padding: '6px 12px', backgroundColor: 'var(--text-tertiary, #666666)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                完成
                              </button>
                            </div>
                          </div>
                        ) : (
                          // 显示模式
                          <div 
                            className="character-card-item"
                            style={{ marginBottom: '12px', cursor: 'pointer', position: 'relative' }}
                            onClick={() => setGeneratePreviewModal({ ...generatePreviewModal, editingIndex: idx })}
                          >
                            <div className="character-card-header">
                              <div className="character-name-row">
                                <span className="character-name-display">{char.name || '未命名角色'}</span>
                                <span className="character-gender-tag">{char.gender || ''}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="character-type-tag" style={{ 
                                  fontSize: '12px', 
                                  padding: '2px 8px', 
                                  borderRadius: '4px',
                                  backgroundColor: '#e0e7ff',
                                  color: '#4338ca'
                                }}>
                                  {char.type || '角色'}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setGeneratePreviewModal({ ...generatePreviewModal, editingIndex: idx });
                                  }}
                                  style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: 'var(--info, #999999)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                  title="编辑"
                                >
                                  编辑
                                </button>
                              </div>
                            </div>
                            <div className="character-desc-display">
                              {char.description || '暂无简介'}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {/* 添加新角色按钮 */}
                    <button
                      onClick={() => {
                        const newChar = { name: '', gender: '男', type: '主要角色', description: '' };
                        const currentData = generatePreviewModal.generatedData as PreviewItem[];
                        const newData = [...currentData, newChar];
                        setGeneratePreviewModal({ 
                          ...generatePreviewModal, 
                          generatedData: newData,
                          editingIndex: newData.length - 1
                        });
                      }}
                      style={{ 
                        width: '100%', 
                        padding: '12px', 
                        marginTop: '8px',
                        backgroundColor: '#f3f4f6', 
                        border: '2px dashed #d1d5db', 
                        borderRadius: '8px', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Plus size={16} />
                      <span>添加角色</span>
                    </button>
                    {generatePreviewModal.generatedData.length === 0 && (
                      <div className="character-empty" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary, #666666)' }}>
                        <Users size={32} />
                        <span>暂无角色数据</span>
                      </div>
                    )}
                    {/* JSON编辑区域（可折叠） */}
                    <details style={{ marginTop: '16px' }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--text-tertiary, #666666)', fontSize: '14px', marginBottom: '8px' }}>
                        查看/编辑 JSON 数据
                      </summary>
                      <textarea
                        value={JSON.stringify(generatePreviewModal.generatedData, null, 2)}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            if (Array.isArray(parsed)) {
                              setGeneratePreviewModal({
                                ...generatePreviewModal,
                                generatedData: parsed
                              });
                            }
                          } catch {
                            // 如果解析失败，保持原样（用户可能正在编辑）
                          }
                        }}
                        style={{ width: '100%', minHeight: '200px', padding: '8px', fontFamily: 'monospace', fontSize: '14px', marginTop: '8px' }}
                      />
                    </details>
                  </div>
                ) : comp.type === 'text' || comp.type === 'textarea' ? (
                  <textarea
                    value={typeof generatePreviewModal.generatedData === 'string' ? generatePreviewModal.generatedData : JSON.stringify(generatePreviewModal.generatedData, null, 2)}
                    onChange={(e) => {
                      setGeneratePreviewModal({
                        ...generatePreviewModal,
                        generatedData: e.target.value
                      });
                    }}
                    style={{ width: '100%', minHeight: '200px', padding: '8px', fontFamily: 'monospace', fontSize: '14px' }}
                  />
                ) : (
                  <textarea
                    value={JSON.stringify(generatePreviewModal.generatedData, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setGeneratePreviewModal({
                          ...generatePreviewModal,
                          generatedData: parsed
                        });
                      } catch {
                        // 如果解析失败，保持原样（用户可能正在编辑）
                      }
                    }}
                    style={{ width: '100%', minHeight: '300px', padding: '8px', fontFamily: 'monospace', fontSize: '14px' }}
                  />
                )}
              </div>

              {generatePreviewModal.existingData && 
               (Array.isArray(generatePreviewModal.existingData) ? generatePreviewModal.existingData.length > 0 : generatePreviewModal.existingData !== '') && (
                <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                    现有数据（{Array.isArray(generatePreviewModal.existingData) ? `${generatePreviewModal.existingData.length} 项` : '已存在'}）：
                  </label>
                  {comp.type === 'character-card' && Array.isArray(generatePreviewModal.existingData) ? (
                    // 角色卡片类型：以卡片形式展示现有数据
                    <div className="comp-character-cards" style={{ marginTop: '12px' }}>
                      {(generatePreviewModal.existingData as PreviewItem[]).slice(0, 5).map((char: PreviewItem, idx: number) => (
                        <div 
                          key={idx} 
                          className="character-card-item"
                          style={{ marginBottom: '12px', cursor: 'default', opacity: 0.8 }}
                        >
                          <div className="character-card-header">
                            <div className="character-name-row">
                              <span className="character-name-display">{char.name || '未命名角色'}</span>
                              <span className="character-gender-tag">{char.gender || ''}</span>
                            </div>
                            <span className="character-type-tag" style={{ 
                              fontSize: '12px', 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              backgroundColor: '#e0e7ff',
                              color: '#4338ca'
                            }}>
                              {char.type || '角色'}
                            </span>
                          </div>
                          <div className="character-desc-display">
                            {char.description || '暂无简介'}
                          </div>
                        </div>
                      ))}
                      {generatePreviewModal.existingData.length > 5 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-tertiary, #666666)', fontSize: '12px', marginTop: '8px' }}>
                          ... 还有 {generatePreviewModal.existingData.length - 5} 个角色
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary, #666666)', maxHeight: '150px', overflow: 'auto' }}>
                      {Array.isArray(generatePreviewModal.existingData) ? (
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(generatePreviewModal.existingData.slice(0, 3), null, 2)}
                          {generatePreviewModal.existingData.length > 3 && `\n... 还有 ${generatePreviewModal.existingData.length - 3} 项`}
                        </pre>
                      ) : (
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                          {String(generatePreviewModal.existingData).substring(0, 200)}
                          {String(generatePreviewModal.existingData).length > 200 && '...'}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setGeneratePreviewModal({ ...generatePreviewModal, isOpen: false })}>
                取消
              </button>
              <div className="footer-spacer" />
              {/* 继续生成按钮 */}
              <button
                className="btn-secondary"
                onClick={handleContinueGenerate}
                disabled={generatePreviewModal.isGeneratingMore}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={14} />
                <span>{generatePreviewModal.isGeneratingMore ? '生成中...' : '继续生成'}</span>
              </button>
              {generatePreviewModal.existingData && 
               (Array.isArray(generatePreviewModal.existingData) ? generatePreviewModal.existingData.length > 0 : generatePreviewModal.existingData !== '') && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (!comp) return;
                    // 追加模式：将生成的数据追加到现有数据
                    let finalData: GeneratedDataType;
                    if (Array.isArray(generatePreviewModal.existingData) && Array.isArray(generatePreviewModal.generatedData)) {
                      finalData = [...(generatePreviewModal.existingData as PreviewItem[]), ...(generatePreviewModal.generatedData as PreviewItem[])];
                    } else if (Array.isArray(generatePreviewModal.existingData)) {
                      finalData = [...(generatePreviewModal.existingData as PreviewItem[]), generatePreviewModal.generatedData as PreviewItem];
                    } else {
                      // 对于非数组类型，追加意味着拼接
                      finalData = String(generatePreviewModal.existingData) + '\n' + String(generatePreviewModal.generatedData);
                    }
                    
                    updateComponentValue(
                      generatePreviewModal.moduleId,
                      comp.id,
                      finalData,
                      generatePreviewModal.tabId
                    );
                    setHasUnsavedChanges(true);
                    setGeneratePreviewModal({ ...generatePreviewModal, isOpen: false });
                  }}
                >
                  追加到现有数据
                </button>
              )}
                  <button
                className="btn-primary"
                onClick={() => {
                  // 替换模式：直接用生成的数据替换现有数据
                  if (comp) {
                    updateComponentValue(
                      generatePreviewModal.moduleId,
                      comp.id,
                      generatePreviewModal.generatedData,
                      generatePreviewModal.tabId
                    );
                    setHasUnsavedChanges(true);
                    setGeneratePreviewModal({ ...generatePreviewModal, isOpen: false });
                  }
                }}
              >
                {generatePreviewModal.existingData && 
                 (Array.isArray(generatePreviewModal.existingData) ? generatePreviewModal.existingData.length > 0 : generatePreviewModal.existingData !== '') 
                  ? '替换现有数据' 
                  : '确认使用'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
