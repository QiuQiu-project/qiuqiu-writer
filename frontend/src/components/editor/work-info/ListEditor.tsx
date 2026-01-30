import { Plus, X } from 'lucide-react';

interface ListEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ListEditor({
  value = [],
  onChange,
  placeholder = '请输入内容',
  disabled = false
}: ListEditorProps) {
  
  const handleAdd = () => {
    onChange([...value, '']);
  };

  const handleChange = (index: number, newVal: string) => {
    const newValue = [...value];
    newValue[index] = newVal;
    onChange(newValue);
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  // Ensure value is an array
  const listValue = Array.isArray(value) ? value : [];

  return (
    <div className="comp-list">
      {listValue.map((item, index) => (
        <div key={index} className="list-row">
          <div className="list-num">{index + 1}</div>
          <input
            type="text"
            value={item}
            onChange={(e) => handleChange(index, e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="comp-input"
          />
          {!disabled && (
            <button 
              className="list-del" 
              onClick={() => handleRemove(index)}
              title="删除此项"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      
      {!disabled && (
        <button className="list-add" onClick={handleAdd}>
          <Plus size={14} />
          <span>添加一项</span>
        </button>
      )}
    </div>
  );
}
