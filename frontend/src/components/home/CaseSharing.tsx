import { ChevronRight } from 'lucide-react';

const cases = [
  { title: '从抵触AI,到用星球写稿赚医药费', date: '2025-07-17 00:00' },
  { title: '35岁被裁,我靠星球写小说还房贷', date: '2025-06-15 00:00' },
];

export default function CaseSharing() {
  return (
    <div
      className="rounded-xl p-5 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(68,68,68,0.15)]"
      style={{
        background: 'var(--bg-primary)',
        boxShadow: '0 2px 12px rgba(68,68,68,0.1)',
        borderColor: 'rgba(68,68,68,0.1)',
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>
          案例分享
        </h3>
        <a
          href="#"
          className="flex items-center gap-1 no-underline text-xs transition-all duration-200 hover:gap-1.5 hover:[color:var(--accent-secondary)]"
          style={{ color: 'var(--accent-primary)' }}
        >
          查看更多 <ChevronRight size={14} />
        </a>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {cases.map((item, index) => (
          <div
            key={index}
            className="p-3 rounded-lg cursor-pointer border border-transparent transition-all duration-200 hover:translate-x-1 hover:[border-color:var(--accent-primary)] hover:[background:var(--accent-light)]"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <p className="text-[13px] font-medium leading-[1.5] m-0 mb-1.5" style={{ color: 'var(--text-primary)' }}>
              {item.title}
            </p>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {item.date}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
