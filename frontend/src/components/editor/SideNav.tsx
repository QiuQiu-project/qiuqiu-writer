import { BookOpen, Tag, FileText, Users, ChevronDown, ChevronRight, Map, Plus, Building2, Edit2, X } from 'lucide-react';
import { useState } from 'react';
import './SideNav.css';

export type NavItem = 'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions';

interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  isEditing?: boolean;
}

interface Volume {
  id: string;
  title: string;
  chapters: Chapter[];
}

interface SideNavProps {
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
  selectedChapter?: string | null;
  onChapterSelect?: (chapterId: string | null) => void;
}

export default function SideNav({ activeNav, onNavChange, selectedChapter, onChapterSelect }: SideNavProps) {
  const [chaptersExpanded, setChaptersExpanded] = useState(true);
  const [draftsExpanded, setDraftsExpanded] = useState(false);
  const [workInfoExpanded, setWorkInfoExpanded] = useState(true);
  
  // 初始化卷和章节数据
  const [volumes, setVolumes] = useState<Volume[]>([
    {
      id: 'vol1',
      title: '第一卷',
      chapters: [
        { id: 'vol1-chap1', volumeId: 'vol1', title: '第1章' },
        { id: 'vol1-chap2', volumeId: 'vol1', title: '第2章' },
        { id: 'vol1-chap3', volumeId: 'vol1', title: '第3章' },
      ],
    },
    {
      id: 'vol2',
      title: '第二卷',
      chapters: [
        { id: 'vol2-chap1', volumeId: 'vol2', title: '第1章' },
      ],
    },
  ]);

  const [volumesExpanded, setVolumesExpanded] = useState<Record<string, boolean>>({
    vol1: true,
    vol2: false,
  });

  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState('');

  const setVolumeExpanded = (volumeId: string, expanded: boolean) => {
    setVolumesExpanded(prev => ({
      ...prev,
      [volumeId]: expanded,
    }));
  };

  // 添加新卷
  const handleAddVolume = (e: React.MouseEvent) => {
    e.stopPropagation();
    const volumeNumber = volumes.length + 1;
    const volumeId = `vol${volumeNumber}`;
    const newVolume: Volume = {
      id: volumeId,
      title: `第${getVolumeNumber(volumeNumber)}卷`,
      chapters: [],
    };
    setVolumes([...volumes, newVolume]);
    setVolumesExpanded(prev => ({ ...prev, [volumeId]: true }));
  };

  // 添加新章节
  const handleAddChapter = (volumeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const volume = volumes.find(v => v.id === volumeId);
    if (!volume) return;

    const chapterNumber = volume.chapters.length + 1;
    const chapterId = `${volumeId}-chap${chapterNumber}`;
    const newChapter: Chapter = {
      id: chapterId,
      volumeId,
      title: `第${chapterNumber}章`,
      isEditing: true,
    };

    setVolumes(volumes.map(v => 
      v.id === volumeId 
        ? { ...v, chapters: [...v.chapters, newChapter] }
        : v
    ));

    setEditingChapter(chapterId);
    setEditingChapterTitle(newChapter.title);
    setVolumesExpanded(prev => ({ ...prev, [volumeId]: true }));
  };

  // 开始编辑章节名称
  const handleStartEditChapter = (chapter: Chapter, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChapter(chapter.id);
    setEditingChapterTitle(chapter.title);
  };

  // 保存章节名称
  const handleSaveChapterTitle = (chapterId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!editingChapterTitle.trim()) return;

    setVolumes(volumes.map(volume => ({
      ...volume,
      chapters: volume.chapters.map(chap =>
        chap.id === chapterId
          ? { ...chap, title: editingChapterTitle.trim() }
          : chap
      ),
    })));

    setEditingChapter(null);
    setEditingChapterTitle('');
  };

  // 取消编辑
  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingChapter(null);
    setEditingChapterTitle('');
  };

  // 获取卷的中文数字
  const getVolumeNumber = (num: number): string => {
    const numbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (num <= 10) return numbers[num - 1];
    if (num <= 19) return `十${numbers[num - 11]}`;
    return `${numbers[Math.floor(num / 10) - 1]}十${numbers[(num % 10) - 1] || ''}`;
  };

  const navItems = [
    { id: 'tags' as NavItem, label: '设定', icon: Tag },
    { id: 'outline' as NavItem, label: '总纲', icon: FileText },
    { id: 'characters' as NavItem, label: '角色', icon: Users },
    { id: 'factions' as NavItem, label: '势力', icon: Building2 },
    { id: 'map' as NavItem, label: '地图', icon: Map },
  ];

  return (
    <aside className="side-nav">
      <div className="nav-section">
        <div className="nav-section">
          <button
            className="nav-section-header"
            onClick={() => setWorkInfoExpanded(!workInfoExpanded)}
          >
            {workInfoExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <BookOpen size={18} />
            <span>作品信息</span>
          </button>
          {workInfoExpanded && (
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
          )}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header-with-action">
          <button
            className="nav-section-header"
            onClick={() => setChaptersExpanded(!chaptersExpanded)}
          >
            {chaptersExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>章节</span>
          </button>
          <button className="nav-add-btn" title="添加卷" onClick={handleAddVolume}>
            <Plus size={14} />
          </button>
        </div>
        {chaptersExpanded && (
          <div className="nav-submenu">
            {volumes.map((volume) => (
              <div key={volume.id} className="nav-volume">
                <div className="nav-volume-header">
                  <button
                    className="nav-volume-toggle"
                    onClick={() => setVolumeExpanded(volume.id, !volumesExpanded[volume.id])}
                  >
                    {volumesExpanded[volume.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button className="nav-volume-item">
                    <span>{volume.title}</span>
                  </button>
                  <button 
                    className="nav-add-btn small" 
                    title="添加章"
                    onClick={(e) => handleAddChapter(volume.id, e)}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {volumesExpanded[volume.id] && (
                  <div className="nav-chapters">
                    {volume.chapters.map((chapter) => (
                      <div
                        key={chapter.id}
                        className={`nav-chapter-item-wrapper ${selectedChapter === chapter.id ? 'active' : ''}`}
                      >
                        {editingChapter === chapter.id ? (
                          <div className="nav-chapter-edit" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              className="nav-chapter-input"
                              value={editingChapterTitle}
                              onChange={(e) => setEditingChapterTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveChapterTitle(chapter.id);
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                              onBlur={() => handleSaveChapterTitle(chapter.id)}
                              autoFocus
                            />
                            <button
                              className="nav-chapter-save"
                              onClick={(e) => handleSaveChapterTitle(chapter.id, e)}
                              title="保存"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            className={`nav-chapter-item ${selectedChapter === chapter.id ? 'active' : ''}`}
                            onClick={() => onChapterSelect?.(chapter.id)}
                            onDoubleClick={(e) => handleStartEditChapter(chapter, e)}
                          >
                            <span>{chapter.title}</span>
                            <button
                              className="nav-chapter-edit-btn"
                              onClick={(e) => handleStartEditChapter(chapter, e)}
                              title="编辑章节名"
                            >
                              <Edit2 size={10} />
                            </button>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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

