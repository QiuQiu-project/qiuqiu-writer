import { Search, X } from 'lucide-react';
import { useState } from 'react';

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
    <div
      className="relative flex items-center flex-1 max-w-[600px] border-2 rounded-[var(--radius-lg,12px)] transition-all shadow-[var(--shadow-sm)] hover:-translate-y-px hover:[border-color:var(--accent-primary)] hover:shadow-[var(--shadow)]"
      style={{
        background: 'var(--bg-primary)',
        borderColor: isFocused ? 'var(--accent-primary)' : 'var(--border-light)',
        boxShadow: isFocused ? '0 0 0 4px var(--accent-light), var(--shadow-md)' : undefined,
        transform: isFocused ? 'translateY(-2px)' : undefined,
      }}
    >
      <Search
        size={20}
        className="absolute left-3.5 pointer-events-none transition-all"
        style={{
          color: isFocused ? 'var(--accent-secondary)' : 'var(--accent-primary)',
          transform: isFocused ? 'scale(1.1)' : undefined,
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="w-full py-2.5 pl-10 pr-10 border-none bg-transparent text-[0.9375rem] outline-none"
        style={{ color: 'var(--text-primary)' }}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 flex items-center justify-center w-7 h-7 p-0 border-none rounded-[var(--radius-sm,6px)] cursor-pointer transition-all hover:[background:var(--accent-light)] hover:[color:var(--accent-primary)] hover:[transform:scale(1.1)_rotate(90deg)]"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          aria-label="清除搜索"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
