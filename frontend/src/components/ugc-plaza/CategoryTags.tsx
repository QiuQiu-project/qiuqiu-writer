import './CategoryTags.css';

interface CategoryTagsProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
}

export default function CategoryTags({ categories, selected, onSelect }: CategoryTagsProps) {
  return (
    <div className="category-tags">
      <button
        className={`category-tag ${selected === null ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span>全部</span>
      </button>
      {categories.map((category) => (
        <button
          key={category}
          className={`category-tag ${selected === category ? 'active' : ''}`}
          onClick={() => onSelect(category === selected ? null : category)}
        >
          <span>{category}</span>
        </button>
      ))}
    </div>
  );
}

