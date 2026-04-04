import { BookOpen, Tag, FileText, Users, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export type ScriptNavItem = 'work-info' | 'tags' | 'outline' | 'characters';

export interface ScriptEpisode {
  id: number;
  title: string;
  word_count: number;
}

interface ScriptSideNavProps {
  activeNav: ScriptNavItem;
  onNavChange: (nav: ScriptNavItem) => void;
  selectedEpisode: number | null;
  onEpisodeSelect: (episodeId: number | null) => void;
  /** 外部传入的剧集列表（来自API）。未提供时使用内置示例数据。 */
  episodes?: ScriptEpisode[];
  /** 点击"新增剧集"按钮时的回调 */
  onAddEpisode?: () => void;
}

const defaultEpisodes: ScriptEpisode[] = [
  { id: 0, title: '剧本概述', word_count: 0 },
  { id: 1, title: '第1集', word_count: 0 },
];

const sectionHeaderClass = 'flex items-center gap-2 w-full py-2.5 px-4 border-none bg-transparent text-sm font-semibold text-left cursor-pointer transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]';
const iconBtnClass = 'w-6 h-6 p-0 border-none bg-transparent cursor-pointer flex items-center justify-center rounded-[4px] transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--accent-primary)]';

export default function ScriptSideNav({ activeNav, onNavChange, selectedEpisode, onEpisodeSelect, episodes, onAddEpisode }: ScriptSideNavProps) {
  const [episodesExpanded, setEpisodesExpanded] = useState(true);
  const [draftsExpanded, setDraftsExpanded] = useState(false);
  const episodeList = episodes ?? defaultEpisodes;

  const navItems = [
    { id: 'work-info' as ScriptNavItem, label: '作品信息', icon: BookOpen },
    { id: 'tags' as ScriptNavItem, label: '标签', icon: Tag },
    { id: 'outline' as ScriptNavItem, label: '总纲', icon: FileText },
    { id: 'characters' as ScriptNavItem, label: '角色', icon: Users },
  ];

  return (
    <aside className="w-[200px] flex flex-col py-4 overflow-y-auto border-r shrink-0" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}>
      {/* Main nav items */}
      <div className="mb-6">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                className={cn(
                  'relative flex items-center gap-3 py-2.5 px-4 border-none text-sm text-left cursor-pointer transition-all',
                  isActive
                    ? 'font-semibold'
                    : 'bg-transparent hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]'
                )}
                style={isActive ? { background: 'var(--accent-light)', color: 'var(--accent-primary)' } : { color: 'var(--text-secondary)' }}
                onClick={() => onNavChange(item.id)}
              >
                {/* Left accent bar (replaces ::before pseudo-element) */}
                <span
                  className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-[0_3px_3px_0] transition-all', isActive ? 'h-[60%]' : 'h-0')}
                  style={{ background: 'var(--accent-gradient)' }}
                />
                <Icon size={18} className="shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Episodes section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 w-full py-2.5 px-4">
          <button
            className="flex-1 flex items-center gap-2 border-none bg-transparent text-sm font-semibold text-left cursor-pointer transition-all p-0 hover:[color:var(--text-primary)]"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => setEpisodesExpanded(!episodesExpanded)}
          >
            {episodesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>剧集</span>
          </button>
          <button
            className={iconBtnClass}
            style={{ color: 'var(--text-tertiary)' }}
            title="添加剧集"
            onClick={onAddEpisode}
          >
            <Plus size={14} />
          </button>
        </div>
        {episodesExpanded && (
          <div className="flex flex-col gap-0.5 pl-4">
            {episodeList.map((episode) => {
              const isActive = selectedEpisode === episode.id;
              return (
                <button
                  key={episode.id}
                  className={cn(
                    'flex items-center justify-between py-2 px-4 border-none text-[13px] text-left cursor-pointer rounded-[var(--radius-sm)] transition-all',
                    isActive
                      ? 'font-semibold'
                      : 'bg-transparent hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]'
                  )}
                  style={isActive ? { background: 'var(--accent-light)', color: 'var(--accent-primary)' } : { color: 'var(--text-secondary)' }}
                  onClick={() => onEpisodeSelect(episode.id)}
                >
                  <span>{episode.title}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{episode.word_count}字</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Drafts section */}
      <div className="mb-6">
        <button
          className={sectionHeaderClass}
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => setDraftsExpanded(!draftsExpanded)}
        >
          {draftsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>草稿箱</span>
        </button>
        {draftsExpanded && (
          <div className="flex flex-col gap-0.5 pl-4">
            <button
              className="py-2 px-4 pl-8 border-none bg-transparent text-[13px] text-left cursor-pointer rounded-[var(--radius-sm)] transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>草稿 1</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
