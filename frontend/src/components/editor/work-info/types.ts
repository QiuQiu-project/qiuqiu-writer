
export type ComponentType = 
  | 'text'           // 单行文本
  | 'textarea'       // 多行文本
  | 'image'          // 图片上传
  | 'select'         // 单选下拉
  | 'multiselect'    // 多选标签
  | 'tags'           // 标签组件
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
  // AI Prompt 配置
  generatePrompt?: string;   
  generatePromptId?: number; 
  validatePrompt?: string;   
  validatePromptId?: number; 
  analysisPrompt?: string;   
  analysisPromptId?: number; 
  // 组件数据
  value: unknown;
}

export interface ModuleConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  components: ComponentConfig[];
}

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  modules: ModuleConfig[];
  lastModified?: number;
  templateId?: string; // 用于 metadata 存储
  [key: string]: unknown;
}

export interface WorkMetadata {
  template_config?: {
    templateId?: string;
    modules?: ModuleConfig[];
    lastModified?: number;
  };
  component_data?: Record<string, unknown>;
}

export interface WorkData {
  metadata?: WorkMetadata;
}

export interface CharacterData {
  id: string;
  name: string;
  gender: string;
  [key: string]: unknown;
}

export interface FactionData {
  id: string;
  name: string;
  summary?: string;
  details?: string;
  levels: string[];
  parentId?: string;
  children?: FactionData[];
}

export interface PreviewItem {
  [key: string]: unknown;
  name?: string;
  gender?: string;
  type?: string;
  description?: string;
}

export interface TimelineEditForm {
  characterIds: string[];
  characters: string[];
  time: string;
  event: string;
  description: string;
  location: string;
}
