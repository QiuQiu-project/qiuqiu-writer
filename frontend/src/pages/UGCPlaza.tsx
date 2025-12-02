import { useState } from 'react';
import './UGCPlaza.css';
import SearchBar from '../components/ugc-plaza/SearchBar';
import FilterBar from '../components/ugc-plaza/FilterBar';
import ContentCard from '../components/ugc-plaza/ContentCard';
import CategoryTags from '../components/ugc-plaza/CategoryTags';
import SortSelector from '../components/ugc-plaza/SortSelector';

// 临时模拟数据
interface UGCContent {
  id: string;
  title: string;
  author: string;
  avatar?: string;
  content: string;
  category: string;
  tags: string[];
  likes: number;
  views: number;
  comments: number;
  createdAt: string;
  coverImage?: string;
}

const mockData: UGCContent[] = [
  {
    id: '1',
    title: '如何写出吸引人的开头',
    author: '写作达人',
    content: '一个好的开头能够立即抓住读者的注意力...',
    category: '写作技巧',
    tags: ['写作', '技巧', '开头'],
    likes: 128,
    views: 1520,
    comments: 45,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    title: '故事结构的三幕式',
    author: '故事大师',
    content: '三幕式结构是经典的故事叙述方式...',
    category: '故事创作',
    tags: ['故事', '结构', '创作'],
    likes: 256,
    views: 3200,
    comments: 89,
    createdAt: '2024-01-14',
  },
  {
    id: '3',
    title: '人物塑造的五个维度',
    author: '角色设计师',
    content: '一个立体的人物需要从多个维度来塑造...',
    category: '人物塑造',
    tags: ['人物', '塑造', '角色'],
    likes: 189,
    views: 2100,
    comments: 67,
    createdAt: '2024-01-13',
  },
];

export default function UGCPlaza() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'popular' | 'trending'>('latest');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // 筛选和排序逻辑
  const filteredContent = mockData
    .filter((item) => {
      if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (selectedCategory && item.category !== selectedCategory) {
        return false;
      }
      if (selectedTags.length > 0 && !selectedTags.some((tag) => item.tags.includes(tag))) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b.likes - a.likes;
        case 'trending':
          return b.views - a.views;
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  const categories = Array.from(new Set(mockData.map((item) => item.category)));
  const allTags = Array.from(new Set(mockData.flatMap((item) => item.tags)));

  return (
    <div className="ugc-plaza">
      <div className="ugc-plaza-header">
        <h1 className="plaza-title">内容广场</h1>
        <p className="plaza-subtitle">发现优质内容，分享创作灵感</p>
      </div>

      <div className="ugc-plaza-toolbar">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <div className="toolbar-right">
          <SortSelector value={sortBy} onChange={setSortBy} />
        </div>
      </div>

      <div className="ugc-plaza-filters">
        <CategoryTags
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
        <FilterBar
          tags={allTags}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
        />
      </div>

      <div className="ugc-plaza-content">
        {filteredContent.length === 0 ? (
          <div className="empty-state">
            <p>暂无内容</p>
            <p className="empty-hint">尝试调整筛选条件</p>
          </div>
        ) : (
          <div className="content-grid">
            {filteredContent.map((item, index) => (
              <ContentCard 
                key={item.id} 
                content={item} 
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

