import { ArrowUpDown } from 'lucide-react';
import './SortSelector.css';

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
    <div className="sort-selector">
      <ArrowUpDown size={16} className="sort-icon" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as 'latest' | 'popular' | 'trending')}
        className="sort-select"
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

