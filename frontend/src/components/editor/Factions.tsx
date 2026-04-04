import { useState } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, X, Users } from 'lucide-react';
import DraggableResizableModal from '../common/DraggableResizableModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export default function Factions({ readOnly }: { readOnly?: boolean }) {
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

  const textareaClassName =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
  const surfaceCardClassName =
    'rounded-lg border border-border bg-background p-4 transition-all hover:border-primary/40 hover:shadow-sm';
  const infoPanelClassName =
    'mt-3 rounded-lg border-l-[3px] border-primary/70 bg-muted/50 px-3 py-3';

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
      // eslint-disable-next-line react-hooks/purity
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
        <div key={faction.id} className="flex flex-col">
          <div
            className="mb-2 flex items-start gap-2"
            style={{ paddingLeft: `${level * 24 + 12}px` }}
          >
            {hasChildren ? (
              <Button
                variant="ghost"
                size="icon-xs"
                className="mt-1 shrink-0 text-muted-foreground"
                onClick={() => toggleFaction(faction.id)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </Button>
            ) : (
              <div className="w-6 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-background p-4">
                  <Input
                    value={factionForm.name}
                    onChange={(e) => setFactionForm({ ...factionForm, name: e.target.value })}
                    placeholder="势力名称"
                    autoFocus
                  />
                  <textarea
                    className={textareaClassName}
                    value={factionForm.summary}
                    onChange={(e) => setFactionForm({ ...factionForm, summary: e.target.value })}
                    placeholder="势力简述..."
                    rows={2}
                  />
                  <textarea
                    className={textareaClassName}
                    value={factionForm.details}
                    onChange={(e) => setFactionForm({ ...factionForm, details: e.target.value })}
                    placeholder="详细信息..."
                    rows={4}
                  />
                  <div className="mt-1 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">等级阶梯</span>
                      <div className="flex min-w-[200px] flex-1 gap-2">
                        <Input
                          value={newLevel}
                          onChange={(e) => setNewLevel(e.target.value)}
                          placeholder="输入等级名称"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newLevel.trim()) {
                              setFactionForm({
                                ...factionForm,
                                levels: [...factionForm.levels, newLevel.trim()],
                              });
                              setNewLevel('');
                            }
                          }}
                        />
                        <Button
                          size="icon-sm"
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
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {factionForm.levels.map((level, index) => (
                        <div key={index} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                            {index + 1}
                          </span>
                          <span className="flex-1 text-sm text-foreground">{level}</span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setFactionForm({
                                ...factionForm,
                                levels: factionForm.levels.filter((_, i) => i !== index),
                              });
                            }}
                            title="删除"
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1 flex gap-2">
                    <Button className="flex-1" onClick={handleSaveFaction}>
                      保存
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setEditingFaction(null);
                        setFactionForm({ name: '', summary: '', details: '', levels: [] });
                        setNewLevel('');
                      }}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={surfaceCardClassName}>
                    <div className="mb-3 text-base font-semibold text-foreground">{faction.name}</div>
                    {faction.summary && (
                      <div className={infoPanelClassName}>
                        <span className="mb-1 block text-xs font-semibold text-muted-foreground">简述</span>
                        <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{faction.summary}</p>
                      </div>
                    )}
                    {faction.details && (
                      <div className={infoPanelClassName}>
                        <span className="mb-1 block text-xs font-semibold text-muted-foreground">详细信息</span>
                        <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{faction.details}</p>
                      </div>
                    )}
                    {faction.levels.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {faction.levels.map((level, index) => (
                          <div key={index} className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                              {index + 1}
                            </span>
                            <span>{level}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!readOnly && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => handleEditFaction(faction.id)}
                          title="编辑"
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => handleAddFaction(faction.id)}
                          title="添加子势力"
                        >
                          <Plus size={14} />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon-sm"
                          onClick={() => handleDeleteFaction(faction.id)}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
              )}
            </div>
          </div>
          {hasChildren && isExpanded && (
            <div className="mt-2 border-l-2 border-border pl-4">
              {renderFactionTree(faction.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <h2 className="text-xl font-bold text-foreground">势力管理</h2>
        {!readOnly && (
          <Button
            onClick={() => handleAddFaction()}
            title="添加顶级势力"
          >
            <Plus size={16} />
            <span>添加势力</span>
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {factions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <Users size={48} className="opacity-50" />
            <p>暂无势力，点击上方按钮添加</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">{renderFactionTree(factions)}</div>
        )}
      </div>

      <DraggableResizableModal
        isOpen={addingFaction}
        onClose={() => {
          setAddingFaction(false);
          setFactionForm({ name: '', summary: '', details: '', levels: [] });
          setNewLevel('');
          setParentFactionId(null);
        }}
        title={parentFactionId ? '添加子势力' : '添加势力'}
        initialWidth={600}
        initialHeight={700}
        className="overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">{parentFactionId ? '添加子势力' : '添加势力'}</h3>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setAddingFaction(false);
                setFactionForm({ name: '', summary: '', details: '', levels: [] });
                setNewLevel('');
                setParentFactionId(null);
              }}
            >
              <X size={16} />
            </Button>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">势力名称</span>
            <Input
              value={factionForm.name}
              onChange={(e) => setFactionForm({ ...factionForm, name: e.target.value })}
              placeholder="势力名称"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">势力简述</span>
            <textarea
              value={factionForm.summary}
              onChange={(e) => setFactionForm({ ...factionForm, summary: e.target.value })}
              className={textareaClassName}
              placeholder="输入势力简述..."
              rows={3}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">详细信息</span>
            <textarea
              value={factionForm.details}
              onChange={(e) => setFactionForm({ ...factionForm, details: e.target.value })}
              className={textareaClassName}
              placeholder="输入详细信息..."
              rows={5}
            />
          </label>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">等级阶梯</span>
              <div className="flex min-w-[200px] flex-1 gap-2">
                <Input
                  value={newLevel}
                  onChange={(e) => setNewLevel(e.target.value)}
                  placeholder="输入等级名称"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newLevel.trim()) {
                      setFactionForm({
                        ...factionForm,
                        levels: [...factionForm.levels, newLevel.trim()],
                      });
                      setNewLevel('');
                    }
                  }}
                />
                <Button
                  size="icon-sm"
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
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
              {factionForm.levels.map((level, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-sm text-foreground">{level}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setFactionForm({
                        ...factionForm,
                        levels: factionForm.levels.filter((_, i) => i !== index),
                      });
                    }}
                    title="删除"
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
              {factionForm.levels.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">还没有等级阶梯</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setAddingFaction(false);
                setFactionForm({ name: '', summary: '', details: '', levels: [] });
                setNewLevel('');
                setParentFactionId(null);
              }}
            >
              取消
            </Button>
            <div className="flex-1" />
            <Button onClick={handleSaveNewFaction}>
              保存
            </Button>
          </div>
        </div>
      </DraggableResizableModal>
    </div>
  );
}
