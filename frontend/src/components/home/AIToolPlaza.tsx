import { ChevronRight } from 'lucide-react';

const tags = [
  '#长篇', '#短篇', '#老福特', '#剧本', '#拆书', '#审稿',
  '#黄金开篇', '#脑洞', '#书名', '#金手指', '#世界观', '#去AI味',
];

export default function AIToolPlaza() {
  return (
    <div
      className="rounded-xl p-6 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(68,68,68,0.15)]"
      style={{
        background: 'var(--bg-primary)',
        boxShadow: '0 2px 12px rgba(68,68,68,0.1)',
        borderColor: 'rgba(68,68,68,0.1)',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold m-0" style={{ color: 'var(--text-primary)' }}>
          AI工具广场
        </h3>
        <a
          href="#"
          className="flex items-center gap-1 no-underline text-sm font-medium transition-all duration-200 hover:gap-2 hover:[color:var(--accent-secondary)]"
          style={{ color: 'var(--accent-primary)' }}
        >
          查看更多 <ChevronRight size={16} />
        </a>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2.5">
        {tags.map((tag) => (
          <button
            key={tag}
            className="px-[14px] py-1.5 border rounded-full text-[13px] font-medium cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)] hover:[border-color:var(--accent-primary)] hover:[background:var(--accent-light)] hover:[color:var(--accent-primary)]"
            style={{
              borderColor: 'var(--border-light)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
