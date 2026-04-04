import { useState } from 'react';
import { X, Eye, EyeOff, User, Lock, Mail, Tag, Feather } from 'lucide-react';
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
      <span className="absolute left-3.5 text-white/30 pointer-events-none">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'w-full h-11 pl-10 pr-10 rounded-xl text-sm text-white placeholder-white/25',
          'bg-white/8 border border-white/12 outline-none transition-all',
          'focus:bg-white/12 focus:border-white/30 focus:ring-1 focus:ring-white/20',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      />
      {suffix && (
        <span className="absolute right-3 text-white/40">{suffix}</span>
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
    <div className="fixed inset-0 z-[2000] overflow-hidden flex items-center justify-center"
      style={{ background: 'linear-gradient(150deg, #070c1b 0%, #0c1430 40%, #060a17 100%)' }}
    >
      {/* Star field */}
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: STAR_SHADOWS, width: 1, height: 1 }} />

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(99,120,255,0.08) 0%, transparent 70%)' }}
      />

      {/* Logo — top left */}
      <div className="absolute top-6 left-8 flex items-center gap-2 z-10">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
          <Feather size={16} className="text-white" />
        </div>
        <span className="text-white/90 font-semibold text-base tracking-wide">球球写作</span>
      </div>

      {/* Close — top right */}
      <button
        onClick={onClose}
        className="absolute top-5 right-7 z-10 w-9 h-9 flex items-center justify-center rounded-xl text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
      >
        <X size={18} />
      </button>

      {/* Decorative moon — right */}
      <div className="absolute right-[-40px] top-1/2 -translate-y-1/2 w-[420px] h-[420px] opacity-70 pointer-events-none select-none hidden lg:block">
        <Moon />
      </div>

      {/* Login Card */}
      <div
        className="relative z-10 w-full mx-4 rounded-2xl p-8 flex flex-col gap-0"
        style={{
          maxWidth: 400,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Title */}
        <h2 className="text-2xl font-bold text-white text-center mb-6">
          {mode === 'login' ? '欢迎回来' : '创建账号'}
        </h2>

        {/* Tabs */}
        <div className="flex mb-6 rounded-xl overflow-hidden bg-white/5 p-1 gap-1">
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={cn(
                'flex-1 py-2 text-sm font-medium rounded-lg transition-all',
                mode === m
                  ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                  : 'text-white/40 hover:text-white/70',
              )}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
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
                  className="p-0.5 hover:text-white/70 transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'mt-2 h-11 w-full rounded-xl text-sm font-semibold text-white transition-all',
                'bg-gradient-to-r from-emerald-500 to-teal-500',
                'hover:from-emerald-400 hover:to-teal-400 hover:shadow-lg hover:shadow-emerald-900/40',
                'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100',
              )}
            >
              {loading ? '登录中...' : '登 录'}
            </button>
            <p className="text-center text-xs text-white/30 mt-1">
              还没有账号？
              <button type="button" onClick={() => switchMode('register')} className="text-emerald-400/80 hover:text-emerald-400 underline-offset-2 hover:underline ml-1">
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
                  className="p-0.5 hover:text-white/70 transition-colors">
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
                  className="p-0.5 hover:text-white/70 transition-colors">
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
                'mt-1 h-11 w-full rounded-xl text-sm font-semibold text-white transition-all',
                'bg-gradient-to-r from-emerald-500 to-teal-500',
                'hover:from-emerald-400 hover:to-teal-400 hover:shadow-lg hover:shadow-emerald-900/40',
                'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100',
              )}
            >
              {loading ? '注册中...' : '注 册'}
            </button>
            <p className="text-center text-xs text-white/30">
              已有账号？
              <button type="button" onClick={() => switchMode('login')} className="text-emerald-400/80 hover:text-emerald-400 underline-offset-2 hover:underline ml-1">
                立即登录
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
