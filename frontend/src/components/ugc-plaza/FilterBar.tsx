import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  tags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export default function FilterBar({ tags, selectedTags, onTagsChange }: FilterBarProps) {
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tag));
  };

  const clearAll = () => {
    onTagsChange([]);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
        标签筛选：
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              className={cn(
                'px-3.5 py-1.5 border-2 rounded-full text-[0.8125rem] font-medium cursor-pointer transition-all shadow-[var(--shadow-sm)]',
                isSelected
                  ? 'text-white border-transparent -translate-y-0.5 shadow-[var(--shadow-md)] hover:-translate-y-[3px] hover:scale-105 hover:shadow-[var(--shadow-lg)]'
                  : 'hover:-translate-y-0.5 hover:shadow-[var(--shadow)] hover:[border-color:var(--accent-primary)] hover:[color:var(--accent-primary)] hover:[background:var(--accent-light)]'
              )}
              style={
                isSelected
                  ? { background: 'var(--accent-gradient)', borderColor: 'transparent' }
                  : { background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }
              }
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {selectedTags.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 ml-auto pl-4 border-l max-md:ml-0 max-md:pl-0 max-md:border-l-0 max-md:w-full max-md:mt-2"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>已选：</span>
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.8125rem] font-semibold shadow-[var(--shadow-sm)] transition-all text-white hover:scale-105 hover:shadow-[var(--shadow)]"
              style={{ background: 'var(--accent-gradient)' }}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="flex items-center justify-center w-4 h-4 p-0 border-none rounded-full cursor-pointer transition-all text-white bg-white/20 hover:bg-white/30"
                aria-label={`移除 ${tag}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-1 border rounded-[6px] text-[0.8125rem] cursor-pointer transition-all hover:[border-color:var(--accent-color)] hover:[color:var(--accent-color)]"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            清除全部
          </button>
        </div>
      )}
    </div>
  );
}
