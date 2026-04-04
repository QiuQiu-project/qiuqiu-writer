
import { useState } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown, Layers } from 'lucide-react';
import type { ComponentConfig, FactionData } from './types';

interface FactionEditorProps {
  component: ComponentConfig;
  onChange: (newValue: unknown) => void;
  isEditMode: boolean;
}

const HIERARCHY_LABELS: Record<number, string> = {
  0: '顶级',
  1: '一级',
  2: '二级',
  3: '三级',
  4: '四级',
  5: '五级',
};

function getHierarchyLabel(level: number): string {
  return HIERARCHY_LABELS[level] ?? `Lv.${level + 1}`;
}

interface FactionNodeProps {
  node: FactionData;
  onUpdate: (id: string, data: Partial<FactionData>) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  level?: number;
}

function FactionNode({
  node,
  onUpdate,
  onDelete,
  onAddChild,
  level = 0,
}: FactionNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [newLevelName, setNewLevelName] = useState('');
  const levels = node.levels ?? [];

  const hasChildren = node.children && node.children.length > 0;

  const handleAddLevel = () => {
    const name = newLevelName.trim();
    if (!name) return;
    onUpdate(node.id, { levels: [...levels, name] });
    setNewLevelName('');
  };

  const handleRemoveLevel = (index: number) => {
    onUpdate(node.id, {
      levels: levels.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="faction-editor-node" style={{ marginLeft: level * 16 }}>
      <div className="faction-editor-node-header">
        <button
          type="button"
          className="faction-editor-expand-btn"
          onClick={() => setExpanded(!expanded)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
          aria-label={expanded ? '收起' : '展开'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className="faction-editor-level-badge" title="层级">
          {getHierarchyLabel(level)}
        </span>

        <div className="faction-editor-info">
          <input
            value={node.name}
            onChange={(e) => onUpdate(node.id, { name: e.target.value })}
            className="faction-editor-name-input"
            placeholder="势力名称"
          />
          <div className="faction-editor-actions">
            <button
              type="button"
              onClick={() => onAddChild(node.id)}
              title="添加下级势力"
            >
              <Plus size={14} />
            </button>
            <button type="button" onClick={() => onDelete(node.id)} title="删除">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="faction-editor-detail-toggle"
        onClick={() => setDetailExpanded(!detailExpanded)}
        aria-expanded={detailExpanded}
      >
        <Layers size={14} />
        {detailExpanded ? '收起描述与等级' : '展开描述与等级'}
      </button>

      {detailExpanded && (
        <div className="faction-editor-detail">
          <div className="faction-editor-field">
            <label>简述</label>
            <textarea
              value={node.summary ?? ''}
              onChange={(e) => onUpdate(node.id, { summary: e.target.value })}
              className="faction-editor-textarea"
              placeholder="势力简要介绍..."
              rows={2}
            />
          </div>
          <div className="faction-editor-field">
            <label>详细信息</label>
            <textarea
              value={node.details ?? ''}
              onChange={(e) => onUpdate(node.id, { details: e.target.value })}
              className="faction-editor-textarea"
              placeholder="势力背景、权力结构、重要事件等..."
              rows={3}
            />
          </div>
          <div className="faction-editor-levels-section">
            <div className="faction-editor-levels-header">
              <span className="faction-editor-levels-title">等级体系</span>
              <div className="faction-editor-add-level">
                <input
                  value={newLevelName}
                  onChange={(e) => setNewLevelName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLevel())}
                  placeholder="如：掌门、长老、弟子"
                />
                <button
                  type="button"
                  className="faction-editor-add-level-btn"
                  onClick={handleAddLevel}
                  title="添加等级"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            {levels.length > 0 && (
              <div className="faction-editor-levels-list">
                {levels.map((name, index) => (
                  <div key={`${node.id}-${index}`} className="faction-editor-level-item">
                    <span className="faction-editor-level-order">{index + 1}</span>
                    <span className="faction-editor-level-name">{name}</span>
                    <button
                      type="button"
                      className="faction-editor-remove-level"
                      onClick={() => handleRemoveLevel(index)}
                      title="移除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {expanded && hasChildren && (
        <div className="faction-editor-children">
          {node.children!.map((child) => (
            <FactionNode
              key={child.id}
              node={child}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddChild={onAddChild}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FactionEditor({
  component,
  onChange,
}: FactionEditorProps) {
  const factions = (Array.isArray(component.value) ? component.value : []) as FactionData[];

  const updateFactionRecursively = (
    list: FactionData[],
    id: string,
    updater: (node: FactionData) => FactionData | null
  ): FactionData[] => {
    return list
      .map((node) => {
        if (node.id === id) return updater(node);
        if (node.children) {
          const newChildren = updateFactionRecursively(
            node.children,
            id,
            updater
          ).filter(Boolean) as FactionData[];
          return { ...node, children: newChildren };
        }
        return node;
      })
      .filter(Boolean) as FactionData[];
  };

  const handleUpdate = (id: string, data: Partial<FactionData>) => {
    const newData = updateFactionRecursively(factions, id, (node) => ({
      ...node,
      ...data,
    }));
    onChange(newData);
  };

  const deleteRecursively = (list: FactionData[], id: string): FactionData[] => {
    return list
      .filter((node) => node.id !== id)
      .map((node) => ({
        ...node,
        children: node.children
          ? deleteRecursively(node.children, id)
          : undefined,
      }));
  };

  const handleDelete = (id: string) => {
    onChange(deleteRecursively(factions, id));
  };

  const handleAddChild = (parentId: string | null) => {
    const newFaction: FactionData = {
      id: Date.now().toString(),
      name: '新势力',
      summary: '',
      details: '',
      levels: [],
      children: [],
    };

    if (parentId === null) {
      onChange([...factions, newFaction]);
    } else {
      const newData = updateFactionRecursively(factions, parentId, (node) => ({
        ...node,
        children: [...(node.children || []), newFaction],
      }));
      onChange(newData);
    }
  };

  return (
    <div className="faction-editor">
      <div className="faction-editor-list">
        {factions.map((faction) => (
          <FactionNode
            key={faction.id}
            node={faction}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onAddChild={handleAddChild}
          />
        ))}
      </div>
      <button
        type="button"
        className="faction-editor-add-root-btn"
        onClick={() => handleAddChild(null)}
      >
        <Plus size={14} /> 添加顶级势力
      </button>
    </div>
  );
}
