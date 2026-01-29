import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Check } from 'lucide-react';

interface MultiSelectOption {
  label: string;
  value: string;
  color?: string;
}

interface MultiSelectEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
  options?: MultiSelectOption[];
  placeholder?: string;
  maxCount?: number;
  disabled?: boolean;
}

export default function MultiSelectEditor({
  value = [],
  onChange,
  options = [],
  placeholder = '请选择标签',
  maxCount,
  disabled = false
}: MultiSelectEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      if (maxCount && value.length >= maxCount) {
        return; // Max count reached
      }
      onChange([...value, optionValue]);
    }
  };

  const removeTag = (tagValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(value.filter(v => v !== tagValue));
  };

  const getOptionLabel = (val: string) => {
    return options.find(o => o.value === val)?.label || val;
  };

  const getOptionColor = (val: string) => {
    return options.find(o => o.value === val)?.color;
  };

  return (
    <div className="comp-multiselect" ref={containerRef}>
      <div 
        className={`selected-tags ${disabled ? 'disabled' : ''}`} 
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {value.length === 0 && (
          <span className="placeholder">{placeholder}</span>
        )}
        
        {value.map(val => (
          <span 
            key={val} 
            className="tag-item"
            style={{ backgroundColor: getOptionColor(val) || 'var(--accent-primary)' }}
          >
            {getOptionLabel(val)}
            {!disabled && (
              <button onClick={(e) => removeTag(val, e)}>
                <X size={10} />
              </button>
            )}
          </span>
        ))}
      </div>

      {isOpen && !disabled && (
        <div className="available-tags">
          {options.length === 0 ? (
            <div className="no-options">
            无可用选项
          </div>
          ) : (
            options.map(opt => {
              const isSelected = value.includes(opt.value);
              const isOptionDisabled = maxCount && value.length >= maxCount && !isSelected;
              
              return (
                <button
                  key={opt.value}
                  className={`tag-option ${isSelected ? 'selected' : ''} ${isOptionDisabled ? 'disabled' : ''}`}
                  onClick={() => !isOptionDisabled && handleSelect(opt.value)}
                  style={{
                    backgroundColor: isSelected ? (opt.color || 'var(--accent-primary)') : 'transparent',
                    borderColor: opt.color || 'var(--accent-primary)',
                    color: isSelected ? 'white' : (opt.color || 'var(--accent-primary)')
                  }}
                >
                  {opt.label}
                  {isSelected && <Check size={12} style={{ marginLeft: '4px' }} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
