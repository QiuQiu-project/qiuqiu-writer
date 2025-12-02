import { BookOpen, Tag, FileText, Users, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import './ScriptSideNav.css';

export type ScriptNavItem = 'work-info' | 'tags' | 'outline' | 'characters';

interface ScriptSideNavProps {
  activeNav: ScriptNavItem;
  onNavChange: (nav: ScriptNavItem) => void;
  selectedEpisode: number | null;
  onEpisodeSelect: (episodeId: number | null) => void;
}

interface Episode {
  id: number;
  title: string;
  wordCount: number;
}

const mockEpisodes: Episode[] = [
  { id: 0, title: '剧本概述', wordCount: 0 },
  { id: 1, title: '第1集', wordCount: 0 },
];

export default function ScriptSideNav({ activeNav, onNavChange, selectedEpisode, onEpisodeSelect }: ScriptSideNavProps) {
  const [episodesExpanded, setEpisodesExpanded] = useState(true);
  const [draftsExpanded, setDraftsExpanded] = useState(false);

  const navItems = [
    { id: 'work-info' as ScriptNavItem, label: '作品信息', icon: BookOpen },
    { id: 'tags' as ScriptNavItem, label: '标签', icon: Tag },
    { id: 'outline' as ScriptNavItem, label: '总纲', icon: FileText },
    { id: 'characters' as ScriptNavItem, label: '角色', icon: Users },
  ];

  return (
    <aside className="script-side-nav">
      <div className="nav-section">
        <nav className="nav-menu">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
                onClick={() => onNavChange(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="nav-section">
        <div className="nav-section-header-with-action">
          <button
            className="nav-section-header"
            onClick={() => setEpisodesExpanded(!episodesExpanded)}
          >
            {episodesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>剧集</span>
          </button>
          <button className="nav-add-btn" title="添加剧集">
            <Plus size={14} />
          </button>
        </div>
        {episodesExpanded && (
          <div className="nav-submenu">
            {mockEpisodes.map((episode) => (
              <button
                key={episode.id}
                className={`nav-episode-item ${selectedEpisode === episode.id ? 'active' : ''}`}
                onClick={() => {
                  onEpisodeSelect(episode.id);
                }}
              >
                <span>{episode.title}</span>
                <span className="episode-word-count">{episode.wordCount}字</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="nav-section">
        <button
          className="nav-section-header"
          onClick={() => setDraftsExpanded(!draftsExpanded)}
        >
          {draftsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>草稿箱</span>
        </button>
        {draftsExpanded && (
          <div className="nav-submenu">
            <button className="nav-subitem">
              <span>草稿 1</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

