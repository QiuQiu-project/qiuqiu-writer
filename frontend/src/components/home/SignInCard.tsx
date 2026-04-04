import { Coins, ChevronRight } from 'lucide-react';

export default function SignInCard() {
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
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-base font-bold m-0" style={{ color: 'var(--text-primary)' }}>
          签到领蛙币
        </h3>
        <a
          href="#"
          className="flex items-center gap-1 no-underline text-xs transition-all duration-200 hover:gap-1.5 hover:[color:var(--accent-secondary)]"
          style={{ color: 'var(--accent-primary)' }}
        >
          更多任务 <ChevronRight size={14} />
        </a>
      </div>

      {/* Sign-in boxes */}
      <div className="flex gap-3 mb-4">
        {[1, 2, 3].map(day => (
          <div
            key={day}
            className="flex-1 flex flex-col items-center gap-1.5 py-4 px-2 border rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:[border-color:var(--accent-primary)] hover:[background:var(--accent-light)]"
            style={{
              background: 'var(--bg-secondary)',
              borderColor: 'var(--border-light)',
            }}
          >
            <Coins size={20} style={{ color: 'var(--warning)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>+10 蛙币</span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>签到{day}天</span>
          </div>
        ))}
      </div>

      {/* Sign-in button */}
      <button
        className="w-full py-3 text-[15px] font-bold text-white border-none rounded-lg cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
        style={{
          background: 'var(--accent-gradient)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        点击签到
      </button>
    </div>
  );
}
