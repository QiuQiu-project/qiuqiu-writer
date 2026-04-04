import { FileText, ChevronRight } from 'lucide-react';

const tools = [
  {
    id: 'novel',
    icon: FileText,
    title: '小说',
    description: '长短篇AI一键生文,5000+专业工作流,百万作者选择',
  },
];

export default function WritingTools() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <div
              key={tool.id}
              className="border rounded-lg p-6 flex items-start gap-4 cursor-pointer transition-all duration-200 relative group hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(68,68,68,0.2)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'rgba(68,68,68,0.1)',
                boxShadow: '0 2px 8px rgba(68,68,68,0.08)',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(68,68,68,0.1)')}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-110"
                style={{ background: 'var(--accent-light)', color: 'var(--accent-primary)' }}
              >
                <Icon size={24} />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <h4 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>
                  {tool.title}
                </h4>
                <p className="text-[13px] leading-[1.6] m-0" style={{ color: 'var(--text-secondary)' }}>
                  {tool.description}
                </p>
              </div>
              <ChevronRight
                size={20}
                className="shrink-0 transition-all duration-200 group-hover:translate-x-1"
                style={{ color: 'var(--text-tertiary)' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
