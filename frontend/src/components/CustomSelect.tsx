import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const displayText = selectedOption ? selectedOption.label : (value ? String(value) : placeholder);
  const isEmpty = !value;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 计算下拉菜单位置
  useEffect(() => {
    if (isOpen && selectRef.current && dropdownRef.current) {
      const triggerRect = selectRef.current.getBoundingClientRect();
      const dropdown = dropdownRef.current;

      dropdown.style.top = `${triggerRect.bottom + window.scrollY + 4}px`;
      dropdown.style.left = `${triggerRect.left + window.scrollX}px`;
      dropdown.style.width = `${triggerRect.width}px`;

      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const dropdownHeight = Math.min(300, options.length * 40 + 8);

      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        dropdown.style.top = `${triggerRect.top + window.scrollY - dropdownHeight - 4}px`;
        dropdown.style.bottom = 'auto';
      }
    }
  }, [isOpen, options.length]);

  return (
    <div
      ref={selectRef}
      id={id}
      className={cn(
        'relative inline-block min-w-[120px]',
        fullWidth && 'w-full',
        disabled && 'opacity-60 cursor-not-allowed pointer-events-none',
        className
      )}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-[8px] text-sm font-[inherit] cursor-pointer transition-all min-h-9 box-border text-left hover:[border-color:var(--accent-primary)] hover:[background:var(--bg-secondary)] focus:outline-none focus:[border-color:var(--accent-primary)] focus:shadow-[0_0_0_3px_var(--accent-light)] disabled:cursor-not-allowed disabled:opacity-60 max-md:px-3.5 max-md:py-2.5 max-md:text-base max-md:min-h-11"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span
          className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ color: isEmpty ? 'var(--text-tertiary)' : 'var(--text-primary)' }}
        >
          {displayText}
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="custom-select-dropdown fixed border rounded-[8px] z-[10010] overflow-hidden [animation:slide-down_0.2s_ease-out] max-h-[300px] overflow-y-auto min-w-[120px] max-md:max-h-[50vh]"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', boxShadow: 'var(--shadow-md)' }}
        >
          <div className="p-1">
            {options.map((option) => {
              const isSelected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-transparent border-none rounded-[6px] text-sm font-[inherit] text-left cursor-pointer transition-all min-h-10 box-border max-md:px-3.5 max-md:py-3 max-md:text-base max-md:min-h-12',
                    isSelected
                      ? 'font-medium'
                      : 'hover:[background:var(--bg-secondary)]',
                    option.disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
                  )}
                  style={
                    isSelected
                      ? { background: 'var(--accent-light)', color: 'var(--accent-primary)' }
                      : { color: 'var(--text-primary)' }
                  }
                  onClick={() => {
                    if (!option.disabled) {
                      onChange(option.value);
                      setIsOpen(false);
                    }
                  }}
                  disabled={option.disabled}
                >
                  <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">{option.label}</span>
                  {isSelected && (
                    <Check size={16} className="shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
