import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Plus, Menu, X } from 'lucide-react';
import LoginModal from '../auth/LoginModal';
import MessageModal from '../common/MessageModal';
import type { MessageType } from '../common/MessageModal';
import { authApi, type UserInfo } from '../../utils/authApi';
import { worksApi } from '../../utils/worksApi';
import { getUserAvatarUrl } from '../../utils/avatarUtils';
import './MainLayout.css';

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

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

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({
      isOpen: true,
      type,
      message,
      title,
      onConfirm,
    });
  };

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

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    if (userMenuOpen || mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen, mobileMenuOpen]);

  const handleLoginSuccess = (user: UserInfo) => {
    setUserInfo(user);
    setIsAuthenticated(true);
    setLoginModalOpen(false);
    const from = (location.state as { from?: string })?.from;
    navigate(from || `/users/${user.id}`, { replace: true });
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('登出失败:', error);
    } finally {
      setUserInfo(null);
      setIsAuthenticated(false);
      setUserMenuOpen(false);
      navigate('/');
    }
  };

  // 处理创建作品
  const handleCreateWork = async () => {
    try {
      console.log('📝 [MainLayout.handleCreateWork] 开始创建作品...');
      
      const workData = {
        title: '未命名作品',
        work_type: 'long' as const,
        is_public: false,
      };
      
      console.log('📝 [MainLayout.handleCreateWork] 准备发送请求，数据:', workData);
      
      const newWork = await worksApi.createWork(workData);
      
      console.log('✅ [MainLayout.handleCreateWork] 作品创建成功:', newWork);
      
      if (!newWork || !newWork.id) {
        throw new Error('创建作品成功，但未返回作品ID');
      }
      
      // 跳转到编辑器
      navigate(`/novel/editor?workId=${newWork.id}`);
    } catch (err) {
      console.error('❌ [MainLayout.handleCreateWork] 创建作品失败:', err);
      const errorMessage = err instanceof Error ? err.message : '创建作品失败';
      showMessage(`创建作品失败: ${errorMessage}`, 'error');
    }
  };

  const isHomePage = location.pathname === '/';
  const isMyProfilePage = userInfo && location.pathname === `/users/${userInfo.id}`;
  const isUserWorksPage = location.pathname.startsWith('/users/');
  const needLoginPrompt = !isAuthenticated && (location.state as { needLogin?: boolean })?.needLogin;

  return (
    <div className="github-layout">
      {needLoginPrompt && (
        <div className="login-prompt-banner">
          <span>请先登录以继续访问</span>
          <button type="button" className="login-prompt-btn" onClick={() => setLoginModalOpen(true)}>
            登录
          </button>
        </div>
      )}
      {/* GitHub风格的顶部导航栏 */}
      <header className="github-header">
        <div className="header-container">
          <div className="header-left">
            <Link to="/" className="logo-link">
              <span className="logo-icon">🌍</span>
              <span className="logo-text">球球写作</span>
            </Link>
            
            {!isHomePage && (
              <nav className="header-nav">
                <Link 
                  to="/" 
                  className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
                >
                  探索
                </Link>
                {isAuthenticated && (
                  <Link 
                    to={userInfo ? `/users/${userInfo.id}` : '/'}
                    className={`nav-link ${isMyProfilePage ? 'active' : ''}`}
                  >
                    个人主页
                  </Link>
                )}
              </nav>
            )}
          </div>

          <div className="header-right">
            {isAuthenticated ? (
              <>
                {!isUserWorksPage && (
                  <button
                    className="header-btn icon-only"
                    onClick={handleCreateWork}
                    title="创建新作品"
                  >
                    <Plus size={18} />
                  </button>
                )}
                <div className="user-menu-wrapper" ref={userMenuRef}>
                  <button
                    className="user-avatar-btn"
                    onClick={() => {
                      // 移动端：控制移动端菜单
                      if (window.innerWidth <= 768) {
                        setMobileMenuOpen(!mobileMenuOpen);
                        setUserMenuOpen(false);
                      } else {
                        // 桌面端：控制用户菜单
                        setUserMenuOpen(!userMenuOpen);
                        setMobileMenuOpen(false);
                      }
                    }}
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
                  </button>
                  {userMenuOpen && (
                    <div className="user-menu-dropdown">
                      <div className="user-menu-header">
                        <div className="user-avatar-large">
                          {userInfo ? (
                            <img 
                              src={getUserAvatarUrl(userInfo.avatar_url, userInfo.username, userInfo.display_name)} 
                              alt={userInfo.display_name || userInfo.username || '用户'}
                              className="user-avatar-img"
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
                        个人主页
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
                        退出登录
                      </a>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  className="header-btn primary"
                  onClick={() => setLoginModalOpen(true)}
                >
                  登录
                </button>
                {/* 未登录时显示移动端菜单按钮 */}
                <button
                  className="mobile-menu-btn"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="菜单"
                >
                  {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 移动端菜单 */}
        {mobileMenuOpen && (
          <div className="mobile-menu" ref={mobileMenuRef}>
            <Link
              to="/"
              className="mobile-menu-item"
              onClick={() => setMobileMenuOpen(false)}
            >
              探索
            </Link>
            {isAuthenticated && (
              <>
            <Link
              to={userInfo ? `/users/${userInfo.id}` : '/'}
              className="mobile-menu-item"
              onClick={() => setMobileMenuOpen(false)}
            >
              个人主页
            </Link>
            <div className="menu-divider"></div>
                <div className="mobile-menu-user">
                  <div className="user-name">{userInfo?.display_name || userInfo?.username || '用户'}</div>
                </div>
                <a
                  href="#"
                  className="mobile-menu-item"
                  onClick={(e) => {
                    e.preventDefault();
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                >
                  退出登录
                </a>
              </>
            )}
            {!isAuthenticated && (
              <button
                className="mobile-menu-item primary"
                onClick={() => {
                  setLoginModalOpen(true);
                  setMobileMenuOpen(false);
                }}
              >
                登录
              </button>
            )}
          </div>
        )}
      </header>

      {/* 主内容区域 */}
      <main className="github-content">
        <Outlet />
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
    </div>
  );
}
