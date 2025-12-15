import { useState, useEffect } from 'react';
import { X, Sparkles, Plus, MapPin, Users, FileText, BookOpen } from 'lucide-react';
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
  characters: string[]; // 人物 ID 列表
  locations: string[]; // 地点列表
  outline: string;
  detailOutline: string;
}

interface ChapterSettingsModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  volumeId: string;
  volumeTitle: string;
  initialData?: Partial<ChapterData>;
  availableCharacters?: Character[];
  availableLocations?: Location[];
  onClose: () => void;
  onSave: (data: ChapterData) => void;
  onGenerateOutline?: () => string;
  onGenerateDetailOutline?: () => string;
  onGenerateContent?: (content: string) => void;  // 生成内容回调
}

export default function ChapterSettingsModal({
  isOpen,
  mode,
  volumeId,
  volumeTitle,
  initialData,
  availableCharacters = [],
  availableLocations = [],
  onClose,
  onSave,
  onGenerateOutline,
  onGenerateDetailOutline,
  onGenerateContent,
}: ChapterSettingsModalProps) {
  const [title, setTitle] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [outline, setOutline] = useState('');
  const [detailOutline, setDetailOutline] = useState('');
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingDetail, setIsGeneratingDetail] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'outline'>('basic');

  // 使用传入的角色数据，如果没有则使用空数组
  const charactersToShow: Character[] = availableCharacters.length > 0 ? availableCharacters : [];
  
  // 使用传入的地点数据，如果没有则使用空数组
  const locationsToShow: Location[] = availableLocations.length > 0 ? availableLocations : [];

  // 初始化数据
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        console.log('📝 [ChapterSettingsModal] 初始化数据:', {
          hasInitialData: !!initialData,
          title: initialData.title,
          outline: initialData.outline,
          detailOutline: initialData.detailOutline,
          outlineLength: initialData.outline?.length || 0,
          detailOutlineLength: initialData.detailOutline?.length || 0,
        });
        setTitle(initialData.title || '');
        setSelectedCharacters(initialData.characters || []);
        setLocations(initialData.locations || []);
        setOutline(initialData.outline || '');
        setDetailOutline(initialData.detailOutline || '');
      } else {
        // 新建章节时重置
        console.log('📝 [ChapterSettingsModal] 新建章节，重置数据');
        setTitle('');
        setSelectedCharacters([]);
        setLocations([]);
        setOutline('');
        setDetailOutline('');
      }
      setActiveTab('basic');
    }
  }, [isOpen, initialData]);

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
      alert('请输入章节名称');
      return;
    }

    onSave({
      id: initialData?.id,
      title: title.trim(),
      volumeId,
      volumeTitle,
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
          {activeTab === 'basic' && (
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

          {activeTab === 'outline' && (
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
                        const content = await generateChapterContent(
                          outline,
                          detailOutline,
                          title || undefined,
                          selectedCharacters.map(id => {
                            const char = availableCharacters.find(c => c.id === id);
                            return char?.name || id;
                          }),
                          locations,
                          (progress) => {
                            console.log('生成进度:', progress);
                          }
                        );
                        onGenerateContent(content);
                        alert('章节内容生成完成！已填充到编辑器中。');
                        onClose(); // 关闭弹窗
                      } catch (error) {
                        console.error('生成内容失败:', error);
                        alert(error instanceof Error ? error.message : '生成内容失败');
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
          <button className="modal-btn save" onClick={handleSave}>
            {mode === 'create' ? '创建章节' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}

