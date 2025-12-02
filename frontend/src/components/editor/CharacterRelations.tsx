import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, ArrowRight, User, Trash2 } from 'lucide-react';
import { ExtensionCategory, Graph, register } from '@antv/g6';
import { ReactNode } from '@antv/g6-extension-react';
import type { GraphData } from '@antv/g6';
import './CharacterRelations.css';

// 注册 React 节点扩展
register(ExtensionCategory.NODE, 'react', ReactNode);

interface Character {
  id: string;
  name: string;
  gender: '男' | '女';
}

interface Relation {
  id: string;
  from: string;
  to: string;
  type: string;
  description?: string;
}

// Mock 数据 - 角色列表
const initialCharacters: Character[] = [
  { id: '1', name: '苏逸飞', gender: '男' },
  { id: '2', name: '林小雨', gender: '女' },
  { id: '3', name: '霍明月', gender: '女' },
  { id: '4', name: '陈小鱼', gender: '女' },
  { id: '5', name: '顾星河', gender: '女' },
  { id: '6', name: '张天宇', gender: '男' },
  { id: '7', name: '王思雨', gender: '女' },
];

// Mock 数据 - 关系列表
const initialRelations: Relation[] = [
  { id: 'r1', from: '1', to: '2', type: '恋人', description: '青梅竹马，从小一起长大' },
  { id: 'r2', from: '1', to: '3', type: '朋友', description: '大学同学，关系很好' },
  { id: 'r3', from: '2', to: '4', type: '闺蜜', description: '从小一起长大的好闺蜜' },
  { id: 'r4', from: '3', to: '5', type: '对手', description: '在学业上存在竞争关系' },
  { id: 'r5', from: '1', to: '6', type: '兄弟', description: '结拜兄弟，生死之交' },
  { id: 'r6', from: '2', to: '7', type: '室友', description: '大学室友，关系亲密' },
  { id: 'r7', from: '4', to: '7', type: '同学', description: '高中同学' },
];

// 自定义 React 节点组件
const CharacterNode = ({ data }: { data: any }) => {
  const { name } = data.data || {};
  
  return (
    <div className="character-node-react">
      <div className="character-node-circle">
        <User size={24} />
      </div>
      <div className="character-node-label">{name || data.id}</div>
    </div>
  );
};

export default function CharacterRelations() {
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [relations, setRelations] = useState<Relation[]>(initialRelations);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [editingRelation, setEditingRelation] = useState<string | null>(null);
  const [addingCharacter, setAddingCharacter] = useState(false);
  const [addingRelation, setAddingRelation] = useState(false);
  const [editForm, setEditForm] = useState<{
    name?: string;
    gender?: '男' | '女';
    relationType?: string;
    relationDescription?: string;
    relationFrom?: string;
    relationTo?: string;
  }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  // 使用 useMemo 来稳定数据引用，避免不必要的重新渲染
  const graphData = useMemo(() => {
    // 计算初始位置，让节点均匀分布在一个圆形上
    const nodeCount = characters.length;
    const radius = Math.max(200, nodeCount * 50); // 根据节点数量调整半径
    const centerX = 400; // 中心点 x
    const centerY = 300; // 中心点 y
    
    const nodes = characters.map((char, index) => {
      // 计算节点在圆形上的位置
      const angle = (index * 2 * Math.PI) / nodeCount - Math.PI / 2; // 从顶部开始
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      console.log(`Node ${char.name} initial position:`, { x, y, angle: (angle * 180) / Math.PI });
      
      return {
        id: char.id,
        type: 'react' as const, // 使用 react 节点类型
        data: {
          label: char.name,
          name: char.name,
          gender: char.gender,
        },
        // G6 5.0 使用 style.x 和 style.y 设置初始位置
        style: {
          x: x, // 位置在 style 中
          y: y, // 位置在 style 中
          size: [80, 80] as [number, number], // 节点大小 [width, height]
          component: (data: any) => <CharacterNode data={data} />, // React 组件
        },
      };
    });

    const edges = relations.map((rel) => ({
      id: rel.id,
      source: rel.from,
      target: rel.to,
      data: {
        label: rel.type,
        type: rel.type,
        description: rel.description,
      },
      style: {
        stroke: '#10b981',
        lineWidth: 2,
      },
    }));

    return { nodes, edges } as GraphData;
  }, [characters, relations]);

  // 创建数据 ID 字符串用于依赖比较
  const dataId = useMemo(() => {
    return JSON.stringify({
      characters: characters.map(c => ({ id: c.id, name: c.name })),
      relations: relations.map(r => ({ id: r.id, from: r.from, to: r.to })),
    });
  }, [characters, relations]);

  // 初始化 G6 图
  useEffect(() => {
    if (!containerRef.current) {
      console.warn('Container ref is null');
      return;
    }

    const data = graphData;

    // 确保容器有尺寸，如果没有则等待
    const container = containerRef.current;
    let width = container.offsetWidth;
    let height = container.offsetHeight;

    // 如果容器尺寸为 0，等待一下再初始化
    if (width === 0 || height === 0) {
      console.warn('Container size is 0, waiting for layout...', { width, height });
      const timer = setTimeout(() => {
        width = container.offsetWidth || 800;
        height = container.offsetHeight || 600;
        console.log('Retrying with size:', { width, height });
        if (width > 0 && height > 0) {
          initializeGraph(width, height, data);
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    initializeGraph(width, height, data);

    function initializeGraph(width: number, height: number, data: GraphData) {
      console.log('Initializing G6 graph with:', { width, height, nodes: data.nodes?.length || 0, edges: data.edges?.length || 0 });

    // 如果图已存在，先销毁
    if (graphRef.current) {
      try {
        graphRef.current.destroy();
      } catch (e) {
        console.warn('Error destroying existing graph:', e);
      }
      graphRef.current = null;
    }

    if (!containerRef.current) return;

    // 创建图实例 - G6 5.0 方式（按照官方文档）
    const graph = new Graph({
      container: containerRef.current,
      width,
      height,
      data,
      node: {
        type: 'react', // 使用 react 节点类型
        style: {
          size: [80, 80] as [number, number], // 节点大小 [width, height]
          component: (data: any) => <CharacterNode data={data} />, // React 组件
        },
      } as any,
      edge: {
        style: {
          stroke: '#10b981',
          lineWidth: 2,
          endArrow: {
            type: 'vee',
            size: 8,
            fill: '#10b981',
          },
        },
        labelText: (d: any) => d.data?.label || '',
        labelFill: '#10b981',
        labelFontSize: 11,
        labelFontWeight: 500,
        labelBackground: true,
        labelBackgroundFill: 'white',
        labelBackgroundOpacity: 0.8,
        labelPlacement: 'center', // 标签居中
      } as any,
      // 不使用布局，使用节点初始位置
      // layout: {
      //   type: 'force',
      //   ...
      // },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    });

    // G6 5.0 需要显式调用 render（按照官方文档）
    graph.render();

    graphRef.current = graph;

    // 节点点击事件
    graph.on('node:click', (e: any) => {
      const nodeId = e.item?.getID?.() || e.target?.id || e.item?.id;
      if (nodeId) {
        setEditingCharacter(nodeId);
        const character = characters.find((c) => c.id === nodeId);
        if (character) {
          setEditForm({
            name: character.name,
            gender: character.gender,
          });
        }
      }
    });

      // 边点击事件 - 直接进入编辑界面
      graph.on('edge:click', (e: any) => {
        const edgeId = e.item?.getID?.() || e.target?.id || e.item?.id;
        if (edgeId) {
          const relation = relations.find((r) => r.id === edgeId);
          if (relation) {
            setEditingRelation(edgeId);
            setEditForm({
              relationType: relation.type,
              relationDescription: relation.description,
            });
          }
        }
      });

      console.log('G6 graph initialized successfully');
      console.log('Nodes data:', data.nodes?.map(n => ({ 
        id: n.id, 
        x: (n.style as any)?.x, 
        y: (n.style as any)?.y 
      })));
    }

    // 窗口大小改变时调整图大小
    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        const newWidth = containerRef.current.offsetWidth;
        const newHeight = containerRef.current.offsetHeight;
        if (newWidth > 0 && newHeight > 0) {
          graphRef.current.resize(newWidth, newHeight);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying graph:', e);
        }
        graphRef.current = null;
      }
    };
  }, [dataId, graphData]); // 使用稳定的 dataId 和 graphData

  // 数据更新已经在第一个 useEffect 中处理，这里不需要单独的更新逻辑


  const handleSaveCharacter = () => {
    if (editingCharacter) {
      setCharacters((prev) =>
        prev.map((c) =>
          c.id === editingCharacter
            ? { ...c, name: editForm.name || c.name, gender: editForm.gender || c.gender }
            : c
        )
      );
      setEditingCharacter(null);
      setEditForm({});
    }
  };

  const handleAddCharacter = () => {
    setAddingCharacter(true);
    setEditForm({
      name: '新角色',
      gender: '男',
    });
  };

  const handleSaveNewCharacter = () => {
    if (editForm.name) {
      const newCharacter: Character = {
        id: String(Date.now()),
        name: editForm.name,
        gender: editForm.gender || '男',
      };
      setCharacters((prev) => [...prev, newCharacter]);
      setAddingCharacter(false);
      setEditForm({});
    }
  };

  const handleAddRelation = () => {
    if (characters.length < 2) {
      alert('请至少创建两个角色才能添加关系');
      return;
    }
    setAddingRelation(true);
    setEditForm({
      relationFrom: characters[0]?.id || '',
      relationTo: characters[1]?.id || '',
      relationType: '新关系',
      relationDescription: '',
    });
  };

  const handleSaveNewRelation = () => {
    if (editForm.relationFrom && editForm.relationTo && editForm.relationType) {
      // 检查是否已存在相同的关系
      const exists = relations.some(
        (r) =>
          (r.from === editForm.relationFrom && r.to === editForm.relationTo) ||
          (r.from === editForm.relationTo && r.to === editForm.relationFrom)
      );
      if (exists) {
        alert('这两个角色之间已经存在关系');
        return;
      }

      const newRelation: Relation = {
        id: `r${Date.now()}`,
        from: editForm.relationFrom,
        to: editForm.relationTo,
        type: editForm.relationType,
        description: editForm.relationDescription,
      };
      setRelations((prev) => [...prev, newRelation]);
      setAddingRelation(false);
      setEditForm({});
    }
  };

  const handleDeleteCharacter = (characterId: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== characterId));
    setRelations((prev) => prev.filter((r) => r.from !== characterId && r.to !== characterId));
  };

  const handleDeleteRelation = (relationId: string) => {
    setRelations((prev) => prev.filter((r) => r.id !== relationId));
  };

  const handleSaveRelation = () => {
    if (editingRelation) {
      setRelations((prev) =>
        prev.map((r) =>
          r.id === editingRelation
            ? {
                ...r,
                type: editForm.relationType || r.type,
                description: editForm.relationDescription || r.description,
              }
            : r
        )
      );
      setEditingRelation(null);
      setEditForm({});
    }
  };

  return (
    <div className="character-relations">
      <div className="relations-header">
        <h3>人物关系网</h3>
        <div className="header-actions">
          <button className="action-btn" onClick={handleAddCharacter}>
            <Plus size={16} />
            <span>添加角色</span>
          </button>
          <button className="action-btn" onClick={handleAddRelation}>
            <Plus size={16} />
            <span>添加关系</span>
          </button>
        </div>
      </div>

      <div className="relations-content">
        <div className="relations-canvas" ref={containerRef}></div>

        {/* 侧边栏 - 角色和关系列表 */}
        <div className="relations-sidebar">
          <div className="sidebar-section">
            <h4>角色列表</h4>
            <div className="character-list">
              {characters.map((character) => (
                <div
                  key={character.id}
                  className={`character-item ${editingCharacter === character.id ? 'active' : ''}`}
                  onClick={() => {
                    setEditingCharacter(character.id);
                    setEditForm({
                      name: character.name,
                      gender: character.gender,
                    });
                  }}
                >
                  <div className="character-info">
                    <div className="character-name">{character.name}</div>
                    <div className="character-gender">{character.gender}</div>
                  </div>
                  <div className="character-actions">
                    <button
                      className="action-icon-btn"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCharacter(character.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <h4>关系列表</h4>
            <div className="relations-list">
              {relations.map((relation) => {
                const fromChar = characters.find((c) => c.id === relation.from);
                const toChar = characters.find((c) => c.id === relation.to);
                return (
                  <div
                    key={relation.id}
                    className={`relation-item ${editingRelation === relation.id ? 'active' : ''}`}
                    onClick={() => {
                      setEditingRelation(relation.id);
                      const relationData = relations.find((r) => r.id === relation.id);
                      if (relationData) {
                        setEditForm({
                          relationType: relationData.type,
                          relationDescription: relationData.description,
                        });
                      }
                    }}
                  >
                    <div className="relation-item-content">
                      <span className="relation-from">{fromChar?.name || '未知'}</span>
                      <ArrowRight size={14} />
                      <span className="relation-type">{relation.type || '未知'}</span>
                      <ArrowRight size={14} />
                      <span className="relation-to">{toChar?.name || '未知'}</span>
                    </div>
                    {relation.description && (
                      <div className="relation-description">{relation.description}</div>
                    )}
                    <div className="relation-actions">
                      <button
                        className="action-icon-btn"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRelation(relation.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 编辑角色的模态框 */}
      {editingCharacter && (
        <div className="edit-modal-overlay" onClick={() => { setEditingCharacter(null); setEditForm({}); }}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h4>编辑角色</h4>
            <div className="modal-form">
              <label>
                <span>角色名称</span>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="edit-input"
                  placeholder="角色名称"
                  autoFocus
                />
              </label>
              <label>
                <span>性别</span>
                <select
                  value={editForm.gender || '男'}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as '男' | '女' })}
                  className="edit-select"
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </label>
              <div className="modal-actions">
                <button className="save-btn" onClick={handleSaveCharacter}>
                  保存
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setEditingCharacter(null);
                    setEditForm({});
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加角色弹窗 */}
      {addingCharacter && (
        <div className="edit-modal-overlay" onClick={() => { setAddingCharacter(false); setEditForm({}); }}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h4>添加角色</h4>
            <div className="modal-form">
              <label>
                <span>角色名称</span>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="edit-input"
                  placeholder="角色名称"
                  autoFocus
                />
              </label>
              <label>
                <span>性别</span>
                <select
                  value={editForm.gender || '男'}
                  onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as '男' | '女' })}
                  className="edit-select"
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </label>
              <div className="modal-actions">
                <button className="save-btn" onClick={handleSaveNewCharacter}>
                  保存
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setAddingCharacter(false);
                    setEditForm({});
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加关系弹窗 */}
      {addingRelation && (
        <div className="edit-modal-overlay" onClick={() => { setAddingRelation(false); setEditForm({}); }}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h4>添加关系</h4>
            <div className="modal-form">
              <label>
                <span>起始角色</span>
                <select
                  value={editForm.relationFrom || ''}
                  onChange={(e) => setEditForm({ ...editForm, relationFrom: e.target.value })}
                  className="edit-select"
                >
                  {characters.map((char) => (
                    <option key={char.id} value={char.id}>
                      {char.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>关系类型</span>
                <input
                  type="text"
                  value={editForm.relationType || ''}
                  onChange={(e) => setEditForm({ ...editForm, relationType: e.target.value })}
                  className="edit-input"
                  placeholder="例如：朋友、恋人、对手等"
                  autoFocus
                />
              </label>
              <label>
                <span>目标角色</span>
                <select
                  value={editForm.relationTo || ''}
                  onChange={(e) => setEditForm({ ...editForm, relationTo: e.target.value })}
                  className="edit-select"
                >
                  {characters.map((char) => (
                    <option key={char.id} value={char.id}>
                      {char.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>关系描述（可选）</span>
                <textarea
                  value={editForm.relationDescription || ''}
                  onChange={(e) => setEditForm({ ...editForm, relationDescription: e.target.value })}
                  className="edit-textarea"
                  placeholder="描述这两个角色之间的关系..."
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button className="save-btn" onClick={handleSaveNewRelation}>
                  保存
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setAddingRelation(false);
                    setEditForm({});
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑关系弹窗 */}
      {editingRelation && (() => {
        const relation = relations.find((r) => r.id === editingRelation);
        const fromChar = characters.find((c) => c.id === relation?.from);
        const toChar = characters.find((c) => c.id === relation?.to);
        return relation ? (
          <div className="edit-modal-overlay" onClick={() => { setEditingRelation(null); setEditForm({}); }}>
            <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
              <h4>编辑关系</h4>
              <div className="modal-form">
                <div className="relation-info-display" style={{ marginBottom: '16px' }}>
                  <div className="relation-characters">
                    <span className="relation-char-name">{fromChar?.name || '未知'}</span>
                    <ArrowRight size={20} />
                    <span className="relation-type-display">{relation.type}</span>
                    <ArrowRight size={20} />
                    <span className="relation-char-name">{toChar?.name || '未知'}</span>
                  </div>
                </div>
                <label>
                  <span>关系类型</span>
                  <input
                    type="text"
                    value={editForm.relationType || ''}
                    onChange={(e) => setEditForm({ ...editForm, relationType: e.target.value })}
                    className="edit-input"
                    placeholder="例如：朋友、恋人、对手等"
                    autoFocus
                  />
                </label>
                <label>
                  <span>关系描述（可选）</span>
                  <textarea
                    value={editForm.relationDescription || ''}
                    onChange={(e) => setEditForm({ ...editForm, relationDescription: e.target.value })}
                    className="edit-textarea"
                    placeholder="描述这两个角色之间的关系..."
                    rows={3}
                  />
                </label>
                <div className="modal-actions">
                  <button className="save-btn" onClick={handleSaveRelation}>
                    保存
                  </button>
                  <button
                    className="cancel-btn"
                    onClick={() => {
                      setEditingRelation(null);
                      setEditForm({});
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );
}
