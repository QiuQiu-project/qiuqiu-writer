import { ArrowUpDown } from 'lucide-react';

interface SortSelectorProps {
  value: 'latest' | 'popular' | 'trending';
  onChange: (value: 'latest' | 'popular' | 'trending') => void;
}

const sortOptions = [
  { value: 'latest', label: '最新' },
  { value: 'popular', label: '最热' },
  { value: 'trending', label: '热门' },
] as const;

export default function SortSelector({ value, onChange }: SortSelectorProps) {
  return (
    <div className="relative flex items-center gap-2 group">
      <ArrowUpDown
        size={16}
        className="shrink-0 transition-all group-hover:rotate-180"
        style={{ color: 'var(--accent-primary)' }}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as 'latest' | 'popular' | 'trending')}
        className="py-2.5 pl-4 pr-10 border-2 text-[0.9375rem] font-medium min-h-10 rounded-[var(--radius-lg,12px)] shadow-[var(--shadow-sm)] transition-all cursor-pointer outline-none hover:-translate-y-px hover:[border-color:var(--accent-primary)] hover:shadow-[var(--shadow)] focus:-translate-y-0.5 focus:[border-color:var(--accent-primary)] focus:shadow-[0_0_0_4px_var(--accent-light),var(--shadow-md)]"
        style={{ borderColor: 'var(--border-light)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
