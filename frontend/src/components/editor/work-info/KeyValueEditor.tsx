import React from 'react';
import { Plus, X } from 'lucide-react';

interface KeyValueItem {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  value: KeyValueItem[];
  onChange: (value: KeyValueItem[]) => void;
  disabled?: boolean;
}

export default function KeyValueEditor({
  value = [],
  onChange,
  disabled = false
}: KeyValueEditorProps) {
  
  // Ensure value is array
  const items = Array.isArray(value) ? value : [];

  const handleAdd = () => {
    onChange([...items, { key: '', value: '' }]);
  };

  const handleChange = (index: number, field: 'key' | 'value', newVal: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: newVal };
    onChange(newItems);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="comp-keyvalue">
      {items.map((item, index) => (
        <div key={index} className="kv-card">
          <div className="kv-header">
            <div className="kv-num">{index + 1}</div>
            <input
              type="text"
              className="kv-key"
              value={item.key}
              onChange={(e) => handleChange(index, 'key', e.target.value)}
              placeholder="属性名 (例如: 力量)"
              disabled={disabled}
            />
            {!disabled && (
              <button onClick={() => handleRemove(index)} title="删除">
                <X size={14} />
              </button>
            )}
          </div>
          <textarea
            className="kv-value"
            value={item.value}
            onChange={(e) => handleChange(index, 'value', e.target.value)}
            placeholder="属性值"
            disabled={disabled}
            rows={2}
          />
        </div>
      ))}

      {!disabled && (
        <button className="add-comp-btn full-width" onClick={handleAdd}>
          <Plus size={14} />
          <span>添加属性</span>
        </button>
      )}
    </div>
  );
}
