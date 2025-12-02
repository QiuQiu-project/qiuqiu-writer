import { useState, useRef } from 'react';
import { 
  Plus, X, GripVertical, Type, Image, ChevronDown, ChevronRight, 
  Edit2, Trash2, Copy, Settings, LayoutTemplate, Save
} from 'lucide-react';
import './WorkInfoManager.css';

// 信息项类型
type InfoItemType = 'text' | 'textarea' | 'image' | 'tags' | 'list';

// 单个信息项
interface InfoItem {
  id: string;
  label: string;
  type: InfoItemType;
  value: string | string[];
  placeholder?: string;
  options?: string[]; // 用于 tags 类型的预设选项
  maxCount?: number; // 用于 tags 类型的最大选择数
}

// 信息分类/模块
interface InfoSection {
  id: string;
  name: string;
  icon?: string;
  expanded: boolean;
  items: InfoItem[];
}

// 模板定义
interface WorkInfoTemplate {
  id: string;
  name: string;
  description?: string;
  sections: InfoSection[];
}

// 预设模板
const defaultTemplates: WorkInfoTemplate[] = [
  {
    id: 'novel-basic',
    name: '小说基础模板',
    description: '适用于一般小说创作的基础信息模板',
    sections: [
      {
        id: 'basic',
        name: '基本信息',
        expanded: true,
        items: [
          { id: 'title', label: '作品名称', type: 'text', value: '', placeholder: '输入作品名称' },
          { id: 'author', label: '作者', type: 'text', value: '', placeholder: '输入作者名' },
          { id: 'genre', label: '题材类型', type: 'tags', value: [], options: ['言情', '悬疑', '科幻', '武侠', '玄幻', '都市', '历史', '军事'], maxCount: 2 },
          { id: 'summary', label: '作品简介', type: 'textarea', value: '', placeholder: '输入作品简介...' },
        ]
      },
      {
        id: 'worldview',
        name: '世界观设定',
        expanded: true,
        items: [
          { id: 'background', label: '背景设定', type: 'textarea', value: '', placeholder: '描述故事发生的背景...' },
          { id: 'worldmap', label: '世界地图', type: 'image', value: '' },
          { id: 'rules', label: '世界规则', type: 'list', value: [] },
        ]
      },
      {
        id: 'style',
        name: '风格定位',
        expanded: false,
        items: [
          { id: 'tone', label: '叙事风格', type: 'tags', value: [], options: ['轻松', '沉重', '幽默', '严肃', '温馨', '黑暗'], maxCount: 2 },
          { id: 'target', label: '目标读者', type: 'text', value: '', placeholder: '描述目标读者群体' },
          { id: 'reference', label: '参考作品', type: 'list', value: [] },
        ]
      }
    ]
  },
  {
    id: 'novel-detailed',
    name: '小说详细模板',
    description: '包含更多详细设定的完整模板',
    sections: [
      {
        id: 'basic',
        name: '基本信息',
        expanded: true,
        items: [
          { id: 'title', label: '作品名称', type: 'text', value: '', placeholder: '输入作品名称' },
          { id: 'subtitle', label: '副标题', type: 'text', value: '', placeholder: '输入副标题（可选）' },
          { id: 'author', label: '作者', type: 'text', value: '', placeholder: '输入作者名' },
          { id: 'cover', label: '封面图', type: 'image', value: '' },
          { id: 'genre', label: '题材类型', type: 'tags', value: [], options: ['言情', '悬疑', '科幻', '武侠', '玄幻', '都市', '历史', '军事', '奇幻', '仙侠'], maxCount: 3 },
          { id: 'summary', label: '作品简介', type: 'textarea', value: '', placeholder: '输入作品简介...' },
        ]
      },
      {
        id: 'plot',
        name: '剧情要素',
        expanded: true,
        items: [
          { id: 'mainline', label: '主线剧情', type: 'textarea', value: '', placeholder: '描述主要剧情线...' },
          { id: 'conflicts', label: '核心冲突', type: 'list', value: [] },
          { id: 'turning', label: '关键转折', type: 'list', value: [] },
        ]
      },
      {
        id: 'worldview',
        name: '世界观设定',
        expanded: false,
        items: [
          { id: 'era', label: '时代背景', type: 'text', value: '', placeholder: '故事发生的时代' },
          { id: 'location', label: '地理环境', type: 'textarea', value: '', placeholder: '描述地理环境...' },
          { id: 'worldmap', label: '世界地图', type: 'image', value: '' },
          { id: 'power', label: '力量体系', type: 'textarea', value: '', placeholder: '描述力量/修炼体系...' },
          { id: 'rules', label: '世界规则', type: 'list', value: [] },
        ]
      },
      {
        id: 'style',
        name: '风格定位',
        expanded: false,
        items: [
          { id: 'tone', label: '叙事风格', type: 'tags', value: [], options: ['轻松', '沉重', '幽默', '严肃', '温馨', '黑暗', '热血', '治愈'], maxCount: 3 },
          { id: 'pov', label: '叙事视角', type: 'tags', value: [], options: ['第一人称', '第三人称', '全知视角', '多视角'], maxCount: 1 },
          { id: 'target', label: '目标读者', type: 'text', value: '', placeholder: '描述目标读者群体' },
          { id: 'reference', label: '参考作品', type: 'list', value: [] },
        ]
      }
    ]
  },
  {
    id: 'empty',
    name: '空白模板',
    description: '从零开始创建自定义模板',
    sections: []
  }
];

export default function WorkInfoManager() {
  // 当前使用的模板
  const [currentTemplate, setCurrentTemplate] = useState<WorkInfoTemplate>(
    JSON.parse(JSON.stringify(defaultTemplates[0]))
  );
  
  // 是否处于编辑模式（编辑模板结构）
  const [isEditMode, setIsEditMode] = useState(false);
  
  // 模板选择器是否展开
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  
  // 新建分类的表单
  const [newSectionName, setNewSectionName] = useState('');
  const [showNewSectionForm, setShowNewSectionForm] = useState(false);
  
  // 新建项目的表单
  const [newItemForm, setNewItemForm] = useState<{
    sectionId: string | null;
    label: string;
    type: InfoItemType;
  }>({ sectionId: null, label: '', type: 'text' });
  
  // 文件输入引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentImageItemId, setCurrentImageItemId] = useState<string | null>(null);

  // 切换分类展开状态
  const toggleSection = (sectionId: string) => {
    setCurrentTemplate(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? { ...section, expanded: !section.expanded }
          : section
      )
    }));
  };

  // 更新信息项的值
  const updateItemValue = (sectionId: string, itemId: string, value: string | string[]) => {
    setCurrentTemplate(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map(item =>
                item.id === itemId ? { ...item, value } : item
              )
            }
          : section
      )
    }));
  };

  // 添加新分类
  const addSection = () => {
    if (!newSectionName.trim()) return;
    
    const newSection: InfoSection = {
      id: `section-${Date.now()}`,
      name: newSectionName.trim(),
      expanded: true,
      items: []
    };
    
    setCurrentTemplate(prev => ({
      ...prev,
      sections: [...prev.sections, newSection]
    }));
    
    setNewSectionName('');
    setShowNewSectionForm(false);
  };

  // 删除分类
  const deleteSection = (sectionId: string) => {
    setCurrentTemplate(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== sectionId)
    }));
  };

  // 添加新项目
  const addItem = (sectionId: string) => {
    if (!newItemForm.label.trim()) return;
    
    const newItem: InfoItem = {
      id: `item-${Date.now()}`,
      label: newItemForm.label.trim(),
      type: newItemForm.type,
      value: newItemForm.type === 'tags' || newItemForm.type === 'list' ? [] : '',
      placeholder: `输入${newItemForm.label}...`,
      options: newItemForm.type === 'tags' ? [] : undefined,
      maxCount: newItemForm.type === 'tags' ? 3 : undefined
    };
    
    setCurrentTemplate(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? { ...section, items: [...section.items, newItem] }
          : section
      )
    }));
    
    setNewItemForm({ sectionId: null, label: '', type: 'text' });
  };

  // 删除项目
  const deleteItem = (sectionId: string, itemId: string) => {
    setCurrentTemplate(prev => ({
      ...prev,
      sections: prev.sections.map(section =>
        section.id === sectionId
          ? { ...section, items: section.items.filter(item => item.id !== itemId) }
          : section
      )
    }));
  };

  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentImageItemId) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      // 找到对应的 section 和 item 并更新
      currentTemplate.sections.forEach(section => {
        const item = section.items.find(i => i.id === currentImageItemId);
        if (item) {
          updateItemValue(section.id, currentImageItemId, imageUrl);
        }
      });
      setCurrentImageItemId(null);
    };
    reader.readAsDataURL(file);
  };

  // 触发图片上传
  const triggerImageUpload = (itemId: string) => {
    setCurrentImageItemId(itemId);
    fileInputRef.current?.click();
  };

  // 处理 tags 选择
  const handleTagToggle = (sectionId: string, itemId: string, tag: string, currentTags: string[], maxCount: number) => {
    if (currentTags.includes(tag)) {
      updateItemValue(sectionId, itemId, currentTags.filter(t => t !== tag));
    } else if (currentTags.length < maxCount) {
      updateItemValue(sectionId, itemId, [...currentTags, tag]);
    }
  };

  // 处理列表项添加
  const handleListAdd = (sectionId: string, itemId: string, currentList: string[], newValue: string) => {
    if (newValue.trim()) {
      updateItemValue(sectionId, itemId, [...currentList, newValue.trim()]);
    }
  };

  // 处理列表项删除
  const handleListRemove = (sectionId: string, itemId: string, currentList: string[], index: number) => {
    updateItemValue(sectionId, itemId, currentList.filter((_, i) => i !== index));
  };

  // 应用模板
  const applyTemplate = (template: WorkInfoTemplate) => {
    setCurrentTemplate(JSON.parse(JSON.stringify(template)));
    setTemplateSelectorOpen(false);
  };

  // 渲染信息项
  const renderInfoItem = (section: InfoSection, item: InfoItem) => {
    switch (item.type) {
      case 'text':
        return (
          <input
            type="text"
            className="info-input"
            value={item.value as string}
            onChange={(e) => updateItemValue(section.id, item.id, e.target.value)}
            placeholder={item.placeholder}
          />
        );
      
      case 'textarea':
        return (
          <textarea
            className="info-textarea"
            value={item.value as string}
            onChange={(e) => updateItemValue(section.id, item.id, e.target.value)}
            placeholder={item.placeholder}
            rows={4}
          />
        );
      
      case 'image':
        return (
          <div className="info-image-wrapper">
            {item.value ? (
              <div className="info-image-preview">
                <img src={item.value as string} alt={item.label} />
                <div className="image-overlay">
                  <button 
                    className="image-action-btn"
                    onClick={() => triggerImageUpload(item.id)}
                  >
                    更换图片
                  </button>
                  <button 
                    className="image-action-btn danger"
                    onClick={() => updateItemValue(section.id, item.id, '')}
                  >
                    删除
                  </button>
                </div>
              </div>
            ) : (
              <button 
                className="info-image-upload"
                onClick={() => triggerImageUpload(item.id)}
              >
                <Image size={24} />
                <span>点击上传图片</span>
              </button>
            )}
          </div>
        );
      
      case 'tags':
        const selectedTags = item.value as string[];
        const maxCount = item.maxCount || 3;
        return (
          <div className="info-tags-wrapper">
            <div className="selected-tags">
              {selectedTags.map(tag => (
                <span key={tag} className="selected-tag">
                  {tag}
                  <button
                    className="remove-tag-btn"
                    onClick={() => handleTagToggle(section.id, item.id, tag, selectedTags, maxCount)}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {selectedTags.length === 0 && (
                <span className="tags-placeholder">点击下方标签选择</span>
              )}
            </div>
            {selectedTags.length < maxCount && item.options && (
              <div className="available-tags">
                {item.options.filter(t => !selectedTags.includes(t)).map(tag => (
                  <button
                    key={tag}
                    className="tag-option"
                    onClick={() => handleTagToggle(section.id, item.id, tag, selectedTags, maxCount)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
            <div className="tags-counter">{selectedTags.length}/{maxCount}</div>
          </div>
        );
      
      case 'list':
        const listItems = item.value as string[];
        return (
          <div className="info-list-wrapper">
            <div className="list-items">
              {listItems.map((listItem, index) => (
                <div key={index} className="list-item">
                  <span className="list-item-order">{index + 1}</span>
                  <span className="list-item-text">{listItem}</span>
                  <button
                    className="list-item-remove"
                    onClick={() => handleListRemove(section.id, item.id, listItems, index)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="list-add-form">
              <input
                type="text"
                className="list-add-input"
                placeholder={`添加${item.label}项...`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleListAdd(section.id, item.id, listItems, (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <button
                className="list-add-btn"
                onClick={(e) => {
                  const input = (e.currentTarget.previousSibling as HTMLInputElement);
                  handleListAdd(section.id, item.id, listItems, input.value);
                  input.value = '';
                }}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="work-info-manager">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      {/* 头部工具栏 */}
      <div className="wim-header">
        <h2 className="wim-title">作品信息</h2>
        <div className="wim-actions">
          {/* 模板选择器 */}
          <div className="template-selector">
            <button 
              className="template-trigger"
              onClick={() => setTemplateSelectorOpen(!templateSelectorOpen)}
            >
              <LayoutTemplate size={16} />
              <span>{currentTemplate.name}</span>
              <ChevronDown size={14} className={templateSelectorOpen ? 'rotated' : ''} />
            </button>
            {templateSelectorOpen && (
              <div className="template-dropdown">
                <div className="template-dropdown-header">选择模板</div>
                {defaultTemplates.map(template => (
                  <button
                    key={template.id}
                    className={`template-option ${currentTemplate.id === template.id ? 'active' : ''}`}
                    onClick={() => applyTemplate(template)}
                  >
                    <div className="template-option-name">{template.name}</div>
                    {template.description && (
                      <div className="template-option-desc">{template.description}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* 编辑模式切换 */}
          <button 
            className={`wim-action-btn ${isEditMode ? 'active' : ''}`}
            onClick={() => setIsEditMode(!isEditMode)}
            title={isEditMode ? '完成编辑' : '编辑模板'}
          >
            {isEditMode ? <Save size={16} /> : <Settings size={16} />}
            <span>{isEditMode ? '完成' : '自定义'}</span>
          </button>
        </div>
      </div>

      {/* 编辑模式提示 */}
      {isEditMode && (
        <div className="edit-mode-banner">
          <Settings size={16} />
          <span>模板编辑模式：可添加/删除分类和信息项</span>
        </div>
      )}

      {/* 内容区域 */}
      <div className="wim-content">
        {currentTemplate.sections.map(section => (
          <div key={section.id} className="wim-section">
            <div 
              className="wim-section-header"
              onClick={() => toggleSection(section.id)}
            >
              <div className="section-header-left">
                {section.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <h3 className="section-name">{section.name}</h3>
                <span className="section-item-count">{section.items.length} 项</span>
              </div>
              {isEditMode && (
                <div className="section-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="section-action-btn danger"
                    onClick={() => deleteSection(section.id)}
                    title="删除分类"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            
            {section.expanded && (
              <div className="wim-section-content">
                {section.items.map(item => (
                  <div key={item.id} className="wim-item">
                    <div className="wim-item-header">
                      {isEditMode && (
                        <div className="item-drag-handle">
                          <GripVertical size={14} />
                        </div>
                      )}
                      <label className="wim-item-label">
                        {item.label}
                        <span className="item-type-badge">{getTypeLabel(item.type)}</span>
                      </label>
                      {isEditMode && (
                        <button
                          className="item-delete-btn"
                          onClick={() => deleteItem(section.id, item.id)}
                          title="删除项目"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="wim-item-content">
                      {renderInfoItem(section, item)}
                    </div>
                  </div>
                ))}
                
                {/* 添加新项目 */}
                {isEditMode && (
                  <div className="add-item-section">
                    {newItemForm.sectionId === section.id ? (
                      <div className="add-item-form">
                        <input
                          type="text"
                          className="add-item-input"
                          placeholder="项目名称"
                          value={newItemForm.label}
                          onChange={(e) => setNewItemForm({ ...newItemForm, label: e.target.value })}
                          autoFocus
                        />
                        <select
                          className="add-item-type"
                          value={newItemForm.type}
                          onChange={(e) => setNewItemForm({ ...newItemForm, type: e.target.value as InfoItemType })}
                        >
                          <option value="text">文本</option>
                          <option value="textarea">多行文本</option>
                          <option value="image">图片</option>
                          <option value="tags">标签</option>
                          <option value="list">列表</option>
                        </select>
                        <button
                          className="add-item-confirm"
                          onClick={() => addItem(section.id)}
                        >
                          添加
                        </button>
                        <button
                          className="add-item-cancel"
                          onClick={() => setNewItemForm({ sectionId: null, label: '', type: 'text' })}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        className="add-item-trigger"
                        onClick={() => setNewItemForm({ sectionId: section.id, label: '', type: 'text' })}
                      >
                        <Plus size={14} />
                        <span>添加信息项</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* 添加新分类 */}
        {isEditMode && (
          <div className="add-section-area">
            {showNewSectionForm ? (
              <div className="add-section-form">
                <input
                  type="text"
                  className="add-section-input"
                  placeholder="输入分类名称"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSection()}
                  autoFocus
                />
                <button className="add-section-confirm" onClick={addSection}>
                  确定
                </button>
                <button 
                  className="add-section-cancel" 
                  onClick={() => {
                    setShowNewSectionForm(false);
                    setNewSectionName('');
                  }}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="add-section-trigger"
                onClick={() => setShowNewSectionForm(true)}
              >
                <Plus size={16} />
                <span>添加新分类</span>
              </button>
            )}
          </div>
        )}

        {/* 空状态 */}
        {currentTemplate.sections.length === 0 && (
          <div className="empty-template">
            <LayoutTemplate size={48} />
            <h3>模板为空</h3>
            <p>点击上方"自定义"按钮开始添加分类和信息项</p>
          </div>
        )}
      </div>
    </div>
  );
}

// 获取类型标签
function getTypeLabel(type: InfoItemType): string {
  const labels: Record<InfoItemType, string> = {
    text: '文本',
    textarea: '长文本',
    image: '图片',
    tags: '标签',
    list: '列表'
  };
  return labels[type];
}

