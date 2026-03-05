import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Plus, MapPin, Users, FileText, BookOpen, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { chaptersApi } from '../../utils/chaptersApi';
import { generateChapterOutline } from '../../utils/bookAnalysisApi';
import { formatOutlineForEditor, formatDetailedOutlineForEditor } from '../../utils/outlineFormat';
import LoadingSpinner from '../common/LoadingSpinner';
import MessageModal from '../common/MessageModal';
import type { MessageType } from '../common/MessageModal';
import './ChapterSettingsModal.css';

interface Character {
  id: string;
  name: string;
  avatar?: string;
  appearance?: Record<string, string>;
  personality?: Record<string, string>;
  description?: string;
  display_name?: string;
  gender?: string;
  type?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Location {
  id: string;
  name: string;
}

interface ChapterData {
  id?: string;
  title: string;
  volumeId: string;
  volumeTitle: string;
  volume_number?: number; // 卷号
  chapter_number?: number; // 章节号
  characters: string[]; // 人物 ID 列表
  locations: string[]; // 地点列表
  outline: string;
  detailOutline: string;
}

interface Volume {
  id: string;
  title: string;
}

/** 从 metadata 按路径取数组并规范为 Character[]，支持 'component_data.characters' 或 'characters' */
function getCharactersFromMetadata(
  metadata: Record<string, unknown> | undefined,
  dataKey: string
): Character[] {
  if (!metadata || !dataKey) return [];
  const keys = dataKey.split('.');
  let value: unknown = metadata;
  for (const k of keys) {
    if (value == null || typeof value !== 'object') return [];
    value = (value as Record<string, unknown>)[k];
  }
  const arr = Array.isArray(value) ? value : [];
  return arr.map((item, index) => {
    if (item != null && typeof item === 'object' && 'name' in (item as object)) {
      const o = item as Record<string, unknown>;
      return {
        id: String(o.id ?? (o as { id?: string }).id ?? index),
        name: String(o.name ?? ''),
        avatar: o.avatar as string | undefined,
        appearance: o.appearance as Record<string, string> | undefined,
        personality: o.personality as Record<string, string> | undefined,
        description: o.description as string | undefined,
        display_name: o.display_name as string | undefined,
        gender: o.gender as string | undefined,
        type: o.type as string | undefined,
      };
    }
    if (typeof item === 'string') {
      return { id: String(index), name: item };
    }
    return { id: String(index), name: String(item) };
  });
}

const CHARACTER_DATA_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: 'component_data.characters', label: '作品角色（设定 - component_data.characters）' },
  { value: 'characters', label: '作品角色（metadata.characters）' },
  { value: '', label: '仅本章已出现角色' },
];

interface ChapterSettingsModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  volumeId: string;
  volumeTitle: string;
  initialData?: Partial<ChapterData>;
  /** 仅从章节中出现的角色（备用） */
  availableCharacters?: Character[];
  /** 作品 metadata，用于按 dataKey 解析角色列表 */
  workMetadata?: Record<string, unknown>;
  /** 角色数据来源 key，如 'component_data.characters' 或 'characters'，空则用 availableCharacters */
  defaultCharacterDataKey?: string;
  availableLocations?: Location[];
  availableVolumes?: Volume[];
  /** 作品 ID（用于 AI 大纲生成） */
  workId?: string | null;
  /** 章节 ID（编辑时传入，用于 AI 大纲生成） */
  chapterId?: number;
  onClose: () => void;
  onSave: (data: ChapterData) => void;
  onGenerateContent?: (content: string, isFinal?: boolean) => void;
}

interface CharacterSelectionCardProps {
  character: Character;
  isSelected: boolean;
  onToggle: () => void;
}

function CharacterSelectionCard({ character, isSelected, onToggle }: CharacterSelectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`character-selection-card ${isSelected ? 'selected' : ''}`}>
      <div 
        className="card-header" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="header-left">
          <div 
            className="checkbox-wrapper"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            style={{ cursor: 'pointer', display: 'flex' }}
          >
            {isSelected ? (
              <div style={{ 
                width: '18px', 
                height: '18px', 
                background: 'var(--accent-primary)', 
                borderRadius: '4px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'white'
              }}>
                <Check size={12} strokeWidth={3} />
              </div>
            ) : (
              <div style={{ 
                width: '18px', 
                height: '18px', 
                border: '2px solid var(--border-color)', 
                borderRadius: '4px',
                background: 'var(--bg-secondary)'
              }} />
            )}
          </div>
          <span className="character-name">{character.name}</span>
          {character.gender && <span className="character-tag">{character.gender}</span>}
          {character.type && <span className="character-tag">{character.type}</span>}
        </div>
        
        <div className="header-right">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="card-content">
          {character.description && (
            <div className="detail-section">
              <div className="detail-title">简介</div>
              <div style={{ lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                {character.description}
              </div>
            </div>
          )}
          
          {character.appearance && Object.keys(character.appearance).length > 0 && (
            <div className="detail-section">
              <div className="detail-title">外貌</div>
              <div className="detail-grid">
                {Object.entries(character.appearance).map(([key, value]) => (
                  <div key={key} className="detail-row">
                    <span className="detail-key">{key}:</span>
                    <span className="detail-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {character.personality && Object.keys(character.personality).length > 0 && (
            <div className="detail-section">
              <div className="detail-title">性格</div>
              <div className="detail-grid">
                {Object.entries(character.personality).map(([key, value]) => (
                  <div key={key} className="detail-row">
                    <span className="detail-key">{key}:</span>
                    <span className="detail-value">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChapterSettingsModal({
  isOpen,
  mode,
  volumeId,
  volumeTitle,
  initialData,
  availableCharacters = [],
  workMetadata,
  defaultCharacterDataKey = 'component_data.characters',
  availableLocations = [],
  availableVolumes = [],
  workId,
  chapterId,
  onClose,
  onSave,
}: ChapterSettingsModalProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [chapterNumber, setChapterNumber] = useState<number | undefined>(undefined);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string>(volumeId);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [outline, setOutline] = useState('');
  const [detailOutline, setDetailOutline] = useState('');
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingDetail, setIsGeneratingDetail] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'outline' | 'characters'>('basic');
  /** 角色数据来源：空表示仅本章已出现；非空表示从 workMetadata 的该 key 取 */
  const [characterDataKey, setCharacterDataKey] = useState<string>(defaultCharacterDataKey);
  
  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
    toast?: boolean;
    autoCloseMs?: number;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({ isOpen: true, type, message, title, onConfirm });
  };

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };
  
  // 是否显示卷号选择器（编辑章节时）
  const showVolumeSelector = mode === 'edit';

  // 角色列表：可配置数据 key，优先从 work 的 metadata 对应 key 取，否则用本章已出现角色
  const charactersFromWork = workMetadata && characterDataKey
    ? getCharactersFromMetadata(workMetadata, characterDataKey)
    : [];
  const charactersToShow: Character[] =
    charactersFromWork.length > 0
      ? charactersFromWork
      : availableCharacters.length > 0
        ? availableCharacters
        : [];

  const locationsToShow: Location[] = availableLocations.length > 0 ? availableLocations : [];

  // 辅助函数：标准化选中的角色ID（处理 ID 变化或仅有 Name 的情况）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeSelectedCharacters = (savedIds: any[], available: Character[]): string[] => {
    if (!savedIds || savedIds.length === 0) return [];
    
    

    const normalized = savedIds.map(savedItem => {
      // 处理 savedItem 可能是对象的情况
      let lookupKey: string;
      if (typeof savedItem === 'object' && savedItem !== null) {
        lookupKey = savedItem.id ? String(savedItem.id) : (savedItem.name || '');
      } else {
        lookupKey = String(savedItem);
      }

      if (!lookupKey) return null;

      // 1. 直接匹配 ID
      const matchById = available.find(c => String(c.id) === lookupKey);
      if (matchById) return String(matchById.id);
      
      // 2. 尝试匹配 Name (兼容旧数据或无 ID 数据)
      const matchByName = available.find(c => c.name === lookupKey || c.display_name === lookupKey);
      if (matchByName) return String(matchByName.id);
      
      // 3. 如果是对象且有 name，尝试用 name 再次匹配（针对 lookupKey 是 ID 但没匹配上的情况）
      if (typeof savedItem === 'object' && savedItem.name) {
         const matchByObjName = available.find(c => c.name === savedItem.name);
         if (matchByObjName) return String(matchByObjName.id);
      }

      // 4. 如果都匹配不上，但 lookupKey 本身看起来像个 ID 或 Name，就先返回它
      // 但为了避免显示问题，如果它不在 available 里，可能不会显示选中状态
      return lookupKey;
    }).filter((id): id is string => id !== null);

    
    return normalized;
  };

  const ensureString = (val: unknown): string => {
    if (typeof val === 'string') return val;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        // ignore
        return String(val);
      }
    }
    return String(val);
  };

  /** 大纲：字符串直接返回，对象用可读格式（与续写预填一致） */
  const outlineForDisplay = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'object') return formatOutlineForEditor(val as Record<string, unknown>);
    return String(val);
  };

  /** 细纲：字符串直接返回，对象用可读格式（与续写预填一致） */
  const detailedOutlineForDisplay = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'object') return formatDetailedOutlineForEditor(val as Record<string, unknown>);
    return String(val);
  };

  // 同一章节在同一打开周期内只请求一次 document，避免 initialData 等依赖变化导致重复请求
  const lastFetchedChapterIdRef = useRef<string | null>(null);
  // 打开弹窗时的大纲/细纲快照，接口返回空时用其回退，避免“先显示后消失”
  const openOutlineRef = useRef<string>('');
  const openDetailOutlineRef = useRef<string>('');

  // 关闭弹窗时清空“已请求章节”，下次打开可重新拉取
  useEffect(() => {
    if (!isOpen) {
      lastFetchedChapterIdRef.current = null;
    }
  }, [isOpen]);

  // 每次打开模态框时重置标签页
  useEffect(() => {
    if (isOpen) {
      setActiveTab('basic');
    }
  }, [isOpen]);

  // 打开时同步角色数据 key 的默认值
  useEffect(() => {
    if (isOpen && defaultCharacterDataKey !== undefined) {
      setCharacterDataKey(defaultCharacterDataKey);
    }
  }, [isOpen, defaultCharacterDataKey]);

  // 初始化数据
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const initFromProps = () => {
          setTitle(ensureString(initialData.title));
          setChapterNumber(initialData.chapter_number);
          setSelectedVolumeId(initialData.volumeId || volumeId);
          setSelectedCharacters(normalizeSelectedCharacters(initialData.characters || [], availableCharacters || []));
          setLocations(initialData.locations || []);
          // 只有 initialData 里大纲/细纲非空时才写 state，避免 effect 重跑时用空串覆盖已显示内容
          const outlineVal = outlineForDisplay(initialData.outline);
          const detailVal = detailedOutlineForDisplay(initialData.detailOutline);
          if ((outlineVal || '').trim()) {
            openOutlineRef.current = outlineVal.trim();
            setOutline(outlineVal.trim());
          }
          if ((detailVal || '').trim()) {
            openDetailOutlineRef.current = detailVal.trim();
            setDetailOutline(detailVal.trim());
          }
        };

        if (mode === 'edit' && initialData.id) {
          const chapterIdStr = String(initialData.id);
          const alreadyFetched = lastFetchedChapterIdRef.current === chapterIdStr;

          // 先用人传进来的 initialData 填表，避免等接口时大纲区域先空再闪
          initFromProps();

          const fetchChapterInfo = async () => {
            try {
              const chapterId = Number(initialData.id);
              if (!isNaN(chapterId)) {
                if (alreadyFetched) {
                  return;
                }
                setIsLoading(true);
                lastFetchedChapterIdRef.current = chapterIdStr;
                const response = await chaptersApi.getChapterDocument(chapterId);
                
                const info = response.chapter_info;
                                
                setTitle(ensureString(info.title));
                setChapterNumber(info.chapter_number);
                setSelectedVolumeId(initialData.volumeId || volumeId);
                
                // 从 metadata 获取大纲和细纲
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const meta = (info.metadata || {}) as any;
                
                // 增强的数据获取逻辑：尝试从 metadata 或顶层字段获取
                let fetchedOutline = '';
                let fetchedDetail = '';

                // 1. 优先从 metadata 获取（对象时用可读格式，与续写预填一致）
                if (meta.outline !== undefined && meta.outline !== null) {
                  fetchedOutline = outlineForDisplay(meta.outline);
                }
                if (meta.detailed_outline !== undefined && meta.detailed_outline !== null) {
                  fetchedDetail = detailedOutlineForDisplay(meta.detailed_outline);
                }

                // 2. 如果 metadata 中没有，尝试从 info 顶层字段获取
                if (!fetchedOutline && (info as any).outline) { // eslint-disable-line @typescript-eslint/no-explicit-any
                  fetchedOutline = outlineForDisplay((info as any).outline); // eslint-disable-line @typescript-eslint/no-explicit-any
                }
                if (!fetchedDetail && (info as any).detailed_outline) { // eslint-disable-line @typescript-eslint/no-explicit-any
                  fetchedDetail = detailedOutlineForDisplay((info as any).detailed_outline); // eslint-disable-line @typescript-eslint/no-explicit-any
                }

                // 3. 如果 API 没有返回有效数据，回退到 initialData，再回退到打开时的快照
                if (!fetchedOutline) fetchedOutline = outlineForDisplay(initialData.outline) || openOutlineRef.current;
                if (!fetchedDetail) fetchedDetail = detailedOutlineForDisplay(initialData.detailOutline) || openDetailOutlineRef.current;

                // 4. 写回 state（优先接口，空则用打开时的快照，避免先显示后消失）
                const finalOutline = (fetchedOutline || '').trim() || openOutlineRef.current;
                const finalDetail = (fetchedDetail || '').trim() || openDetailOutlineRef.current;
                setOutline(finalOutline);
                setDetailOutline(finalDetail);
                if (finalOutline) openOutlineRef.current = finalOutline;
                if (finalDetail) openDetailOutlineRef.current = finalDetail;

                // 从 metadata.component_data 获取角色列表
                const componentData = meta.component_data || {};
                
                
                if (componentData.characters && Array.isArray(componentData.characters)) {
                  // 直接传递原始数组，由 normalizeSelectedCharacters 处理对象或字符串
                  setSelectedCharacters(normalizeSelectedCharacters(componentData.characters, availableCharacters || []));
                } else {
                  
                  setSelectedCharacters(normalizeSelectedCharacters(initialData.characters || [], availableCharacters || []));
                }

                if (componentData.locations && Array.isArray(componentData.locations)) {
                  const locs = componentData.locations.map((l: unknown) => String(l));
                  setLocations(locs);
                } else {
                  setLocations(initialData.locations || []);
                }
              } else {
                initFromProps();
              }
            } catch {
              // ignore
              initFromProps();
            } finally {
              setIsLoading(false);
            }
          };
          fetchChapterInfo();
        } else {
          initFromProps();
        }
      } else {
        // 新建章节时重置
        setTitle('');
        setChapterNumber(undefined);
        setSelectedVolumeId(volumeId);
        setSelectedCharacters([]);
        setLocations([]);
        setOutline('');
        setDetailOutline('');
      }
      // setActiveTab('basic'); // Moved to separate useEffect to prevent flickering on data update
    }
  }, [isOpen, initialData, volumeId, mode, availableCharacters]);

  const handleCharacterToggle = (characterId: string) => {
    setSelectedCharacters(prev => 
      prev.includes(characterId)
        ? prev.filter(id => id !== characterId)
        : [...prev, characterId]
    );
  };

  const handleAddLocation = () => {
    if (newLocation.trim() && !locations.includes(newLocation.trim())) {
      setLocations([...locations, newLocation.trim()]);
      setNewLocation('');
    }
  };

  const handleRemoveLocation = (location: string) => {
    setLocations(locations.filter(l => l !== location));
  };

  const handleSelectPresetLocation = (locationName: string) => {
    if (!locations.includes(locationName)) {
      setLocations([...locations, locationName]);
    }
  };

  const handleGenerateOutline = async () => {
    if (!workId) {
      showMessage('无法获取作品ID，请重新打开章节设置', 'warning');
      return;
    }
    setIsGeneratingOutline(true);
    try {
      const generated = await generateChapterOutline(workId, title || '新章节', 'outline', {
        chapterId,
        characters: selectedCharacters,
        locations,
      });
      setOutline(generated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      showMessage(`大纲生成失败：${msg}`, 'error');
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleGenerateDetailOutline = async () => {
    if (!workId) {
      showMessage('无法获取作品ID，请重新打开章节设置', 'warning');
      return;
    }
    setIsGeneratingDetail(true);
    try {
      const generated = await generateChapterOutline(workId, title || '新章节', 'detailed_outline', {
        chapterId,
        currentOutline: outline || undefined,
        characters: selectedCharacters,
        locations,
      });
      setDetailOutline(generated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      showMessage(`细纲生成失败：${msg}`, 'error');
    } finally {
      setIsGeneratingDetail(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) {
      showMessage('请输入章节名称', 'warning');
      return;
    }

    const selectedVolume = availableVolumes.find(v => v.id === selectedVolumeId);
    const finalVolumeId = selectedVolumeId;
    const finalVolumeTitle = selectedVolume?.title || volumeTitle;
    const finalVolumeNumber = selectedVolumeId.startsWith('vol') 
      ? parseInt(selectedVolumeId.replace('vol', '')) 
      : undefined;

    onSave({
      id: initialData?.id,
      title: title.trim(),
      volumeId: finalVolumeId,
      volumeTitle: finalVolumeTitle,
      volume_number: finalVolumeNumber,
      chapter_number: chapterNumber,
      characters: selectedCharacters,
      locations,
      outline,
      detailOutline,
    });
    onClose();
  };


  if (!isOpen) return null;

  return (
    <div className="chapter-modal-overlay" onClick={onClose}>
      <div className="chapter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chapter-modal-header">
          <div className="modal-header-content">
            <BookOpen size={20} />
            <h2>{mode === 'create' ? '新建章节' : '编辑章节'}</h2>
            <span className="volume-badge">{volumeTitle}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="chapter-modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            <FileText size={16} />
            <span>基本信息</span>
          </button>
          <button
            className={`modal-tab ${activeTab === 'outline' ? 'active' : ''}`}
            onClick={() => setActiveTab('outline')}
          >
            <BookOpen size={16} />
            <span>大纲细纲</span>
          </button>
          <button
            className={`modal-tab ${activeTab === 'characters' ? 'active' : ''}`}
            onClick={() => setActiveTab('characters')}
          >
            <Users size={16} />
            <span>角色信息</span>
          </button>
        </div>

        <div className="chapter-modal-content">
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
              <LoadingSpinner message="正在加载章节信息..." />
            </div>
          )}
          {!isLoading && activeTab === 'basic' && (
            <div className="modal-section-content">
              {/* 章节名称 */}
              <div className="form-group">
                <label className="form-label">
                  <FileText size={16} />
                  章节名称
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="请输入章节名称，如：第1章 初遇"
                  autoFocus
                />
              </div>

              <div className="form-row">
                {/* 卷号选择器 - 只在长篇作品编辑章节时显示 */}
                {showVolumeSelector && (
                  <div className="form-group half">
                    <label className="form-label">
                      <BookOpen size={16} />
                      所属卷
                    </label>
                    <div className="select-wrapper">
                      <select
                        className="form-select"
                        value={selectedVolumeId}
                        onChange={(e) => setSelectedVolumeId(e.target.value)}
                      >
                        {availableVolumes.map(vol => (
                          <option key={vol.id} value={vol.id}>
                            {vol.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="select-arrow" size={16} />
                    </div>
                  </div>
                )}

                {/* 章节序号 */}
                <div className={`form-group ${showVolumeSelector ? 'half' : ''}`}>
                  <label className="form-label">
                    <span className="hashtag-icon">#</span>
                    章节序号
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={chapterNumber || ''}
                    onChange={(e) => setChapterNumber(parseInt(e.target.value) || undefined)}
                    placeholder="自动生成"
                  />
                  <div className="form-hint">留空则自动顺延</div>
                </div>
              </div>

              {/* 地点设置 */}
              <div className="form-group">
                <label className="form-label">
                  <MapPin size={16} />
                  相关地点
                </label>
                
                <div className="location-input-group">
                  <input
                    type="text"
                    className="form-input"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLocation();
                      }
                    }}
                    placeholder="输入地点名称按回车添加"
                  />
                  <button 
                    type="button"
                    className="icon-btn add-location-btn"
                    onClick={handleAddLocation}
                    disabled={!newLocation.trim()}
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {/* 已选地点标签 */}
                {locations.length > 0 && (
                  <div className="location-tags">
                    {locations.map((loc, index) => (
                      <span key={index} className="location-tag">
                        <MapPin size={12} />
                        {loc}
                        <button 
                          className="tag-remove-btn"
                          onClick={() => handleRemoveLocation(loc)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* 推荐地点 */}
                {locationsToShow.length > 0 && (
                  <div className="suggested-locations">
                    <span className="suggestion-label">推荐：</span>
                    <div className="suggestion-list">
                      {locationsToShow
                        .filter(l => !locations.includes(l.name))
                        .slice(0, 5)
                        .map(loc => (
                          <button
                            key={loc.id}
                            className="suggestion-chip"
                            onClick={() => handleSelectPresetLocation(loc.name)}
                          >
                            {loc.name}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isLoading && activeTab === 'outline' && (
            <div className="modal-section-content">
              <div className="form-group">
                <div className="label-with-action">
                  <label className="form-label">
                    <BookOpen size={16} />
                    章节大纲
                  </label>
                  <button 
                    className="icon-btn"
                    onClick={handleGenerateOutline}
                    disabled={isGeneratingOutline}
                    title="AI生成大纲"
                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6' }}
                  >
                    {isGeneratingOutline ? (
                      <span className="loading-spinner small" style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'block', animation: 'spin 1s linear infinite' }}></span>
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </button>
                </div>
                <textarea
                  className="form-textarea outline-textarea"
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="在此输入本章的故事梗概..."
                  rows={6}
                />
              </div>

              <div className="form-group">
                <div className="label-with-action">
                  <label className="form-label">
                    <FileText size={16} />
                    详细细纲
                  </label>
                  <button 
                    className="icon-btn"
                    onClick={handleGenerateDetailOutline}
                    disabled={isGeneratingDetail}
                    title="AI生成细纲"
                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6' }}
                  >
                    {isGeneratingDetail ? (
                      <span className="loading-spinner small" style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'block', animation: 'spin 1s linear infinite' }}></span>
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </button>
                </div>
                <textarea
                  className="form-textarea detail-textarea"
                  value={detailOutline}
                  onChange={(e) => setDetailOutline(e.target.value)}
                  placeholder="在此输入详细的场景描写、对话要点等..."
                  rows={10}
                />
              </div>

              {/* 生成内容按钮 */}
              {/* {onGenerateContent && (
                <div className="form-group">
                  <button
                    className="icon-btn"
                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#3b82f6' }}
                    title={isGeneratingContent ? '生成中...' : '根据大纲和细纲生成章节内容'}
                    disabled={isGeneratingContent || !outline.trim() || !detailOutline.trim()}
                    onClick={async () => {
                      if (!outline.trim() || !detailOutline.trim()) {
                        showMessage('请先填写大纲和细纲', 'warning');
                        return;
                      }
                      setIsGeneratingContent(true);
                      try {
                        const { generateChapterContent } = await import('../../utils/bookAnalysisApi');
                        let fullContent = '';

                        await generateChapterContent(
                          outline,
                          detailOutline,
                          title || undefined,
                          selectedCharacters.map(id => {
                            const char = availableCharacters.find(c => c.id === id);
                            return char?.name || id;
                          }),
                          locations,
                          // 流式回调：每次追加新片段，并实时通知外层填充到编辑器
                          (progress) => {
                            if (progress.text) {
                              fullContent += progress.text;
                              // 过程中不断把当前完整内容推送给外层，实时更新界面
                              onGenerateContent(fullContent, false);
                            }
                            if (progress.status === 'done') {
                              // 结束时再推送一次，标记为最终内容，方便外层做保存等处理
                              onGenerateContent(fullContent, true);
                            }
                          },
                          {
                            // 可根据需要传入模型等设置，这里先使用默认配置
                          },
                        );

                        showToast('章节内容生成完成！已流式填充到编辑器中。');
                        onClose();
                      } catch (error) {

                        showMessage(parseError(error), 'error', '生成失败');
                      } finally {
                        setIsGeneratingContent(false);
                      }
                    }}
                  >
                    {isGeneratingContent ? (
                      <span className="loading-spinner small" style={{ width: '16px', height: '16px', border: '2px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'block', animation: 'spin 1s linear infinite' }}></span>
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </button>
                </div>
              )} */}
            </div>
          )}

          {!isLoading && activeTab === 'characters' && (
            <div className="modal-section-content">
              {workMetadata && (
                <div className="form-group character-data-key-group">
                  <label className="form-label">
                    <Users size={16} />
                    角色数据来源
                  </label>
                  <div className="select-wrapper">
                    <select
                      className="form-select"
                      value={characterDataKey}
                      onChange={(e) => setCharacterDataKey(e.target.value)}
                      title="选择从作品设定中读取角色列表的数据 key"
                    >
                      {CHARACTER_DATA_KEY_OPTIONS.map((opt) => (
                        <option key={opt.value || 'empty'} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="select-arrow" size={16} />
                  </div>
                  <div className="form-hint">
                    选择「作品角色」可看到作品设定中的全部角色并勾选本章出场角色
                  </div>
                </div>
              )}
              {charactersToShow.length > 0 ? (
                <div className="character-selection-grid">
                  {charactersToShow.map(char => (
                    <CharacterSelectionCard
                      key={char.id}
                      character={char}
                      isSelected={selectedCharacters.includes(String(char.id))}
                      onToggle={() => handleCharacterToggle(String(char.id))}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Users size={48} />
                  <p>暂无可用角色</p>
                  <span className="empty-hint">
                    {workMetadata
                      ? '请在上方选择「作品角色」数据来源，或在作品信息/角色管理中添加角色'
                      : '请先在角色管理中添加角色'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="chapter-modal-footer">
          <button className="modal-btn cancel" onClick={onClose}>
            取消
          </button>
          <div className="footer-spacer" />
          <button className="modal-btn save" onClick={handleSave}>
            {mode === 'create' ? '创建章节' : '保存修改'}
          </button>
        </div>

        <MessageModal
          isOpen={messageState.isOpen}
          onClose={closeMessage}
          title={messageState.title}
          message={messageState.message}
          type={messageState.type}
          toast={messageState.toast}
          autoCloseMs={messageState.autoCloseMs}
          onConfirm={() => {
            closeMessage();
            if (messageState.onConfirm) messageState.onConfirm();
          }}
        />
      </div>
    </div>
  );
}


