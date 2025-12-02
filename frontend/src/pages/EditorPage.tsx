import { useState } from 'react';
import './EditorPage.css';
import SideNav, { type NavItem } from '../components/editor/SideNav';
import TagsManager from '../components/editor/TagsManager';
import AIAssistant from '../components/editor/AIAssistant';

export default function EditorPage() {
  const [activeNav, setActiveNav] = useState<NavItem>('tags');

  return (
    <div className="editor-page">
      <div className="editor-body">
        <SideNav activeNav={activeNav} onNavChange={setActiveNav} />
        <div className="editor-main">
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'work-info' && (
            <div className="placeholder-content">
              <h2>作品信息</h2>
              <p>作品信息管理功能开发中...</p>
            </div>
          )}
          {activeNav === 'outline' && (
            <div className="placeholder-content">
              <h2>总纲</h2>
              <p>总纲管理功能开发中...</p>
            </div>
          )}
          {activeNav === 'characters' && (
            <div className="placeholder-content">
              <h2>角色</h2>
              <p>角色管理功能开发中...</p>
            </div>
          )}
          {activeNav === 'settings' && (
            <div className="placeholder-content">
              <h2>设定</h2>
              <p>设定管理功能开发中...</p>
            </div>
          )}
        </div>
        <AIAssistant />
      </div>
    </div>
  );
}

