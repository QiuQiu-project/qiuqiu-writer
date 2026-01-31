
import { useState } from 'react';
import { Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import type { ComponentConfig, FactionData } from './types';

interface FactionEditorProps {
  component: ComponentConfig;
  onChange: (newValue: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  isEditMode: boolean;
}

// 递归渲染势力树节点
const FactionNode = ({ 
  node, 
  onUpdate, 
  onDelete, 
  onAddChild,
  level = 0
}: { 
  node: FactionData; 
  onUpdate: (id: string, data: Partial<FactionData>) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  level?: number;
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="faction-node" style={{ marginLeft: level * 20 }}>
      <div className="faction-node-header">
        <button 
          className="faction-expand-btn"
          onClick={() => setExpanded(!expanded)}
          style={{ visibility: (node.children && node.children.length > 0) ? 'visible' : 'hidden' }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        
        <div className="faction-info">
          <input 
            value={node.name} 
            onChange={e => onUpdate(node.id, { name: e.target.value })}
            className="faction-name-input"
            placeholder="势力名称"
          />
          
          <div className="faction-actions">
            <button onClick={() => onAddChild(node.id)} title="添加下级"><Plus size={14} /></button>
            <button onClick={() => onDelete(node.id)} title="删除"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>
      
      {expanded && node.children && (
        <div className="faction-children">
          {node.children.map(child => (
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
};

export default function FactionEditor({
  component,
  onChange,
  // isEditMode is no longer used for restricting editing, 
  // but we keep it in props to avoid breaking the interface if passed
}: FactionEditorProps) {
  const factions = (Array.isArray(component.value) ? component.value : []) as FactionData[];

  const updateFactionRecursively = (
    list: FactionData[], 
    id: string, 
    updater: (node: FactionData) => FactionData | null
  ): FactionData[] => {
    return list.map(node => {
      if (node.id === id) {
        return updater(node);
      }
      if (node.children) {
        const newChildren = updateFactionRecursively(node.children, id, updater).filter(Boolean) as FactionData[];
        return { ...node, children: newChildren };
      }
      return node;
    }).filter(Boolean) as FactionData[];
  };

  const handleUpdate = (id: string, data: Partial<FactionData>) => {
    const newData = updateFactionRecursively(factions, id, node => ({ ...node, ...data }));
    onChange(newData);
  };

  const handleDelete = (id: string) => {
    // 递归删除
    const deleteRecursively = (list: FactionData[]): FactionData[] => {
      return list.filter(node => {
        if (node.id === id) return false;
        if (node.children) {
          node.children = deleteRecursively(node.children);
        }
        return true;
      });
    };
    onChange(deleteRecursively(factions));
  };

  const handleAddChild = (parentId: string | null) => {
    const newFaction: FactionData = {
      id: Date.now().toString(),
      name: '新势力',
      levels: [],
      children: []
    };

    if (parentId === null) {
      onChange([...factions, newFaction]);
    } else {
      const newData = updateFactionRecursively(factions, parentId, node => ({
        ...node,
        children: [...(node.children || []), newFaction]
      }));
      onChange(newData);
    }
  };

  return (
    <div className="faction-editor">
      <div className="faction-list">
        {factions.map(faction => (
          <FactionNode
            key={faction.id}
            node={faction}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onAddChild={handleAddChild}
          />
        ))}
      </div>
      <button className="faction-add-root-btn btn-secondary" onClick={() => handleAddChild(null)}>
        <Plus size={14} /> 添加顶级势力
      </button>
    </div>
  );
}
