import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, Coins, ChevronDown } from 'lucide-react';
import SideNav from '../components/editor/SideNav';
import AIAssistant from '../components/editor/AIAssistant';
import TagsManager from '../components/editor/TagsManager';
import ChapterOutline from '../components/editor/ChapterOutline';
import MapView from '../components/editor/MapView';
import Characters from '../components/editor/Characters';
import Factions from '../components/editor/Factions';
import NovelEditor from '../components/editor/NovelEditor';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import './NovelEditorPage.css';

export default function NovelEditorPage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState<'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions'>('work-info');
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [smartCompletion, setSmartCompletion] = useState(false);
  const [font, setFont] = useState('默认');

  return (
    <div className="novel-editor-page">
      {/* 顶部工具栏 */}
      <header className="novel-editor-header">
        <div className="header-left">
          <button className="exit-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>退出</span>
          </button>
          <div className="work-info">
            <h1 className="work-title">回响之声</h1>
            <div className="work-tags">
              <span className="tag">长篇</span>
              <span className="tag">第三人称</span>
              <span className="tag">男频</span>
              <span className="status-tag">已保存到云端</span>
            </div>
          </div>
        </div>
        <div className="header-center">
          <div className="word-count">
            <span>本章字数: 0</span>
            <span>总字数: 447</span>
            <Info size={14} />
          </div>
        </div>
        <div className="header-right">
          <div className="header-actions">
            <button className="action-btn">
              <span>皮肤:</span>
              <ChevronDown size={14} />
            </button>
            <button className="action-btn">替换</button>
            <button className="action-btn">回收站</button>
            <button className="action-btn">分享</button>
          </div>
          <div className="coin-section">
            <div className="coin-display">
              <Coins size={16} />
              <span>494+</span>
            </div>
            <button className="member-btn">开会员得蛙币</button>
          </div>
        </div>
      </header>

      <div className="novel-editor-body">
        {/* 左侧边栏 */}
        <SideNav
          activeNav={activeNav}
          onNavChange={setActiveNav}
          selectedChapter={selectedChapter}
          onChapterSelect={(chapterId) => {
            setSelectedChapter(chapterId);
            // 选择章节时，清除 activeNav，让编辑器显示
            setActiveNav('work-info');
          }}
        />

        {/* 主编辑区 */}
        <div className="novel-editor-main">
          {/* 根据导航项显示不同内容 */}
          {activeNav === 'work-info' && selectedChapter === null && <WorkInfoManager />}
          {activeNav === 'tags' && <TagsManager />}
          {activeNav === 'outline' && <ChapterOutline />}
          {activeNav === 'map' && <MapView />}
          {activeNav === 'characters' && <Characters />}
          {activeNav === 'factions' && <Factions />}
          {activeNav === 'settings' && (
            <div className="placeholder-content">
              <h2>设置</h2>
              <p>功能开发中...</p>
            </div>
          )}
          {/* 文本编辑器（当选择了章节时显示） */}
          {selectedChapter !== null && !['tags', 'outline', 'map', 'characters', 'settings', 'factions'].includes(activeNav) && (
            <NovelEditor
              smartCompletion={smartCompletion}
              onSmartCompletionChange={setSmartCompletion}
              font={font}
              onFontChange={setFont}
            />
          )}
        </div>

        {/* 右侧边栏 */}
        <AIAssistant />
      </div>
    </div>
  );
}

