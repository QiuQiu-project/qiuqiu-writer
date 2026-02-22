import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Plus, User, Maximize2, X, Trash2, Pencil } from 'lucide-react';
import { ExtensionCategory, Graph, register } from '@antv/g6';
import { ReactNode } from '@antv/g6-extension-react';
import type { GraphData } from '@antv/g6';
import './CharacterRelations.css';

// 注册 React 节点扩展
try {
  register(ExtensionCategory.NODE, 'react', ReactNode);
} catch (error) {
  // 忽略重复注册的错误
  console.debug('G6 React Node extension registration skipped:', error);
}

function getCssVar(name: string, fallback: string): string {
  try {
    const val =
      typeof window !== 'undefined'
        ? getComputedStyle(document.documentElement).getPropertyValue(name)
        : '';
    const trimmed = (val || '').trim();
    return trimmed || fallback;
  } catch {
    return fallback;
  }
}

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
  dependencyKeys?: string[];
}

interface NodeData {
  data?: {
    name?: string;
  };
  id?: string;
}

// 自定义 React 节点组件
const CharacterNode = ({ data }: { data: NodeData }) => {
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

function CharacterRelations({ data, onChange, dependencyKeys = [] }: CharacterRelationsProps) {
  // 使用外部传入的数据，如果没有则使用空数组
  const [characters, setCharacters] = useState<Character[]>(data?.characters || []);
  const [relations, setRelations] = useState<Relation[]>(data?.relations || []);
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [manualLinking, setManualLinking] = useState(false);
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
  const manualLinkingRef = useRef(false);
  useEffect(() => {
    if (viewMode !== 'graph') {
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch {
          // 忽略清理错误
        }
        graphRef.current = null;
      }
      if (fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch {
          // 忽略清理错误
        }
        fullscreenGraphRef.current = null;
      }
      setIsFullscreen(false);
      setManualLinking(false);
    }
  }, [viewMode]);
  const pendingFromRef = useRef<string | null>(null);
  const tempEdgeIdRef = useRef<string | null>(null);
  useEffect(() => {
    manualLinkingRef.current = manualLinking;
    const graph = graphRef.current;
    if (!graph) return;

    const behaviors: unknown[] = ['drag-canvas', 'zoom-canvas'];
    if (manualLinking) {
      behaviors.push({
        type: 'create-edge',
        trigger: 'drag',
        onFinish: (e: unknown) => {
          const ev = e as { [key: string]: unknown } | undefined;
          const dataObj =
            (ev?.data as Record<string, unknown> | undefined) ||
            ((ev?.item as { model?: Record<string, unknown> } | undefined)
              ?.model);
          
          // 记录临时创建的边ID
          const edgeId = (ev?.item as { id?: string } | undefined)?.id;
          if (edgeId) {
            tempEdgeIdRef.current = edgeId;
          }

          const sourceId = (dataObj?.source as string | undefined) || undefined;
          const targetId = (dataObj?.target as string | undefined) || undefined;
          if (!sourceId || !targetId) return;
          setEditForm({
            relationFrom: sourceId,
            relationTo: targetId,
            relationType: '',
            relationDescription: '',
          });
          setAddingRelation(true);
        },
      });
    } else {
      behaviors.push('drag-element');
    }
    const g = graph as unknown as {
      setBehaviors?: (b: unknown[]) => void;
    };
    if (g.setBehaviors) {
      g.setBehaviors(behaviors);
    }
  }, [manualLinking]);

  // 使用 useMemo 来稳定数据引用，避免不必要的重新渲染
  const graphData = useMemo(() => {
    const edgeColor = getCssVar('--text-primary', '#000000');
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        stroke: edgeColor,
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
    if (viewMode !== 'graph') {
      return;
    }
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
      } catch {
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
        } catch {
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
        const edgeColor = getCssVar('--text-primary', '#000000');
        const labelBg = getCssVar('--bg-secondary', '#ffffff');
        const labelText = getCssVar('--text-primary', '#000000');
        graph = new Graph({
          container: containerRef.current,
          width,
          height,
          data,
          node: {
            type: 'react', // 使用 react 节点类型
            style: {
              size: [80, 80] as [number, number], // 节点大小 [width, height]
              component: (data: unknown) => <CharacterNode data={data as NodeData} />, // React 组件
            },
          } as unknown as object,
          edge: {
            style: {
              stroke: edgeColor,
              lineWidth: 2,
              endArrow: {
                type: 'vee',
                size: 8,
                fill: edgeColor,
              },
            },
            labelText: (d: unknown) => {
              const dd = d as { data?: { label?: string } } | undefined;
              return dd?.data?.label || '';
            },
            labelFill: labelText,
            labelFontSize: 11,
            labelFontWeight: 500,
            labelBackground: true,
            labelBackgroundFill: labelBg,
            labelBackgroundOpacity: 0.95,
            labelPlacement: 'center', // 标签居中
          } as unknown as object,
          behaviors: manualLinkingRef.current
            ? [
                'drag-canvas',
                'zoom-canvas',
                {
                  type: 'create-edge',
                  trigger: 'drag',
                  onFinish: (e: unknown) => {
                    const ev = e as { [key: string]: unknown } | undefined;
                    const dataObj =
                      (ev?.data as Record<string, unknown> | undefined) ||
                      ((ev?.item as { model?: Record<string, unknown> } | undefined)
                        ?.model);
                    const sourceId = (dataObj?.source as string | undefined) || undefined;
                    const targetId = (dataObj?.target as string | undefined) || undefined;
                    if (!sourceId || !targetId) return;
                    setEditForm({
                      relationFrom: sourceId,
                      relationTo: targetId,
                      relationType: '',
                      relationDescription: '',
                    });
                    setAddingRelation(true);
                  },
                },
              ]
            : ['drag-canvas', 'zoom-canvas', 'drag-element'],
        });

        // 在 render 之前再次检查 graphDataId 是否仍然匹配
        if (currentGraphDataId !== prevGraphDataIdRef.current) {
          // graphDataId 已经变化，销毁刚创建的图实例
          try {
            graph.destroy();
          } catch {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

            

            // 节点点击事件 - 仅用于非连线模式下的交互（如有）
            // 注意：手动连线现在通过 create-edge behavior 处理，不再需要 node:click
              } else {
                // graphDataId 已经变化，销毁图实例
                if (graph) {
                  try {
                    graph.destroy();
                  } catch {
                    // 忽略清理错误
                  }
                }
                isInitializingRef.current = false;
              }
            })
            .catch(() => {
              // render 失败，清理图实例
              if (graph) {
                try {
                  graph.destroy();
                } catch {
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
            graph.on('edge:click', (e: unknown) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const event = e as any;
              const edgeId = event.item?.getID?.() || event.target?.id || event.item?.id;
              if (!edgeId) return;
              const relation = relations.find((r) => r.id === edgeId);
              if (!relation) return;
              setEditingRelation(edgeId);
              setEditForm({
                relationType: relation.type,
                relationDescription: relation.description,
                relationFrom: relation.from,
                relationTo: relation.to,
              });
            });

            
          } else {
            // graphDataId 已经变化，销毁图实例
            if (graph) {
              try {
                graph.destroy();
              } catch {
                // 忽略清理错误
              }
            }
            isInitializingRef.current = false;
          }
        }
      } catch {
        if (graph) {
          try {
            graph.destroy();
          } catch {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphDataId]); // 只使用稳定的 graphDataId 作为依赖，避免 graphData 对象引用变化导致循环

  // 组件卸载时清理图实例
  useEffect(() => {
    return () => {
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch {
          // 忽略清理错误
        }
        graphRef.current = null;
      }
      if (fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch {
          // 忽略清理错误
        }
        fullscreenGraphRef.current = null;
      }
    };
  }, []); // 只在组件卸载时执行

  // 全屏模式初始化图
  useEffect(() => {
    if (viewMode !== 'graph') {
      return;
    }
    if (!isFullscreen || !fullscreenContainerRef.current || characters.length === 0) {
      // 如果关闭全屏，清理全屏图实例
      if (!isFullscreen && fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch {
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
        } catch {
          // 忽略清理错误
        }
      }

      try {
        // 创建全屏图实例
        const edgeColor = getCssVar('--text-primary', '#000000');
        const labelBg = getCssVar('--bg-secondary', '#ffffff');
        const labelText = getCssVar('--text-primary', '#000000');
        const fullscreenGraph = new Graph({
          container: container,
          width,
          height,
          data: graphData,
          node: {
            type: 'react',
            style: {
              size: [80, 80] as [number, number], // 节点大小 [width, height]
              component: (data: unknown) => <CharacterNode data={data as NodeData} />, // React 组件
            },
          } as unknown as object,
          edge: {
            style: {
              stroke: edgeColor,
              lineWidth: 2,
              endArrow: {
                type: 'vee',
                size: 8,
                fill: edgeColor,
              },
            },
            labelText: (d: unknown) => {
              const dd = d as { data?: { label?: string } } | undefined;
              return dd?.data?.label || '';
            },
            labelFill: labelText,
            labelFontSize: 12,
            labelFontWeight: 500,
            labelBackground: true,
            labelBackgroundFill: labelBg,
            labelBackgroundOpacity: 0.95,
            labelPlacement: 'center',
          } as unknown as object,
          behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
        });

        const renderResult = fullscreenGraph.render();
        
        if (renderResult && typeof renderResult.then === 'function') {
          renderResult.then(() => {
            fullscreenGraphRef.current = fullscreenGraph;
          }).catch(() => {
            
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
      } catch {
        // ignore
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [isFullscreen, graphData, characters.length, viewMode]);

  return (
    <div className="character-relations">
      <div className="relations-header">
        <div className="relations-title">
          <h3>人物关系</h3>
          {dependencyKeys.length > 0 && (
            <div className="relations-meta">
              依赖数据键：{dependencyKeys.join(', ')}（已加载 {characters.length} 人物）
            </div>
          )}
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              type="button"
            >
              列表
            </button>
            <button
              className={`toggle-btn ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
              type="button"
            >
              关系图
            </button>
          </div>
          <button
            className="action-btn"
            onClick={() => setAddingRelation(true)}
            title="添加关系"
          >
            <Plus size={16} />
            <span>添加关系</span>
          </button>
          {viewMode === 'graph' && (
            <>
              <button
                className="action-btn"
                onClick={() => {
                  if (characters.length < 2) return;
                  pendingFromRef.current = null;
                  setManualLinking(v => !v);
                }}
                title="手动连线"
              >
                <Maximize2 size={16} />
                <span>{manualLinking ? '取消连线' : '手动连线'}</span>
              </button>
              <button
                className="action-btn"
                onClick={() => setIsFullscreen(true)}
                title="全屏查看"
              >
                <Maximize2 size={16} />
                <span>全屏</span>
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'graph' ? (
        <div className="relations-canvas" ref={containerRef}></div>
      ) : (
        <div className="relations-list">
          {relations.length === 0 ? (
            <div className="list-empty">暂无人物关系，点击“添加关系”来创建</div>
          ) : (
            <div className="relations-list-table">
              <div className="relations-list-header">
                <div className="relations-list-cell">角色A</div>
                <div className="relations-list-cell">关系</div>
                <div className="relations-list-cell">角色B</div>
                <div className="relations-list-cell">描述</div>
                <div className="relations-list-cell">操作</div>
              </div>
              {relations.map((rel) => {
                const fromName = characters.find(c => c.id === rel.from)?.name || rel.from;
                const toName = characters.find(c => c.id === rel.to)?.name || rel.to;
                return (
                  <div key={rel.id} className="relations-list-row">
                    <div className="relations-list-cell">{fromName}</div>
                    <div className="relations-list-cell">
                      <span className="relation-pill">{rel.type || '关系'}</span>
                    </div>
                    <div className="relations-list-cell">{toName}</div>
                    <div className="relations-list-cell relation-desc">
                      {rel.description || '—'}
                    </div>
                    <div className="relations-list-cell relation-actions">
                      <button
                        className="action-btn"
                        type="button"
                        title="编辑"
                        onClick={() => {
                          setEditingRelation(rel.id);
                          setEditForm({
                            relationType: rel.type,
                            relationDescription: rel.description,
                            relationFrom: rel.from,
                            relationTo: rel.to,
                          });
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="delete-btn"
                        type="button"
                        title="删除"
                        onClick={() => {
                          const newRelations = relations.filter(r => r.id !== rel.id);
                          setRelations(newRelations);
                          if (onChange) {
                            onChange({ characters, relations: newRelations });
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {addingRelation && (
        <div className="edit-modal-overlay">
          <div className="edit-modal">
            <h4>添加关系</h4>
            <div className="modal-form">
              <label>
                <span>从</span>
                <select
                  className="edit-select"
                  value={editForm.relationFrom || ''}
                  onChange={e =>
                    setEditForm({ ...editForm, relationFrom: e.target.value })
                  }
                >
                  <option value="">选择角色...</option>
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>到</span>
                <select
                  className="edit-select"
                  value={editForm.relationTo || ''}
                  onChange={e =>
                    setEditForm({ ...editForm, relationTo: e.target.value })
                  }
                >
                  <option value="">选择角色...</option>
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>关系类型</span>
                <input
                  className="edit-input"
                  type="text"
                  value={editForm.relationType || ''}
                  onChange={e =>
                    setEditForm({ ...editForm, relationType: e.target.value })
                  }
                  placeholder="例如：朋友、敌人、亲戚"
                />
              </label>
              <label>
                <span>描述</span>
                <input
                  className="edit-input"
                  type="text"
                  value={editForm.relationDescription || ''}
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      relationDescription: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <div className="footer-spacer" />
              <button
                className="cancel-btn"
                onClick={() => {
                  if (tempEdgeIdRef.current && graphRef.current) {
                    try {
                      // 如果取消，移除临时创建的边
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      graphRef.current.removeData(tempEdgeIdRef.current as any);
                    } catch {
                      // 忽略错误
                    }
                    tempEdgeIdRef.current = null;
                  }
                  setAddingRelation(false);
                }}
              >
                取消
              </button>
              <button
                className="save-btn"
                onClick={() => {
                  if (
                    editForm.relationFrom &&
                    editForm.relationTo &&
                    editForm.relationType
                  ) {
                    const newRelation: Relation = {
                      id: `rel_${Date.now()}`,
                      from: editForm.relationFrom,
                      to: editForm.relationTo,
                      type: editForm.relationType,
                      description: editForm.relationDescription,
                    };
                    const newRelations = [...relations, newRelation];
                    setRelations(newRelations);
                    if (onChange) {
                      onChange({
                        characters,
                        relations: newRelations,
                      });
                    }
                    setAddingRelation(false);
                    setEditForm({});
                  }
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {editingRelation && (
        <div className="edit-modal-overlay">
          <div className="edit-modal">
            <h4>编辑关系</h4>
            <div className="modal-form">
              <label>
                <span>从</span>
                <select
                  className="edit-select"
                  value={editForm.relationFrom || ''}
                  onChange={e =>
                    setEditForm({ ...editForm, relationFrom: e.target.value })
                  }
                >
                  <option value="">选择角色...</option>
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>到</span>
                <select
                  className="edit-select"
                  value={editForm.relationTo || ''}
                  onChange={e =>
                    setEditForm({ ...editForm, relationTo: e.target.value })
                  }
                >
                  <option value="">选择角色...</option>
                  {characters.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>类型</span>
                <input
                  className="edit-input"
                  type="text"
                  value={editForm.relationType || ''}
                  onChange={e =>
                    setEditForm({ ...editForm, relationType: e.target.value })
                  }
                  placeholder="例如：朋友、敌人、亲戚"
                />
              </label>
              <label>
                <span>描述</span>
                <input
                  className="edit-input"
                  type="text"
                  value={editForm.relationDescription || ''}
                  onChange={e =>
                    setEditForm({
                      ...editForm,
                      relationDescription: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="cancel-btn"
                onClick={() => setEditingRelation(null)}
              >
                取消
              </button>
              <div className="footer-spacer" />
              <button
                className="save-btn"
                onClick={() => {
                  if (!editForm.relationFrom || !editForm.relationTo) return;
                  const newRelations = relations.map(r => {
                    if (r.id === editingRelation) {
                      return {
                        ...r,
                        from: editForm.relationFrom!,
                        to: editForm.relationTo!,
                        type: editForm.relationType || r.type,
                        description:
                          editForm.relationDescription ?? r.description,
                      };
                    }
                    return r;
                  });
                  setRelations(newRelations);
                  if (onChange) {
                    onChange({
                      characters,
                      relations: newRelations,
                    });
                  }
                  setEditingRelation(null);
                  setEditForm({});
                }}
              >
                保存
              </button>
              <button
                className="cancel-btn"
                onClick={() => {
                  const newRelations = relations.filter(
                    r => r.id !== editingRelation
                  );
                  setRelations(newRelations);
                  if (onChange) {
                    onChange({
                      characters,
                      relations: newRelations,
                    });
                  }
                  setEditingRelation(null);
                  setEditForm({});
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div className="fullscreen-modal-overlay">
          <div className="fullscreen-modal">
            <div className="fullscreen-header">
              <h3>人物关系图</h3>
              <button
                className="close-fullscreen-btn"
                onClick={() => setIsFullscreen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div
              className="fullscreen-canvas"
              ref={fullscreenContainerRef}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CharacterRelations);
