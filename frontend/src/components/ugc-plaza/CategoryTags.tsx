import { cn } from '@/lib/utils';

interface CategoryTagsProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
}

export default function CategoryTags({ categories, selected, onSelect }: CategoryTagsProps) {
  const tagClass = (isActive: boolean) =>
    cn(
      'px-5 py-2 border-2 rounded-full text-sm font-semibold cursor-pointer transition-all whitespace-nowrap shadow-[var(--shadow-sm)]',
      isActive
        ? 'text-white border-transparent -translate-y-0.5 shadow-[var(--shadow-md)] hover:-translate-y-[3px] hover:scale-105 hover:shadow-[var(--shadow-lg)]'
        : 'hover:-translate-y-0.5 hover:shadow-[var(--shadow)] hover:[border-color:var(--accent-primary)] hover:[color:var(--accent-primary)] hover:[background:var(--accent-light)]'
    );

  const tagStyle = (isActive: boolean): React.CSSProperties =>
    isActive
      ? { background: 'var(--accent-gradient)', borderColor: 'transparent' }
      : { background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' };

  return (
    <div className="flex flex-wrap gap-3">
      <button
        className={tagClass(selected === null)}
        style={tagStyle(selected === null)}
        onClick={() => onSelect(null)}
      >
        <span className="relative z-[1]">全部</span>
      </button>
      {categories.map((category) => (
        <button
          key={category}
          className={tagClass(selected === category)}
          style={tagStyle(selected === category)}
          onClick={() => onSelect(category === selected ? null : category)}
        >
          <span className="relative z-[1]">{category}</span>
        </button>
      ))}
    </div>
  );
}
