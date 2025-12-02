import { useState } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, X, Users } from 'lucide-react';
import './Factions.css';

interface Faction {
  id: string;
  name: string;
  summary?: string;
  details?: string;
  levels: string[];
  parentId?: string;
  children?: Faction[];
}

const mockFactions: Faction[] = [
  {
    id: '1',
    name: '帝国',
    summary: '大陆上最强大的国家',
    details: '拥有悠久历史的庞大帝国，控制着大陆的中心区域。',
    levels: ['皇帝', '亲王', '公爵', '侯爵', '伯爵'],
    children: [
      {
        id: '1-1',
        name: '皇室',
        summary: '帝国的核心统治家族',
        details: '由皇帝及其直系亲属组成，掌握最高权力。',
        levels: ['皇帝', '皇后', '太子', '公主'],
        parentId: '1',
      },
      {
        id: '1-2',
        name: '贵族议会',
        summary: '由各大贵族组成的议会',
        details: '负责制定法律和政策，平衡各方利益。',
        levels: ['议长', '议员'],
        parentId: '1',
      },
    ],
  },
  {
    id: '2',
    name: '魔法协会',
    summary: '魔法师的组织',
    details: '由各地魔法师组成的组织，致力于魔法研究和教育。',
    levels: ['大法师', '高级法师', '中级法师', '初级法师', '学徒'],
    children: [
      {
        id: '2-1',
        name: '元素法师团',
        summary: '专精元素魔法的法师组织',
        details: '擅长火、水、土、风等元素魔法的法师团体。',
        levels: ['元素大师', '元素法师', '元素学徒'],
        parentId: '2',
      },
    ],
  },
  {
    id: '3',
    name: '佣兵公会',
    summary: '自由佣兵的组织',
    details: '为各种任务提供佣兵服务的组织，成员来自各地。',
    levels: ['S级', 'A级', 'B级', 'C级', 'D级'],
  },
];

export default function Factions() {
  const [factions, setFactions] = useState<Faction[]>(mockFactions);
  const [expandedFactions, setExpandedFactions] = useState<Record<string, boolean>>({
    '1': true,
    '2': false,
  });
  const [editingFaction, setEditingFaction] = useState<string | null>(null);
  const [addingFaction, setAddingFaction] = useState(false);
  const [parentFactionId, setParentFactionId] = useState<string | null>(null);
  const [factionForm, setFactionForm] = useState<{
    name: string;
    summary: string;
    details: string;
    levels: string[];
    parentId?: string;
  }>({
    name: '',
    summary: '',
    details: '',
    levels: [],
  });
  const [newLevel, setNewLevel] = useState('');

  const toggleFaction = (factionId: string) => {
    setExpandedFactions((prev) => ({
      ...prev,
      [factionId]: !prev[factionId],
    }));
  };

  const flattenFactions = (factions: Faction[], parentId?: string): Faction[] => {
    const result: Faction[] = [];
    factions.forEach((faction) => {
      result.push({ ...faction, parentId });
      if (faction.children && faction.children.length > 0) {
        result.push(...flattenFactions(faction.children, faction.id));
      }
    });
    return result;
  };

  const getAllFactions = (): Faction[] => {
    return flattenFactions(factions);
  };

  const handleAddFaction = (parentId?: string) => {
    setParentFactionId(parentId || null);
    setAddingFaction(true);
    setFactionForm({
      name: '新势力',
      summary: '',
      details: '',
      levels: [],
      parentId,
    });
  };

  const handleSaveNewFaction = () => {
    if (!factionForm.name.trim()) return;

    const newFaction: Faction = {
      id: String(Date.now()),
      name: factionForm.name,
      summary: factionForm.summary,
      details: factionForm.details,
      levels: factionForm.levels,
      parentId: factionForm.parentId,
    };

    if (factionForm.parentId) {
      // 添加到子势力
      setFactions((prev) =>
        prev.map((faction) => {
          if (faction.id === factionForm.parentId) {
            return {
              ...faction,
              children: [...(faction.children || []), newFaction],
            };
          }
          return addToChildren(faction, factionForm.parentId!, newFaction);
        })
      );
    } else {
      // 添加为顶级势力
      setFactions((prev) => [...prev, newFaction]);
    }

    setAddingFaction(false);
    setFactionForm({ name: '', summary: '', details: '', levels: [] });
    setNewLevel('');
    setParentFactionId(null);
  };

  const addToChildren = (faction: Faction, targetId: string, newFaction: Faction): Faction => {
    if (faction.id === targetId) {
      return {
        ...faction,
        children: [...(faction.children || []), newFaction],
      };
    }
    if (faction.children) {
      return {
        ...faction,
        children: faction.children.map((child) => addToChildren(child, targetId, newFaction)),
      };
    }
    return faction;
  };

  const handleEditFaction = (factionId: string) => {
    const allFactions = getAllFactions();
    const faction = allFactions.find((f) => f.id === factionId);
    if (faction) {
      setEditingFaction(factionId);
      setFactionForm({
        name: faction.name,
        summary: faction.summary || '',
        details: faction.details || '',
        levels: [...faction.levels],
        parentId: faction.parentId,
      });
    }
  };

  const handleSaveFaction = () => {
    if (!editingFaction) return;

    setFactions((prev) =>
      prev.map((faction) => updateFaction(faction, editingFaction, factionForm))
    );

    setEditingFaction(null);
    setFactionForm({ name: '', summary: '', details: '', levels: [] });
    setNewLevel('');
  };

  const updateFaction = (
    faction: Faction,
    targetId: string,
    form: typeof factionForm
  ): Faction => {
    if (faction.id === targetId) {
      return {
        ...faction,
        name: form.name,
        summary: form.summary,
        details: form.details,
        levels: form.levels,
      };
    }
    if (faction.children) {
      return {
        ...faction,
        children: faction.children.map((child) => updateFaction(child, targetId, form)),
      };
    }
    return faction;
  };

  const handleDeleteFaction = (factionId: string) => {
    if (!confirm('确定要删除这个势力吗？删除后其子势力也会被删除。')) return;

    setFactions((prev) => prev.filter((faction) => removeFaction(faction, factionId)));

    if (editingFaction === factionId) {
      setEditingFaction(null);
      setFactionForm({ name: '', summary: '', details: '', levels: [] });
    }
  };

  const removeFaction = (faction: Faction, targetId: string): boolean => {
    if (faction.id === targetId) {
      return false;
    }
    if (faction.children) {
      faction.children = faction.children.filter((child) => removeFaction(child, targetId));
    }
    return true;
  };

  const renderFactionTree = (factions: Faction[], level: number = 0): React.ReactElement[] => {
    return factions.map((faction) => {
      const hasChildren = faction.children && faction.children.length > 0;
      const isExpanded = expandedFactions[faction.id];
      const isEditing = editingFaction === faction.id;

      return (
        <div key={faction.id} className="faction-tree-item">
          <div
            className="faction-tree-row"
            style={{ paddingLeft: `${level * 24 + 12}px` }}
          >
            {hasChildren ? (
              <button
                className="faction-toggle-btn"
                onClick={() => toggleFaction(faction.id)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <div className="faction-toggle-placeholder" />
            )}
            <div className="faction-tree-content">
              {isEditing ? (
                <div className="faction-edit-form">
                  <input
                    type="text"
                    className="faction-name-input"
                    value={factionForm.name}
                    onChange={(e) => setFactionForm({ ...factionForm, name: e.target.value })}
                    placeholder="势力名称"
                    autoFocus
                  />
                  <textarea
                    className="faction-info-textarea"
                    value={factionForm.summary}
                    onChange={(e) => setFactionForm({ ...factionForm, summary: e.target.value })}
                    placeholder="势力简述..."
                    rows={2}
                  />
                  <textarea
                    className="faction-info-textarea"
                    value={factionForm.details}
                    onChange={(e) => setFactionForm({ ...factionForm, details: e.target.value })}
                    placeholder="详细信息..."
                    rows={4}
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
                          className="add-level-btn"
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
                            className="remove-level-btn"
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
                    </div>
                  </div>
                  <div className="faction-actions">
                    <button className="save-faction-btn" onClick={handleSaveFaction}>
                      保存
                    </button>
                    <button
                      className="cancel-faction-btn"
                      onClick={() => {
                        setEditingFaction(null);
                        setFactionForm({ name: '', summary: '', details: '', levels: [] });
                        setNewLevel('');
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="faction-display">
                    <div className="faction-name-display">{faction.name}</div>
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
                    <div className="faction-actions-display">
                      <button
                        className="edit-faction-btn"
                        onClick={() => handleEditFaction(faction.id)}
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="add-child-btn"
                        onClick={() => handleAddFaction(faction.id)}
                        title="添加子势力"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        className="delete-faction-btn"
                        onClick={() => handleDeleteFaction(faction.id)}
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {hasChildren && isExpanded && (
            <div className="faction-children">
              {renderFactionTree(faction.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="factions-page">
      <div className="factions-header">
        <h2 className="factions-title">势力管理</h2>
        <button
          className="add-faction-btn"
          onClick={() => handleAddFaction()}
          title="添加顶级势力"
        >
          <Plus size={16} />
          <span>添加势力</span>
        </button>
      </div>

      <div className="factions-content">
        {factions.length === 0 ? (
          <div className="empty-factions">
            <Users size={48} />
            <p>暂无势力，点击上方按钮添加</p>
          </div>
        ) : (
          <div className="factions-tree">{renderFactionTree(factions)}</div>
        )}
      </div>

      {/* 添加势力弹窗 */}
      {addingFaction && (
        <div
          className="edit-modal-overlay"
          onClick={() => {
            setAddingFaction(false);
            setFactionForm({ name: '', summary: '', details: '', levels: [] });
            setNewLevel('');
            setParentFactionId(null);
          }}
        >
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h4>{parentFactionId ? '添加子势力' : '添加势力'}</h4>
            <div className="modal-form">
              <label>
                <span>势力名称</span>
                <input
                  type="text"
                  value={factionForm.name}
                  onChange={(e) => setFactionForm({ ...factionForm, name: e.target.value })}
                  className="edit-input"
                  placeholder="势力名称"
                  autoFocus
                />
              </label>
              <label>
                <span>势力简述</span>
                <textarea
                  value={factionForm.summary}
                  onChange={(e) => setFactionForm({ ...factionForm, summary: e.target.value })}
                  className="edit-textarea"
                  placeholder="输入势力简述..."
                  rows={3}
                />
              </label>
              <label>
                <span>详细信息</span>
                <textarea
                  value={factionForm.details}
                  onChange={(e) => setFactionForm({ ...factionForm, details: e.target.value })}
                  className="edit-textarea"
                  placeholder="输入详细信息..."
                  rows={5}
                />
              </label>
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
                      className="add-level-btn"
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
                        className="remove-level-btn"
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
                </div>
              </div>
              <div className="modal-actions">
                <button className="save-btn" onClick={handleSaveNewFaction}>
                  保存
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setAddingFaction(false);
                    setFactionForm({ name: '', summary: '', details: '', levels: [] });
                    setNewLevel('');
                    setParentFactionId(null);
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

