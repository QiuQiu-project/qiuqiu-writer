import { useState, useEffect } from 'react';
import { X, Sparkles, Plus, MapPin, Users, FileText, BookOpen } from 'lucide-react';
import { chaptersApi } from '../../utils/chaptersApi';
import LoadingSpinner from '../common/LoadingSpinner';
import MessageModal from '../common/MessageModal';
import type { MessageType } from '../common/MessageModal';
import './ChapterSettingsModal.css';

interface Character {
  id: string;
  name: string;
  avatar?: string;
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
  onGenerateContent,
}: ChapterSettingsModalProps) {
  const [title, setTitle] = useState('');
  const [chapterNumber, setChapterNumber] = useState<number | undefined>(undefined);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string>(volumeId);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [outline, setOutline] = useState('');
  const [detailOutline, setDetailOutline] = useState('');
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingDetail, setIsGeneratingDetail] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'outline'>('basic');
  
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
          setSelectedCharacters(initialData.characters || []);
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
                const meta = info.metadata || {};
                
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
                
                // 保持 initialData 中的其他字段
                setSelectedCharacters(initialData.characters || []);
                setLocations(initialData.locations || []);
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
  }, [isOpen, initialData, volumeId, mode]);

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
        </div>

        <div className="chapter-modal-body">
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

              {/* 卷号选择器 - 只在长篇作品编辑章节时显示 */}
              {showVolumeSelector && (
                <div className="form-group">
                  <label className="form-label">
                    <BookOpen size={16} />
                    所属卷
                  </label>
                  <select
                    className="form-input"
                    value={selectedVolumeId}
                    onChange={(e) => setSelectedVolumeId(e.target.value)}
                  >
                    {availableVolumes.map(vol => (
                      <option key={vol.id} value={vol.id}>
                        {vol.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 章节号 - 只在编辑章节时显示 */}
              {mode === 'edit' && (
                <div className="form-group">
                  <label className="form-label">
                    <FileText size={16} />
                    章节号
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={chapterNumber ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setChapterNumber(value === '' ? undefined : parseInt(value, 10));
                    }}
                    placeholder="请输入章节号"
                    min="1"
                  />
                </div>
              )}

              {/* 出场人物 - 只在有角色设定时显示 */}
              {charactersToShow.length > 0 && (
                <div className="form-group">
                  <label className="form-label">
                    <Users size={16} />
                    出场人物
                  </label>
                  <div className="character-grid">
                    {charactersToShow.map(char => (
                      <button
                        key={char.id}
                        className={`character-chip ${selectedCharacters.includes(char.id) ? 'selected' : ''}`}
                        onClick={() => handleCharacterToggle(char.id)}
                      >
                        <span className="character-avatar">{char.name[0]}</span>
                        <span>{char.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 剧情地点 - 只在有地点设定时显示 */}
              {locationsToShow.length > 0 && (
                <div className="form-group">
                  <label className="form-label">
                    <MapPin size={16} />
                    剧情地点
                  </label>
                  <div className="location-input-row">
                    <input
                      type="text"
                      className="form-input location-input"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="输入地点名称"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()}
                    />
                    <button className="add-location-btn" onClick={handleAddLocation}>
                      <Plus size={16} />
                      添加
                    </button>
                  </div>
                  {/* 预设地点 */}
                  <div className="preset-locations">
                    <span className="preset-label">快速选择：</span>
                    {locationsToShow.map(loc => (
                      <button
                        key={loc.id}
                        className={`preset-location-chip ${locations.includes(loc.name) ? 'selected' : ''}`}
                        onClick={() => handleSelectPresetLocation(loc.name)}
                      >
                        {loc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 已选地点 */}
              {locations.length > 0 && (
                <div className="form-group">
                  <div className="selected-locations">
                    {locations.map(loc => (
                      <span key={loc} className="location-tag">
                        <MapPin size={12} />
                        {loc}
                        <button
                          className="remove-location-btn"
                          onClick={() => handleRemoveLocation(loc)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && activeTab === 'outline' && (
            <div className="modal-section-content">
              {/* 大纲 */}
              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label">
                    <FileText size={16} />
                    大纲
                  </label>
                  <button
                    className={`ai-generate-btn ${isGeneratingOutline ? 'generating' : ''}`}
                    onClick={handleGenerateOutline}
                    disabled={isGeneratingOutline}
                  >
                    <Sparkles size={14} />
                    <span>{isGeneratingOutline ? '生成中...' : 'AI生成'}</span>
                  </button>
                </div>
                <textarea
                  className="form-textarea"
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="在这里编写本章大纲，概括主要情节走向、核心事件..."
                  rows={8}
                />
              </div>

              {/* 细纲 */}
              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label">
                    <FileText size={16} />
                    细纲
                  </label>
                  <button
                    className={`ai-generate-btn ${isGeneratingDetail ? 'generating' : ''}`}
                    onClick={handleGenerateDetailOutline}
                    disabled={isGeneratingDetail}
                  >
                    <Sparkles size={14} />
                    <span>{isGeneratingDetail ? '生成中...' : 'AI生成'}</span>
                  </button>
                </div>
                <textarea
                  className="form-textarea detail"
                  value={detailOutline}
                  onChange={(e) => setDetailOutline(e.target.value)}
                  placeholder="在这里编写本章细纲，详细描述每个场景、对话要点、情绪转折..."
                  rows={12}
                />
              </div>

              {/* 生成内容按钮 */}
              {onGenerateContent && (
                <div className="form-group">
                  <button
                    className={`ai-generate-content-btn ${isGeneratingContent ? 'generating' : ''}`}
                    onClick={async () => {
                      if (!outline.trim() || !detailOutline.trim()) {
                        alert('请先填写大纲和细纲');
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
                    disabled={isGeneratingContent || !outline.trim() || !detailOutline.trim()}
                  >
                    <Sparkles size={16} />
                    <span>{isGeneratingContent ? '生成中...' : '根据大纲和细纲生成章节内容'}</span>
                  </button>
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


