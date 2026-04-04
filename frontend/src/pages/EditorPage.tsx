import { useState, useEffect } from 'react';
import { Menu, X, MessageSquare } from 'lucide-react';
import SideNav, { type NavItem } from '../components/editor/SideNav';
import TagsManager from '../components/editor/TagsManager';
import AIAssistant from '../components/editor/AIAssistant';

export default function EditorPage() {
  const [activeNav, setActiveNav] = useState<NavItem>('tags');
  const [isMobile, setIsMobile] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowNav(false);
        setMobileChatOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      className="w-full min-h-[calc(100vh-64px)] flex flex-col [animation:fade-in_0.4s_ease-out]"
      style={{ background: 'var(--bg-secondary)' }}
    >
      {isMobile && (
        <div
          className="flex items-center justify-between px-4 py-3 border-b sticky top-0 z-10"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        >
          <button
            className="bg-transparent border-none p-1 cursor-pointer rounded-[4px] hover:[background:var(--bg-secondary)]"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => setShowNav(!showNav)}
          >
            {showNav ? <X size={24} /> : <Menu size={24} />}
          </button>
          <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            作品管理
          </span>
          <button
            className="bg-transparent border-none p-1 cursor-pointer rounded-[4px] hover:[background:var(--bg-secondary)]"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => setMobileChatOpen(!mobileChatOpen)}
          >
            {mobileChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
          </button>
        </div>
      )}

      <div className="flex-1 flex relative min-h-[calc(100vh-64px)] max-md:flex-col max-md:min-h-0">
        {/* Mobile Sidebar Overlay */}
        {isMobile && showNav && (
          <div
            className="fixed inset-0 bg-black/50 z-[999] [animation:fade-in_0.2s_ease-out] backdrop-blur-[2px]"
            onClick={() => setShowNav(false)}
          />
        )}

        <div
          className={`shrink-0 flex flex-col border-r w-[260px] max-md:fixed max-md:top-0 max-md:h-dvh max-md:w-[280px] max-md:z-[1000] max-md:transition-[left] max-md:duration-300 max-md:ease-[cubic-bezier(0.4,0,0.2,1)] max-md:shadow-[2px_0_8px_rgba(0,0,0,0.1)] max-md:border-r-0 ${showNav ? 'max-md:left-0' : 'max-md:-left-[280px]'}`}
          style={{ borderColor: 'var(--border-color)', background: 'var(--bg-primary)' }}
        >
          <SideNav activeNav={activeNav} onNavChange={(nav) => {
            setActiveNav(nav);
            if (isMobile) setShowNav(false);
          }} />
        </div>

        <div
          className="flex-1 overflow-y-auto p-8 max-md:p-4 max-md:w-full max-md:overflow-x-hidden"
          style={{ background: 'var(--bg-primary)' }}
        >
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'work-info' && (
            <div
              className="flex flex-col items-center justify-center min-h-[400px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <h2 className="text-2xl mb-4" style={{ color: 'var(--text-primary)' }}>作品信息</h2>
              <p>作品信息管理功能开发中...</p>
            </div>
          )}
          {activeNav === 'outline' && (
            <div
              className="flex flex-col items-center justify-center min-h-[400px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <h2 className="text-2xl mb-4" style={{ color: 'var(--text-primary)' }}>总纲</h2>
              <p>总纲管理功能开发中...</p>
            </div>
          )}
          {activeNav === 'characters' && (
            <div
              className="flex flex-col items-center justify-center min-h-[400px]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <h2 className="text-2xl mb-4" style={{ color: 'var(--text-primary)' }}>角色</h2>
              <p>角色管理功能开发中...</p>
            </div>
          )}
        </div>

        {/* Desktop AI Assistant or Mobile Chat Drawer */}
        {(!isMobile || mobileChatOpen) && (
          <div
            className={`shrink-0 flex flex-col border-l ${isMobile ? 'fixed top-0 right-0 bottom-0 w-full max-w-[350px] h-dvh z-[1002] shadow-[-2px_0_8px_rgba(0,0,0,0.1)] border-l-0 [animation:slide-in-right_0.3s_ease]' : 'w-[350px]'}`}
            style={{ borderColor: 'var(--border-color)', background: 'var(--bg-primary)' }}
          >
            {isMobile && (
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--border-color)', background: 'var(--bg-primary)' }}
              >
                <h3 className="m-0 text-base font-semibold">AI 助手</h3>
                <button
                  className="bg-transparent border-none p-1 cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => setMobileChatOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
            )}
            <AIAssistant />
          </div>
        )}

        {/* Mobile Chat Overlay */}
        {isMobile && mobileChatOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-[1001] [animation:fade-in_0.2s_ease-out] backdrop-blur-[2px]"
            onClick={() => setMobileChatOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
