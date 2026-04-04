import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TagCategory {
  name: string;
  limit: number;
  tags: string[];
}

interface TagsManagerProps {
  readOnly?: boolean;
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

export default function TagsManager({ readOnly }: TagsManagerProps = {}) {
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
  const textareaClassName =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';

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
    <div className="h-full w-full overflow-y-auto p-6">
      <h2 className="mb-6 text-xl font-bold text-foreground">设定</h2>
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        {tagCategories.map((category) => {
          const selected = selectedTags[category.name] || [];
          const count = selected.length;
          const limit = category.limit;
          const availableTags = category.tags.filter((tag) => !selected.includes(tag));
          const isLimitReached = count >= limit;

          return (
            <div key={category.name} className="rounded-xl border border-border bg-background p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-semibold text-foreground">{category.name}</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {count}/{limit}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {selected.length > 0 && (
                  <div className="flex min-h-9 flex-wrap items-start gap-1.5 rounded-lg border border-border bg-muted/40 p-2">
                    {selected.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                        {tag}
                        {!readOnly && (
                          <button
                            className="rounded-full bg-white/20 p-0.5 transition-colors hover:bg-white/40"
                            onClick={() => removeTag(category.name, tag)}
                            title="移除"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {!isLimitReached && (
                  <div className="flex max-h-[200px] flex-wrap gap-2 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
                    {availableTags.map((tag) => (
                      <label key={tag} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:bg-primary/10">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => handleTagSelect(category.name, tag)}
                          disabled={isLimitReached || readOnly}
                          className="size-4 accent-primary"
                        />
                        <span>{tag}</span>
                      </label>
                    ))}
                  </div>
                )}
                {isLimitReached && (
                  <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-center text-sm text-muted-foreground">
                    已达到选择上限（{limit}个）
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="col-span-full rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="mb-4 border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">文本信息</h3>
          </div>
          <textarea
            className={textareaClassName}
            value={textInfo}
            onChange={(e) => setTextInfo(e.target.value)}
            placeholder="输入文本信息..."
            rows={4}
            disabled={readOnly}
          />
        </div>

        {/* 背景 */}
        <div className="col-span-full rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="mb-4 border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">背景</h3>
          </div>
          <textarea
            className={textareaClassName}
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="输入背景信息..."
            rows={4}
            disabled={readOnly}
          />
        </div>

        {/* 等级体系 */}
        <div className="col-span-full rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-base font-semibold text-foreground">等级体系</h3>
            {!readOnly && (
              <Button
                variant="outline"
                size="icon-sm"
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
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-lg:grid-cols-1">
            {factions.length === 0 ? (
              <div className="col-span-full rounded-lg bg-muted/40 p-5 text-center text-sm text-muted-foreground">暂无等级体系，点击上方 + 按钮添加</div>
            ) : (
              factions.map((faction) => (
                <div key={faction.id} className="flex min-h-[200px] flex-col rounded-lg border border-border bg-background transition-all hover:border-primary/40 hover:shadow-sm">
                  {editingFaction === faction.id ? (
                    <div className="flex flex-col gap-4 p-4">
                      <Input
                        value={factionForm.name}
                        onChange={(e) => setFactionForm({ ...factionForm, name: e.target.value })}
                        placeholder="等级体系名称"
                        autoFocus
                      />
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
                        <div className="flex min-h-[60px] flex-col gap-2 rounded-lg bg-muted/40 p-3">
                          {factionForm.levels.map((level, index) => (
                            <div key={index} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                              <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
                              <span className="flex-1 text-sm text-foreground">{level}</span>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="text-muted-foreground hover:text-destructive"
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
                            <div className="py-3 text-center text-sm text-muted-foreground">暂无等级，在上方输入框中添加</div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-3">
                        <label className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-muted-foreground">等级体系简述</span>
                          <textarea
                            className={textareaClassName}
                            value={factionForm.summary}
                            onChange={(e) => setFactionForm({ ...factionForm, summary: e.target.value })}
                            placeholder="输入等级体系简述..."
                            rows={3}
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-muted-foreground">详细信息</span>
                          <textarea
                            className={textareaClassName}
                            value={factionForm.details}
                            onChange={(e) => setFactionForm({ ...factionForm, details: e.target.value })}
                            placeholder="输入详细信息..."
                            rows={5}
                          />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
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
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setEditingFaction(null);
                            setFactionForm({ name: '', levels: [], summary: '', details: '' });
                            setNewLevel('');
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 p-4">
                      <div className="text-base font-semibold text-foreground">{faction.name}</div>
                      {faction.levels.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {faction.levels.map((level, index) => (
                            <div key={index} className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                              <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{index + 1}</span>
                              <span>{level}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {faction.summary && (
                        <div className="rounded-lg bg-muted/40 px-3 py-3">
                          <span className="mb-1 block text-xs font-semibold text-muted-foreground">简述</span>
                          <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{faction.summary}</p>
                        </div>
                      )}
                      {faction.details && (
                        <div className="rounded-lg bg-muted/40 px-3 py-3">
                          <span className="mb-1 block text-xs font-semibold text-muted-foreground">详细信息</span>
                          <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{faction.details}</p>
                        </div>
                      )}
                      {!readOnly && (
                        <div className="mt-auto flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
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
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon-sm"
                            onClick={() => {
                              setFactions(factions.filter((f) => f.id !== faction.id));
                            }}
                            title="删除"
                          >
                            <X size={14} />
                          </Button>
                        </div>
                      )}
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
