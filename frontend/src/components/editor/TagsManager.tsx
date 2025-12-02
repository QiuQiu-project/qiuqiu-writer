import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import './TagsManager.css';

interface TagCategory {
  name: string;
  limit: number;
  tags: string[];
}

const tagCategories: TagCategory[] = [
  {
    name: '题材',
    limit: 1,
    tags: [
      '言情', '现实情感', '悬疑', '惊悚', '科幻', '武侠', '脑洞', '太空歌剧',
      '赛博朋克', '游戏', '仙侠', '历史', '玄幻', '奇幻', '都市', '军事',
      '电竞', '体育', '现实', '诸天无限', '快穿'
    ],
  },
  {
    name: '情节',
    limit: 3,
    tags: [
      '权谋', '出轨', '婚姻', '家庭', '校园', '职场', '娱乐圈', '重生',
      '穿越', '犯罪', '丧尸', '探险', '宫斗宅斗', '克苏鲁', '系统', '规则怪谈',
      '团宠', '囤物资', '先婚后爱', '追妻火葬场', '破镜重圆', '争霸', '超能力/异能',
      '玄学风水', '种田', '直播', '萌宝', '美食', '鉴宝', '聊天群', '卡牌', '弹幕'
    ],
  },
  {
    name: '情绪',
    limit: 3,
    tags: [
      '纯爱', 'HE', 'BE', '甜宠', '虐恋', '暗恋', '先虐后甜', '沙雕',
      '爽文', '复仇', '反转', '逆袭', '励志', '烧脑', '热血', '求生',
      '打脸', '多视角反转', '治愈', '反套路', '搞笑吐槽', '无CP'
    ],
  },
  {
    name: '时空',
    limit: 1,
    tags: ['古代', '现代', '未来', '架空', '民国'],
  },
];

export default function TagsManager() {
  const [selectedTags, setSelectedTags] = useState<Record<string, string[]>>({
    题材: [],
    情节: [],
    情绪: [],
    时空: [],
  });
  const [textInfo, setTextInfo] = useState('');
  const [background, setBackground] = useState('');
  const [factions, setFactions] = useState<Array<{ id: string; name: string; levels: string[]; summary?: string; details?: string }>>([]);
  const [editingFaction, setEditingFaction] = useState<string | null>(null);
  const [factionForm, setFactionForm] = useState<{ name: string; levels: string[]; summary: string; details: string }>({ name: '', levels: [], summary: '', details: '' });
  const [newLevel, setNewLevel] = useState('');

  const handleTagSelect = (category: string, tag: string) => {
    const current = selectedTags[category] || [];
    const limit = tagCategories.find((c) => c.name === category)?.limit || 0;

    if (current.includes(tag)) {
      // 如果已选中，则移除
      setSelectedTags({
        ...selectedTags,
        [category]: current.filter((t) => t !== tag),
      });
    } else if (current.length < limit) {
      // 如果未选中且未达到限制，则添加
      setSelectedTags({
        ...selectedTags,
        [category]: [...current, tag],
      });
    }
  };

  const removeTag = (category: string, tag: string) => {
    const current = selectedTags[category] || [];
    setSelectedTags({
      ...selectedTags,
      [category]: current.filter((t) => t !== tag),
    });
  };

  return (
    <div className="tags-manager">
      <h2 className="tags-title">设定</h2>
      <div className="tags-content">
        {tagCategories.map((category) => {
          const selected = selectedTags[category.name] || [];
          const count = selected.length;
          const limit = category.limit;
          const availableTags = category.tags.filter((tag) => !selected.includes(tag));
          const isLimitReached = count >= limit;

          return (
            <div key={category.name} className="tag-category">
              <div className="category-header">
                <h3 className="category-name">{category.name}</h3>
                <span className="category-count">
                  {count}/{limit}
                </span>
              </div>
              <div className="tags-select-wrapper">
                {selected.length > 0 && (
                  <div className="selected-tags-display">
                    {selected.map((tag) => (
                      <span key={tag} className="selected-tag">
                        {tag}
                        <button
                          className="remove-tag-btn"
                          onClick={() => removeTag(category.name, tag)}
                          title="移除"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {!isLimitReached && (
                  <div className="tags-checkbox-list">
                    {availableTags.map((tag) => (
                      <label key={tag} className="tag-checkbox-item">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleTagSelect(category.name, tag)}
                          disabled={isLimitReached}
                        />
                        <span>{tag}</span>
                      </label>
                    ))}
                  </div>
                )}
                {isLimitReached && (
                  <div className="tags-limit-reached">
                    已达到选择上限（{limit}个）
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 文本信息 */}
        <div className="tag-category">
          <div className="category-header">
            <h3 className="category-name">文本信息</h3>
          </div>
          <textarea
            className="info-textarea"
            value={textInfo}
            onChange={(e) => setTextInfo(e.target.value)}
            placeholder="输入文本信息..."
            rows={4}
          />
        </div>

        {/* 背景 */}
        <div className="tag-category">
          <div className="category-header">
            <h3 className="category-name">背景</h3>
          </div>
          <textarea
            className="info-textarea"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="输入背景信息..."
            rows={4}
          />
        </div>

        {/* 等级体系 */}
        <div className="tag-category">
          <div className="category-header">
            <h3 className="category-name">等级体系</h3>
            <button
              className="btn btn-add"
              onClick={() => {
                const newFaction = {
                  id: String(Date.now()),
                  name: '新等级体系',
                  levels: [],
                  summary: '',
                  details: '',
                };
                setFactions([...factions, newFaction]);
                setEditingFaction(newFaction.id);
                setFactionForm({ name: '新等级体系', levels: [], summary: '', details: '' });
              }}
              title="添加等级体系"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="factions-list">
            {factions.length === 0 ? (
              <div className="empty-factions">暂无等级体系，点击上方 + 按钮添加</div>
            ) : (
              factions.map((faction) => (
                <div key={faction.id} className="faction-item">
                  {editingFaction === faction.id ? (
                    <div className="faction-edit-form">
                      <input
                        type="text"
                        className="faction-name-input"
                        value={factionForm.name}
                        onChange={(e) => setFactionForm({ ...factionForm, name: e.target.value })}
                        placeholder="等级体系名称"
                        autoFocus
                      />
                      <div className="faction-levels-section">
                        <div className="levels-header">
                          <span className="levels-title">等级阶梯</span>
                          <div className="add-level-input">
                            <input
                              type="text"
                              value={newLevel}
                              onChange={(e) => setNewLevel(e.target.value)}
                              placeholder="输入等级名称"
                              onKeyPress={(e) => {
                                if (e.key === 'Enter' && newLevel.trim()) {
                                  setFactionForm({
                                    ...factionForm,
                                    levels: [...factionForm.levels, newLevel.trim()],
                                  });
                                  setNewLevel('');
                                }
                              }}
                            />
                            <button
                              className="btn btn-icon btn-icon-sm btn-primary"
                              onClick={() => {
                                if (newLevel.trim()) {
                                  setFactionForm({
                                    ...factionForm,
                                    levels: [...factionForm.levels, newLevel.trim()],
                                  });
                                  setNewLevel('');
                                }
                              }}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="levels-list">
                          {factionForm.levels.map((level, index) => (
                            <div key={index} className="level-item">
                              <span className="level-order">{index + 1}</span>
                              <span className="level-name">{level}</span>
                              <button
                                className="btn btn-icon btn-icon-sm btn-danger-outline"
                                onClick={() => {
                                  setFactionForm({
                                    ...factionForm,
                                    levels: factionForm.levels.filter((_, i) => i !== index),
                                  });
                                }}
                                title="删除"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          {factionForm.levels.length === 0 && (
                            <div className="empty-levels">暂无等级，在上方输入框中添加</div>
                          )}
                        </div>
                      </div>
                      <div className="faction-info-section">
                        <label className="faction-info-label">
                          <span>等级体系简述</span>
                          <textarea
                            className="faction-info-textarea"
                            value={factionForm.summary}
                            onChange={(e) => setFactionForm({ ...factionForm, summary: e.target.value })}
                            placeholder="输入等级体系简述..."
                            rows={3}
                          />
                        </label>
                        <label className="faction-info-label">
                          <span>详细信息</span>
                          <textarea
                            className="faction-info-textarea"
                            value={factionForm.details}
                            onChange={(e) => setFactionForm({ ...factionForm, details: e.target.value })}
                            placeholder="输入详细信息..."
                            rows={5}
                          />
                        </label>
                      </div>
                      <div className="faction-actions">
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            setFactions(
                              factions.map((f) =>
                                f.id === faction.id
                                  ? { 
                                      ...f, 
                                      name: factionForm.name, 
                                      levels: factionForm.levels,
                                      summary: factionForm.summary,
                                      details: factionForm.details,
                                    }
                                  : f
                              )
                            );
                            setEditingFaction(null);
                            setFactionForm({ name: '', levels: [], summary: '', details: '' });
                            setNewLevel('');
                          }}
                        >
                          保存
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setEditingFaction(null);
                            setFactionForm({ name: '', levels: [], summary: '', details: '' });
                            setNewLevel('');
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="faction-display">
                      <div className="faction-name-display">{faction.name}</div>
                      {faction.levels.length > 0 && (
                        <div className="faction-levels-display">
                          {faction.levels.map((level, index) => (
                            <div key={index} className="level-badge">
                              <span className="level-order-small">{index + 1}</span>
                              <span>{level}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {faction.summary && (
                        <div className="faction-summary-display">
                          <span className="faction-info-label-text">简述：</span>
                          <p className="faction-info-text">{faction.summary}</p>
                        </div>
                      )}
                      {faction.details && (
                        <div className="faction-details-display">
                          <span className="faction-info-label-text">详细信息：</span>
                          <p className="faction-info-text">{faction.details}</p>
                        </div>
                      )}
                      <div className="faction-actions-display">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setEditingFaction(faction.id);
                            setFactionForm({ 
                              name: faction.name, 
                              levels: [...faction.levels],
                              summary: faction.summary || '',
                              details: faction.details || '',
                            });
                          }}
                          title="编辑"
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-icon btn-icon-sm btn-danger-outline"
                          onClick={() => {
                            setFactions(factions.filter((f) => f.id !== faction.id));
                          }}
                          title="删除"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
