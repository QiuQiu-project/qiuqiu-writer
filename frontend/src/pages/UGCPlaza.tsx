import { useState } from 'react';
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
    <div
      className="w-full min-h-[calc(100vh-64px)] flex flex-col relative [animation:fade-in_0.4s_ease-out]"
      style={{ background: 'var(--bg-gradient-soft)' }}
    >
      {/* Header */}
      <div
        className="relative z-[1] px-8 pt-12 pb-8 border-b backdrop-blur-[10px] shadow-sm max-md:px-4 max-md:pt-6 max-md:pb-4"
        style={{
          background: 'linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(255,255,255,0.8) 100%)',
          borderColor: 'var(--border-light)',
        }}
      >
        <h1
          className="text-[2.5rem] font-extrabold tracking-[-0.02em] mb-3 relative max-md:text-[1.75rem]"
          style={{
            background: 'var(--accent-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          内容广场
          {/* Underline decoration */}
          <span
            className="absolute bottom-[-8px] left-0 w-[60px] h-1 rounded-full"
            style={{ background: 'var(--accent-gradient)' }}
          />
        </h1>
        <p className="text-lg font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>
          发现优质内容，分享创作灵感
        </p>
      </div>

      {/* Toolbar */}
      <div
        className="relative z-[1] flex justify-between items-center gap-4 px-8 py-6 border-b backdrop-blur-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.05)] max-md:px-4 max-md:py-4 max-md:flex-col max-md:items-stretch"
        style={{
          background: 'rgba(255,255,255,0.8)',
          borderColor: 'var(--border-light)',
        }}
      >
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <div className="flex gap-4 items-center max-md:justify-between max-md:w-full">
          <SortSelector value={sortBy} onChange={setSortBy} />
        </div>
      </div>

      {/* Filters */}
      <div
        className="relative z-[1] px-8 py-6 border-b backdrop-blur-[10px] flex flex-col gap-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] max-md:px-4 max-md:py-4"
        style={{
          background: 'rgba(255,255,255,0.6)',
          borderColor: 'var(--border-light)',
        }}
      >
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

      {/* Content */}
      <div className="relative z-[1] flex-1 p-10 overflow-y-auto max-md:p-4 max-sm:p-2">
        {filteredContent.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-24 px-8 text-center rounded-xl border-2 border-dashed backdrop-blur-[10px]"
            style={{
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.5)',
              borderColor: 'var(--border-color)',
            }}
          >
            <p className="text-xl mb-3 font-semibold" style={{ color: 'var(--text-primary)' }}>暂无内容</p>
            <p className="text-[0.9375rem] opacity-80" style={{ color: 'var(--text-secondary)' }}>尝试调整筛选条件</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-8 max-w-[1400px] mx-auto [animation:fade-in-up_0.6s_ease-out] max-sm:grid-cols-1 max-sm:gap-6">
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
