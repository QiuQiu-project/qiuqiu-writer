import { useState } from 'react';
import { X, Eye, EyeOff, User, Lock, Mail, Tag } from 'lucide-react';
import { authApi, type LoginRequest, type RegisterRequest, type UserInfo } from '../../utils/authApi';
import { cn } from '@/lib/utils';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (userInfo: UserInfo) => void;
}

/* ─── Star field (CSS box-shadow trick) ─── */
const STAR_SHADOWS = Array.from({ length: 160 }, () => {
  const x = Math.floor(Math.random() * 1600);
  const y = Math.floor(Math.random() * 900);
  const op = (Math.random() * 0.5 + 0.2).toFixed(2);
  const sz = Math.random() > 0.85 ? '1.5px' : '1px';
  return `${x}px ${y}px 0 ${sz} rgba(255,255,255,${op})`;
}).join(', ');

/* ─── Crescent moon SVG ─── */
function Moon() {
  return (
    <svg viewBox="0 0 300 300" fill="none" className="w-full h-full">
      <defs>
        <mask id="crescent">
          <circle cx="150" cy="150" r="140" fill="white" />
          <circle cx="205" cy="120" r="118" fill="black" />
        </mask>
      </defs>
      <circle cx="150" cy="150" r="140" fill="rgba(255,255,255,0.06)" mask="url(#crescent)" />
      <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" mask="url(#crescent)" />
      {/* Glow */}
      <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(180,200,255,0.05)" strokeWidth="30" mask="url(#crescent)" />
    </svg>
  );
}

/* ─── Input with prefix icon ─── */
function IconInput({
  icon,
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled,
  suffix,
}: {
  icon: React.ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center">
      <span className="absolute left-3.5 text-[#6a58a7]/55 pointer-events-none">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full h-11 pl-10 pr-10 rounded-xl text-sm text-[#1f045a] placeholder:text-[#6b5a7a]/55',
          'bg-white border border-[#ede4ff] outline-none transition-all',
          'focus:bg-white focus:border-[#ffcf99] focus:ring-2 focus:ring-[#fff2e5]',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      />
      {suffix && (
        <span className="absolute right-3 text-[#6a58a7]/60">{suffix}</span>
      )}
    </div>
  );
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loginForm, setLoginForm] = useState<LoginRequest>({
    username_or_email: '',
    password: '',
  });
  const [registerForm, setRegisterForm] = useState<RegisterRequest>({
    invitation_code: '',
    username: '',
    email: '',
    password: '',
    confirm_password: '',
    display_name: '',
  });

  if (!isOpen) return null;

  const handleLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login(loginForm);
      authApi.setToken(res.access_token);
      authApi.setRefreshToken(res.refresh_token);
      authApi.setUserInfo(res.user);
      onLoginSuccess(res.user);
      onClose();
      setLoginForm({ username_or_email: '', password: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError(null);
    if (registerForm.password !== registerForm.confirm_password) {
      setError('两次输入的密码不一致');
      return;
    }
    if (registerForm.password.length < 8) {
      setError('密码长度至少为8位');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.register(registerForm);
      authApi.setToken(res.access_token);
      authApi.setRefreshToken(res.refresh_token);
      authApi.setUserInfo(res.user);
      onLoginSuccess(res.user);
      onClose();
      setRegisterForm({ invitation_code: '', username: '', email: '', password: '', confirm_password: '', display_name: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => { setMode(m); setError(null); };

  return (
    <div className="fixed inset-0 z-[2000] overflow-hidden flex items-center justify-center bg-[linear-gradient(160deg,#fdf7ff_0%,#f6f0ff_45%,#fffaf3_100%)]"
    >
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "url('/favicon.png')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: 'min(42vw, 420px)',
        }}
      />
      {/* Star field */}
      <div className="absolute inset-0 pointer-events-none opacity-20" style={{ boxShadow: STAR_SHADOWS, width: 1, height: 1 }} />

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(106,88,167,0.10) 0%, transparent 70%)' }}
      />
      <div className="absolute left-[8%] top-[15%] h-44 w-44 rounded-full bg-[#ff8000]/10 blur-[70px] pointer-events-none" />
      <div className="absolute right-[10%] bottom-[12%] h-56 w-56 rounded-full bg-[#6a58a7]/10 blur-[80px] pointer-events-none" />

      {/* Logo — top left */}
      <div className="absolute top-6 left-8 flex items-center gap-2 z-10">
        <div className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-[#1f045a]/8 backdrop-blur border border-[#ede4ff]">
          <img src="/favicon.png" alt="球球写作" className="h-6 w-6 object-contain" />
        </div>
        <span className="text-[#1f045a] font-semibold text-base tracking-wide">球球写作</span>
      </div>

      {/* Close — top right */}
      <button
        onClick={onClose}
        className="absolute top-5 right-7 z-10 w-9 h-9 flex items-center justify-center rounded-xl text-[#6b5a7a]/50 hover:text-[#1f045a] hover:bg-white transition-all border border-transparent hover:border-[#ede4ff]"
      >
        <X size={18} />
      </button>

      {/* Decorative moon — right */}
      <div className="absolute right-[-40px] top-1/2 -translate-y-1/2 w-[420px] h-[420px] opacity-20 pointer-events-none select-none hidden lg:block">
        <Moon />
      </div>

      {/* Login Card */}
      <div
        className="relative z-10 w-full mx-4 rounded-2xl p-8 flex flex-col gap-0"
        style={{
          maxWidth: 400,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #ede4ff',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 32px 80px rgba(31,4,90,0.12), inset 0 1px 0 rgba(255,255,255,0.55)',
        }}
      >
        {/* Title */}
        <h2 className="text-2xl font-bold text-[#1f045a] text-center mb-6">
          {mode === 'login' ? '欢迎回来' : '创建账号'}
        </h2>

        {/* Tabs */}
        <div className="flex mb-6 rounded-xl overflow-hidden bg-[#f2ebff] p-1 gap-1">
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={cn(
                'inline-flex flex-1 items-center justify-center py-2 text-center text-sm font-medium rounded-lg transition-all',
                mode === m
                  ? 'bg-white text-[#ff8000] shadow-sm'
                  : 'text-[#6b5a7a] hover:text-[#1f045a]',
              )}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        {/* Login Form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <IconInput
              icon={<User size={16} />}
              placeholder="用户名或邮箱"
              value={loginForm.username_or_email}
              onChange={v => setLoginForm({ ...loginForm, username_or_email: v })}
              disabled={loading}
            />
            <IconInput
              icon={<Lock size={16} />}
              type={showPassword ? 'text' : 'password'}
              placeholder="密码"
              value={loginForm.password}
              onChange={v => setLoginForm({ ...loginForm, password: v })}
              disabled={loading}
              suffix={
                <button type="button" tabIndex={-1} onClick={() => setShowPassword(p => !p)}
                  className="p-0.5 hover:text-[#1f045a] transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl text-center text-sm font-semibold text-white transition-all',
                'bg-gradient-to-r from-[#ff8000] to-[#964900]',
                'hover:from-[#ff922f] hover:to-[#a95506] hover:shadow-lg hover:shadow-[#964900]/20',
                'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100',
              )}
            >
              {loading ? '登录中...' : '登 录'}
            </button>
            <p className="text-center text-xs text-[#6b5a7a] mt-1">
              还没有账号？
              <button type="button" onClick={() => switchMode('register')} className="text-[#ff8000] hover:text-[#964900] underline-offset-2 hover:underline ml-1">
                立即注册
              </button>
            </p>
          </form>
        )}

        {/* Register Form */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <IconInput
              icon={<User size={16} />}
              placeholder="用户名（字母、数字、下划线）"
              value={registerForm.username}
              onChange={v => setRegisterForm({ ...registerForm, username: v })}
              disabled={loading}
            />
            <IconInput
              icon={<Mail size={16} />}
              type="email"
              placeholder="邮箱"
              value={registerForm.email}
              onChange={v => setRegisterForm({ ...registerForm, email: v })}
              disabled={loading}
            />
            <IconInput
              icon={<Lock size={16} />}
              type={showPassword ? 'text' : 'password'}
              placeholder="密码（至少8位）"
              value={registerForm.password}
              onChange={v => setRegisterForm({ ...registerForm, password: v })}
              disabled={loading}
              suffix={
                <button type="button" tabIndex={-1} onClick={() => setShowPassword(p => !p)}
                  className="p-0.5 hover:text-[#1f045a] transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <IconInput
              icon={<Lock size={16} />}
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="确认密码"
              value={registerForm.confirm_password}
              onChange={v => setRegisterForm({ ...registerForm, confirm_password: v })}
              disabled={loading}
              suffix={
                <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(p => !p)}
                  className="p-0.5 hover:text-[#1f045a] transition-colors">
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <IconInput
              icon={<User size={16} />}
              placeholder="昵称（可选）"
              value={registerForm.display_name || ''}
              onChange={v => setRegisterForm({ ...registerForm, display_name: v })}
              disabled={loading}
            />
            <IconInput
              icon={<Tag size={16} />}
              placeholder="邀请码"
              value={registerForm.invitation_code || ''}
              onChange={v => setRegisterForm({ ...registerForm, invitation_code: v })}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'mt-1 inline-flex h-11 w-full items-center justify-center rounded-xl text-center text-sm font-semibold text-white transition-all',
                'bg-gradient-to-r from-[#ff8000] to-[#964900]',
                'hover:from-[#ff922f] hover:to-[#a95506] hover:shadow-lg hover:shadow-[#964900]/20',
                'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100',
              )}
            >
              {loading ? '注册中...' : '注 册'}
            </button>
            <p className="text-center text-xs text-[#6b5a7a]">
              已有账号？
              <button type="button" onClick={() => switchMode('login')} className="text-[#ff8000] hover:text-[#964900] underline-offset-2 hover:underline ml-1">
                立即登录
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
