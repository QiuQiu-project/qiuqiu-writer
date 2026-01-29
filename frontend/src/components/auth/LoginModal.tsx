import { useState } from 'react';
import { X } from 'lucide-react';
import { authApi, type LoginRequest, type RegisterRequest, type UserInfo } from '../../utils/authApi';
import './LoginModal.css';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (userInfo: UserInfo) => void;
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 登录表单
  const [loginForm, setLoginForm] = useState<LoginRequest>({
    username_or_email: '',
    password: '',
  });

  // 注册表单
  const [registerForm, setRegisterForm] = useState<RegisterRequest>({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
    display_name: '',
  });

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await authApi.login(loginForm);
      authApi.setToken(response.access_token);
      authApi.setRefreshToken(response.refresh_token);
      authApi.setUserInfo(response.user);
      onLoginSuccess(response.user);
      onClose();
      // 重置表单
      setLoginForm({ username_or_email: '', password: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 验证密码
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
      const response = await authApi.register(registerForm);
      authApi.setToken(response.access_token);
      authApi.setRefreshToken(response.refresh_token);
      authApi.setUserInfo(response.user);
      onLoginSuccess(response.user);
      onClose();
      // 重置表单
      setRegisterForm({
        username: '',
        email: '',
        password: '',
        confirm_password: '',
        display_name: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-modal-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="login-modal-header">
          <h2>{mode === 'login' ? '登录' : '注册'}</h2>
          <div className="login-modal-tabs">
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              登录
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              注册
            </button>
          </div>
        </div>

        {error && <div className="login-modal-error">{error}</div>}

        {mode === 'login' ? (
          <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label>用户名或邮箱</label>
              <input
                type="text"
                value={loginForm.username_or_email}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, username_or_email: e.target.value })
                }
                placeholder="请输入用户名或邮箱"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
                placeholder="请输入密码"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleRegister}>
            <div className="form-group">
              <label>用户名</label>
              <input
                type="text"
                value={registerForm.username}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, username: e.target.value })
                }
                placeholder="3-50个字符，只能包含字母、数字、下划线和连字符"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>邮箱</label>
              <input
                type="email"
                value={registerForm.email}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, email: e.target.value })
                }
                placeholder="请输入邮箱地址"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>显示名称（可选）</label>
              <input
                type="text"
                value={registerForm.display_name}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, display_name: e.target.value })
                }
                placeholder="请输入显示名称"
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, password: e.target.value })
                }
                placeholder="至少8位，包含大小写字母、数字中的至少3种"
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>确认密码</label>
              <input
                type="password"
                value={registerForm.confirm_password}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, confirm_password: e.target.value })
                }
                placeholder="请再次输入密码"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? '注册中...' : '注册'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}






