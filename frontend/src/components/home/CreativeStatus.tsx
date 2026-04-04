export default function CreativeStatus() {
  return (
    <div
      className="rounded-xl p-6 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(68,68,68,0.15)]"
      style={{
        background: 'var(--bg-primary)',
        boxShadow: '0 2px 12px rgba(68,68,68,0.1)',
        borderColor: 'rgba(68,68,68,0.1)',
      }}
    >
      <div className="mb-5">
        <h3 className="text-lg font-bold m-0" style={{ color: 'var(--text-primary)' }}>
          创作情况
        </h3>
      </div>

      <div className="flex flex-col gap-5">
        {/* Word count */}
        <div className="flex items-baseline gap-2">
          <span className="text-[36px] font-extrabold" style={{ color: 'var(--accent-primary)' }}>0</span>
          <span className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>万字</span>
        </div>

        {/* Progress */}
        <div className="flex flex-col gap-2">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>超越0.0%创作者</span>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: '0%', background: 'var(--accent-gradient)' }}
            />
          </div>
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-3 gap-4 pt-4 border-t"
          style={{ borderColor: 'var(--border-light)' }}
        >
          {[
            { label: '累计AI使用次数', value: '0次' },
            { label: '累计天数', value: '3天' },
            { label: '作品数', value: '3篇' },
          ].map(stat => (
            <div key={stat.label} className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</span>
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
