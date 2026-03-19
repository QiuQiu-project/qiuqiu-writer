import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Menu, X, Compass, BookOpen, LogOut, Clapperboard, CreditCard, Receipt } from 'lucide-react';
import LoginModal from '../auth/LoginModal';
import MessageModal from '../common/MessageModal';
import type { MessageType } from '../common/MessageModal';
import { authApi, type UserInfo } from '../../utils/authApi';
import { getUserAvatarUrl } from '../../utils/avatarUtils';
import ImportWorkModal from '../ImportWorkModal';
import './MainLayout.css';

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

  // 消息提示状态
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

  // 检查登录状态
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

  // 是否需要展示“请先登录”提示条（由路由 state 触发，但登录后要立刻消失）
  useEffect(() => {
    const nextNeedLogin =
      !isAuthenticated && Boolean((location.state as { needLogin?: boolean } | null)?.needLogin);
    setNeedLoginPrompt(nextNeedLogin);
  }, [isAuthenticated, location.state]);

  // 点击外部关闭菜单
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

  // 处理导入成功
  const handleImportSuccess = (workId: string) => {
    setShowImportModal(false);
    navigate(`/novel/editor?workId=${workId}`);
  };

  const isHomePage = location.pathname === '/';
  const isMyProfilePage = userInfo && location.pathname === `/users/${userInfo.id}`;
  const isUserPage = location.pathname.startsWith('/users/');

  return (
    <div className={`qiuqiu-layout sidebar-layout${isHomePage ? ' is-homepage' : ''}${isUserPage ? ' is-profile-page' : ''}`}>
      {needLoginPrompt && (
        <div className="login-prompt-banner">
          <span>请先登录以继续访问</span>
          <button type="button" className="login-prompt-btn" onClick={() => setLoginModalOpen(true)}>
            登录
          </button>
        </div>
      )}
      
      {/* 侧边栏导航 */}
      {!isHomePage && (
        <aside className={`qiuqiu-sidebar${isMyProfilePage ? ' profile-sidebar' : ''}`}>
          <div className="sidebar-header">
            <Link to="/" className="logo-link">
              <img src="/favicon.png" alt="Logo" className="logo-icon" />
              <span className="logo-text">球球写作</span>
            </Link>
          </div>

          <nav className="sidebar-nav">
            <Link 
              to="/" 
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              <Compass size={20} />
              <span className="nav-text">探索</span>
            </Link>
            {isAuthenticated && (
              <>
                <Link 
                  to={userInfo ? `/users/${userInfo.id}` : '/'}
                  className={`nav-link ${isMyProfilePage ? 'active' : ''}`}
                >
                  <BookOpen size={20} />
                  <span className="nav-text">小说创作</span>
                </Link>
                <Link 
                  to="/script"
                  className={`nav-link ${location.pathname.startsWith('/script') ? 'active' : ''}`}
                >
                  <Clapperboard size={20} />
                  <span className="nav-text">剧本创作</span>
                </Link>
              </>
            )}
          </nav>

          <div className="sidebar-footer">
            {isAuthenticated ? (
              <>
                <div className="user-menu-wrapper" ref={userMenuRef}>
                  <button
                    className="user-avatar-btn"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    title="用户菜单"
                  >
                    {userInfo ? (
                      <img 
                        src={getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name)} 
                        alt={userInfo.display_name || userInfo.username || '用户'}
                        className="user-avatar-btn-img"
                      />
                    ) : (
                      <User size={20} />
                    )}
                    <span className="user-name-small">{userInfo?.display_name || userInfo?.username}</span>
                  </button>
                  {userMenuOpen && (
                    <div className="user-menu-dropdown sidebar-user-dropdown">
                      <div className="user-menu-header">
                        <div className="user-avatar-btn">
                          {userInfo ? (
                            <img 
                              src={getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name)} 
                              alt={userInfo.display_name || userInfo.username || '用户'}
                              className="user-avatar-btn-img"
                            />
                          ) : (
                            <User size={24} />
                          )}
                        </div>
                        <div className="user-details">
                          <div className="user-name">{userInfo?.display_name || userInfo?.username || '用户'}</div>
                        </div>
                      </div>
                      <div className="menu-divider"></div>
                      <Link
                        to={userInfo ? `/users/${userInfo.id}` : '/'}
                        className="menu-item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <BookOpen size={16} />
                        个人主页
                      </Link>
                      <Link
                        to="/plans"
                        className="menu-item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <CreditCard size={16} />
                        <span>我的套餐</span>
                      </Link>
                      <Link
                        to="/transactions"
                        className="menu-item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Receipt size={16} />
                        交易记录
                      </Link>
                      <div className="menu-divider"></div>
                      <a
                        href="#"
                        className="menu-item"
                        onClick={(e) => {
                          e.preventDefault();
                          handleLogout();
                        }}
                      >
                        <LogOut size={16} />
                        退出登录
                      </a>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                className="sidebar-btn primary login-btn"
                onClick={() => setLoginModalOpen(true)}
              >
                <span className="btn-text">登录</span>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* 移动端菜单按钮 (仅在小屏幕显示) */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <Menu size={24} />
      </button>

      {/* 移动端侧边栏 */}
      {mobileMenuOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setMobileMenuOpen(false)}>
          <aside className="mobile-sidebar" onClick={e => e.stopPropagation()}>
             {/* 复用侧边栏内容或简化版 */}
             <div className="sidebar-header">
              <span className="logo-text">球球写作</span>
              <button className="close-btn" onClick={() => setMobileMenuOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="sidebar-nav">
              <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Compass size={20} />
                <span className="nav-text">探索</span>
              </Link>
              {isAuthenticated && (
                <>
                  <Link to={userInfo ? `/users/${userInfo.id}` : '/'} className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                    <BookOpen size={20} />
                    <span className="nav-text">小说创作</span>
                  </Link>
                  <Link to="/script" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                    <Clapperboard size={20} />
                    <span className="nav-text">剧本创作</span>
                  </Link>
                </>
              )}
            </nav>
            <div className="sidebar-footer">
               {isAuthenticated ? (
                 <button className="sidebar-btn" onClick={handleLogout}>
                   <LogOut size={20} />
                   <span className="btn-text">退出登录</span>
                 </button>
               ) : (
                 <button className="sidebar-btn primary" onClick={() => { setLoginModalOpen(true); setMobileMenuOpen(false); }}>
                   登录
                 </button>
               )}
            </div>
          </aside>
        </div>
      )}

      {/* 主内容区域 */}
      <main className="qiuqiu-content">
        <Outlet context={{ setLoginModalOpen }} />
      </main>

      {/* 登录弹窗 */}
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
      {/* 导入作品弹窗 */}
      <ImportWorkModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}
