import { useState, useEffect } from 'react';
import { X, Sparkles, Plus, MapPin, Users, FileText, BookOpen, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { chaptersApi } from '../../utils/chaptersApi';
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

interface ChapterSettingsModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  volumeId: string;
  volumeTitle: string;
  initialData?: Partial<ChapterData>;
  availableCharacters?: Character[];
  availableLocations?: Location[];
  availableVolumes?: Volume[]; // 可用的卷列表
  onClose: () => void;
  onSave: (data: ChapterData) => void;
  // content: 当前已生成的完整文本；isFinal: 是否为最终完成（可用于结束后保存等）
  onGenerateContent?: (content: string, isFinal?: boolean) => void;  // 生成内容回调（支持流式）
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
  availableLocations = [],
  availableVolumes = [],
  onClose,
  onSave,
  // onGenerateContent,
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
  
  // 是否显示卷号选择器（编辑章节时）
  const showVolumeSelector = mode === 'edit';

  // 使用传入的角色数据，如果没有则使用空数组
  const charactersToShow: Character[] = availableCharacters.length > 0 ? availableCharacters : [];
  
  // 使用传入的地点数据，如果没有则使用空数组
  const locationsToShow: Location[] = availableLocations.length > 0 ? availableLocations : [];

  // 辅助函数：标准化选中的角色ID（处理 ID 变化或仅有 Name 的情况）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeSelectedCharacters = (savedIds: any[], available: Character[]): string[] => {
    if (!savedIds || savedIds.length === 0) return [];
    
    console.log('🔄 [ChapterSettingsModal] Normalizing characters:', { savedIds, availableCount: available.length });

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

    console.log('✅ [ChapterSettingsModal] Normalized result:', normalized);
    return normalized;
  };

  const ensureString = (val: unknown): string => {
    if (typeof val === 'string') return val;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val, null, 2);
      } catch (e) {
        console.warn('Failed to stringify object:', e);
        return String(val);
      }
    }
    return String(val);
  };

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
          setOutline(ensureString(initialData.outline));
          setDetailOutline(ensureString(initialData.detailOutline));
        };

        if (mode === 'edit' && initialData.id) {
          const fetchChapterInfo = async () => {
            try {
              setIsLoading(true);
              const chapterId = Number(initialData.id);
              if (!isNaN(chapterId)) {
                const response = await chaptersApi.getChapterDocument(chapterId);
                console.log('📝 [ChapterSettingsModal] Fetched chapter info:', response);
                const info = response.chapter_info;
                console.log('📝 [ChapterSettingsModal] Chapter info details:', {
                  title: info.title,
                  outline: info.outline,
                  detailed_outline: info.detailed_outline,
                  metadata: info.metadata
                });
                
                setTitle(ensureString(info.title));
                setChapterNumber(info.chapter_number);
                setSelectedVolumeId(initialData.volumeId || volumeId);
                
                // 从 metadata 获取大纲和细纲
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const meta = (info.metadata || {}) as any;
                
                // 增强的数据获取逻辑：尝试从 metadata 或顶层字段获取
                let fetchedOutline = '';
                let fetchedDetail = '';

                // 1. 优先从 metadata 获取
                if (meta.outline) {
                  fetchedOutline = ensureString(meta.outline);
                }
                
                if (meta.detailed_outline) {
                  fetchedDetail = ensureString(meta.detailed_outline);
                }

                // 2. 如果 metadata 中没有，尝试从 info 顶层字段获取
                // 注意：虽然类型定义为 Record，但后端可能返回字符串，或者我们在运行时应该兼容处理
                if (!fetchedOutline && (info as any).outline) { // eslint-disable-line @typescript-eslint/no-explicit-any
                  const rawOutline = (info as any).outline; // eslint-disable-line @typescript-eslint/no-explicit-any
                  if (typeof rawOutline === 'string') {
                    fetchedOutline = rawOutline;
                  }
                }

                if (!fetchedDetail && (info as any).detailed_outline) { // eslint-disable-line @typescript-eslint/no-explicit-any
                  const rawDetail = (info as any).detailed_outline; // eslint-disable-line @typescript-eslint/no-explicit-any
                  if (typeof rawDetail === 'string') {
                    fetchedDetail = rawDetail;
                  }
                }

                // 3. 如果 API 没有返回有效数据，回退到 initialData
                if (!fetchedOutline) fetchedOutline = ensureString(initialData.outline);
                if (!fetchedDetail) fetchedDetail = ensureString(initialData.detailOutline);
                
                setOutline(fetchedOutline);
                setDetailOutline(fetchedDetail);
                
                // 从 metadata.component_data 获取角色列表
                const componentData = meta.component_data || {};
                console.log('📦 [ChapterSettingsModal] Metadata component_data:', componentData);
                
                if (componentData.characters && Array.isArray(componentData.characters)) {
                  // 直接传递原始数组，由 normalizeSelectedCharacters 处理对象或字符串
                  setSelectedCharacters(normalizeSelectedCharacters(componentData.characters, availableCharacters || []));
                } else {
                  console.log('⚠️ [ChapterSettingsModal] No characters in component_data, falling back to initialData');
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
            } catch (error) {
              console.error('Failed to fetch chapter info:', error);
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
      setActiveTab('basic');
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
    setIsGeneratingOutline(true);
    // 模拟 AI 生成
    setTimeout(() => {
      const generated = `【AI生成大纲】
本章主要情节：
1. 主角面临新的挑战
2. 与关键人物的对话与冲突
3. 发现重要线索，推动故事发展

核心冲突：内心矛盾与外部压力的交织
情感基调：紧张中带有希望`;
      setOutline(generated);
      setIsGeneratingOutline(false);
    }, 1500);
  };

  const handleGenerateDetailOutline = async () => {
    setIsGeneratingDetail(true);
    // 模拟 AI 生成
    setTimeout(() => {
      const generated = `【AI生成细纲】
场景一（开场）：
- 时间：清晨
- 地点：主角住所
- 情节：主角醒来，回忆昨日事件
- 对话要点：内心独白，展现困惑

场景二（发展）：
- 地点：城市街道
- 情节：偶遇关键人物
- 对话要点：信息交换，伏笔铺设
- 情绪：好奇转为警惕

场景三（高潮）：
- 地点：神秘场所
- 情节：发现重要线索
- 转折点：认知颠覆
- 悬念设置：为下一章埋下伏笔`;
      setDetailOutline(generated);
      setIsGeneratingDetail(false);
    }, 1500);
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
                    className={`ai-generate-btn ${isGeneratingOutline ? 'loading' : ''}`}
                    onClick={handleGenerateOutline}
                    disabled={isGeneratingOutline}
                  >
                    <Sparkles size={14} />
                    {isGeneratingOutline ? '生成中...' : 'AI 生成大纲'}
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
                    className={`ai-generate-btn ${isGeneratingDetail ? 'loading' : ''}`}
                    onClick={handleGenerateDetailOutline}
                    disabled={isGeneratingDetail}
                  >
                    <Sparkles size={14} />
                    {isGeneratingDetail ? '生成中...' : 'AI 生成细纲'}
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

                        showMessage('章节内容生成完成！已流式填充到编辑器中。', 'success', '生成完成', onClose);
                      } catch (error) {
                        console.error('生成内容失败:', error);
                        showMessage(error instanceof Error ? error.message : '生成内容失败', 'error');
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
                  <span className="empty-hint">请先在角色管理中添加角色</span>
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
          onConfirm={() => {
            closeMessage();
            if (messageState.onConfirm) messageState.onConfirm();
          }}
        />
      </div>
    </div>
  );
}


