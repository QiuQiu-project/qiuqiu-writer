export default function HomeHeader() {
  return (
    <header
      className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-[100]"
      style={{
        background: 'var(--bg-primary)',
        borderColor: 'var(--border-light)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Hi, 星球tL2L3z
        </span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          欢迎来到球球写作!
        </span>
      </div>

      <div className="flex-1 flex justify-center">
        <button
          className="px-5 py-2 text-sm font-semibold text-white border-none rounded-full cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
          style={{
            background: 'var(--accent-gradient)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          AI工具大赛第五期
        </button>
      </div>
    </header>
  );
}
