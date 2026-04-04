/**
 * StoryboardView — 分镜视图
 * 将集数的分镜脚本按场次（actTitle）分组，以网格卡片展示
 */
import { useState } from 'react';
import { Sparkles, RefreshCw, Image as ImageIcon, Edit2, X, Check } from 'lucide-react';
import { dramaGenerateImage } from '../../utils/dramaApi';
import type { DramaCharacter, DramaEpisode, DramaMeta, DramaPanel, DramaScene, DramaStoryboard } from './dramaTypes';

const SHOT_TYPE_LABELS: Record<string, string> = {
  wide: '全景',
  medium: '中景',
  close: '近景',
  'extreme-close': '特写',
  'bird-eye': '俯瞰',
  'low-angle': '仰拍',
};

interface StoryboardViewProps {
  episode: DramaEpisode;
  meta: DramaMeta;
  workId: string | null;
  selectedImageSize?: string;
  allEpisodes?: DramaEpisode[];
  onUpdateStoryboard: (storyboard: DramaStoryboard) => void;
  onRegenerateStoryboard: () => void;
}

interface PanelWithEpisode {
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string;
  panel: DramaPanel;
}

function collectAllPanelsWithImages(allEpisodes: DramaEpisode[]): PanelWithEpisode[] {
  const result: PanelWithEpisode[] = [];
  for (const ep of allEpisodes) {
    for (const p of (ep.storyboard?.panels ?? [])) {
      if (p.imageUrl) {
        result.push({ episodeId: ep.id, episodeNumber: ep.number, episodeTitle: ep.title, panel: p });
      }
    }
  }
  return result;
}

function resolvePanelById(id: string, allEpisodes: DramaEpisode[]): DramaPanel | undefined {
  for (const ep of allEpisodes) {
    const found = ep.storyboard?.panels.find(p => p.id === id);
    if (found) return found;
  }
  return undefined;
}

interface ActGroup {
  actIndex: number;
  actTitle: string;
  panels: DramaPanel[];
}

function groupPanelsByAct(panels: DramaPanel[]): ActGroup[] {
  const map = new Map<string, ActGroup>();
  for (const panel of panels) {
    const key = panel.actTitle || '场次1';
    if (!map.has(key)) {
      map.set(key, { actIndex: panel.actIndex ?? 1, actTitle: key, panels: [] });
    }
    map.get(key)!.panels.push(panel);
  }
  return Array.from(map.values()).sort((a, b) => a.actIndex - b.actIndex);
}

// ─── 角色头像气泡 ────────────────────────────────────────────
function CharAvatar({ char, size = 20 }: { char: DramaCharacter; size?: number }) {
  return (
    <div className="storyboard-ref-avatar" title={char.name} style={{ width: size, height: size }}>
      {char.imageUrl ? (
        <img src={char.imageUrl} alt={char.name} />
      ) : (
        <span>{char.name.charAt(0)}</span>
      )}
    </div>
  );
}

// ─── 场景缩略图气泡 ──────────────────────────────────────────
function SceneThumb({ scene, size = 20 }: { scene: DramaScene; size?: number }) {
  return (
    <div className="storyboard-ref-scene" title={`${scene.location} · ${scene.time}`} style={{ width: size, height: size }}>
      {scene.imageUrl ? (
        <img src={scene.imageUrl} alt={scene.location} />
      ) : (
        <span>{scene.location.charAt(0)}</span>
      )}
    </div>
  );
}

export default function StoryboardView({
  episode,
  meta,
  workId,
  selectedImageSize = '1024x1024',
  allEpisodes = [],
  onUpdateStoryboard,
  onRegenerateStoryboard,
}: StoryboardViewProps) {
  // 确保当前集也在 allEpisodes 中（用于跨集面板解析）
  const allEpisodesWithCurrent = allEpisodes.some(e => e.id === episode.id)
    ? allEpisodes
    : [episode, ...allEpisodes];
  const storyboard = episode.storyboard;
  const [generatingPanelId, setGeneratingPanelId] = useState<string | null>(null);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [editingPanel, setEditingPanel] = useState<DramaPanel | null>(null);

  if (!storyboard || storyboard.panels.length === 0) {
    return (
      <div className="storyboard-empty">
        <ImageIcon size={48} />
        <p>暂无分镜数据</p>
        <button className="storyboard-regen-btn" onClick={onRegenerateStoryboard}>
          <RefreshCw size={14} />
          生成分镜
        </button>
      </div>
    );
  }

  const acts = groupPanelsByAct(storyboard.panels);
  const totalPanels = storyboard.panels.length;
  const panelsWithImage = storyboard.panels.filter(p => p.imageUrl).length;

  const updatePanel = (panelId: string, patch: Partial<DramaPanel>) => {
    const newPanels = storyboard.panels.map(p => p.id === panelId ? { ...p, ...patch } : p);
    onUpdateStoryboard({ ...storyboard, panels: newPanels });
  };

  const handleGeneratePanelImage = async (
    panel: DramaPanel,
  ): Promise<string | null> => {
    if (!workId) return null;
    setGeneratingPanelId(panel.id);
    try {
      const shotLabel = SHOT_TYPE_LABELS[panel.shotType] || panel.shotType;
      const dialogueInfo = panel.dialogue ? `台词："${panel.dialogue}"` : '';

      // 从 meta 查找角色外貌描述，格式：角色名（外貌描述），逐个明确关联
      const linkedCharsForGen = panel.characters
        .map(name => meta.characters.find(c => c.name === name))
        .filter((c): c is DramaCharacter => !!c);
      // 精确格式：[名字]（[外貌]），让模型明确关联角色名与外貌
      const charAppearanceInfos = linkedCharsForGen
        .filter(c => c.appearance)
        .map(c => `${c.name}（${c.appearance}）`);
      // 外貌放最前（权重最高），无外貌则降级为角色名列表
      const charAppearanceStr = charAppearanceInfos.length > 0
        ? `画面人物：${charAppearanceInfos.join('；')}`
        : panel.characters.length > 0
          ? `出场角色：${panel.characters.join('、')}`
          : '';

      // 从 meta 查找关联场景描述
      const linkedScene = panel.sceneId ? meta.scenes?.find(s => s.id === panel.sceneId) : undefined;
      const sceneDesc = linkedScene
        ? `${linkedScene.location}·${linkedScene.time}，${linkedScene.description}`
        : '';

      // 用户手选上文参考（跨集，多选），优先级最高
      const contextRefUrls: string[] = (panel.contextRefPanelIds ?? [])
        .map(id => resolvePanelById(id, allEpisodesWithCurrent)?.imageUrl)
        .filter((u): u is string => !!u);

      // 有上文参考时：prompt 加一致性提示（对不支持图片输入的模型也有效）
      const contextHint = contextRefUrls.length > 0
        ? '与参考画面保持相同的角色造型、服装配色和画风'
        : '';

      const prompt = panel.imagePrompt || [
        '单张横版插画，完整场景，无分格无边框，电影感构图，高质量细节。',
        contextHint,                 // 上文一致性提示（有上文参考时）
        charAppearanceStr,           // 角色外貌
        sceneDesc,                   // 场景描述
        panel.action,                // 动作
        `${shotLabel}构图`,          // 镜头类型
        panel.emotion ? `情绪：${panel.emotion}` : '',
        dialogueInfo,
      ].filter(Boolean).join('，');

      // 参考图策略：
      // - 有上文参考 → 专门用上文参考图（用户明确选择，不混入角色/场景图）
      // - 无上文参考 → 使用角色图 + 场景图作为外貌/场景引导
      const referenceImageUrls: string[] = contextRefUrls.length > 0
        ? contextRefUrls
        : [
            ...linkedCharsForGen.map(c => c.imageUrl).filter((u): u is string => !!u),
            ...(linkedScene?.imageUrl ? [linkedScene.imageUrl] : []),
          ];

      const imageUrl = await dramaGenerateImage(prompt, workId, {
        size: selectedImageSize,
        referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
      });
      if (imageUrl) updatePanel(panel.id, { imageUrl });
      return imageUrl ?? null;
    } catch {
      return null;
    } finally {
      setGeneratingPanelId(null);
    }
  };

  const handleBatchGenerateImages = async () => {
    if (!workId || batchGenerating) return;
    const panelsWithoutImage = storyboard.panels.filter(p => !p.imageUrl);
    if (panelsWithoutImage.length === 0) return;
    setBatchGenerating(true);
    for (const panel of panelsWithoutImage) {
      await handleGeneratePanelImage(panel);
    }
    setBatchGenerating(false);
  };

  return (
    <div className="storyboard-view">
      {/* 工具栏 */}
      <div className="storyboard-toolbar">
        <div className="storyboard-toolbar-left">
          <span className="storyboard-stats">
            {totalPanels} 格分镜 · {panelsWithImage}/{totalPanels} 已生图
          </span>
          {storyboard.generatedAt && (
            <span className="storyboard-gen-time">
              生成于 {new Date(storyboard.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="storyboard-toolbar-right">
          <button
            className="storyboard-batch-btn"
            onClick={handleBatchGenerateImages}
            disabled={batchGenerating || panelsWithImage === totalPanels}
            title="为所有未生图的分镜格批量生成图片"
          >
            {batchGenerating
              ? <><span className="drama-spinner" style={{ width: 12, height: 12 }} /> 生成中...</>
              : <><Sparkles size={13} /> 批量生成图片</>
            }
          </button>
          <button
            className="storyboard-regen-btn outline"
            onClick={onRegenerateStoryboard}
            title="重新生成分镜脚本（会覆盖当前分镜）"
          >
            <RefreshCw size={13} />
            重新生成分镜
          </button>
        </div>
      </div>

      {/* 分镜内容区（按场次分组） */}
      <div className="storyboard-content">
        {acts.map(act => (
          <div key={act.actTitle} className="storyboard-act-section">
            {/* 场次标题 */}
            <div className="storyboard-act-header">
              <span className="storyboard-act-index">场次 {act.actIndex}</span>
              <span className="storyboard-act-title">{act.actTitle}</span>
              <span className="storyboard-act-count">{act.panels.length} 格</span>
            </div>

            {/* 分镜网格 */}
            <div className="storyboard-panels-grid">
              {act.panels.map(panel => {
                const linkedChars = panel.characters
                  .map(name => meta.characters.find(c => c.name === name))
                  .filter((c): c is DramaCharacter => !!c);
                const linkedScene = panel.sceneId
                  ? meta.scenes?.find(s => s.id === panel.sceneId)
                  : undefined;
                const hasRefs = linkedChars.length > 0 || !!linkedScene;

                  // 解析上文参考面板
                const contextRefPanels = (panel.contextRefPanelIds ?? [])
                  .map(id => resolvePanelById(id, allEpisodesWithCurrent))
                  .filter((p): p is DramaPanel => !!p && !!p.imageUrl);

                return (
                  <div key={panel.id} className="storyboard-panel-card">
                    {/* 图片区 */}
                    <div className="storyboard-panel-image">
                      {panel.imageUrl ? (
                        <img src={panel.imageUrl} alt={`分镜 ${panel.index}`} className="storyboard-panel-img" />
                      ) : (
                        <div className="storyboard-panel-img-placeholder">
                          <ImageIcon size={24} />
                          <span>未生成</span>
                        </div>
                      )}
                      {/* 格序号 */}
                      <span className="storyboard-panel-index-badge">#{panel.index}</span>
                    </div>

                    {/* 信息区 */}
                    <div className="storyboard-panel-info">
                      <div className="storyboard-panel-meta">
                        <span className="storyboard-shot-badge">{SHOT_TYPE_LABELS[panel.shotType] || panel.shotType}</span>
                        {panel.emotion && (
                          <span className="storyboard-emotion-tag">{panel.emotion}</span>
                        )}
                      </div>

                      <p className="storyboard-panel-action">{panel.action}</p>

                      {panel.dialogue && (
                        <p className="storyboard-panel-dialogue">"{panel.dialogue}"</p>
                      )}

                      {/* 角色 & 场景参考图行 */}
                      {hasRefs && (
                        <div className="storyboard-panel-refs">
                          {linkedChars.slice(0, 3).map(char => (
                            <CharAvatar key={char.id} char={char} size={22} />
                          ))}
                          {linkedChars.length > 3 && (
                            <div className="storyboard-ref-more" title={`还有 ${linkedChars.length - 3} 位角色`}>
                              +{linkedChars.length - 3}
                            </div>
                          )}
                          {linkedScene && (
                            <SceneThumb scene={linkedScene} size={22} />
                          )}
                        </div>
                      )}

                      {/* 上文参考图行 */}
                      {contextRefPanels.length > 0 && (
                        <div className="storyboard-panel-context-refs">
                          <span className="storyboard-context-refs-badge">上文</span>
                          {contextRefPanels.slice(0, 4).map(rp => (
                            <div
                              key={rp.id}
                              className="storyboard-context-ref-thumb"
                              title={`#${rp.index}`}
                            >
                              <img src={rp.imageUrl} alt={`#${rp.index}`} />
                            </div>
                          ))}
                          {contextRefPanels.length > 4 && (
                            <div className="storyboard-ref-more" title={`还有 ${contextRefPanels.length - 4} 张`}>
                              +{contextRefPanels.length - 4}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="storyboard-panel-actions">
                      <button
                        className="storyboard-panel-btn generate"
                        onClick={() => handleGeneratePanelImage(panel)}
                        disabled={generatingPanelId === panel.id || batchGenerating}
                        title="生成分镜图"
                      >
                        {generatingPanelId === panel.id
                          ? <span className="drama-spinner" style={{ width: 11, height: 11 }} />
                          : <Sparkles size={11} />}
                        生图
                      </button>
                      <button
                        className="storyboard-panel-btn edit"
                        onClick={() => setEditingPanel({ ...panel })}
                        title="编辑分镜格"
                      >
                        <Edit2 size={11} />
                        编辑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 编辑分镜格模态框 */}
      {editingPanel && (
        <PanelEditModal
          panel={editingPanel}
          meta={meta}
          allEpisodes={allEpisodesWithCurrent}
          currentPanelId={editingPanel.id}
          onChange={setEditingPanel}
          onSave={() => {
            updatePanel(editingPanel.id, editingPanel);
            setEditingPanel(null);
          }}
          onClose={() => setEditingPanel(null)}
        />
      )}
    </div>
  );
}

// ─── 分镜格编辑模态框 ────────────────────────────────────────
function PanelEditModal({
  panel,
  meta,
  allEpisodes,
  currentPanelId,
  onChange,
  onSave,
  onClose,
}: {
  panel: DramaPanel;
  meta: DramaMeta;
  allEpisodes: DramaEpisode[];
  currentPanelId: string;
  onChange: (p: DramaPanel) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const scenes = meta.scenes ?? [];
  // 收集所有已生成图片的面板（排除自身）
  const allPanelsWithImages = collectAllPanelsWithImages(allEpisodes)
    .filter(x => x.panel.id !== currentPanelId);

  const toggleCharacter = (name: string) => {
    const next = panel.characters.includes(name)
      ? panel.characters.filter(n => n !== name)
      : [...panel.characters, name];
    onChange({ ...panel, characters: next });
  };

  const selectScene = (sceneId: string | undefined) => {
    onChange({ ...panel, sceneId });
  };

  return (
    <div className="drama-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drama-modal-content" style={{ maxWidth: 560 }}>
        <div className="drama-modal-header">
          <h3>编辑分镜格 #{panel.index}</h3>
          <button className="drama-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="drama-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>

          {/* 镜头类型 */}
          <div className="storyboard-edit-field">
            <label>镜头类型</label>
            <select
              value={panel.shotType}
              onChange={e => onChange({ ...panel, shotType: e.target.value as DramaPanel['shotType'] })}
              className="storyboard-edit-select"
            >
              {Object.entries(SHOT_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* 出场角色多选 */}
          {meta.characters.length > 0 && (
            <div className="storyboard-edit-field">
              <label>出场角色</label>
              <div className="storyboard-char-selector">
                {meta.characters.map(char => {
                  const selected = panel.characters.includes(char.name);
                  return (
                    <button
                      key={char.id}
                      type="button"
                      className={`storyboard-char-option${selected ? ' selected' : ''}`}
                      onClick={() => toggleCharacter(char.name)}
                      title={char.name}
                    >
                      <div className="storyboard-char-avatar">
                        {char.imageUrl ? (
                          <img src={char.imageUrl} alt={char.name} />
                        ) : (
                          <span>{char.name.charAt(0)}</span>
                        )}
                      </div>
                      <span className="storyboard-char-name">{char.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 关联场景选择 */}
          {scenes.length > 0 && (
            <div className="storyboard-edit-field">
              <label>关联场景</label>
              <div className="storyboard-scene-selector">
                {/* 不关联选项 */}
                <button
                  type="button"
                  className={`storyboard-scene-option${!panel.sceneId ? ' selected' : ''}`}
                  onClick={() => selectScene(undefined)}
                  title="不关联场景"
                >
                  <div className="storyboard-scene-thumb no-scene">
                    <span>—</span>
                  </div>
                  <span className="storyboard-scene-label">不关联</span>
                </button>
                {scenes.map(scene => {
                  const selected = panel.sceneId === scene.id;
                  return (
                    <button
                      key={scene.id}
                      type="button"
                      className={`storyboard-scene-option${selected ? ' selected' : ''}`}
                      onClick={() => selectScene(scene.id)}
                      title={`${scene.location} · ${scene.time}`}
                    >
                      <div className="storyboard-scene-thumb">
                        {scene.imageUrl ? (
                          <img src={scene.imageUrl} alt={scene.location} />
                        ) : (
                          <span>{scene.location.charAt(0)}</span>
                        )}
                      </div>
                      <span className="storyboard-scene-label">{scene.location}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 情绪基调 */}
          <div className="storyboard-edit-field">
            <label>情绪基调</label>
            <input
              className="storyboard-edit-input"
              value={panel.emotion || ''}
              onChange={e => onChange({ ...panel, emotion: e.target.value })}
              placeholder="如：紧张、温馨、震撼"
            />
          </div>

          {/* 动作描述 */}
          <div className="storyboard-edit-field">
            <label>动作描述</label>
            <textarea
              className="storyboard-edit-textarea"
              value={panel.action}
              onChange={e => onChange({ ...panel, action: e.target.value })}
              rows={3}
              placeholder="画面中的动作和环境描述"
            />
          </div>

          {/* 台词 */}
          <div className="storyboard-edit-field">
            <label>台词</label>
            <input
              className="storyboard-edit-input"
              value={panel.dialogue || ''}
              onChange={e => onChange({ ...panel, dialogue: e.target.value || undefined })}
              placeholder="本格对白（可为空）"
            />
          </div>

          {/* 图片生成提示词 */}
          <div className="storyboard-edit-field">
            <label>图片生成提示词（可选，覆盖自动生成）</label>
            <textarea
              className="storyboard-edit-textarea"
              value={panel.imagePrompt || ''}
              onChange={e => onChange({ ...panel, imagePrompt: e.target.value || undefined })}
              rows={2}
              placeholder="留空则自动构建（单张横版插画，无分格，含角色外貌 & 场景描述）"
            />
          </div>

          {/* 上文参考图（跨集多选） */}
          <div className="storyboard-edit-field">
            <label>上文参考图</label>
            {allPanelsWithImages.length === 0 ? (
              <p className="storyboard-context-empty">暂无已生成的分镜图可供参考</p>
            ) : (
              <div className="storyboard-context-picker">
                {allPanelsWithImages.map(({ episodeNumber, episodeTitle, panel: rp }) => {
                  const selected = (panel.contextRefPanelIds ?? []).includes(rp.id);
                  return (
                    <button
                      key={rp.id}
                      type="button"
                      className={`storyboard-context-option${selected ? ' selected' : ''}`}
                      onClick={() => {
                        const ids = panel.contextRefPanelIds ?? [];
                        const next = ids.includes(rp.id)
                          ? ids.filter(i => i !== rp.id)
                          : [...ids, rp.id];
                        onChange({ ...panel, contextRefPanelIds: next.length > 0 ? next : undefined });
                      }}
                      title={`第${episodeNumber}集 ${episodeTitle} · #${rp.index}`}
                    >
                      <div className="storyboard-context-thumb">
                        <img src={rp.imageUrl} alt={`#${rp.index}`} />
                        {selected && (
                          <div className="storyboard-context-selected-mark">
                            <Check size={9} />
                          </div>
                        )}
                      </div>
                      <span className="storyboard-context-label">E{episodeNumber}·#{rp.index}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="drama-modal-footer">
          <button className="drama-btn-secondary" onClick={onClose}>取消</button>
          <button className="drama-btn-primary" onClick={onSave}>
            <Check size={13} /> 保存
          </button>
        </div>
      </div>
    </div>
  );
}
