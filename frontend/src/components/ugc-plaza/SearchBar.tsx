import { Search, X } from 'lucide-react';
import { useState } from 'react';
import './SearchBar.css';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = '搜索内容...' }: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className={`search-bar ${isFocused ? 'focused' : ''}`}>
      <Search size={20} className="search-icon" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="search-input"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="search-clear"
          aria-label="清除搜索"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

