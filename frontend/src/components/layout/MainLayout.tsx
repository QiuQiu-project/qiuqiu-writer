import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Menu, X, Compass, BookOpen, LogOut, Clapperboard, CreditCard, Receipt } from 'lucide-react';
import LoginModal from '../auth/LoginModal';
import MessageModal from '../common/MessageModal';
import type { MessageType } from '../common/MessageModal';
import { authApi, type UserInfo } from '../../utils/authApi';
import { getUserAvatarUrl } from '../../utils/avatarUtils';
import ImportWorkModal from '../ImportWorkModal';
import { cn } from '@/lib/utils';

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needLoginPrompt, setNeedLoginPrompt] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    const checkAuth = async () => {
      if (authApi.isAuthenticated()) {
        const storedUser = authApi.getUserInfo();
        if (storedUser) {
          setUserInfo(storedUser);
          setIsAuthenticated(true);
        } else {
          try {
            const user = await authApi.getCurrentUser();
            setUserInfo(user);
            setIsAuthenticated(true);
            authApi.setUserInfo(user);
          } catch {
            authApi.clearToken();
            setIsAuthenticated(false);
            setUserInfo(null);
          }
        }
      } else {
        setIsAuthenticated(false);
        setUserInfo(null);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const nextNeedLogin =
      !isAuthenticated && Boolean((location.state as { needLogin?: boolean } | null)?.needLogin);
    setNeedLoginPrompt(nextNeedLogin);
  }, [isAuthenticated, location.state]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
    };

    if (userMenuOpen || mobileMenuOpen || showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen, mobileMenuOpen, showCreateMenu]);

  const handleLoginSuccess = (user: UserInfo) => {
    setUserInfo(user);
    setIsAuthenticated(true);
    setNeedLoginPrompt(false);
    setLoginModalOpen(false);
    const from = (location.state as { from?: string })?.from;
    navigate(from || `/users/${user.id}`, { replace: true });
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      setUserInfo(null);
      setIsAuthenticated(false);
      setUserMenuOpen(false);
      navigate('/');
    }
  };

  const handleImportSuccess = (workId: string) => {
    setShowImportModal(false);
    navigate(`/novel/editor?workId=${workId}`);
  };

  const isHomePage = location.pathname === '/';
  const isMyProfilePage = userInfo && location.pathname === `/users/${userInfo.id}`;
  const isUserPage = location.pathname.startsWith('/users/');
  const isSpecialPage = isHomePage || isUserPage;

  return (
    <div
      className="w-full min-h-screen flex flex-row"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Login prompt banner */}
      {needLoginPrompt && (
        <div
          className="fixed top-0 left-0 right-0 z-[300] flex items-center justify-center gap-3 px-4 py-2.5 text-sm border-b max-md:top-[60px]"
          style={{
            background: 'var(--warning-light, rgba(253,230,138,0.1))',
            color: 'var(--warning, #f59e0b)',
            borderColor: 'var(--warning, #fcd34d)',
          }}
        >
          <span>请先登录以继续访问</span>
          <button
            type="button"
            className="px-3 py-1 border-none rounded text-xs text-white cursor-pointer"
            style={{ background: 'var(--warning, #f59e0b)' }}
            onClick={() => setLoginModalOpen(true)}
          >
            登录
          </button>
        </div>
      )}

      {/* Desktop Sidebar */}
      {!isHomePage && (
        <aside
          className={cn(
            'w-[240px] h-screen sticky top-0 flex flex-col border-r z-[100] shrink-0 transition-transform duration-300 max-md:hidden',
          )}
          style={{
            background: isSpecialPage ? 'var(--bg-sidebar, var(--bg-secondary))' : 'var(--bg-secondary)',
            borderColor: 'var(--border-color)',
          }}
        >
          {/* Logo */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-transparent">
            <Link
              to="/"
              className="flex items-center gap-2.5 no-underline font-semibold text-lg transition-opacity hover:opacity-80"
              style={{ color: 'var(--text-primary)' }}
            >
              <img src="/favicon.png" alt="Logo" className="w-7 h-7" data-no-lightbox />
              <span className="text-[18px] font-bold tracking-[-0.5px]">球球写作</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-5 flex flex-col gap-1 overflow-y-auto">
            {[
              { to: '/', icon: <Compass size={20} />, label: '探索', active: location.pathname === '/' },
              ...(isAuthenticated ? [
                {
                  to: userInfo ? `/users/${userInfo.id}` : '/',
                  icon: <BookOpen size={20} />,
                  label: '小说创作',
                  active: !!isMyProfilePage,
                },
                {
                  to: '/drama',
                  icon: <Clapperboard size={20} />,
                  label: '剧本创作',
                  active: location.pathname.startsWith('/drama'),
                },
              ] : []),
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-[15px] font-medium no-underline transition-all duration-200',
                  item.active
                    ? 'font-semibold [background:var(--bg-tertiary)] [color:var(--text-primary)]'
                    : '[color:var(--text-secondary)] hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]',
                )}
              >
                <span className={item.active ? 'opacity-100' : 'opacity-80'}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-5 py-4 border-t flex flex-col gap-3" style={{ borderColor: 'var(--border-light)' }}>
            {isAuthenticated ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  className="flex items-center gap-2.5 px-3 py-2 w-full border-none bg-transparent rounded-lg cursor-pointer text-left transition-colors duration-200 hover:[background:var(--bg-tertiary)]"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  title="用户菜单"
                >
                  {userInfo ? (
                    <img
                      src={getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name)}
                      alt={userInfo.display_name || userInfo.username || '用户'}
                      className="w-8 h-8 rounded-full object-cover border"
                      style={{ borderColor: 'var(--border-color)' }}
                    />
                  ) : (
                    <span className="w-8 h-8 flex items-center justify-center">
                      <User size={20} />
                    </span>
                  )}
                  <span
                    className="flex-1 text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {userInfo?.display_name || userInfo?.username}
                  </span>
                </button>

                {/* User dropdown */}
                {userMenuOpen && (
                  <div
                    className="absolute bottom-0 left-full ml-3 w-[260px] rounded-xl border py-2 z-[1000]"
                    style={{
                      background: 'var(--bg-primary)',
                      borderColor: 'var(--border-color)',
                      boxShadow: 'var(--shadow-lg)',
                      animation: 'fade-in 0.2s ease',
                    }}
                  >
                    {/* Dropdown header */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {userInfo ? (
                        <img
                          src={getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name)}
                          alt={userInfo.display_name || userInfo.username || '用户'}
                          className="w-8 h-8 rounded-full object-cover border shrink-0"
                          style={{ borderColor: 'var(--border-color)' }}
                        />
                      ) : (
                        <User size={24} />
                      )}
                      <div className="flex-1 min-w-0 flex items-center">
                        <span
                          className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {userInfo?.display_name || userInfo?.username || '用户'}
                        </span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px mx-0 my-1.5" style={{ background: 'var(--border-light)' }} />

                    {/* Menu items */}
                    {[
                      { to: userInfo ? `/users/${userInfo.id}` : '/', icon: <BookOpen size={16} />, label: '个人主页' },
                      { to: '/plans', icon: <CreditCard size={16} />, label: '我的套餐' },
                      { to: '/transactions', icon: <Receipt size={16} />, label: '交易记录' },
                    ].map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm no-underline transition-colors duration-200 hover:[background:var(--bg-secondary)]"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={() => setUserMenuOpen(false)}
                      >
                        {item.icon}
                        {item.label}
                      </Link>
                    ))}

                    <div className="h-px mx-0 my-1.5" style={{ background: 'var(--border-light)' }} />

                    <a
                      href="#"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm no-underline transition-colors duration-200 hover:[background:var(--bg-secondary)]"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={(e) => { e.preventDefault(); handleLogout(); }}
                    >
                      <LogOut size={16} />
                      退出登录
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="flex items-center justify-center gap-2.5 px-4 py-2.5 w-full border rounded-lg cursor-pointer text-sm font-medium transition-all duration-200 hover:opacity-90"
                style={{
                  background: 'var(--accent-primary)',
                  color: 'var(--text-inverse)',
                  borderColor: 'var(--accent-primary)',
                }}
                onClick={() => setLoginModalOpen(true)}
              >
                <span>登录</span>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Mobile hamburger button */}
      <button
        className="hidden fixed top-4 left-4 z-[200] p-2 border rounded-lg cursor-pointer max-md:flex items-center justify-center"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-sm)',
        }}
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <Menu size={24} />
      </button>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[4px]"
          style={{ animation: 'fade-in 0.2s ease' }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            className="w-[280px] h-full flex flex-col"
            style={{
              background: 'var(--bg-secondary)',
              boxShadow: 'var(--shadow-xl)',
              animation: 'slide-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[60px] px-4 flex items-center justify-between">
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>球球写作</span>
              <button
                className="bg-transparent border-none p-2 cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
              <Link
                to="/"
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[15px] font-medium no-underline transition-all hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Compass size={20} />
                <span>探索</span>
              </Link>
              {isAuthenticated && (
                <>
                  <Link
                    to={userInfo ? `/users/${userInfo.id}` : '/'}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[15px] font-medium no-underline transition-all hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <BookOpen size={20} />
                    <span>小说创作</span>
                  </Link>
                  <Link
                    to="/drama"
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-[15px] font-medium no-underline transition-all hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Clapperboard size={20} />
                    <span>剧本创作</span>
                  </Link>
                </>
              )}
            </nav>

            <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border-light)' }}>
              {isAuthenticated ? (
                <button
                  className="flex items-center justify-center gap-2.5 px-4 py-2.5 w-full border rounded-lg cursor-pointer text-sm font-medium transition-all hover:[background:var(--bg-tertiary)] hover:[border-color:var(--border-hover)]"
                  style={{
                    background: 'var(--bg-primary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                  onClick={handleLogout}
                >
                  <LogOut size={20} />
                  <span>退出登录</span>
                </button>
              ) : (
                <button
                  className="flex items-center justify-center gap-2.5 px-4 py-2.5 w-full border-none rounded-lg cursor-pointer text-sm font-medium transition-all hover:opacity-90"
                  style={{
                    background: 'var(--accent-primary)',
                    color: 'var(--text-inverse)',
                  }}
                  onClick={() => { setLoginModalOpen(true); setMobileMenuOpen(false); }}
                >
                  登录
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main
        className="flex-1 min-w-0 h-screen overflow-y-auto relative max-md:h-auto max-md:min-h-screen max-md:pt-[60px]"
        style={{ background: isSpecialPage ? 'transparent' : 'var(--bg-primary)' }}
      >
        <Outlet context={{ setLoginModalOpen }} />
      </main>

      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />

      <ImportWorkModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}
