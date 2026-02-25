import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CustomSelect.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  id?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  className = '',
  disabled = false,
  fullWidth = false,
  id,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const currentIndex = options.findIndex(opt => opt.value === value);
        const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
        onChange(options[nextIndex].value);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        const currentIndex = options.findIndex(opt => opt.value === value);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
        onChange(options[prevIndex].value);
      }
    }
  };

  const selectedOption = options.find(opt => opt.value === value);
  // 有选中项用 label；没有匹配项但 value 有值（如历史数据或 options 未加载）时显示 value，否则显示 placeholder
  const displayText = selectedOption ? selectedOption.label : (value ? String(value) : placeholder);
  const isEmpty = !value;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 计算下拉菜单位置
  useEffect(() => {
    if (isOpen && selectRef.current && dropdownRef.current) {
      const triggerRect = selectRef.current.getBoundingClientRect();
      const dropdown = dropdownRef.current;
      
      // 计算位置
      dropdown.style.top = `${triggerRect.bottom + window.scrollY + 4}px`;
      dropdown.style.left = `${triggerRect.left + window.scrollX}px`;
      dropdown.style.width = `${triggerRect.width}px`;
      
      // 检查是否需要向上展开
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const dropdownHeight = Math.min(300, options.length * 40 + 8);
      
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        // 向上展开
        dropdown.style.top = `${triggerRect.top + window.scrollY - dropdownHeight - 4}px`;
        dropdown.style.bottom = 'auto';
      }
    }
  }, [isOpen, options.length]);

  return (
    <div
      ref={selectRef}
      id={id}
      className={`custom-select ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${fullWidth ? 'full-width' : ''} ${className}`}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
    >
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className={`custom-select-value ${isEmpty ? 'placeholder' : ''}`}>
          {displayText}
        </span>
        <ChevronDown
          size={16}
          className={`custom-select-arrow ${isOpen ? 'open' : ''}`}
        />
      </button>
      
      {isOpen && (
        <div 
          ref={dropdownRef}
          className="custom-select-dropdown"
        >
          <div className="custom-select-options">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`custom-select-option ${value === option.value ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}`}
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setIsOpen(false);
                  }
                }}
                disabled={option.disabled}
              >
                <span className="option-label">{option.label}</span>
                {value === option.value && (
                  <Check size={16} className="option-check" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

