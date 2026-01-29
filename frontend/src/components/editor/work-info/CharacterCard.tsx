
import React, { useState } from 'react';
import { Plus, Trash2, User, ChevronDown, ChevronRight } from 'lucide-react';
import type { ComponentConfig, CharacterData } from './types';

interface CharacterCardProps {
  component: ComponentConfig;
  onChange: (newValue: any) => void;
  isEditMode: boolean;
  availableCharacters?: CharacterData[];
}

interface SingleCharacterCardProps {
  value: Record<string, any>;
  onChange: (newValue: Record<string, any>) => void;
  fields: { key: string; label: string; type: string }[];
  isEditMode: boolean;
  onDelete?: () => void;
}

function SingleCharacterCard({ 
  value, 
  onChange, 
  fields, 
  isEditMode,
  onDelete 
}: SingleCharacterCardProps) {
  const [newFieldName, setNewFieldName] = useState('');
  const [isAddingField, setIsAddingField] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOthersExpanded, setIsOthersExpanded] = useState(false);

  const updateField = (key: string, val: any) => {
    onChange({ ...value, [key]: val });
  };

  const deleteField = (key: string) => {
    const newValue = { ...value };
    delete newValue[key];
    onChange(newValue);
  };

  const handleAddField = () => {
    if (newFieldName.trim()) {
      onChange({ ...value, [newFieldName.trim()]: '' });
      setNewFieldName('');
      setIsAddingField(false);
    }
  };

  const predefinedKeys = new Set(fields.map(f => f.key));
  const customKeys = Object.keys(value).filter(k => !predefinedKeys.has(k) && k !== 'id');

  // Prepare JSON string for the "Others" section
  const getCustomDataJson = () => {
    const customData: Record<string, any> = {};
    customKeys.forEach(key => {
      customData[key] = value[key];
    });
    // Return empty string if no custom data, otherwise formatted JSON
    return Object.keys(customData).length > 0 ? JSON.stringify(customData, null, 2) : '';
  };

  const [customJsonValue, setCustomJsonValue] = useState(getCustomDataJson());
  
  // Update local state when value changes (external update)
  React.useEffect(() => {
    setCustomJsonValue(getCustomDataJson());
  }, [value]);

  const handleCustomJsonChange = (newJson: string) => {
    setCustomJsonValue(newJson);
    try {
      const parsed = newJson.trim() ? JSON.parse(newJson) : {};
      
      // Merge parsed custom fields with predefined fields
      // 1. Keep predefined fields from current value
      const newValue: Record<string, any> = {};
      fields.forEach(f => {
        if (value[f.key] !== undefined) {
          newValue[f.key] = value[f.key];
        }
      });
      if (value.id) newValue.id = value.id;

      // 2. Add parsed custom fields
      Object.keys(parsed).forEach(key => {
        // Only add if it's not a predefined key (security/integrity check)
        if (!predefinedKeys.has(key) && key !== 'id') {
          newValue[key] = parsed[key];
        }
      });

      onChange(newValue);
    } catch (e) {
      // Invalid JSON, just update local state (don't propagate change yet)
    }
  };

  // Find the name field to display in header
  const nameField = fields.find(f => f.key === 'name') || fields[0];
  const nameValue = value[nameField.key] || '未命名角色';

  const renderValue = (val: any) => {
    if (typeof val === 'object' && val !== null) {
      try {
        return JSON.stringify(val);
      } catch (e) {
        return String(val);
      }
    }
    return val || '';
  };

  return (
    <div className="character-card-item" style={{ 
      background: '#fff', 
      border: '1px solid #e2e8f0', 
      borderRadius: '8px', 
      marginBottom: '12px',
      overflow: 'hidden',
      transition: 'all 0.2s ease'
    }}>
      {/* Header / Collapsed View */}
      <div 
        className="character-card-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: isExpanded ? '#f8fafc' : '#fff',
          borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, color: '#334155' }}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>{nameValue}</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEditMode && onDelete && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('确定要删除这个角色吗？')) {
                  onDelete();
                }
              }}
              className="delete-card-btn"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="删除角色"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="character-card-content" style={{ padding: '16px' }}>
          {fields.map(field => (
            <div key={field.key} className="character-field">
              <label>{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea
                  value={value[field.key] || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                  disabled={!isEditMode && false}
                  placeholder={`请输入${field.label}`}
                />
              ) : field.type === 'image' ? (
                 <div className="field-image">
                   {value[field.key] ? (
                     <div className="image-preview">
                       <img src={value[field.key]} alt={field.label} />
                       {isEditMode && (
                         <button onClick={() => updateField(field.key, '')}>删除</button>
                       )}
                     </div>
                   ) : (
                     isEditMode && <button className="upload-btn">上传图片</button>
                   )}
                 </div>
              ) : (
                <input
                  type="text"
                  value={value[field.key] || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                  disabled={!isEditMode && false}
                  placeholder={`请输入${field.label}`}
                />
              )}
            </div>
          ))}

          {/* Custom Fields - Collapsible Section */}
          <div className="character-others-section" style={{ 
            marginTop: '12px',
            border: '1px solid #f1f5f9',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div 
              onClick={() => setIsOthersExpanded(!isOthersExpanded)}
              style={{
                padding: '8px 12px',
                background: '#f8fafc',
                fontSize: '13px',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                userSelect: 'none'
              }}
            >
              {isOthersExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              其他信息 (JSON)
            </div>
            
            {isOthersExpanded && (
              <div style={{ padding: '0' }}>
                <textarea
                  value={customJsonValue}
                  onChange={e => handleCustomJsonChange(e.target.value)}
                  disabled={!isEditMode}
                  placeholder="在此处输入 JSON 格式的其他信息..."
                  style={{
                    width: '100%',
                    minHeight: '150px',
                    padding: '12px',
                    border: 'none',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    resize: 'vertical',
                    outline: 'none',
                    background: isEditMode ? '#fff' : '#f8fafc'
                  }}
                />
              </div>
            )}
          </div>

          {/* Add Field Button */}
          {isEditMode && (
            <div className="add-field-section">
              {isAddingField ? (
                <div className="add-field-form">
                  <input 
                    type="text" 
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                    placeholder="字段名称"
                    className="comp-input"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddField()}
                  />
                  <button onClick={handleAddField} className="add-field-confirm-btn">确定</button>
                  <button onClick={() => setIsAddingField(false)} className="add-field-cancel-btn">取消</button>
                </div>
              ) : (
                <button 
                  className="add-field-btn" 
                  onClick={() => setIsAddingField(true)}
                >
                  <Plus size={14} /> 添加自定义属性
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CharacterCard({
  component,
  onChange,
  isEditMode,
  availableCharacters = []
}: CharacterCardProps) {
  const isArray = Array.isArray(component.value);
  const value = isArray 
    ? (component.value as any[]) 
    : (typeof component.value === 'object' && component.value !== null 
      ? component.value 
      : {}) as Record<string, any>;
    
  const fields = component.config.cardFields || [
    { key: 'name', label: '姓名', type: 'text' },
    { key: 'gender', label: '性别', type: 'text' },
    { key: 'age', label: '年龄', type: 'text' },
    { key: 'role', label: '定位', type: 'text' },
    { key: 'description', label: '简介', type: 'textarea' }
  ];

  // Logic to import from availableCharacters
  const handleImportCharacter = (char: CharacterData) => {
    // Map CharacterData to card fields
    const newCharData = {
      ...char,
      name: char.name || '',
      gender: (char.gender as string) || '',
      description: char.description || '',
      role: char.type === 'main' ? '主角' : '配角',
    };

    if (isArray) {
      // Add to list
      onChange([...(value as any[]), newCharData]);
    } else {
      // Fill single card
      const newValue: Record<string, any> = {
        ...(value as Record<string, any>),
        ...newCharData
      };
      onChange(newValue);
    }
  };

  const handleAddCharacter = () => {
    if (isArray) {
      onChange([...(value as any[]), {}]);
    }
  };

  const handleDeleteCharacter = (index: number) => {
    if (isArray) {
      const newList = [...(value as any[])];
      newList.splice(index, 1);
      onChange(newList);
    }
  };

  const handleCharacterChange = (index: number, newData: any) => {
    if (isArray) {
      const newList = [...(value as any[])];
      newList[index] = newData;
      onChange(newList);
    }
  };

  if (isArray) {
    return (
      <div className="character-card-list">
        {/* Import Character Section */}
        {availableCharacters.length > 0 && isEditMode && (
           <div className="character-import-section" style={{ marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>快速添加角色：</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {availableCharacters.map(char => (
                  <button 
                    key={char.id}
                    onClick={() => handleImportCharacter(char)}
                    style={{ 
                      padding: '4px 10px', 
                      fontSize: '12px', 
                      background: 'white', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Plus size={12} />
                    {char.name}
                  </button>
                ))}
                <button 
                  onClick={handleAddCharacter}
                  style={{ 
                    padding: '4px 10px', 
                    fontSize: '12px', 
                    background: '#eff6ff', 
                    border: '1px solid #bfdbfe', 
                    color: '#2563eb',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Plus size={12} />
                  新建空白角色
                </button>
              </div>
           </div>
        )}

        <div className="character-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(value as any[]).map((charData, index) => (
            <SingleCharacterCard
              key={index}
              value={charData || {}}
              onChange={(newData) => handleCharacterChange(index, newData)}
              fields={fields}
              isEditMode={isEditMode}
              onDelete={() => handleDeleteCharacter(index)}
            />
          ))}
          
          {(value as any[]).length === 0 && !isEditMode && (
             <div className="empty-state" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px' }}>
                <User size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <div>暂无角色数据</div>
             </div>
          )}
        </div>
        
        {isEditMode && (
          <button 
            onClick={handleAddCharacter}
            className="add-character-btn"
            style={{
              width: '100%',
              padding: '12px',
              marginTop: '16px',
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: '8px',
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <Plus size={16} />
            添加角色
          </button>
        )}
      </div>
    );
  }

  // Legacy Single Card Mode
  return (
    <div className="character-card">
      {/* Import Character Section */}
      {availableCharacters.length > 0 && !(value as any).name && (
         <div className="character-import-section" style={{ marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>从数据源导入角色：</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availableCharacters.map(char => (
                <button 
                  key={char.id}
                  onClick={() => handleImportCharacter(char)}
                  style={{ 
                    padding: '4px 10px', 
                    fontSize: '12px', 
                    background: 'white', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Plus size={12} />
                  {char.name}
                </button>
              ))}
            </div>
         </div>
      )}

      <SingleCharacterCard
        value={value as Record<string, any>}
        onChange={onChange}
        fields={fields}
        isEditMode={isEditMode}
      />
    </div>
  );
}
