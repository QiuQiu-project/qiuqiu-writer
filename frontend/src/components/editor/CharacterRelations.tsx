import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Plus, Maximize2, X, Trash2, Pencil, ZoomIn, ZoomOut } from 'lucide-react';
import { Graph } from '@antv/g6';
import type { GraphData } from '@antv/g6';
import './CharacterRelations.css';

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
  
  // 用于在回调中获取最新数据，避免依赖闭包过期
  const latestDataRef = useRef({ characters, relations, onChange });
  useEffect(() => {
    latestDataRef.current = { characters, relations, onChange };
  }, [characters, relations, onChange]);

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
          const ev = e as { item?: { id?: string; model?: { source?: string; target?: string } }; source?: string; target?: string; data?: Record<string, unknown> };
          
          // 记录临时创建的边ID
          const edgeId = ev.item?.id;
          if (edgeId) {
            tempEdgeIdRef.current = edgeId;
          }

          // G6 5.0 event compatibility
          const model = ev.item?.model || {};
          const dataObj = ev.data || {};
          const sourceId = model.source || ev.source || (dataObj.source as string);
          const targetId = model.target || ev.target || (dataObj.target as string);
          
          if (!sourceId || !targetId) return;
          
          // 自动保存连线，并打开编辑框填写类型
          const { relations: currentRelations, characters: currentCharacters, onChange: currentOnChange } = latestDataRef.current;
          
          const newRelation: Relation = {
            id: `rel_${Date.now()}`,
            from: sourceId,
            to: targetId,
            type: '',
            description: '',
          };
          
          const newRelations = [...currentRelations, newRelation];
          setRelations(newRelations);
          
          // 使用 setTimeout 避免在渲染周期内更新父组件，可能导致状态丢失或冲突
          setTimeout(() => {
            if (currentOnChange) {
              currentOnChange({
                characters: currentCharacters,
                relations: newRelations,
              });
            }
          }, 0);
          
          // 立即打开编辑框
          setEditingRelation(newRelation.id);
          setEditForm({
            relationFrom: sourceId,
            relationTo: targetId,
            relationType: '',
            relationDescription: '',
          });
          // 不再设置 addingRelation(true)
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
        type: 'circle', // Use built-in circle node
        data: {
          label: char.name,
          name: char.name,
          gender: char.gender,
        },
        style: {
          x: x, 
          y: y, 
          size: 40, 
          fill: char.gender === '女' ? '#ffadd2' : '#91caff',
          stroke: '#d9d9d9',
          lineWidth: 1,
          labelText: char.name,
          labelPlacement: 'bottom',
          labelFill: edgeColor,
          labelFontSize: 12,
        },
      };
    });

    const validNodeIds = new Set(characters.map(c => c.id));
    const edges = relations
      .filter(rel => validNodeIds.has(rel.from) && validNodeIds.has(rel.to))
      .map((rel) => ({
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
    if (graphRef.current && graphDataId === prevGraphDataIdRef.current && graphDataId !== '') {
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
        if (!containerRef.current) {
          isInitializingRef.current = false;
          return;
        }
        // 再次检查 graphDataId 是否变化
        if (graphDataId !== prevGraphDataIdRef.current) {
          isInitializingRef.current = false;
          return;
        }
        width = container.offsetWidth || 800;
        height = container.offsetHeight || 600;
        // 确保有非零尺寸
        if (width === 0) width = 800;
        if (height === 0) height = 600;
        
        initializeGraph(width, height, data);
      }, 200);
      return () => {
        clearTimeout(timer);
        // 如果组件卸载，重置标志
        isInitializingRef.current = false;
      };
    }

    initializeGraph(width, height, data);

    async function initializeGraph(width: number, height: number, data: GraphData) {
      const currentGraphDataId = graphDataId;
      
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch {
          // ignore
        }
        graphRef.current = null;
      }

      if (!containerRef.current) {
        isInitializingRef.current = false;
        return;
      }

      if (width < 100) width = 800;
      if (height < 100) height = 600;

      let graph: Graph | null = null;
      
      try {
        console.log('[CharacterRelations] Initializing G6 Graph...', { width, height, nodeCount: data.nodes?.length });
        
        const edgeColor = getCssVar('--text-primary', '#000000');
        const labelBg = getCssVar('--bg-secondary', '#ffffff');
        const labelText = getCssVar('--text-primary', '#000000');
        
        graph = new Graph({
          container: containerRef.current,
          width,
          height,
          data,
          autoFit: 'view',
          padding: 20,
          node: {
            type: 'circle',
            style: {
              size: 40,
              labelPlacement: 'bottom',
              labelText: (d: unknown) => {
                const data = d as { data?: { label?: string } };
                return data.data?.label || '';
              },
              labelFill: edgeColor,
              labelFontSize: 12,
            },
          } as unknown as object,
          edge: {
            type: 'line',
            style: {
              stroke: edgeColor,
              lineWidth: 2,
              endArrow: true,
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
            labelPlacement: 'center',
          } as unknown as object,
          behaviors: manualLinkingRef.current
            ? [
                'drag-canvas',
                'zoom-canvas',
                {
                  type: 'create-edge',
                  trigger: 'drag',
                  onFinish: (e: unknown) => {
                    const event = e as { item?: { id?: string; model?: { source?: string; target?: string } }; source?: string; target?: string };
                    const edgeId = event.item?.id;
                    if (edgeId) {
                      tempEdgeIdRef.current = edgeId;
                    }
                    // G6 5.0 event compatibility
                    const model = event.item?.model || {};
                    const sourceId = model.source || event.source;
                    const targetId = model.target || event.target;
                    
                    if (!sourceId || !targetId) return;
                    
                    // 自动保存连线，并打开编辑框填写类型
                    const { relations: currentRelations, characters: currentCharacters, onChange: currentOnChange } = latestDataRef.current;
                    
                    const newRelation: Relation = {
                      id: `rel_${Date.now()}`,
                      from: sourceId,
                      to: targetId,
                      type: '',
                      description: '',
                    };
                    
                    const newRelations = [...currentRelations, newRelation];
                    setRelations(newRelations);
                    
                    // 使用 setTimeout 避免在渲染周期内更新父组件，可能导致状态丢失或冲突
                    setTimeout(() => {
                      if (currentOnChange) {
                        currentOnChange({
                          characters: currentCharacters,
                          relations: newRelations,
                        });
                      }
                    }, 0);
                    
                    // 立即打开编辑框
                    setEditingRelation(newRelation.id);
                    setEditForm({
                      relationFrom: sourceId,
                      relationTo: targetId,
                      relationType: '',
                      relationDescription: '',
                    });
                    // 不再设置 addingRelation(true)
                  },
                },
              ]
            : ['drag-canvas', 'zoom-canvas', 'drag-element'],
        });

        if (currentGraphDataId !== prevGraphDataIdRef.current) {
          try { graph.destroy(); } catch { /* ignore */ }
          isInitializingRef.current = false;
          return;
        }

        await graph.render();
        
        if (currentGraphDataId === prevGraphDataIdRef.current && graph) {
          graphRef.current = graph;
          isInitializingRef.current = false;
          console.log('[CharacterRelations] G6 Graph initialized successfully');

          graph.on('edge:click', (e: unknown) => {
            const event = e as { target?: { id?: string }; item?: { id?: string } };
            const edgeId = event.target?.id || event.item?.id;
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
          if (graph) {
            try { graph.destroy(); } catch { /* ignore */ }
          }
          isInitializingRef.current = false;
        }
      } catch (err) {
        console.error('[CharacterRelations] G6 Graph initialization failed:', err);
        if (graph) {
          try { graph.destroy(); } catch { /* ignore */ }
        }
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
  }, [graphDataId, viewMode]); // 只使用稳定的 graphDataId 作为依赖，避免 graphData 对象引用变化导致循环

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

    const container = fullscreenContainerRef.current;

    let resizeCleanup: (() => void) | null = null;

    const createGraph = () => {
      if (!fullscreenContainerRef.current) return;
      const el = fullscreenContainerRef.current;
      // 与内联图一致：若容器尚未有尺寸则用备用尺寸，避免节点不渲染
      let w = el.offsetWidth || 0;
      let h = el.offsetHeight || 0;
      if (w < 100) w = window.innerWidth - 100;
      if (h < 100) h = window.innerHeight - 150;

      if (fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch {
          // ignore
        }
        fullscreenGraphRef.current = null;
      }
      resizeCleanup?.();

      try {
        const edgeColor = getCssVar('--text-primary', '#000000');
        const labelBg = getCssVar('--bg-secondary', '#ffffff');
        const labelTextColor = getCssVar('--text-primary', '#000000');
        const canvasBg = getCssVar('--bg-secondary', '#f5f5f5');
        const fullscreenGraph = new Graph({
          container: el,
          width: w,
          height: h,
          background: canvasBg,
          data: graphData,
          autoFit: 'view',
          padding: 20,
          node: {
            type: 'circle',
            style: (datum: { style?: Record<string, unknown>; data?: { label?: string; gender?: string } }) => ({
              ...(datum?.style || {}),
              size: 40,
              labelPlacement: 'bottom',
              fill: (datum?.style?.fill as string) ?? (datum?.data?.gender === '女' ? '#ffadd2' : '#91caff'),
              stroke: (datum?.style?.stroke as string) ?? '#595959',
              lineWidth: 1,
              labelText: (datum?.style?.labelText as string) ?? datum?.data?.label ?? '',
              labelFill: labelTextColor,
              labelFontSize: 12,
            }),
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
            labelFill: labelTextColor,
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
        const afterRender = () => {
          fullscreenGraphRef.current = fullscreenGraph;
          requestAnimationFrame(() => {
            fullscreenGraph.fitView?.().catch(() => {});
          });
        };
        if (renderResult && typeof renderResult.then === 'function') {
          renderResult.then(afterRender).catch(() => {});
        } else {
          afterRender();
        }

        const handleResize = () => {
          if (fullscreenGraphRef.current && fullscreenContainerRef.current) {
            const nw = fullscreenContainerRef.current.offsetWidth || window.innerWidth - 100;
            const nh = fullscreenContainerRef.current.offsetHeight || window.innerHeight - 150;
            if (nw > 0 && nh > 0) {
              fullscreenGraphRef.current.resize(nw, nh);
            }
          }
        };
        window.addEventListener('resize', handleResize);
        resizeCleanup = () => window.removeEventListener('resize', handleResize);
      } catch {
        // ignore
      }
    };

    // 优先等容器有尺寸再创建；若一段时间后仍无尺寸则用窗口尺寸创建，确保节点能显示
    let rafId: number;
    let resizeObserver: ResizeObserver | null = null;

    const tryCreate = () => {
      if (!container) return;
      const cw = container.offsetWidth;
      const ch = container.offsetHeight;
      if (cw > 0 && ch > 0) {
        createGraph();
        return;
      }
      rafId = requestAnimationFrame(tryCreate);
    };
    rafId = requestAnimationFrame(tryCreate);

    const timeoutId = setTimeout(() => {
      if (fullscreenGraphRef.current) return;
      if (fullscreenContainerRef.current) createGraph();
    }, 250);

    resizeObserver = new ResizeObserver(() => {
      if (!fullscreenContainerRef.current || fullscreenGraphRef.current) return;
      const w = fullscreenContainerRef.current.offsetWidth;
      const h = fullscreenContainerRef.current.offsetHeight;
      if (w > 0 && h > 0) createGraph();
    });
    if (container) resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      resizeObserver?.disconnect();
      resizeCleanup?.();
      if (fullscreenGraphRef.current) {
        try {
          fullscreenGraphRef.current.destroy();
        } catch {
          // ignore
        }
        fullscreenGraphRef.current = null;
      }
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
          {viewMode === 'list' && (
            <button
              className="action-btn"
              onClick={() => setAddingRelation(true)}
              title="添加关系"
            >
              <Plus size={16} />
              <span>添加关系</span>
            </button>
          )}
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
                  autoFocus
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
                  autoFocus
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
              <h3>人物关系图 {characters.length > 0 ? `(${characters.length} 角色)` : ''}</h3>
              <div className="fullscreen-header-actions">
                <button
                  type="button"
                  className="fullscreen-zoom-btn"
                  title="放大"
                  onClick={() => fullscreenGraphRef.current?.zoomBy(1.25)}
                >
                  <ZoomIn size={18} />
                  <span>放大</span>
                </button>
                <button
                  type="button"
                  className="fullscreen-zoom-btn"
                  title="缩小"
                  onClick={() => fullscreenGraphRef.current?.zoomBy(0.8)}
                >
                  <ZoomOut size={18} />
                  <span>缩小</span>
                </button>
                <button
                  type="button"
                  className="fullscreen-zoom-btn"
                  title="适应视口"
                  onClick={() => fullscreenGraphRef.current?.fitView?.()}
                >
                  <Maximize2 size={18} />
                  <span>适应视口</span>
                </button>
                <button
                  className="close-fullscreen-btn"
                  onClick={() => setIsFullscreen(false)}
                  title="关闭"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="fullscreen-canvas-wrapper">
              {/* 画布容器必须无 React 子节点，否则 React 协调时会移除 G6 追加的 canvas */}
              <div className="fullscreen-canvas" ref={fullscreenContainerRef} />
              {characters.length === 0 && (
                <div className="fullscreen-empty-state">
                  暂无角色数据，请先添加角色
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CharacterRelations);
