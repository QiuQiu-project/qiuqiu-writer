import { Play, Coins } from 'lucide-react';

export default function TrainingBanner() {
  return (
    <div
      className="rounded-xl p-8 flex items-center justify-between relative overflow-hidden shadow-[0_8px_32px_rgba(68,68,68,0.3)]"
      style={{ background: 'linear-gradient(135deg, #444444 0%, #333333 100%)' }}
    >
      {/* Decorative circle (replaces ::before pseudo-element) */}
      <div className="absolute -top-1/2 -right-[10%] w-[300px] h-[300px] rounded-full pointer-events-none bg-white/10" />

      {/* Content */}
      <div className="flex-1 relative z-[1]">
        <div className="mb-5">
          <h2 className="text-[28px] font-extrabold text-white m-0 mb-3 [text-shadow:0_2px_4px_rgba(0,0,0,0.1)]">
            「阁主X星球」 写作训练营
          </h2>
          <p className="text-base text-white/95 m-0 leading-[1.6]">
            【阁主】品质保证,全面开营!
          </p>
        </div>
        <button
          className="px-8 py-3 bg-white text-[#444] border-none rounded-full text-base font-bold cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
          style={{ boxShadow: 'var(--shadow-md)' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-xl)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
        >
          立即查看
        </button>
      </div>

      {/* Illustration */}
      <div className="relative w-[200px] h-[150px] z-[1] shrink-0">
        <div
          className="w-[120px] h-[90px] rounded-xl border-[3px] border-white flex items-center justify-center backdrop-blur-[10px]"
          style={{ background: 'rgba(255,255,255,0.2)', boxShadow: 'var(--shadow-lg)' }}
        >
          <Play size={40} className="text-white" />
        </div>
        <div
          className="absolute top-5 right-5 flex flex-col gap-2"
          style={{ animation: 'float 3s ease-in-out infinite' }}
        >
          <Coins size={24} className="[filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.2))]" style={{ color: 'var(--warning)' }} />
          <div
            className="w-10 h-[50px] rounded-[4px] flex items-center justify-center font-bold text-sm text-white"
            style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #999 100%)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            100
          </div>
        </div>
      </div>
    </div>
  );
}
