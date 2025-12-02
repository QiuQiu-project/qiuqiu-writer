import { X } from 'lucide-react';
import './FilterBar.css';

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
    <div className="filter-bar">
      <div className="filter-label">标签筛选：</div>
      <div className="filter-tags">
        {tags.map((tag) => (
          <button
            key={tag}
            className={`filter-tag ${selectedTags.includes(tag) ? 'selected' : ''}`}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      {selectedTags.length > 0 && (
        <div className="selected-tags">
          <span className="selected-label">已选：</span>
          {selectedTags.map((tag) => (
            <span key={tag} className="selected-tag">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="remove-tag"
                aria-label={`移除 ${tag}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="clear-all">
            清除全部
          </button>
        </div>
      )}
    </div>
  );
}

