import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  BookOpen,
  Sparkles,
  Users,
  Zap,
  Brain,
  Cloud,
  PenTool,
  FileText,
  ArrowRight,
  Check,
} from 'lucide-react';
import { authApi } from '../utils/authApi';
import MessageModal from '../components/common/MessageModal';
import type { MessageType } from '../components/common/MessageModal';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const navigate = useNavigate();
  const context = useOutletContext<{ setLoginModalOpen: (open: boolean) => void }>();
  const setLoginModalOpen = context?.setLoginModalOpen;

  const isAuthenticated = authApi.isAuthenticated();

  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
    toast?: boolean;
    autoCloseMs?: number;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  const features = [
    {
      icon: <PenTool size={22} />,
      title: '智能写作助手',
      description: 'AI 驱动的创作助手，帮你突破写作瓶颈，随时激发创作灵感',
    },
    {
      icon: <FileText size={22} />,
      title: '多格式支持',
      description: '强大的编辑工具，支持长篇小说、剧本、短篇等各类写作需求',
    },
    {
      icon: <Users size={22} />,
      title: '多人AI协作',
      description: '多人实时协作 + AI 同步辅助，共同创作时 AI 随时为每位作者提供支持',
    },
    {
      icon: <Cloud size={22} />,
      title: '云端同步',
      description: '自动保存，多设备无缝同步，随时随地继续你的创作',
    },
    {
      icon: <Zap size={22} />,
      title: '实时编辑',
      description: '流畅的富文本编辑体验，支持 Markdown，所见即所得',
    },
    {
      icon: <Brain size={22} />,
      title: '多层记忆系统',
      description: '创作者记忆、作品记忆与对话记忆三层架构，让 AI 持续了解你的风格与故事世界',
    },
  ];

  const handleGetStarted = () => {
    if (!isAuthenticated) {
      if (setLoginModalOpen) {
        setLoginModalOpen(true);
      }
      return;
    }
    navigate('/novel?section=workbench');
  };

  return (
    <div className="landing-bg w-full min-h-[calc(100vh-60px)] relative overflow-x-hidden antialiased" style={{ color: 'var(--text-primary)' }}>

      {/* Animated Background Orbs */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute rounded-full blur-[90px] opacity-[0.18] w-[700px] h-[700px] -top-[180px] -left-[140px]"
          style={{
            background: 'radial-gradient(circle, var(--orb-1-color, rgba(59,130,246,0.5)), transparent 70%)',
            animation: 'orb-float 26s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full blur-[90px] opacity-[0.14] w-[550px] h-[550px] bottom-[80px] -right-[120px]"
          style={{
            background: 'radial-gradient(circle, var(--orb-2-color, rgba(99,102,241,0.55)), transparent 70%)',
            animation: 'orb-float 20s ease-in-out infinite',
            animationDelay: '-9s',
          }}
        />
        <div
          className="absolute rounded-full blur-[90px] opacity-[0.10] w-[420px] h-[420px] top-[38%] left-[45%]"
          style={{
            background: 'radial-gradient(circle, var(--orb-3-color, rgba(14,165,233,0.45)), transparent 70%)',
            animation: 'orb-float 16s ease-in-out infinite',
            animationDelay: '-5s',
          }}
        />
      </div>

      {/* Hero Section */}
      <section className="relative z-[1] max-w-[1200px] mx-auto px-10 py-[120px] pb-[110px] flex items-center justify-center min-h-[calc(100vh-60px)] text-center max-md:px-6 max-md:py-20 max-md:min-h-auto max-sm:px-4 max-sm:py-[60px]">
        <div className="max-w-[820px] flex flex-col items-center">

          {/* Badge */}
          <div
            className="inline-flex items-center gap-[7px] px-[18px] py-1.5 rounded-full text-[13px] font-medium tracking-[0.04em] backdrop-blur-sm mb-9"
            style={{
              background: 'var(--hero-badge-bg)',
              border: '1px solid var(--hero-badge-border)',
              color: 'var(--hero-badge-color)',
              animation: 'fade-in-down 0.65s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            <Sparkles size={13} />
            <span>AI 驱动的智能写作平台</span>
          </div>

          {/* Title */}
          <h1
            className="flex flex-col gap-2.5 mb-7 text-[clamp(52px,9vw,88px)] font-extrabold leading-[1.04] tracking-[-0.045em]"
            style={{ animation: 'fade-in-up 0.7s 0.1s cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'var(--hero-title-gradient)' }}
            >
              球球写作
            </span>
            <span
              className="text-[clamp(20px,3.2vw,30px)] font-normal tracking-[-0.015em]"
              style={{ color: 'var(--hero-subtitle-color)' }}
            >
              让创作更简单，让故事更精彩
            </span>
          </h1>

          {/* Description */}
          <p
            className="text-[clamp(15px,1.8vw,18px)] leading-[1.8] mb-[52px] max-w-[580px] max-md:mb-10"
            style={{
              color: 'var(--text-tertiary)',
              animation: 'fade-in-up 0.7s 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            专业的 AI 写作助手，帮助你从灵感到成稿，轻松完成每一部作品。
            无论你想写什么，球球写作都是你最好的创作伙伴。
          </p>

          {/* Action Buttons */}
          <div
            className="flex gap-3.5 flex-wrap justify-center max-md:flex-col max-md:w-full max-md:max-w-[300px]"
            style={{ animation: 'fade-in-up 0.7s 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            <button
              onClick={handleGetStarted}
              className={cn(
                'inline-flex items-center gap-2 px-[34px] py-[15px] rounded-full text-[15px] font-semibold tracking-[0.01em] cursor-pointer border-0 text-white',
                'transition-all duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
                'bg-gradient-to-br from-[#ff8000] to-[#964900]',
                'shadow-[0_10px_30px_rgba(255,128,0,0.28),0_1px_3px_rgba(31,4,90,0.18)]',
                'hover:from-[#ff922f] hover:to-[#a95506] hover:-translate-y-0.5',
                'hover:shadow-[0_14px_38px_rgba(255,128,0,0.32),0_2px_6px_rgba(31,4,90,0.2)]',
                'active:translate-y-0 active:shadow-[0_8px_20px_rgba(255,128,0,0.22)]',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'max-md:w-full max-md:justify-center',
              )}
            >
              开始创作
              <ArrowRight size={17} />
            </button>
            {!isAuthenticated && (
              <button
                onClick={() => navigate('/')}
                className={cn(
                  'inline-flex items-center gap-2 px-[34px] py-[15px] rounded-full text-[15px] font-medium tracking-[0.01em] cursor-pointer',
                  'transition-all duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
                  'backdrop-blur-md border border-white/[0.12]',
                  'bg-white/[0.06] text-[color:var(--text-secondary)]',
                  'hover:bg-white/[0.10] hover:border-white/[0.22] hover:text-[color:var(--text-primary)] hover:-translate-y-0.5',
                  'hover:shadow-[0_6px_24px_rgba(0,0,0,0.15)]',
                  'max-md:w-full max-md:justify-center',
                )}
              >
                了解更多
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-[1] py-[100px] px-10 max-md:py-[70px] max-md:px-6 max-sm:py-14 max-sm:px-4">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16 max-sm:mb-10">
            <span
              className="inline-block text-[11px] font-bold tracking-[0.12em] uppercase mb-[18px] opacity-90"
              style={{ color: 'var(--section-label-color)' }}
            >
              核心功能
            </span>
            <h2
              className="text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.025em] leading-[1.15] mb-[18px]"
              style={{ color: 'var(--section-title-color)' }}
            >
              为什么选择球球写作？
            </h2>
            <p className="text-base mx-auto leading-[1.75] max-w-[480px]" style={{ color: 'var(--text-tertiary)' }}>
              我们提供全方位的创作支持，让你的创作之旅更加顺畅
            </p>
          </div>

          <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className={cn(
                  'p-8 backdrop-blur-xl border rounded-[20px] relative overflow-hidden group',
                  'transition-all duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
                  'hover:-translate-y-[7px]',
                  'hover:shadow-[0_24px_60px_rgba(0,0,0,0.2),0_0_0_1px_rgba(59,130,246,0.12)]',
                  'max-md:p-7 max-sm:p-6',
                )}
                style={{
                  background: 'var(--glass-bg)',
                  borderColor: 'var(--glass-border)',
                  animation: `fade-in-up 0.6s ${0.05 + Math.floor(index / 3) * 0.07 + (index % 3) * 0.07}s cubic-bezier(0.16, 1, 0.3, 1) both`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--glass-bg-hover)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--glass-bg)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--glass-border)'; }}
              >
                {/* Hover glow overlay */}
                <div className="absolute inset-0 rounded-[20px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-[320ms] bg-gradient-to-br from-blue-500/[0.06] to-transparent" />

                <div
                  className="w-[50px] h-[50px] flex items-center justify-center rounded-[13px] border mb-[22px] flex-shrink-0 relative z-[1] transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.13) 100%)',
                    borderColor: 'rgba(59,130,246,0.24)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  {feature.icon}
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] mb-2.5 relative z-[1]" style={{ color: 'var(--feature-title-color)' }}>
                  {feature.title}
                </h3>
                <p className="text-sm leading-[1.72] relative z-[1]" style={{ color: 'var(--text-tertiary)' }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="relative z-[1] pt-5 px-10 pb-[100px] max-md:py-[70px] max-md:px-6 max-sm:py-14 max-sm:px-4">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16 max-sm:mb-10">
            <span
              className="inline-block text-[11px] font-bold tracking-[0.12em] uppercase mb-[18px] opacity-90"
              style={{ color: 'var(--section-label-color)' }}
            >
              应用场景
            </span>
            <h2
              className="text-[clamp(28px,4vw,44px)] font-bold tracking-[-0.025em] leading-[1.15] mb-[18px]"
              style={{ color: 'var(--section-title-color)' }}
            >
              适用于各类创作需求
            </h2>
            <p className="text-base mx-auto leading-[1.75] max-w-[480px]" style={{ color: 'var(--text-tertiary)' }}>
              无论你是专业作家还是写作爱好者，球球写作都能满足你的需求
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-[18px]">
            {[
              {
                icon: <BookOpen size={32} />,
                title: '创作管理',
                items: ['章节结构管理', '角色关系梳理', '情节大纲规划', '自动保存功能'],
              },
              {
                icon: <FileText size={32} />,
                title: '内容编辑',
                items: ['富文本编辑', 'Markdown 支持', '实时预览', '格式自动调整'],
              },
              {
                icon: <Users size={32} />,
                title: '团队协作',
                items: ['多人实时编辑', '版本历史管理', '评论批注功能', '权限精细控制'],
              },
            ].map((uc, i) => (
              <div
                key={i}
                className={cn(
                  'px-9 py-10 backdrop-blur-xl border rounded-[24px] relative overflow-hidden group',
                  'transition-all duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
                  'hover:-translate-y-2 hover:shadow-[0_28px_64px_rgba(0,0,0,0.2)]',
                  'max-md:px-7 max-md:py-8 max-sm:px-6 max-sm:py-7',
                )}
                style={{
                  background: 'var(--glass-bg)',
                  borderColor: 'var(--glass-border)',
                  animation: `fade-in-up 0.6s ${0.1 + i * 0.08}s cubic-bezier(0.16, 1, 0.3, 1) both`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--glass-bg-hover)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--glass-border-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--glass-bg)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--glass-border)'; }}
              >
                {/* Bottom accent line on hover */}
                <div className="absolute bottom-0 left-[20%] right-[20%] h-px opacity-0 group-hover:opacity-100 transition-opacity duration-[320ms]"
                  style={{ background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)' }} />

                <div className="mb-6 transition-all duration-300 group-hover:scale-[1.08] group-hover:[filter:drop-shadow(0_0_12px_rgba(59,130,246,0.4))]"
                  style={{ color: 'var(--accent-primary)', opacity: 0.85 }}>
                  {uc.icon}
                </div>
                <h3 className="text-[22px] font-bold tracking-[-0.025em] mb-[22px]" style={{ color: 'var(--feature-title-color)' }}>
                  {uc.title}
                </h3>
                <ul className="flex flex-col gap-[11px] list-none p-0 m-0">
                  {uc.items.map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-sm leading-[1.5]" style={{ color: 'var(--text-tertiary)' }}>
                <Check size={15} className="text-[#47b8ab] shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-[1] pt-[60px] px-10 pb-[100px] max-md:pt-10 max-md:px-6 max-md:pb-[70px] max-sm:pt-[30px] max-sm:px-4 max-sm:pb-[60px]">
        <div
          className="max-w-[680px] mx-auto text-center px-12 py-[72px] backdrop-blur-xl border rounded-[32px] relative overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.15)] max-md:px-7 max-md:py-12 max-md:rounded-[24px]"
          style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
        >
          {/* Top glow */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[400px] h-[200px] pointer-events-none"
            style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.2), transparent 70%)' }}
            aria-hidden="true"
          />

          <h2
            className="text-[clamp(26px,3.5vw,38px)] font-bold tracking-[-0.03em] leading-[1.2] mb-4"
            style={{ color: 'var(--cta-title-color)' }}
          >
            立即开启你的创作之旅
          </h2>
          <p className="text-base leading-[1.6] mb-10" style={{ color: 'var(--text-tertiary)' }}>
            加入创作者社区，用 AI 助力你的每一个故事
          </p>
          <button
            onClick={handleGetStarted}
            className={cn(
              'inline-flex items-center gap-2 px-10 py-4 rounded-full text-[16px] font-semibold tracking-[0.01em] cursor-pointer border-0 text-white',
              'transition-all duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
              'bg-gradient-to-br from-[#ff8000] to-[#964900]',
              'shadow-[0_10px_30px_rgba(255,128,0,0.28),0_1px_3px_rgba(31,4,90,0.18)]',
              'hover:from-[#ff922f] hover:to-[#a95506] hover:-translate-y-0.5',
              'hover:shadow-[0_14px_38px_rgba(255,128,0,0.32)]',
              'active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            免费开始创作
            <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        toast={messageState.toast}
        autoCloseMs={messageState.autoCloseMs}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />
    </div>
  );
}
