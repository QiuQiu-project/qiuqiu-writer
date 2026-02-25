import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';

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
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', () => setIsOpen(false));
    window.addEventListener('scroll', () => setIsOpen(false), true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', () => setIsOpen(false));
      window.removeEventListener('scroll', () => setIsOpen(false), true);
    };
  }, []);

  const handleSelect = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const dropdownMenu = isOpen && !disabled ? createPortal(
    <div 
      className="available-tags" 
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 10010, // Higher than GuideTip (9999) and OnboardingGuide (10001)
        boxShadow: 'var(--shadow-md)',
        backgroundColor: 'var(--bg-primary, #ffffff)',
        border: '1px solid var(--border-color, #e0e0e0)',
        borderRadius: 'var(--radius-sm)',
        marginTop: '0', // Positioned via top
        maxHeight: '200px',
        overflowY: 'auto',
      }}
    >
      {options.length === 0 ? (
        <div className="no-options" style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
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
              onClick={(e) => !isOptionDisabled && handleSelect(opt.value, e)}
              style={{
                backgroundColor: isSelected ? (opt.color || 'var(--accent-primary)') : 'transparent',
                borderColor: opt.color || 'var(--accent-primary)',
                color: isSelected ? 'white' : (opt.color || 'var(--accent-primary)'),
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                margin: '4px',
                border: '1px solid',
                borderRadius: '16px',
                cursor: isOptionDisabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                opacity: isOptionDisabled ? 0.5 : 1
              }}
            >
              {opt.label}
              {isSelected && <Check size={12} style={{ marginLeft: '4px' }} />}
            </button>
          )
        })
      )}
    </div>,
    document.body
  ) : null;

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

      {dropdownMenu}
    </div>
  );
}
