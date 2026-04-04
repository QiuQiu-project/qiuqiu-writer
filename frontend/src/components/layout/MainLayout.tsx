import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Menu, X, Compass, BookOpen, LogOut, CreditCard, Receipt, Search, Bell, Settings2, Sparkles } from 'lucide-react';
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
    navigate(from || '/novel', { replace: true });
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
  const isSpecialPage = isHomePage;
  const isEditorPage = location.pathname.startsWith('/novel/editor') || location.pathname.startsWith('/drama/editor');
  const showWorkspaceShell = !isSpecialPage && !isEditorPage;
  const workspaceSection = new URLSearchParams(location.search).get('section');

  return (
    <div
      className="flex min-h-screen w-full flex-row"
      style={{ background: showWorkspaceShell ? '#fdf7ff' : 'var(--bg-primary)' }}
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
      {!isHomePage && !isEditorPage && (
        <aside
          className="sticky top-0 z-[100] hidden h-screen w-64 shrink-0 flex-col border-r border-[#ede4ff] bg-[#f8f1ff] px-4 py-4 md:flex"
        >
          <div className="flex items-center gap-3 px-2 py-6">
            <Link
              to="/"
              className="flex items-center gap-3 no-underline transition-opacity hover:opacity-80"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#964900] text-white shadow-lg">
                <img src="/favicon.png" alt="Logo" className="h-6 w-6 object-contain" data-no-lightbox />
              </div>
              <div>
                <div className="text-lg font-black text-[#1f045a]">球球写作</div>
                <div className="text-xs font-semibold text-[#1f045a]/60">灵感策展台</div>
              </div>
            </Link>
          </div>

          <nav className="mt-8 flex flex-1 flex-col gap-2 overflow-y-auto">
            {[
              { to: '/novel?section=workbench', icon: <Compass size={20} />, label: '工作台', active: location.pathname.startsWith('/novel') && workspaceSection !== 'templates' },
              ...(isAuthenticated ? [
                {
                  to: '/novel?section=templates',
                  icon: <BookOpen size={20} />,
                  label: '模板库',
                  active: location.pathname.startsWith('/novel') && workspaceSection === 'templates',
                },
              ] : []),
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-[15px] font-semibold no-underline transition-all',
                  item.active
                    ? 'bg-[#ff8000] text-white shadow-md'
                    : 'text-[#1f045a]/70 hover:bg-[#ede4ff] hover:text-[#1f045a]',
                )}
              >
                <span className={item.active ? 'opacity-100' : 'opacity-80'}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto border-t border-[#ede4ff] px-2 py-4">
            {isAuthenticated && (
              <button
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#964900] px-4 py-4 text-sm font-bold text-white shadow-xl transition-all hover:opacity-90"
                onClick={() => navigate('/novel?section=workbench&action=create')}
              >
                <Sparkles size={16} />
                新建作品
              </button>
            )}
          </div>
        </aside>
      )}

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[4px]"
          style={{ animation: 'fade-in 0.2s ease' }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            className="flex h-full w-[300px] max-w-[86vw] flex-col bg-[#f8f1ff] px-4 py-4 shadow-[0px_20px_40px_rgba(31,4,90,0.12)]"
            style={{ animation: 'slide-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#964900] text-white shadow-lg">
                  <img src="/favicon.png" alt="Logo" className="h-6 w-6 object-contain" />
                </div>
                <div>
                  <div className="text-lg font-black text-[#1f045a]">球球写作</div>
                  <div className="text-xs font-semibold text-[#1f045a]/60">灵感策展台</div>
                </div>
              </div>
              <button
                className="rounded-lg p-2 text-[#1f045a]/70 transition-colors hover:bg-[#ede4ff] hover:text-[#1f045a]"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {showWorkspaceShell && (
              <div className="mb-4 px-1">
                <div className="flex items-center gap-2 rounded-full bg-[#f2ebff] px-4 py-2">
                  <Search size={16} className="text-[#1f045a]/45" />
                  <span className="text-sm text-[#1f045a]/45">搜索文档...</span>
                </div>
              </div>
            )}

            <nav className="mt-4 flex flex-1 flex-col gap-2">
              {[
                { to: '/novel?section=workbench', icon: <Compass size={20} />, label: '工作台', active: location.pathname.startsWith('/novel') && workspaceSection !== 'templates' },
                ...(isAuthenticated ? [
                  { to: '/novel?section=templates', icon: <BookOpen size={20} />, label: '模板库', active: location.pathname.startsWith('/novel') && workspaceSection === 'templates' },
                ] : []),
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold no-underline transition-all',
                    item.active ? 'bg-[#ff8000] text-white shadow-md' : 'text-[#1f045a]/70 hover:bg-[#ede4ff] hover:text-[#1f045a]'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="mt-auto border-t border-[#ede4ff] px-2 py-4">
              {isAuthenticated && (
                <button
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#964900] px-4 py-4 text-sm font-bold text-white shadow-xl transition-all hover:opacity-90"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/novel?section=workbench&action=create');
                  }}
                >
                  <Sparkles size={16} />
                  新建作品
                </button>
              )}
              {isAuthenticated ? (
                <button
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#dfc1af] bg-white px-4 py-3 text-sm font-medium text-[#1f045a] transition-all hover:bg-[#ede4ff]"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                >
                  <LogOut size={20} />
                  <span>退出登录</span>
                </button>
              ) : (
                <button
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#964900] px-4 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
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
        className={cn(
          'relative min-w-0 flex-1 overflow-y-auto max-md:h-auto max-md:min-h-screen max-md:pt-[60px]',
          showWorkspaceShell ? 'h-screen bg-[#fdf7ff]' : 'h-screen'
        )}
        style={{ background: isSpecialPage ? 'transparent' : showWorkspaceShell ? '#fdf7ff' : 'var(--bg-primary)' }}
      >
        {showWorkspaceShell && (
          <>
            <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-[#fdf7ff] px-8 max-md:hidden">
              <div className="flex items-center gap-8">
                <div className="flex w-96 items-center gap-2 rounded-full bg-[#f2ebff] px-4 py-1.5">
                  <Search size={16} className="text-[#1f045a]/45" />
                  <input
                    className="w-full border-none bg-transparent text-sm text-[#1f045a] outline-none placeholder:text-[#1f045a]/45"
                    placeholder="搜索文档..."
                  />
                </div>
              </div>
              <nav className="hidden items-center gap-6 lg:flex">
                <button className={cn('font-semibold transition-colors hover:text-[#ff8000]', workspaceSection !== 'templates' ? 'border-b-2 border-[#ff8000] pb-1 text-[#ff8000]' : 'text-[#1f045a]/70')} onClick={() => navigate('/novel?section=workbench')}>工作台</button>
                <button className={cn('font-semibold transition-colors hover:text-[#ff8000]', workspaceSection === 'templates' ? 'border-b-2 border-[#ff8000] pb-1 text-[#ff8000]' : 'text-[#1f045a]/70')} onClick={() => navigate('/novel?section=templates')}>模板库</button>
              </nav>
            <div className="relative flex items-center gap-4" ref={userMenuRef}>
                <button className="text-[#1f045a] transition-colors hover:text-[#ff8000]"><Bell size={18} /></button>
                <button className="text-[#1f045a] transition-colors hover:text-[#ff8000]"><Settings2 size={18} /></button>
              <button
                className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-[#ede4ff] bg-white"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                title="用户菜单"
              >
                <img
                  src={userInfo ? getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name) : '/favicon.png'}
                  alt="profile"
                  className="h-full w-full object-cover"
                  data-no-lightbox
                />
              </button>
              {userMenuOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+12px)] z-[1000] w-[260px] rounded-xl border py-2"
                  style={{
                    background: '#ffffff',
                    borderColor: '#ede4ff',
                    boxShadow: '0 20px 40px rgba(31,4,90,0.08)',
                    animation: 'fade-in 0.2s ease',
                  }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    {userInfo ? (
                      <img
                        src={getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name)}
                        alt={userInfo.display_name || userInfo.username || '用户'}
                        className="w-8 h-8 rounded-full object-cover border border-[#dfc1af] shrink-0"
                        data-no-lightbox
                      />
                    ) : (
                      <User size={24} />
                    )}
                    <div className="flex-1 min-w-0 flex items-center">
                      <span className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: '#1f045a' }}>
                        {userInfo?.display_name || userInfo?.username || '用户'}
                      </span>
                    </div>
                  </div>
                  <div className="h-px mx-0 my-1.5 bg-[#ede4ff]" />
                  {[
                    { to: '/plans', icon: <CreditCard size={16} />, label: '我的套餐' },
                    { to: '/transactions', icon: <Receipt size={16} />, label: '交易记录' },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm no-underline transition-colors duration-200 hover:bg-[#f8f1ff]"
                      style={{ color: '#1f045a' }}
                      onClick={() => setUserMenuOpen(false)}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                  <div className="h-px mx-0 my-1.5 bg-[#ede4ff]" />
                  <a
                    href="#"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm no-underline transition-colors duration-200 hover:bg-[#f8f1ff]"
                    style={{ color: '#1f045a' }}
                    onClick={(e) => { e.preventDefault(); handleLogout(); }}
                  >
                    <LogOut size={16} />
                    退出登录
                  </a>
                </div>
              )}
              </div>
            </header>

            <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-[#ede4ff] bg-[#fdf7ff]/95 px-4 py-3 backdrop-blur max-md:flex">
              <button
                className="inline-flex size-10 items-center justify-center rounded-xl border border-[#ede4ff] bg-white text-[#1f045a] shadow-[0px_10px_24px_rgba(31,4,90,0.08)]"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu size={22} />
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-3">
                <img src="/favicon.png" alt="球球" className="size-6 object-contain" />
                <span className="truncate text-base font-bold text-[#1f045a]">{workspaceSection === 'templates' ? '模板库' : '工作台'}</span>
              </div>
              <button
                className="flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-[#ede4ff] bg-white"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <img
                  src={userInfo ? getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name) : '/favicon.png'}
                  alt="profile"
                  className="h-full w-full object-cover"
                  data-no-lightbox
                />
              </button>
            </header>
          </>
        )}

        <div className={cn(showWorkspaceShell && 'min-h-[calc(100vh-64px)]')}>
          <Outlet context={{ setLoginModalOpen }} />
        </div>
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
