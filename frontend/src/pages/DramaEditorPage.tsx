/**
 * DramaEditorPage — 剧本编辑器
 * 布局：左侧集数/角色导航 + 中间编辑区 + 右侧 AI 对话面板
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Film, Users, Layers, BookOpen, MapPin,
  Plus, Trash2, Save, Sparkles, Edit2, X, Wifi, WifiOff,
  Download, Video, ChevronLeft, ChevronRight as ChevronRightIcon,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Settings
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { worksApi, type Work } from '../utils/worksApi';
import { authApi } from '../utils/authApi';
import { chaptersApi } from '../utils/chaptersApi';
import { useYjsEditor } from '../hooks/useYjsEditor';
import { dramaChatStream, dramaGenerateImage, dramaExtractScenes, dramaExtractCharacters, getDramaExtractOptions, type DramaExtractModelOption, type DramaSceneGenerationStyleOption } from '../utils/dramaApi';
import CollabAIPanel from '../components/editor/CollabAIPanel';
import MessageModal from '../components/common/MessageModal';
import { useModalState } from '../hooks/useModalState';
import ImportFromNovelModal from '../components/drama/ImportFromNovelModal';
import ImportEpisodeFromChapterModal from '../components/drama/ImportEpisodeFromChapterModal';
import ShareWorkModal from '../components/ShareWorkModal';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import DramaScriptEditor from '../components/editor/DramaScriptEditor';
import type { WorkData } from '../components/editor/work-info/types';
import type { DramaCharacter, DramaEpisode, DramaMeta, DramaScene, LocalDramaTask } from '../components/drama/dramaTypes';
import './DramaEditorPage.css';

type LeftTab = 'work-info' | 'episodes' | 'characters' | 'scenes';

const FALLBACK_SCENE_STYLES: DramaSceneGenerationStyleOption[] = [
  { id: 'balanced', label: '平衡', description: '镜头感与信息量均衡，适合通用场景提取。' },
  { id: 'cinematic', label: '电影感', description: '强调光影、构图、镜头语言和画面张力。' },
  { id: 'concise', label: '简洁', description: '保留关键视觉要素，描述简短直接。' },
  { id: 'detailed', label: '细节丰富', description: '强化空间层次、材质、动作细节与氛围元素。' },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

/** 将 AI 输出的结构标记文本转为 TipTap HTML（剧本格式） */
function screenplayTextToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const html = lines.map(line => {
    if (line.startsWith('【场】')) return `<h1>${esc(line.slice(3))}</h1>`;
    if (line.startsWith('【名】')) return `<h2>${esc(line.slice(3))}</h2>`;
    if (line.startsWith('【提】')) return `<h3>${esc(line.slice(3))}</h3>`;
    if (line.startsWith('【白】')) return `<blockquote><p>${esc(line.slice(3))}</p></blockquote>`;
    if (line.startsWith('【动】')) return `<p>${esc(line.slice(3))}</p>`;
    // 兼容 AI 偶尔遗漏标记时的普通文本
    return `<p>${esc(line)}</p>`;
  }).join('');
  return html || '<p></p>';
}

const DRAMA_EXTRA_COMMANDS = [
  {
    id: 'drama-gen-script',
    name: '/drama-gen-script',
    subtitle: '根据当前集简介和角色列表生成剧本，实时写入编辑器',
  },
  {
    id: 'drama-extract-characters',
    name: '/drama-extract-characters',
    subtitle: '从所有集的剧本/简介中提取角色信息',
  },
  {
    id: 'drama-extract-scenes',
    name: '/drama-extract-scenes',
    subtitle: '从当前集剧本提取场景（可加风格参数：balanced/cinematic/concise/detailed）',
  },
] as const;

function parseMeta(work: Work): DramaMeta {
  const m = work.metadata || {};
  const episodes = (m.episodes as unknown as DramaEpisode[]) || [];

  // 将旧的按集存储场景迁移到全局场景库
  let globalScenes: DramaScene[] = (m.scenes as unknown as DramaScene[]) || [];
  if (globalScenes.length === 0) {
    for (const ep of episodes) {
      for (const scene of (ep.scenes || [])) {
        globalScenes.push({ ...scene, episodeId: ep.id });
      }
    }
  }

  return {
    genre: (m.genre as string) || '',
    style: (m.style as string) || '',
    totalEpisodes: (m.totalEpisodes as number) || 1,
    outline: (m.outline as string) || '',
    characters: (m.characters as unknown as DramaCharacter[]) || [],
    episodes,
    scenes: globalScenes,
    sourceNovelId: m.sourceNovelId as string | undefined,
    sourceNovelTitle: m.sourceNovelTitle as string | undefined,
  };
}

// ─── 左侧导航 ────────────────────────────────────────────────
function DramaSideNav({
  meta,
  activeEpisodeId,
  onSelectEpisode,
  activeTab,
  onTabChange,
  onAddEpisode,
  onAddEpisodeFromNovel,
  onDeleteEpisode,
  onGenerateCharacterImage,
  generatingCharacterImage,
  onSelectCharacter,
  scenes,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  onGenerateSceneImage,
  generatingSceneImage,
  imageSizes,
  selectedImageSize,
  onImageSizeChange,
}: {
  meta: DramaMeta;
  activeEpisodeId: string | null;
  onSelectEpisode: (id: string) => void;
  activeTab: LeftTab;
  onTabChange: (t: LeftTab) => void;
  onAddEpisode: () => void;
  onAddEpisodeFromNovel?: () => void;
  onDeleteEpisode: (id: string) => void;
  onGenerateCharacterImage?: (id: string) => void;
  generatingCharacterImage?: string | null;
  onSelectCharacter?: (c: DramaCharacter) => void;
  scenes?: DramaScene[];
  onAddScene?: () => void;
  onUpdateScene?: (id: string, patch: Partial<DramaScene>) => void;
  onDeleteScene?: (id: string) => void;
  onGenerateSceneImage?: (sceneId: string) => void;
  generatingSceneImage?: string | null;
  imageSizes?: string[];
  selectedImageSize?: string;
  onImageSizeChange?: (sz: string) => void;
}) {
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  const sceneList = scenes || [];

  return (
    <div className="drama-sidenav">
      {/* Tab 切换 */}
      <div className="drama-sidenav-tabs">
        <button
          className={`drama-sidenav-tab ${activeTab === 'work-info' ? 'active' : ''}`}
          onClick={() => onTabChange('work-info')}
          title="作品信息"
        >
          <BookOpen size={16} />
          <span>作品</span>
        </button>
        <button
          className={`drama-sidenav-tab ${activeTab === 'episodes' ? 'active' : ''}`}
          onClick={() => onTabChange('episodes')}
          title="集数"
        >
          <Layers size={16} />
          <span>集数</span>
        </button>
        <button
          className={`drama-sidenav-tab ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => onTabChange('characters')}
          title="角色"
        >
          <Users size={16} />
          <span>角色</span>
        </button>
        <button
          className={`drama-sidenav-tab ${activeTab === 'scenes' ? 'active' : ''}`}
          onClick={() => onTabChange('scenes')}
          title="场景库"
        >
          <MapPin size={16} />
          <span>场景</span>
        </button>
      </div>

      {/* 作品信息占位（内容在主区域） */}
      {activeTab === 'work-info' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-empty">
            <BookOpen size={24} />
            <p>作品信息在右侧展示</p>
          </div>
        </div>
      )}

      {/* 集数列表 */}
      {activeTab === 'episodes' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-header">
            <span className="drama-sidenav-count">{meta.episodes.length} 集</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {onAddEpisodeFromNovel && (
                <button className="drama-sidenav-add" onClick={onAddEpisodeFromNovel} title="从小说导入新集">
                  <BookOpen size={14} />
                </button>
              )}
              <button className="drama-sidenav-add" onClick={onAddEpisode} title="添加集数">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="drama-ep-nav-list">
            {meta.episodes.length === 0 ? (
              <div className="drama-sidenav-empty">
                <p>还没有集数</p>
                <button className="drama-sidenav-add-btn" onClick={onAddEpisode}>
                  <Plus size={13} /> 添加第一集
                </button>
                {onAddEpisodeFromNovel && (
                  <button className="drama-sidenav-add-btn" onClick={onAddEpisodeFromNovel}
                    style={{ marginTop: '6px' }}>
                    <BookOpen size={13} /> 从小说导入
                  </button>
                )}
              </div>
            ) : (
              meta.episodes.map(ep => (
                <div
                  key={ep.id}
                  className={`drama-ep-nav-item ${activeEpisodeId === ep.id ? 'active' : ''}`}
                  onClick={() => onSelectEpisode(ep.id)}
                >
                  <div className="drama-ep-nav-num">{ep.number}</div>
                  <div className="drama-ep-nav-info">
                    <span className="drama-ep-nav-title">{ep.title}</span>
                    {ep.synopsis && (
                      <span className="drama-ep-nav-synopsis">{ep.synopsis}</span>
                    )}
                  </div>
                  {ep.videoUrl && (
                    <div className="drama-ep-nav-video-dot" title="已生成视频" />
                  )}
                  <button
                    className="drama-ep-nav-delete"
                    title="删除本集"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteEpisode(ep.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 角色列表 */}
      {activeTab === 'characters' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-header">
            <span className="drama-sidenav-count">{meta.characters.length} 个角色</span>
          </div>
          <div className="drama-char-nav-list">
            {meta.characters.length === 0 ? (
              <div className="drama-sidenav-empty">
                <p>还没有角色</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>在聊天面板输入 /drama-extract-characters 提取</p>
              </div>
            ) : (
              meta.characters.map(c => (
                <div
                  key={c.id}
                  className="drama-char-nav-item"
                  onClick={() => onSelectCharacter?.(c)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="drama-char-nav-avatar-wrapper">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} className="drama-char-nav-avatar img" />
                    ) : (
                      <div className="drama-char-nav-avatar">{c.name.slice(0, 1)}</div>
                    )}
                    {onGenerateCharacterImage && (
                      <button
                        className="drama-char-nav-avatar-btn"
                        onClick={(e) => { e.stopPropagation(); onGenerateCharacterImage(c.id); }}
                        disabled={generatingCharacterImage === c.id}
                        title="生成角色照片"
                      >
                        <Sparkles size={12} />
                      </button>
                    )}
                  </div>
                  <div className="drama-char-nav-info">
                    <span className="drama-char-nav-name">{c.name}</span>
                    <span className="drama-char-nav-role">{c.role}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 场景库 */}
      {activeTab === 'scenes' && (
        <div className="drama-sidenav-content">
          <div className="drama-sidenav-header">
            <span className="drama-sidenav-count">{sceneList.length} 个场景</span>
            {onAddScene && (
              <button className="drama-sidenav-add" onClick={onAddScene} title="添加场景">
                <Plus size={14} />
              </button>
            )}
          </div>
          {sceneList.length === 0 ? (
            <div className="drama-sidenav-empty">
              <MapPin size={24} />
              <p>还没有场景</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>在聊天面板输入 /drama-extract-scenes 提取</p>
            </div>
          ) : (
            <div className="drama-scene-sidebar-list">
              {sceneList.map((scene, idx) => {
                const epTitle = meta.episodes.find(e => e.id === scene.episodeId)?.title;
                const isExpanded = expandedSceneId === scene.id;
                return (
                  <div key={scene.id} className={`drama-scene-sidebar-item ${isExpanded ? 'expanded' : ''}`}>
                    <div
                      className="drama-scene-sidebar-body"
                      onClick={() => setExpandedSceneId(isExpanded ? null : scene.id)}
                    >
                      <div className="drama-scene-sidebar-num">{idx + 1}</div>
                      <div className="drama-scene-sidebar-info">
                        <div className="drama-scene-sidebar-loc">
                          {scene.location}
                          <span className="drama-scene-sidebar-time">· {scene.time}</span>
                        </div>
                        {epTitle && <span className="drama-scene-sidebar-ep">来自 {epTitle}</span>}
                        {scene.description && (
                          <p className="drama-scene-sidebar-desc">{scene.description}</p>
                        )}
                      </div>
                      <div className="drama-scene-sidebar-actions" onClick={e => e.stopPropagation()}>
                        {onGenerateSceneImage && (
                          <button
                            className="drama-icon-btn"
                            title="生成场景图"
                            onClick={() => onGenerateSceneImage(scene.id)}
                            disabled={generatingSceneImage === scene.id}
                          >
                            {generatingSceneImage === scene.id
                              ? <span className="drama-spinner" style={{ width: 12, height: 12 }} />
                              : <Sparkles size={12} />}
                          </button>
                        )}
                        {onDeleteScene && (
                          <button
                            className="drama-icon-btn danger"
                            title="删除场景"
                            onClick={() => onDeleteScene(scene.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    {isExpanded && onUpdateScene && (
                      <div className="drama-scene-sidebar-edit">
                        <div className="drama-scene-row">
                          <input
                            className="drama-input sm"
                            placeholder="地点"
                            value={scene.location}
                            onChange={e => onUpdateScene(scene.id, { location: e.target.value })}
                          />
                          <select
                            className="drama-select sm"
                            value={scene.time}
                            onChange={e => onUpdateScene(scene.id, { time: e.target.value })}
                          >
                            {['白天', '夜晚', '清晨', '黄昏', '室内', '室外'].map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <textarea
                          className="drama-textarea sm"
                          placeholder="场景描述..."
                          value={scene.description}
                          onChange={e => onUpdateScene(scene.id, { description: e.target.value })}
                          rows={2}
                        />
                        {scene.imageUrl && (
                          <img src={scene.imageUrl} alt="场景图" className="drama-scene-sidebar-img" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── 集数设置模态框 ─────────────────────────────────────────
function EpisodeSettingsModal({
  episode,
  onChange,
  onClose,
}: {
  episode: DramaEpisode;
  onChange: (patch: Partial<DramaEpisode>) => void;
  onClose: () => void;
}) {
  return (
    <div className="drama-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drama-modal-content" style={{ maxWidth: 520 }}>
        <div className="drama-modal-header">
          <h3>第{episode.number}集设置</h3>
          <button className="drama-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="drama-modal-body" style={{ gap: 16, padding: '20px' }}>
          {/* 集标题 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="drama-field-label" style={{ margin: 0 }}>集标题</label>
            <input
              className="drama-ep-title-input"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 12px' }}
              value={episode.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder={`第${episode.number}集标题`}
            />
          </div>
          {/* 来源提示 */}
          {episode.sourceChapterTitle && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              来自《{episode.sourceChapterTitle}》
            </div>
          )}
          {/* 剧情简介 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="drama-field-label" style={{ margin: 0 }}>剧情简介</label>
            <textarea
              className="drama-ep-synopsis-input"
              placeholder="这一集发生了什么？主要冲突和转折点是什么？"
              value={episode.synopsis}
              onChange={e => onChange({ synopsis: e.target.value })}
              rows={5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 集数编辑器（标题区 + 正文区） ──────────────────────────
function EpisodeEditor({
  episode,
  onChange,
  onGenerateVideo,
  generatingVideo,
  editor,
}: {
  episode: DramaEpisode;
  onChange: (patch: Partial<DramaEpisode>) => void;
  onGenerateVideo: (episodeId: string) => void;
  generatingVideo: string | null;
  editor?: Editor | null;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="drama-ep-editor">
      {/* 标题区 */}
      <div className="drama-ep-title-zone">
        <span className="drama-ep-num-badge">E{episode.number}</span>
        <input
          className="drama-ep-title-input"
          value={episode.title}
          onChange={e => onChange({ title: e.target.value })}
          placeholder={`第${episode.number}集标题`}
        />
        {episode.sourceChapterTitle && (
          <span className="drama-ep-source-hint">来自《{episode.sourceChapterTitle}》</span>
        )}
        <button
          className="drama-icon-btn"
          title="集数设置（简介等）"
          onClick={() => setSettingsOpen(true)}
          style={{ flexShrink: 0 }}
        >
          <Settings size={15} />
        </button>
        <button
          className="drama-icon-btn"
          title={generatingVideo === episode.id ? '生成中...' : '生成视频'}
          onClick={() => onGenerateVideo(episode.id)}
          disabled={generatingVideo === episode.id}
          style={{ flexShrink: 0 }}
        >
          {generatingVideo === episode.id ? <span className="drama-spinner" /> : <Video size={15} />}
        </button>
      </div>

      {/* 剧本正文区（全高度） */}
      <div className="drama-script-area">
        {editor ? (
          <DramaScriptEditor editor={editor} />
        ) : (
          <textarea
            className="drama-textarea full script-font"
            placeholder={`INT. 场景名称 - 时间\n\n角色动作描述\n\n角色名\n台词内容\n\n...`}
            value={episode.script}
            onChange={e => onChange({ script: e.target.value })}
          />
        )}
      </div>

      {/* 集数设置模态框 */}
      {settingsOpen && (
        <EpisodeSettingsModal
          episode={episode}
          onChange={onChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────
export default function DramaEditorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workId = searchParams.get('workId');

  const [work, setWork] = useState<Work | null>(null);
  const [workTitle, setWorkTitle] = useState('');
  const [meta, setMeta] = useState<DramaMeta>({
    genre: '', style: '', totalEpisodes: 1, outline: '', characters: [], episodes: [], scenes: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('work-info');
  const [episodeChapterMap, setEpisodeChapterMap] = useState<Record<number, number>>({});
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [episodeImportModalOpen, setEpisodeImportModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [generatingVideo, setGeneratingVideo] = useState<string | null>(null);
  const [generatingCharacterImage, setGeneratingCharacterImage] = useState<string | null>(null);
  const [generatingSceneImage, setGeneratingSceneImage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [sceneExtractModels, setSceneExtractModels] = useState<DramaExtractModelOption[]>([]);
  const [sceneExtractStyles, setSceneExtractStyles] = useState<DramaSceneGenerationStyleOption[]>(FALLBACK_SCENE_STYLES);
  const [imageSizes, setImageSizes] = useState<string[]>([]);
  const [selectedImageSize, setSelectedImageSize] = useState<string>('1024x1024');
  const [localTasks, setLocalTasks] = useState<LocalDramaTask[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<DramaCharacter | null>(null);
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [editingCharacterData, setEditingCharacterData] = useState<DramaCharacter | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { messageState, showMessage, closeMessage } = useModalState();

  // 图片生成模态框状态
  type ImageGenTarget =
    | { type: 'character'; characterId: string; style: 'portrait' | 'grid4' }
    | { type: 'scene'; sceneId: string }
    | null;
  const [imageGenTarget, setImageGenTarget] = useState<ImageGenTarget>(null);
  const [imageGenPrompt, setImageGenPrompt] = useState('');
  const [imageGenSize, setImageGenSize] = useState('1024x1024');
  const [imageGenExecuting, setImageGenExecuting] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveErrorRef = useRef(false);

  // 加载作品 + 当前用户
  useEffect(() => {
    if (!workId) { navigate('/drama'); return; }
    Promise.all([
      worksApi.getWork(workId),
      authApi.getCurrentUser().catch(() => null),
    ]).then(([w, user]) => {
      setWork(w);
      setWorkTitle(w.title || '');
      const m = parseMeta(w);
      setMeta(m);
      if (m.episodes.length > 0) setActiveEpisodeId(m.episodes[0].id);
      if (user) setCurrentUserId(String(user.id));
    }).catch(() => navigate('/drama')).finally(() => setLoading(false));
  }, [workId, navigate]);

  useEffect(() => {
    let active = true;
    getDramaExtractOptions()
      .then((res) => {
        if (!active) return;
        setSceneExtractModels(res.models || []);
        const styles = Array.isArray(res.scene_generation_styles) && res.scene_generation_styles.length > 0
          ? res.scene_generation_styles
          : FALLBACK_SCENE_STYLES;
        setSceneExtractStyles(styles);
        if (Array.isArray(res.image_sizes) && res.image_sizes.length > 0) {
          setImageSizes(res.image_sizes);
          setSelectedImageSize(res.default_image_size || res.image_sizes[0]);
        }
      })
      .catch(() => {
        if (!active) return;
        setSceneExtractModels([]);
        setSceneExtractStyles(FALLBACK_SCENE_STYLES);
      });
    return () => { active = false; };
  }, []);

  // 按集建立 Chapter 映射（用于 Yjs 协作编辑）
  useEffect(() => {
    if (!workId || meta.episodes.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { chapters } = await chaptersApi.listChapters({ work_id: workId });
        if (cancelled) return;
        const map: Record<number, number> = {};
        for (const ch of chapters) {
          if (ch.chapter_number) map[ch.chapter_number] = ch.id;
        }
        for (const ep of meta.episodes) {
          if (!map[ep.number]) {
            const newCh = await chaptersApi.createChapter({
              work_id: workId,
              title: ep.title,
              chapter_number: ep.number,
            });
            if (cancelled) return;
            map[ep.number] = newCh.id;
          }
        }
        if (!cancelled) setEpisodeChapterMap(map);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [workId, meta.episodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自动保存（防抖 1.5s）
  const scheduleSave = useCallback((newMeta: DramaMeta) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!workId) return;
      setSaving(true);
      try {
        await worksApi.updateWork(workId, { metadata: newMeta as unknown as Work['metadata'] });
        setSavedAt(new Date());
        lastSaveErrorRef.current = false;
      } catch {
        if (!lastSaveErrorRef.current) {
          lastSaveErrorRef.current = true;
          showMessage('自动保存失败，请检查网络连接', 'error', undefined, undefined, { toast: true, autoCloseMs: 3000 });
        }
      }finally { setSaving(false); }
    }, 1500);
  }, [workId]);

  const handleMetaChange = (patch: Partial<DramaMeta>) => {
    const updated = { ...meta, ...patch };
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleEpisodeChange = (id: string, patch: Partial<DramaEpisode>) => {
    const updated = {
      ...meta,
      episodes: meta.episodes.map(e => e.id === id ? { ...e, ...patch } : e)
    };
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleAddEpisode = () => {
    const num = meta.episodes.length + 1;
    const ep: DramaEpisode = {
      id: genId(), number: num, title: `第${num}集`,
      synopsis: '', script: '', scenes: []
    };
    const updated = { ...meta, episodes: [...meta.episodes, ep] };
    setMeta(updated);
    setActiveEpisodeId(ep.id);
    scheduleSave(updated);
  };

  const handleEpisodeImportConfirm = (patch: Partial<DramaEpisode>) => {
    const num = meta.episodes.length + 1;
    const ep: DramaEpisode = {
      id: genId(), number: num, title: `第${num}集`,
      synopsis: '', script: '', scenes: [],
      ...patch,
    };
    const updated = { ...meta, episodes: [...meta.episodes, ep] };
    setMeta(updated);
    setActiveEpisodeId(ep.id);
    setLeftTab('episodes');
    scheduleSave(updated);
  };

  const handleDeleteEpisode = (id: string) => {
    const remaining = meta.episodes.filter(e => e.id !== id).map((e, i) => ({ ...e, number: i + 1 }));
    const updated = { ...meta, episodes: remaining };
    setMeta(updated);
    if (activeEpisodeId === id) {
      setActiveEpisodeId(remaining.length > 0 ? remaining[0].id : null);
    }
    scheduleSave(updated);
  };

  const handleUpdateTitle = async (title: string) => {
    if (!workId || !title.trim()) return;
    await worksApi.updateWork(workId, { title });
    setWork(prev => prev ? { ...prev, title } : prev);
    setWorkTitle(title);
  };

  const handleImport = (patch: Partial<DramaMeta>) => {
    const updated = { ...meta, ...patch };
    if (patch.episodes && patch.episodes.length > 0) {
      setActiveEpisodeId(patch.episodes[0].id);
      setLeftTab('episodes');
    }
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleAddScene = () => {
    const scene: DramaScene = {
      id: genId(), location: '新场景', time: '白天', description: '',
      episodeId: activeEpisodeId || undefined,
    };
    const updated = { ...meta, scenes: [...(meta.scenes || []), scene] };
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleUpdateScene = (id: string, patch: Partial<DramaScene>) => {
    const updated = { ...meta, scenes: (meta.scenes || []).map(s => s.id === id ? { ...s, ...patch } : s) };
    setMeta(updated);
    scheduleSave(updated);
  };

  const handleDeleteScene = (id: string) => {
    const updated = { ...meta, scenes: (meta.scenes || []).filter(s => s.id !== id) };
    setMeta(updated);
    scheduleSave(updated);
  };

  // 集数导航
  const episodeIndex = meta.episodes.findIndex(e => e.id === activeEpisodeId);
  const prevEpisode = episodeIndex > 0 ? meta.episodes[episodeIndex - 1] : null;
  const nextEpisode = episodeIndex < meta.episodes.length - 1 ? meta.episodes[episodeIndex + 1] : null;
  const activeEpisode = meta.episodes.find(e => e.id === activeEpisodeId) || null;

  // Yjs 协作编辑器（按集连接）
  const activeChapterId = activeEpisode ? episodeChapterMap[activeEpisode.number] : undefined;
  const yjsDocumentId = workId && activeChapterId ? `work_${workId}_chapter_${activeChapterId}` : '';
  const { editor, connectionStatus } = useYjsEditor({
    documentId: yjsDocumentId,
    placeholder: '开始编写剧本正文...',
    editable: !!yjsDocumentId,
  });

  // 集数列表（供 CollabAIPanel 使用）
  const chapterItems = meta.episodes.map(ep => ({
    id: ep.id,
    title: ep.title,
    chapter_number: ep.number,
  }));

  // ─── Drama AI 命令（聊天面板斜杠命令）───────────────────────

  const handleDramaCommand = useCallback((commandId: string, fullQuery: string) => {
    if (!workId) return;
    const ep = activeEpisodeId ? meta.episodes.find(e => e.id === activeEpisodeId) : null;
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    if (commandId === 'drama-extract-characters') {
      let combinedContent = '';
      for (const episode of meta.episodes) {
        combinedContent += `\n第${episode.number}集：${episode.title}\n${episode.synopsis}\n${episode.script}`;
      }
      if (!combinedContent.trim()) {
        showMessage('没有可用的剧本内容用于提取角色', 'warning', undefined, undefined, { toast: true, autoCloseMs: 3000 });
        return;
      }
      const preferredModelId = sceneExtractModels.length > 0
        ? (selectedModel && sceneExtractModels.some(m => m.model_id === selectedModel) ? selectedModel : sceneExtractModels[0].model_id)
        : null;

      const task: LocalDramaTask = {
        local_id: localId, type: 'extract-characters',
        query: fullQuery, episode_id: '', episode_title: '所有集',
        status: 'running', created_at: now,
      };
      setLocalTasks(prev => [task, ...prev]);
      setLeftTab('episodes'); // 切到 AI 任务 tab 方便查看进度

      dramaExtractCharacters(combinedContent.slice(0, 8000), workId, 12, preferredModelId)
        .then(result => {
          if (Array.isArray(result) && result.length > 0) {
            const newChars = result.map(c => ({
              id: genId(), name: c.name || '未知角色', role: c.role || '配角',
              description: c.description || '', appearance: c.appearance || '', personality: c.personality || '',
            }));
            const existingNames = new Set(meta.characters.map(c => c.name));
            const toAdd = newChars.filter(c => !existingNames.has(c.name));
            const merged = toAdd.length > 0 ? [...meta.characters, ...toAdd] : (meta.characters.length === 0 ? newChars : meta.characters);
            handleMetaChange({ characters: merged });
            setLeftTab('characters');
          }
          setLocalTasks(prev => prev.map(t =>
            t.local_id === localId ? { ...t, status: 'done', result } : t
          ));
        })
        .catch(err => {
          setLocalTasks(prev => prev.map(t =>
            t.local_id === localId ? { ...t, status: 'error', error: String(err) } : t
          ));
        });
      return;
    }

    if (commandId === 'drama-extract-scenes') {
      if (!ep) { showMessage('请先选择要提取场景的集数', 'warning', undefined, undefined, { toast: true, autoCloseMs: 3000 }); return; }
      // 解析风格参数（命令后的词）
      const parts = fullQuery.trim().split(/\s+/).slice(1);
      const validStyles = sceneExtractStyles.map(s => s.id);
      const style = parts.find(p => validStyles.includes(p)) ?? 'balanced';
      const content = editor ? editor.getText() : ep.script;
      if (!content.trim()) { showMessage('当前集没有剧本内容，请先生成剧本', 'warning', undefined, undefined, { toast: true, autoCloseMs: 3000 }); return; }

      const task: LocalDramaTask = {
        local_id: localId, type: 'extract-scenes',
        query: `/drama-extract-scenes [${style}]`, episode_id: ep.id, episode_title: ep.title,
        status: 'running', created_at: now,
      };
      setLocalTasks(prev => [task, ...prev]);

      dramaExtractScenes(content, workId, 12, selectedModel || null, style)
        .then(result => {
          if (Array.isArray(result) && result.length > 0) {
            const newScenes = result.map((s, i) => ({
              id: s.id || `scene-${i + 1}`, location: s.location || '未命名场景',
              time: s.time || '白天', description: s.description || '', episodeId: ep.id,
            }));
            const otherScenes = (meta.scenes || []).filter(sc => sc.episodeId !== ep.id);
            handleMetaChange({ scenes: [...otherScenes, ...newScenes] });
            setLeftTab('scenes');
          }
          setLocalTasks(prev => prev.map(t =>
            t.local_id === localId ? { ...t, status: 'done', result } : t
          ));
        })
        .catch(err => {
          setLocalTasks(prev => prev.map(t =>
            t.local_id === localId ? { ...t, status: 'error', error: String(err) } : t
          ));
        });
      return;
    }

    if (commandId === 'drama-gen-script') {
      if (!ep) { showMessage('请先选择要生成剧本的集数', 'warning', undefined, undefined, { toast: true, autoCloseMs: 3000 }); return; }
      if (!ep.synopsis.trim()) { showMessage('请先填写剧情简介再生成剧本', 'warning', undefined, undefined, { toast: true, autoCloseMs: 3000 }); return; }

      const characters = meta.characters.map(c => `${c.name}（${c.role}）`).join('、');
      const prompt = [
        `请根据以下信息，为第${ep.number}集「${ep.title}」生成专业的剧本正文。`,
        `\n剧情简介：${ep.synopsis}`,
        characters ? `\n主要角色：${characters}` : '',
        meta.outline ? `\n故事背景：${meta.outline}` : '',
        '\n\n输出格式要求：每行必须以下列前缀之一开头，每行只含一种内容，不得有多余说明：\n' +
        '【场】场次标题（如：【场】INT. 地点 - 时间）\n' +
        '【动】动作/环境描述\n' +
        '【名】角色名（单独一行，后跟对白或舞台提示）\n' +
        '【提】括弧内的舞台提示（如：【提】低声，握紧拳头）\n' +
        '【白】角色对白（紧接在【名】或【提】之后）\n' +
        '直接输出剧本，不要额外解释。',
      ].filter(Boolean).join('');

      const abortController = new AbortController();
      const task: LocalDramaTask = {
        local_id: localId, type: 'gen-script',
        query: fullQuery, episode_id: ep.id, episode_title: ep.title,
        status: 'running', streamContent: '', created_at: now, abortController,
      };
      setLocalTasks(prev => [task, ...prev]);
      editor?.commands.setContent('<p></p>');

      let accumulated = '';
      dramaChatStream(
        prompt,
        (chunk: string) => {
          accumulated += chunk;
          editor?.commands.setContent(screenplayTextToHtml(accumulated));
          setLocalTasks(prev => prev.map(t =>
            t.local_id === localId ? { ...t, streamContent: accumulated } : t
          ));
        },
        workId,
        { signal: abortController.signal },
      ).then(() => {
        // 完成时同步 episode.script 供后续提取使用
        handleEpisodeChange(ep.id, { script: accumulated });
        setLocalTasks(prev => prev.map(t =>
          t.local_id === localId ? { ...t, status: 'done' } : t
        ));
      }).catch(err => {
        if ((err as Error)?.name === 'AbortError') {
          setLocalTasks(prev => prev.map(t =>
            t.local_id === localId ? { ...t, status: 'cancelled' } : t
          ));
        } else {
          setLocalTasks(prev => prev.map(t =>
            t.local_id === localId ? { ...t, status: 'error', error: String(err) } : t
          ));
        }
      });
      return;
    }
  }, [workId, activeEpisodeId, meta, editor, sceneExtractModels, sceneExtractStyles, selectedModel, handleMetaChange, handleEpisodeChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancelLocalTask = useCallback((localId: string) => {
    setLocalTasks(prev => {
      const task = prev.find(t => t.local_id === localId);
      task?.abortController?.abort();
      return prev.map(t =>
        t.local_id === localId ? { ...t, status: 'cancelled' } : t
      );
    });
  }, []);

  const handleGenerateVideo = async (episodeId: string) => {
    // TODO: 对接视频生成模型 API
    setGeneratingVideo(episodeId);
    // 模拟生成过程（实际对接后替换）
    setTimeout(() => {
      setGeneratingVideo(null);
      showMessage('视频生成功能即将上线，敬请期待！', 'info', undefined, undefined, { toast: true, autoCloseMs: 3000 });
    }, 1500);
  };


  // 打开图片生成模态框
  const openCharacterImageModal = (characterId: string, style: 'portrait' | 'grid4' = 'portrait') => {
    const char = meta.characters.find(c => c.id === characterId);
    if (!char) return;
    const prompt = style === 'grid4'
      ? `为剧本角色生成一张【角色设定集】图片。要求：必须在一张图片上以 2x2 网格排版的形式，展示该角色的4个不同角度、姿势或表情（如正面、侧面、全身、特写）。确保4个格子里是同一个人的不同视图，背景保持干净。\n角色信息 -> 角色名：${char.name}，身份：${char.role}，外貌特征：${char.appearance}，性格：${char.personality}，描述：${char.description}`
      : `为剧本角色生成一张肖像照片。角色名：${char.name}，身份：${char.role}，外貌特征：${char.appearance}，性格：${char.personality}，描述：${char.description}`;
    setImageGenPrompt(prompt);
    setImageGenSize(selectedImageSize);
    setImageGenTarget({ type: 'character', characterId, style });
  };

  const openSceneImageModal = (sceneId: string) => {
    const scene = (meta.scenes || []).find(s => s.id === sceneId);
    if (!scene) return;
    const prompt = `为剧本生成一张场景概念图。场景地点：${scene.location}，时间：${scene.time}，描述：${scene.description}`;
    setImageGenPrompt(prompt);
    setImageGenSize(selectedImageSize);
    setImageGenTarget({ type: 'scene', sceneId });
  };

  // 执行图片生成（模态框确认后调用）
  const executeGenerateImage = async () => {
    if (!imageGenTarget || !workId) return;
    setImageGenExecuting(true);
    if (imageGenTarget.type === 'character') setGeneratingCharacterImage(imageGenTarget.characterId);
    else setGeneratingSceneImage(imageGenTarget.sceneId);
    try {
      const imageUrl = await dramaGenerateImage(imageGenPrompt, workId, { size: imageGenSize });
      if (imageUrl) {
        if (imageGenTarget.type === 'character') {
          const newCharacters = meta.characters.map(c =>
            c.id === imageGenTarget.characterId ? { ...c, imageUrl } : c
          );
          handleMetaChange({ characters: newCharacters });
        } else {
          handleUpdateScene(imageGenTarget.sceneId, { imageUrl });
        }
      }
      setImageGenTarget(null);
    } catch (e) {
      showMessage(e instanceof Error ? e.message : '图片生成失败，请重试', 'error', undefined, undefined, { toast: true, autoCloseMs: 4000 });
    } finally {
      setImageGenExecuting(false);
      setGeneratingCharacterImage(null);
      setGeneratingSceneImage(null);
    }
  };

  // 在模态框内切换角色生成风格时重建提示词
  const handleImageGenStyleChange = (style: 'portrait' | 'grid4') => {
    if (!imageGenTarget || imageGenTarget.type !== 'character') return;
    const char = meta.characters.find(c => c.id === imageGenTarget.characterId);
    if (!char) return;
    const prompt = style === 'grid4'
      ? `为剧本角色生成一张【角色设定集】图片。要求：必须在一张图片上以 2x2 网格排版的形式，展示该角色的4个不同角度、姿势或表情（如正面、侧面、全身、特写）。确保4个格子里是同一个人的不同视图，背景保持干净。\n角色信息 -> 角色名：${char.name}，身份：${char.role}，外貌特征：${char.appearance}，性格：${char.personality}，描述：${char.description}`
      : `为剧本角色生成一张肖像照片。角色名：${char.name}，身份：${char.role}，外貌特征：${char.appearance}，性格：${char.personality}，描述：${char.description}`;
    setImageGenPrompt(prompt);
    setImageGenTarget({ ...imageGenTarget, style });
  };


  if (loading) {
    return (
      <div className="drama-editor-loading">
        <Film size={32} />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="drama-editor-page">
      {/* 顶部栏 */}
      <header className="drama-editor-topbar">
        <div className="drama-editor-topbar-left">
          <button className="drama-back-btn" onClick={() => navigate('/drama')}>
            <ArrowLeft size={16} />
          </button>
          <button
            className="drama-sidebar-toggle"
            onClick={() => setLeftCollapsed(v => !v)}
            title={leftCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            {leftCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <Film size={15} className="drama-editor-topbar-icon" />
          <input
            className="drama-title-input"
            value={workTitle}
            onChange={e => setWorkTitle(e.target.value)}
            onBlur={e => { if (e.target.value !== work?.title) handleUpdateTitle(e.target.value); }}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="剧本名称"
          />
          <span className="drama-save-status">
            {saving ? '保存中...' : savedAt ? `已保存 ${savedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          {yjsDocumentId && (
            <span className="drama-status-tag">
              {connectionStatus === 'connected' ? (
                <Wifi size={12} />
              ) : connectionStatus === 'connecting' ? (
                <Wifi size={12} style={{ opacity: 0.5 }} />
              ) : (
                <WifiOff size={12} style={{ opacity: 0.4 }} />
              )}
              {connectionStatus === 'connected' ? '协作中' : connectionStatus === 'connecting' ? '连接中...' : '已断开'}
            </span>
          )}
        </div>
        <div className="drama-editor-topbar-right">
          {workId && (
            <button
              className="drama-share-btn"
              onClick={() => setShareModalOpen(true)}
              title="邀请协作者"
            >
              <Users size={15} />
              <span>分享</span>
            </button>
          )}
          <button
            className="drama-sidebar-toggle"
            onClick={() => setRightCollapsed(v => !v)}
            title={rightCollapsed ? '展开 AI 面板' : '收起 AI 面板'}
          >
            {rightCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </button>
        </div>
      </header>

      <div className="drama-editor-body">
        {/* 左侧导航 */}
        {!leftCollapsed && (
          <aside className="drama-editor-left">
            <DramaSideNav
              meta={meta}
              activeEpisodeId={activeEpisodeId}
              onSelectEpisode={id => {
                setActiveEpisodeId(id);
                if (leftTab === 'work-info') setLeftTab('episodes');
              }}
              activeTab={leftTab}
              onTabChange={setLeftTab}
              onAddEpisode={handleAddEpisode}
              onAddEpisodeFromNovel={() => setEpisodeImportModalOpen(true)}
              onDeleteEpisode={handleDeleteEpisode}
              onGenerateCharacterImage={openCharacterImageModal}
              generatingCharacterImage={generatingCharacterImage}
              onSelectCharacter={setSelectedCharacter}
              scenes={meta.scenes || []}
              onAddScene={handleAddScene}
              onUpdateScene={handleUpdateScene}
              onDeleteScene={handleDeleteScene}
              onGenerateSceneImage={openSceneImageModal}
              generatingSceneImage={generatingSceneImage}
              imageSizes={imageSizes}
              selectedImageSize={selectedImageSize}
              onImageSizeChange={setSelectedImageSize}
            />
          </aside>
        )}

        {/* 主内容区 */}
        <main className="drama-editor-main">
          {leftTab === 'work-info' ? (
            <div className="work-info-panel-wrapper">
              <WorkInfoManager
                workId={workId}
                workData={work ? { metadata: { ...(work.metadata || {}) } } as WorkData : undefined}
              />
            </div>
          ) : activeEpisode ? (
            <>
              <EpisodeEditor
                episode={activeEpisode}
                onChange={patch => handleEpisodeChange(activeEpisode.id, patch)}
                onGenerateVideo={handleGenerateVideo}
                generatingVideo={generatingVideo}
                editor={editor}
              />
              {/* 集数导航 */}
              <div className="drama-ep-nav-footer">
                <button
                  className="drama-ep-nav-btn"
                  disabled={!prevEpisode}
                  onClick={() => prevEpisode && setActiveEpisodeId(prevEpisode.id)}
                >
                  <ChevronLeft size={15} />
                  {prevEpisode ? prevEpisode.title : '已是第一集'}
                </button>
                <span className="drama-ep-nav-indicator">
                  {episodeIndex + 1} / {meta.episodes.length}
                </span>
                <button
                  className="drama-ep-nav-btn"
                  disabled={!nextEpisode}
                  onClick={() => nextEpisode && setActiveEpisodeId(nextEpisode.id)}
                >
                  {nextEpisode ? nextEpisode.title : '已是最后一集'}
                  <ChevronRightIcon size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="drama-editor-welcome">
              <div className="drama-editor-welcome-inner">
                <Film size={48} className="drama-editor-welcome-icon" />
                <h2>开始你的剧本创作</h2>
                <p>在左侧添加集数，或从小说一键导入</p>
                <div className="drama-editor-welcome-btns">
                  <button className="drama-create-btn" onClick={handleAddEpisode}>
                    <Plus size={16} /> 创建第一集
                  </button>
                  <button className="drama-import-novel-btn drama-import-novel-btn-welcome"
                    onClick={() => setImportModalOpen(true)}>
                    <Download size={15} /> 从小说导入
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 右侧 AI 面板 */}
        {!rightCollapsed && workId && (
          <aside className="drama-editor-right">
            <CollabAIPanel
              workId={workId}
              chapters={chapterItems}
              currentChapterId={activeEpisodeId || undefined}
              currentUserId={currentUserId}
              selectedModel={selectedModel}
              onSelectedModelChange={setSelectedModel}
              localTasks={localTasks}
              extraCommands={[...DRAMA_EXTRA_COMMANDS]}
              onExtraCommand={handleDramaCommand}
              onCancelLocalTask={handleCancelLocalTask}
            />
          </aside>
        )}
      </div>

      <ImportFromNovelModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImport}
        workId={workId}
      />

      <ImportEpisodeFromChapterModal
        isOpen={episodeImportModalOpen}
        onClose={() => setEpisodeImportModalOpen(false)}
        onImport={handleEpisodeImportConfirm}
        workId={workId}
        episodeNumber={meta.episodes.length + 1}
      />

      {/* 角色详情/编辑弹窗 */}
      {selectedCharacter && (
        <div className="drama-modal-overlay" onClick={() => {
          setSelectedCharacter(null);
          setIsEditingCharacter(false);
        }}>
          <div className="drama-modal-content character-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="drama-modal-header">
              <h3>{isEditingCharacter ? '编辑角色' : '角色详情'}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!isEditingCharacter && (
                  <>
                    <button className="drama-modal-action-btn" onClick={() => {
                      setEditingCharacterData(selectedCharacter);
                      setIsEditingCharacter(true);
                    }} title="编辑">
                      <Edit2 size={16} />
                    </button>
                    <button className="drama-modal-action-btn" onClick={() => {
                      if (window.confirm(`确定要删除角色「${selectedCharacter.name}」吗？`)) {
                        const newCharacters = meta.characters.filter(c => c.id !== selectedCharacter.id);
                        handleMetaChange({ characters: newCharacters });
                        setSelectedCharacter(null);
                      }
                    }} title="删除">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                <button className="drama-modal-close" onClick={() => {
                  setSelectedCharacter(null);
                  setIsEditingCharacter(false);
                }}><X size={20} /></button>
              </div>
            </div>
            <div className="drama-modal-body">
              {isEditingCharacter && editingCharacterData ? (
                <div className="character-edit-form">
                  <div className="drama-input-group">
                    <label>角色名</label>
                    <input className="drama-input" value={editingCharacterData.name} onChange={e => setEditingCharacterData({...editingCharacterData, name: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>角色身份</label>
                    <input className="drama-input" value={editingCharacterData.role} onChange={e => setEditingCharacterData({...editingCharacterData, role: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>描述</label>
                    <textarea className="drama-textarea" rows={3} value={editingCharacterData.description} onChange={e => setEditingCharacterData({...editingCharacterData, description: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>外貌</label>
                    <textarea className="drama-textarea" rows={3} value={editingCharacterData.appearance} onChange={e => setEditingCharacterData({...editingCharacterData, appearance: e.target.value})} />
                  </div>
                  <div className="drama-input-group">
                    <label>性格</label>
                    <textarea className="drama-textarea" rows={3} value={editingCharacterData.personality} onChange={e => setEditingCharacterData({...editingCharacterData, personality: e.target.value})} />
                  </div>
                  <div className="character-edit-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                    <button className="drama-btn-secondary" onClick={() => setIsEditingCharacter(false)}>取消</button>
                    <button className="drama-btn-primary" onClick={() => {
                      const newCharacters = meta.characters.map(c => c.id === editingCharacterData.id ? editingCharacterData : c);
                      handleMetaChange({ characters: newCharacters });
                      setSelectedCharacter(editingCharacterData);
                      setIsEditingCharacter(false);
                    }} style={{ display: 'flex', alignItems: 'center' }}>
                      <Save size={14} style={{ marginRight: '4px' }} />
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="character-detail-top">
                    <div 
                      className="character-detail-avatar-wrapper"
                      onClick={() => {
                        if (selectedCharacter.imageUrl) {
                          setPreviewImage(selectedCharacter.imageUrl);
                        }
                      }}
                      style={{ cursor: selectedCharacter.imageUrl ? 'pointer' : 'default' }}
                    >
                      {selectedCharacter.imageUrl ? (
                        <img src={selectedCharacter.imageUrl} alt={selectedCharacter.name} className="character-detail-avatar" />
                      ) : (
                        <div className="character-detail-avatar-placeholder">{selectedCharacter.name.slice(0, 1)}</div>
                      )}
                      {selectedCharacter.imageUrl && (
                        <div className="character-detail-avatar-hover">
                          <Sparkles size={16} />
                          <span>查看大图</span>
                        </div>
                      )}
                    </div>
                    <div className="character-detail-info">
                      <div className="character-detail-name">{selectedCharacter.name}</div>
                      <div className="character-detail-role">{selectedCharacter.role}</div>
                      
                      <div className="character-detail-actions" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>重新生成图片：</span>
                        {imageSizes.length > 1 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {imageSizes.map(sz => (
                              <button
                                key={sz}
                                onClick={() => setSelectedImageSize(sz)}
                                style={{
                                  padding: '2px 8px', fontSize: '11px', borderRadius: 4, border: '1px solid',
                                  cursor: 'pointer', fontFamily: 'monospace',
                                  background: selectedImageSize === sz ? 'var(--accent-primary)' : 'transparent',
                                  color: selectedImageSize === sz ? '#fff' : 'var(--text-secondary)',
                                  borderColor: selectedImageSize === sz ? 'var(--accent-primary)' : 'var(--border-light)',
                                }}
                              >
                                {sz}
                              </button>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            className="drama-btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center' }}
                            onClick={() => openCharacterImageModal(selectedCharacter.id, 'portrait')}
                            disabled={generatingCharacterImage === selectedCharacter.id}
                          >
                            <Sparkles size={14} style={{ marginRight: '4px' }} />
                            单人肖像
                          </button>
                          <button
                            className="drama-btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center' }}
                            onClick={() => openCharacterImageModal(selectedCharacter.id, 'grid4')}
                            disabled={generatingCharacterImage === selectedCharacter.id}
                          >
                            <Layers size={14} style={{ marginRight: '4px' }} />
                            四视图设定集
                          </button>
                        </div>
                        {generatingCharacterImage === selectedCharacter.id && (
                          <span style={{ fontSize: '12px', color: 'var(--primary-color)' }}>正在生成中，请稍候...</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="character-detail-section">
                    <h4>描述</h4>
                    <p>{selectedCharacter.description || '暂无描述'}</p>
                  </div>
                  <div className="character-detail-section">
                    <h4>外貌</h4>
                    <p>{selectedCharacter.appearance || '暂无描述'}</p>
                  </div>
                  <div className="character-detail-section">
                    <h4>性格</h4>
                    <p>{selectedCharacter.personality || '暂无描述'}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 图片预览遮罩 */}
      {previewImage && (
        <div className="drama-image-preview-overlay" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="drama-image-preview-img" />
          <button className="drama-image-preview-close" onClick={() => setPreviewImage(null)}>×</button>
        </div>
      )}

      <ShareWorkModal
        isOpen={shareModalOpen}
        workId={workId || ''}
        workTitle={workTitle || work?.title || '剧本'}
        editorPath="/drama/editor"
        onClose={() => setShareModalOpen(false)}
      />

      {/* 图片生成模态框 */}
      {imageGenTarget !== null && (
        <div className="drama-modal-overlay" onClick={() => !imageGenExecuting && setImageGenTarget(null)}>
          <div className="drama-modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="drama-modal-header">
              <h3>生成图片</h3>
              <button className="drama-modal-close" onClick={() => !imageGenExecuting && setImageGenTarget(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="drama-modal-body">
              {imageGenTarget.type === 'character' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>生成风格</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['portrait', 'grid4'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => handleImageGenStyleChange(s)}
                        style={{
                          padding: '5px 14px', fontSize: 13, borderRadius: 6, border: '1px solid',
                          cursor: 'pointer',
                          background: imageGenTarget.style === s ? 'var(--accent-primary)' : 'transparent',
                          color: imageGenTarget.style === s ? '#fff' : 'var(--text-primary)',
                          borderColor: imageGenTarget.style === s ? 'var(--accent-primary)' : 'var(--border-light)',
                        }}
                      >
                        {s === 'portrait' ? '单人肖像' : '四视图设定集'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {imageSizes.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>图片尺寸</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {imageSizes.map(sz => (
                      <button
                        key={sz}
                        onClick={() => setImageGenSize(sz)}
                        style={{
                          padding: '3px 10px', fontSize: 12, borderRadius: 4, border: '1px solid',
                          cursor: 'pointer', fontFamily: 'monospace',
                          background: imageGenSize === sz ? 'var(--accent-primary)' : 'transparent',
                          color: imageGenSize === sz ? '#fff' : 'var(--text-secondary)',
                          borderColor: imageGenSize === sz ? 'var(--accent-primary)' : 'var(--border-light)',
                        }}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>生成提示词（可编辑）</label>
                <textarea
                  className="drama-textarea"
                  rows={5}
                  value={imageGenPrompt}
                  onChange={e => setImageGenPrompt(e.target.value)}
                  style={{ fontSize: 13, resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="drama-modal-footer">
              <button className="drama-btn-secondary" onClick={() => setImageGenTarget(null)} disabled={imageGenExecuting}>
                取消
              </button>
              <button className="drama-btn-primary" onClick={executeGenerateImage} disabled={imageGenExecuting || !imageGenPrompt.trim()}>
                {imageGenExecuting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="drama-spinner" style={{ width: 14, height: 14 }} />
                    生成中...
                  </span>
                ) : '开始生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        toast={messageState.toast}
        autoCloseMs={messageState.autoCloseMs}
        onConfirm={messageState.onConfirm}
      />
    </div>
  );
}

