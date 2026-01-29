
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ComponentConfig } from './types';

interface CharacterCardProps {
  component: ComponentConfig;
  onChange: (newValue: any) => void;
  isEditMode: boolean;
}

export default function CharacterCard({
  component,
  onChange,
  isEditMode
}: CharacterCardProps) {
  const value = (typeof component.value === 'object' && component.value !== null 
    ? component.value 
    : {}) as Record<string, any>;
    
  const fields = component.config.cardFields || [
    { key: 'name', label: '姓名', type: 'text' },
    { key: 'gender', label: '性别', type: 'text' },
    { key: 'age', label: '年龄', type: 'text' },
    { key: 'role', label: '定位', type: 'text' },
    { key: 'description', label: '简介', type: 'textarea' }
  ];

  const [newFieldName, setNewFieldName] = useState('');
  const [isAddingField, setIsAddingField] = useState(false);

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

  return (
    <div className="character-card">
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

      {/* Custom Fields */}
      {customKeys.map(key => (
        <div key={key} className="character-field">
          <label>{key}</label>
          <div className="custom-field-input-wrapper" style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
            <input
              type="text"
              value={value[key] || ''}
              onChange={e => updateField(key, e.target.value)}
              disabled={!isEditMode && false}
              placeholder={`请输入${key}`}
              style={{ flex: 1 }}
            />
            {isEditMode && (
              <button 
                onClick={() => deleteField(key)}
                className="icon-btn delete-btn"
                title="删除字段"
                style={{ padding: '4px', color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Add Field Button */}
      {isEditMode && (
        <div className="add-field-section" style={{ marginTop: '12px', borderTop: '1px dashed var(--border-light)', paddingTop: '12px' }}>
          {isAddingField ? (
            <div className="add-field-form" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                placeholder="字段名称"
                className="comp-input"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddField()}
                style={{ flex: 1, padding: '6px 10px', fontSize: '13px', border: '1px solid var(--border-light)', borderRadius: '4px' }}
              />
              <button onClick={handleAddField} style={{ padding: '6px 12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>确定</button>
              <button onClick={() => setIsAddingField(false)} style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>取消</button>
            </div>
          ) : (
            <button 
              className="add-field-btn" 
              onClick={() => setIsAddingField(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
            >
              <Plus size={14} /> 添加自定义属性
            </button>
          )}
        </div>
      )}
    </div>
  );
}
