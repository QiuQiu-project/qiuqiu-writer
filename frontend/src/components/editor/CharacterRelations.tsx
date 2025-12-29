import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Plus, ArrowRight, User, Trash2, Maximize2, X } from 'lucide-react';
import { ExtensionCategory, Graph, register } from '@antv/g6';
import { ReactNode } from '@antv/g6-extension-react';
import type { GraphData } from '@antv/g6';
import './CharacterRelations.css';

// 注册 React 节点扩展
register(ExtensionCategory.NODE, 'react', ReactNode);

// 导出接口供外部使用
export interface Character {
  id: string;
  name: string;
  gender: '男' | '女';
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  type: string;
  description?: string;
}

export interface CharacterRelationsData {
  characters: Character[];
  relations: Relation[];
}

// 组件属性
interface CharacterRelationsProps {
  data?: CharacterRelationsData;
  onChange?: (data: CharacterRelationsData) => void;
}

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

// 创建稳定的数据字符串用于比较
// 注意：只比较角色的 name 和 gender，不比较 id（因为 id 可能包含时间戳，不稳定）
function getDataId(data?: CharacterRelationsData): string {
  if (!data) return '';
  // 对数组进行排序，确保相同内容的数据生成相同的ID
  // 使用 name 作为排序键，因为 name 是稳定的
  const sortedCharacters = [...(data.characters || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sortedRelations = [...(data.relations || [])].sort((a, b) => {
    // 关系排序：先按 from，再按 to
    const fromCompare = (a.from || '').localeCompare(b.from || '');
    if (fromCompare !== 0) return fromCompare;
    return (a.to || '').localeCompare(b.to || '');
  });
  
  return JSON.stringify({
    // 只比较 name 和 gender，不比较 id（避免时间戳导致的变化）
    characters: sortedCharacters.map(c => ({ name: c.name, gender: c.gender })),
    // 关系使用 from 和 to 的 name（如果可能），或者使用 id
    relations: sortedRelations.map(r => ({ from: r.from, to: r.to, type: r.type })),
  });
}

function CharacterRelations({ data, onChange }: CharacterRelationsProps) {
  // 使用外部传入的数据，如果没有则使用空数组
  const [characters, setCharacters] = useState<Character[]>(data?.characters || []);
  const [relations, setRelations] = useState<Relation[]>(data?.relations || []);

  // 使用稳定的数据ID来检测数据变化
  const dataId = useMemo(() => getDataId(data), [data]);
  const prevDataIdRef = useRef<string>('');

  // 同步外部数据变化 - 使用深度比较避免不必要的更新
  useEffect(() => {
    // 只有当数据ID真正改变时才更新状态
    if (dataId !== prevDataIdRef.current && dataId !== '') {
      prevDataIdRef.current = dataId;
      if (data) {
        // 标记这是外部数据更新，不要触发 onChange
        isExternalUpdateRef.current = true;
        setCharacters(data.characters || []);
        setRelations(data.relations || []);
        // 重置标志
        setTimeout(() => {
          isExternalUpdateRef.current = false;
        }, 0);
      }
    }
  }, [dataId]); // 只依赖 dataId，不依赖 data 对象引用

  // 使用 useRef 存储 onChange 回调，避免依赖变化导致重新渲染
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 使用 ref 标记是否是外部数据更新（避免循环）
  const isExternalUpdateRef = useRef(false);
  const [editingRelation, setEditingRelation] = useState<string | null>(null);
  const [addingRelation, setAddingRelation] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editForm, setEditForm] = useState<{
    relationType?: string;
    relationDescription?: string;
    relationFrom?: string;
    relationTo?: string;
  }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const fullscreenGraphRef = useRef<Graph | null>(null);

  // 使用 useMemo 来稳定数据引用，避免不必要的重新渲染
  const graphData = useMemo(() => {
    // 计算初始位置，让节点均匀分布在一个圆形上
    const nodeCount = characters.length;
    
    // 如果没有节点，返回空数据
    if (nodeCount === 0) {
      return { nodes: [], edges: [] } as GraphData;
    }
    
    // 使用固定尺寸计算位置，避免依赖容器尺寸导致重新计算
    // 容器尺寸会在初始化时动态获取
    const containerWidth = 800;
    const containerHeight = 600;
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    const radius = Math.max(150, nodeCount * 40); // 根据节点数量调整半径
    
    const nodes = characters.map((char, index) => {
      // 计算节点在圆形上的位置
      const angle = nodeCount === 1 
        ? 0 // 如果只有一个节点，放在中心
        : (index * 2 * Math.PI) / nodeCount - Math.PI / 2; // 从顶部开始
      const x = nodeCount === 1 ? centerX : centerX + radius * Math.cos(angle);
      const y = nodeCount === 1 ? centerY : centerY + radius * Math.sin(angle);
      
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

  // 创建数据 ID 字符串用于 G6 初始化依赖比较
  const graphDataId = useMemo(() => {
    return JSON.stringify({
      characters: characters.map(c => ({ id: c.id, name: c.name })),
      relations: relations.map(r => ({ id: r.id, from: r.from, to: r.to })),
    });
  }, [characters, relations]);

  // 使用 ref 存储上一次的 graphDataId，确保不会重复初始化
  const prevGraphDataIdRef = useRef<string>('');
  const isInitializingRef = useRef(false);

  // 初始化 G6 图
  useEffect(() => {
    // 如果 graphDataId 没有变化，不重新初始化
    if (graphDataId === prevGraphDataIdRef.current && graphDataId !== '') {
      // 不返回清理函数，保持图实例
      return;
    }

    // 如果正在初始化，不重复初始化
    if (isInitializingRef.current) {
      return;
    }

    if (!containerRef.current) {
      return;
    }

    // 如果 graphDataId 变化了，先清理旧的图实例
    if (graphDataId !== prevGraphDataIdRef.current && prevGraphDataIdRef.current !== '' && graphRef.current) {
      try {
        graphRef.current.destroy();
      } catch (e) {
        // 忽略清理错误
      }
      graphRef.current = null;
    }

    // 标记正在初始化
    isInitializingRef.current = true;
    prevGraphDataIdRef.current = graphDataId;

    // 使用当前的 graphData（在 useMemo 中已经稳定）
    const data = graphData;

    // 确保容器有尺寸，如果没有则等待
    const container = containerRef.current;
    let width = container.offsetWidth;
    let height = container.offsetHeight;

    // 如果容器尺寸为 0，等待一下再初始化
    if (width === 0 || height === 0) {
      const timer = setTimeout(() => {
        // 再次检查 graphDataId 是否变化
        if (graphDataId !== prevGraphDataIdRef.current) {
          isInitializingRef.current = false;
          return;
        }
        width = container.offsetWidth || 800;
        height = container.offsetHeight || 600;
        if (width > 0 && height > 0) {
          initializeGraph(width, height, data);
        } else {
          initializeGraph(800, 600, data);
        }
      }, 200);
      return () => {
        clearTimeout(timer);
        // 如果组件卸载，重置标志
        isInitializingRef.current = false;
      };
    }

    initializeGraph(width, height, data);

    function initializeGraph(width: number, height: number, data: GraphData) {
      // 在初始化前再次检查 graphDataId 是否仍然匹配
      const currentGraphDataId = graphDataId;
      
      // 如果图已存在，先销毁
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch (e) {
          // 忽略清理错误
        }
        graphRef.current = null;
      }

      if (!containerRef.current) {
        isInitializingRef.current = false;
        return;
      }

      // 确保容器有最小尺寸
      if (width < 100) width = 800;
      if (height < 100) height = 600;

      let graph: Graph | null = null;
      
      try {
        // 创建图实例 - G6 5.0 方式（按照官方文档）
        graph = new Graph({
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
          behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
        });

        // 在 render 之前再次检查 graphDataId 是否仍然匹配
        if (currentGraphDataId !== prevGraphDataIdRef.current) {
          // graphDataId 已经变化，销毁刚创建的图实例
          try {
            graph.destroy();
          } catch (e) {
            // 忽略清理错误
          }
          isInitializingRef.current = false;
          return;
        }

        // G6 5.0 需要显式调用 render（按照官方文档）
        // render() 可能返回 Promise，但即使不是 Promise 也安全
        const renderResult = graph.render();
        
        // 如果 render() 返回 Promise，等待它完成
        if (renderResult && typeof renderResult.then === 'function') {
          renderResult
            .then(() => {
              // render 完成后再次检查 graphDataId 是否仍然匹配
              if (currentGraphDataId === prevGraphDataIdRef.current && graph) {
                graphRef.current = graph;
                
                // 标记初始化完成
                isInitializingRef.current = false;

                // 节点点击事件已移除 - 角色不允许编辑

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
                        relationFrom: relation.from,
                        relationTo: relation.to,
                      });
                    }
                  }
                });
              } else {
                // graphDataId 已经变化，销毁图实例
                if (graph) {
                  try {
                    graph.destroy();
                  } catch (e) {
                    // 忽略清理错误
                  }
                }
                isInitializingRef.current = false;
              }
            })
            .catch((error) => {
              // render 失败，清理图实例
              if (graph) {
                try {
                  graph.destroy();
                } catch (e) {
                  // 忽略清理错误
                }
              }
              isInitializingRef.current = false;
            });
        } else {
          // render() 不是 Promise，直接设置
          if (currentGraphDataId === prevGraphDataIdRef.current && graph) {
            graphRef.current = graph;
            
            // 标记初始化完成
            isInitializingRef.current = false;

            // 节点点击事件 - 必须在 graph 创建成功后注册
            // 节点点击事件已移除 - 角色不允许编辑

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
                    relationFrom: relation.from,
                    relationTo: relation.to,
                  });
                }
              }
            });
          } else {
            // graphDataId 已经变化，销毁图实例
            if (graph) {
              try {
                graph.destroy();
              } catch (e) {
                // 忽略清理错误
              }
            }
            isInitializingRef.current = false;
          }
        }
      } catch (error) {
        if (graph) {
          try {
            graph.destroy();
          } catch (e) {
            // 忽略清理错误
          }
        }
        // 即使失败也要重置标志
        isInitializingRef.current = false;
      }

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
      // 注意：只在组件真正卸载时才清理图实例
      // 如果只是 graphDataId 变化，清理逻辑在上面已经处理了
      // 这里只重置标志，不销毁图实例（因为图实例需要在组件卸载时才销毁）
      isInitializingRef.current = false;
    };
  }, [graphDataId]); // 只使用稳定的 graphDataId 作为依赖，避免 graphData 对象引用变化导致循环

  // 组件卸载时清理图实例
  useEffect(() => {
    return () => {
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch (e) {
          // 忽略清理错误
        }
        graphRef.current = null;
      }
      if (fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch (e) {
          // 忽略清理错误
        }
        fullscreenGraphRef.current = null;
      }
    };
  }, []); // 只在组件卸载时执行

  // 全屏模式初始化图
  useEffect(() => {
    if (!isFullscreen || !fullscreenContainerRef.current || characters.length === 0) {
      // 如果关闭全屏，清理全屏图实例
      if (!isFullscreen && fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch (e) {
          // 忽略清理错误
        }
        fullscreenGraphRef.current = null;
      }
      return;
    }

    // 延迟一下确保容器已渲染
    const timer = setTimeout(() => {
      if (!fullscreenContainerRef.current) return;

      const container = fullscreenContainerRef.current;
      const width = container.offsetWidth || window.innerWidth - 100;
      const height = container.offsetHeight || window.innerHeight - 150;

      // 如果全屏图已存在，先销毁
      if (fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch (e) {
          // 忽略清理错误
        }
      }

      try {
        // 创建全屏图实例
        const fullscreenGraph = new Graph({
          container: container,
          width,
          height,
          data: graphData,
          node: {
            type: 'react',
            style: {
              size: [80, 80] as [number, number],
              component: (data: any) => <CharacterNode data={data} />,
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
            labelFontSize: 12,
            labelFontWeight: 500,
            labelBackground: true,
            labelBackgroundFill: 'white',
            labelBackgroundOpacity: 0.8,
            labelPlacement: 'center',
          } as any,
          behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
        });

        const renderResult = fullscreenGraph.render();
        
        if (renderResult && typeof renderResult.then === 'function') {
          renderResult.then(() => {
            fullscreenGraphRef.current = fullscreenGraph;
          }).catch((error) => {
            console.error('全屏图渲染失败:', error);
          });
        } else {
          fullscreenGraphRef.current = fullscreenGraph;
        }

        // 窗口大小改变时调整全屏图大小
        const handleResize = () => {
          if (fullscreenGraphRef.current && fullscreenContainerRef.current) {
            const newWidth = fullscreenContainerRef.current.offsetWidth || window.innerWidth - 100;
            const newHeight = fullscreenContainerRef.current.offsetHeight || window.innerHeight - 150;
            if (newWidth > 0 && newHeight > 0) {
              fullscreenGraphRef.current.resize(newWidth, newHeight);
            }
          }
        };

        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (error) {
        console.error('创建全屏图失败:', error);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [isFullscreen, graphData, characters.length]);

  // 数据更新已经在第一个 useEffect 中处理，这里不需要单独的更新逻辑


  // 角色编辑和添加功能已移除 - 角色只能从角色列表中获取

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
      // 用户操作后通知父组件
      setTimeout(() => {
        if (onChangeRef.current) {
          onChangeRef.current({ 
            characters, 
            relations: [...relations, newRelation] 
          });
        }
      }, 0);
    }
  };

  // 角色删除功能已移除 - 角色只能从角色列表中管理

  const handleDeleteRelation = (relationId: string) => {
    const newRelations = relations.filter((r) => r.id !== relationId);
    setRelations(newRelations);
    // 用户操作后通知父组件
    setTimeout(() => {
      if (onChangeRef.current) {
        onChangeRef.current({ characters, relations: newRelations });
      }
    }, 0);
  };

  const handleSaveRelation = () => {
    if (editingRelation && editForm.relationFrom && editForm.relationTo && editForm.relationType) {
      // 检查是否修改了角色，如果修改了，需要检查是否会产生重复关系
      const currentRelation = relations.find((r) => r.id === editingRelation);
      if (currentRelation) {
        const fromChanged = currentRelation.from !== editForm.relationFrom;
        const toChanged = currentRelation.to !== editForm.relationTo;
        
        // 如果修改了角色，检查是否会产生重复关系
        if (fromChanged || toChanged) {
          const wouldConflict = relations.some(
            (r) =>
              r.id !== editingRelation && // 排除当前关系
              ((r.from === editForm.relationFrom && r.to === editForm.relationTo) ||
               (r.from === editForm.relationTo && r.to === editForm.relationFrom))
          );
          if (wouldConflict) {
            alert('这两个角色之间已经存在关系');
            return;
          }
        }
      }

      const newRelations = relations.map((r) =>
        r.id === editingRelation
          ? {
              ...r,
              from: editForm.relationFrom,
              to: editForm.relationTo,
              type: editForm.relationType,
              description: editForm.relationDescription || r.description,
            }
          : r
      );
      setRelations(newRelations);
      setEditingRelation(null);
      setEditForm({});
      // 用户操作后通知父组件
      setTimeout(() => {
        if (onChangeRef.current) {
          onChangeRef.current({ characters, relations: newRelations });
        }
      }, 0);
    }
  };

  return (
    <div className="character-relations">
      <div className="relations-header">
        <h3>人物关系网</h3>
        <div className="header-actions">
          {characters.length > 0 && (
            <button 
              className="action-btn" 
              onClick={() => setIsFullscreen(true)}
              title="放大查看"
            >
              <Maximize2 size={16} />
              <span>放大</span>
            </button>
          )}
          <button className="action-btn" onClick={handleAddRelation}>
            <Plus size={16} />
            <span>添加关系</span>
          </button>
        </div>
      </div>

      <div className="relations-content">
        {characters.length === 0 ? (
          <div className="relations-empty">
            <User size={48} />
            <h4>暂无角色</h4>
            <p>请在角色列表中添加角色，然后在此创建关系</p>
          </div>
        ) : (
          <div className="relations-canvas" ref={containerRef}></div>
        )}

        {/* 侧边栏 - 角色和关系列表 */}
        <div className="relations-sidebar">
          <div className="sidebar-section">
            <h4>角色列表 ({characters.length})</h4>
            <div className="character-list">
              {characters.length === 0 && (
                <div className="list-empty">请在角色列表中添加角色</div>
              )}
              {characters.map((character) => (
                <div
                  key={character.id}
                  className="character-item"
                >
                  <div className="character-info">
                    <div className="character-name">{character.name}</div>
                    <div className="character-gender">{character.gender}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <h4>关系列表 ({relations.length})</h4>
            <div className="relations-list">
              {relations.length === 0 && (
                <div className="list-empty">
                  {characters.length < 2 ? '至少需要2个角色才能添加关系' : '点击上方按钮添加关系'}
                </div>
              )}
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
                          relationFrom: relationData.from,
                          relationTo: relationData.to,
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
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setAddingRelation(false);
                    setEditForm({});
                  }}
                >
                  取消
                </button>
                <div className="footer-spacer" />
                <button className="save-btn" onClick={handleSaveNewRelation}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑关系弹窗 */}
      {editingRelation && (() => {
        const relation = relations.find((r) => r.id === editingRelation);
        const fromChar = characters.find((c) => c.id === editForm.relationFrom || relation?.from);
        const toChar = characters.find((c) => c.id === editForm.relationTo || relation?.to);
        return relation ? (
          <div className="edit-modal-overlay" onClick={() => { setEditingRelation(null); setEditForm({}); }}>
            <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
              <h4>编辑关系</h4>
              <div className="modal-form">
                <label>
                  <span>起始角色</span>
                  <select
                    value={editForm.relationFrom || relation.from || ''}
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
                    value={editForm.relationTo || relation.to || ''}
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
                  <button
                    className="cancel-btn"
                    onClick={() => {
                      setEditingRelation(null);
                      setEditForm({});
                    }}
                  >
                    取消
                  </button>
                  <div className="footer-spacer" />
                  <button className="save-btn" onClick={handleSaveRelation}>
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* 全屏放大模态框 */}
      {isFullscreen && (
        <div className="fullscreen-modal-overlay" onClick={() => setIsFullscreen(false)}>
          <div className="fullscreen-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-header">
              <h3>人物关系网 - 全屏查看</h3>
              <button 
                className="close-fullscreen-btn" 
                onClick={() => setIsFullscreen(false)}
                title="关闭"
              >
                <X size={20} />
              </button>
            </div>
            <div className="fullscreen-canvas" ref={fullscreenContainerRef}></div>
          </div>
        </div>
      )}
    </div>
  );
}

// 使用 memo 包装组件，自定义比较函数
// 只比较 data，忽略 onChange（因为 onChange 在组件内部用 useRef 存储，变化不影响行为）
export default memo(CharacterRelations, (prevProps, nextProps) => {
  // 只比较 data，忽略 onChange
  const prevDataId = getDataId(prevProps.data);
  const nextDataId = getDataId(nextProps.data);
  
  // 如果数据ID相同，不重新渲染（即使 onChange 引用不同）
  return prevDataId === nextDataId; // 返回 true 表示 props 相同，不需要重新渲染
});
