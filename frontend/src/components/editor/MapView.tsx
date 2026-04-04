import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, MapPin, ArrowRight, X } from 'lucide-react';
import { ExtensionCategory, Graph, register } from '@antv/g6';
import { ReactNode } from '@antv/g6-extension-react';
import type { GraphData } from '@antv/g6';
import MessageModal from '../common/MessageModal';
import DraggableResizableModal from '../common/DraggableResizableModal';
import type { MessageType } from '../common/MessageModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// 注册 React 节点扩展
register(ExtensionCategory.NODE, 'react', ReactNode);

interface MapLocation {
  id: string;
  name: string;
  description?: string;
}

interface MapConnection {
  id: string;
  from: string;
  to: string;
  type?: string;
  description?: string;
}

const initialLocations: MapLocation[] = [
  {
    id: '1',
    name: '起始之城',
    description: '故事开始的地方，主角的故乡',
  },
  {
    id: '2',
    name: '迷雾森林',
    description: '充满危险的森林，隐藏着秘密',
  },
  {
    id: '3',
    name: '魔法学院',
    description: '学习魔法的地方',
  },
  {
    id: '4',
    name: '龙之谷',
    description: '传说中的龙族栖息地',
  },
];

const initialConnections: MapConnection[] = [
  { id: 'c1', from: '1', to: '2', type: '道路', description: '主要贸易路线' },
  { id: 'c2', from: '2', to: '3', type: '小径', description: '隐秘通道' },
  { id: 'c3', from: '1', to: '3', type: '河流', description: '水路运输' },
  { id: 'c4', from: '3', to: '4', type: '传送门', description: '魔法传送' },
];

interface LocationNodeData {
  data?: {
    name?: string;
  };
  id?: string;
}

// 自定义 React 地点节点组件
const LocationNode = ({ data }: { data: LocationNodeData }) => {
  const { name } = data.data || {};
  
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex size-12 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground shadow-sm">
        <MapPin size={24} />
      </div>
      <div className="rounded-md bg-background/90 px-2 py-1 text-center text-sm font-semibold text-foreground shadow-sm">
        {name || data.id}
      </div>
    </div>
  );
};

export default function MapView({ readOnly }: { readOnly?: boolean }) {
  const [locations, setLocations] = useState<MapLocation[]>(initialLocations);
  const [connections, setConnections] = useState<MapConnection[]>(initialConnections);
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [editingConnection, setEditingConnection] = useState<string | null>(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [addingConnection, setAddingConnection] = useState(false);
  const [editForm, setEditForm] = useState<{
    locationName?: string;
    locationDescription?: string;
    connectionType?: string;
    connectionDescription?: string;
    connectionFrom?: string;
    connectionTo?: string;
  }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);

  // 消息提示状态
  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const textareaClassName =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';
  const selectClassName =
    'h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({
      isOpen: true,
      type,
      message,
      title,
      onConfirm,
    });
  };

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  // 使用 useMemo 来稳定数据引用
  const graphData = useMemo(() => {
    // 计算初始位置，让节点均匀分布
    const nodeCount = locations.length;
    const radius = Math.max(200, nodeCount * 50);
    const centerX = 400;
    const centerY = 300;
    
    const nodes = locations.map((loc, index) => {
      const angle = (index * 2 * Math.PI) / nodeCount - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      return {
        id: loc.id,
        type: 'react' as const,
        data: {
          label: loc.name,
          name: loc.name,
          description: loc.description,
        },
        style: {
          x: x,
          y: y,
          size: [100, 100] as [number, number],
          component: (data: LocationNodeData) => <LocationNode data={data} />,
        },
      };
    });

    const edges = connections.map((conn) => ({
      id: conn.id,
      source: conn.from,
      target: conn.to,
      data: {
        label: conn.type,
        type: conn.type,
        description: conn.description,
      },
      style: {
        stroke: '#10b981',
        lineWidth: 2,
      },
    }));

    return { nodes, edges } as GraphData;
  }, [locations, connections]);

  // 创建数据 ID 字符串用于依赖比较
  const dataId = useMemo(() => {
    return JSON.stringify({
      locations: locations.map(l => ({ id: l.id, name: l.name })),
      connections: connections.map(c => ({ id: c.id, from: c.from, to: c.to })),
    });
  }, [locations, connections]);

  // 初始化 G6 图
  useEffect(() => {
    if (!containerRef.current) return;

    const data = graphData;
    const container = containerRef.current;
    let width = container.offsetWidth;
    let height = container.offsetHeight;

    if (width === 0 || height === 0) {
      const timer = setTimeout(() => {
        width = container.offsetWidth || 800;
        height = container.offsetHeight || 600;
        if (width > 0 && height > 0) {
          initializeGraph(width, height, data);
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    initializeGraph(width, height, data);

    function initializeGraph(width: number, height: number, data: GraphData) {
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
        } catch {
          // ignore
        }
        graphRef.current = null;
      }

      if (!containerRef.current) return;

      const graph = new Graph({
        container: containerRef.current,
        width,
        height,
        data,
        node: {
          type: 'react',
          style: {
            size: [100, 100] as [number, number],
            component: (data: LocationNodeData) => <LocationNode data={data} />,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelText: (d: any) => d.data?.label || '',
          labelFill: '#10b981',
          labelFontSize: 11,
          labelFontWeight: 500,
          labelBackground: true,
          labelBackgroundFill: 'white',
          labelBackgroundOpacity: 0.8,
          labelPlacement: 'center',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      });

      graph.render();
      graphRef.current = graph;

      // 节点点击事件
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graph.on('node:click', (e: any) => {
        const nodeId = e.item?.getID?.() || e.target?.id || e.item?.id;
        if (nodeId) {
          setEditingLocation(nodeId);
          const location = locations.find((l) => l.id === nodeId);
          if (location) {
            setEditForm({
              locationName: location.name,
              locationDescription: location.description,
            });
          }
        }
      });

      // 边点击事件
      graph.on('edge:click', (e: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const event = e as any;
        const edgeId = event.item?.getID?.() || event.target?.id || event.item?.id;
        if (edgeId) {
          setEditingConnection(edgeId);
          const connection = connections.find((c) => c.id === edgeId);
          if (connection) {
            setEditForm({
              connectionType: connection.type,
              connectionDescription: connection.description,
            });
          }
        }
      });
    }

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
        } catch {
          // ignore
        }
        graphRef.current = null;
      }
    };
  }, [dataId, graphData, locations, connections]);

  const handleSaveLocation = () => {
    if (editingLocation) {
      setLocations((prev) =>
        prev.map((l) =>
          l.id === editingLocation
            ? {
                ...l,
                name: editForm.locationName || l.name,
                description: editForm.locationDescription || l.description,
              }
            : l
        )
      );
      setEditingLocation(null);
      setEditForm({});
    }
  };

  const handleAddLocation = () => {
    setAddingLocation(true);
    setEditForm({
      locationName: '新地点',
      locationDescription: '',
    });
  };

  const handleSaveNewLocation = () => {
    if (editForm.locationName) {
      const newLocation: MapLocation = {
        id: String(Date.now()),
        name: editForm.locationName,
        description: editForm.locationDescription,
      };
      setLocations((prev) => [...prev, newLocation]);
      setAddingLocation(false);
      setEditForm({});
    }
  };

  const handleDeleteLocation = (locationId: string) => {
    setLocations((prev) => prev.filter((l) => l.id !== locationId));
    setConnections((prev) => prev.filter((c) => c.from !== locationId && c.to !== locationId));
  };

  const handleAddConnection = () => {
    if (locations.length < 2) {
      showMessage('请至少创建两个地点才能添加连接', 'warning');
      return;
    }
    setAddingConnection(true);
    setEditForm({
      connectionFrom: locations[0]?.id || '',
      connectionTo: locations[1]?.id || '',
      connectionType: '道路',
      connectionDescription: '',
    });
  };

  const handleSaveNewConnection = () => {
    if (editForm.connectionFrom && editForm.connectionTo && editForm.connectionType) {
      const exists = connections.some(
        (c) =>
          (c.from === editForm.connectionFrom && c.to === editForm.connectionTo) ||
          (c.from === editForm.connectionTo && c.to === editForm.connectionFrom)
      );
      if (exists) {
        showMessage('这两个地点之间已经存在连接', 'warning');
        return;
      }

      const newConnection: MapConnection = {
        id: `c${Date.now()}`,
        from: editForm.connectionFrom,
        to: editForm.connectionTo,
        type: editForm.connectionType,
        description: editForm.connectionDescription,
      };
      setConnections((prev) => [...prev, newConnection]);
      setAddingConnection(false);
      setEditForm({});
    }
  };

  const handleDeleteConnection = (connectionId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connectionId));
  };

  const handleSaveConnection = () => {
    if (editingConnection) {
      setConnections((prev) =>
        prev.map((c) =>
          c.id === editingConnection
            ? {
                ...c,
                type: editForm.connectionType || c.type,
                description: editForm.connectionDescription || c.description,
              }
            : c
        )
      );
      setEditingConnection(null);
      setEditForm({});
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-foreground">地图</h2>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleAddLocation}>
              <Plus size={16} />
              <span>添加地点</span>
            </Button>
            <Button variant="outline" onClick={handleAddConnection}>
              <Plus size={16} />
              <span>添加连接</span>
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex-1 bg-muted/40" ref={containerRef}></div>

        <div className="flex w-[300px] flex-col overflow-hidden border-l border-border bg-background">
          <div className="border-b border-border p-5">
            <h4 className="text-base font-semibold text-foreground">地点列表</h4>
            <div className="mt-3 flex flex-col gap-3">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className={cn(
                    'cursor-pointer rounded-lg border bg-background p-3 transition-colors',
                    editingLocation === location.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/40'
                  )}
                  onClick={() => {
                    setEditingLocation(location.id);
                    setEditForm({
                      locationName: location.name,
                      locationDescription: location.description,
                    });
                  }}
                >
                  <div className="mb-2">
                    <div className="text-sm font-medium text-foreground">{location.name}</div>
                    {location.description && (
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{location.description}</div>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLocation(location.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <h4 className="text-base font-semibold text-foreground">连接列表</h4>
            <div className="mt-3 flex flex-col gap-3">
              {connections.map((connection) => {
                const fromLoc = locations.find((l) => l.id === connection.from);
                const toLoc = locations.find((l) => l.id === connection.to);
                return (
                  <div
                    key={connection.id}
                    className={cn(
                      'cursor-pointer rounded-lg border bg-background p-3 transition-colors',
                      editingConnection === connection.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted/40'
                    )}
                    onClick={() => {
                      setEditingConnection(connection.id);
                      setEditForm({
                        connectionType: connection.type,
                        connectionDescription: connection.description,
                      });
                    }}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-foreground">{fromLoc?.name || '未知'}</span>
                      <ArrowRight size={14} className="text-muted-foreground" />
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {connection.type || '连接'}
                      </span>
                      <ArrowRight size={14} className="text-muted-foreground" />
                      <span className="font-semibold text-foreground">{toLoc?.name || '未知'}</span>
                    </div>
                    {connection.description && (
                      <div className="text-xs leading-5 text-muted-foreground">{connection.description}</div>
                    )}
                    {!readOnly && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                          title="删除"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConnection(connection.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <DraggableResizableModal
        isOpen={addingLocation}
        onClose={() => { setAddingLocation(false); setEditForm({}); }}
        title="添加地点"
        initialWidth={500}
        initialHeight={350}
        className="overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">添加地点</h3>
            <Button variant="ghost" size="icon-sm" onClick={() => { setAddingLocation(false); setEditForm({}); }}>
              <X size={16} />
            </Button>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">地点名称</span>
            <Input
              value={editForm.locationName || ''}
              onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
              placeholder="地点名称"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">地点描述（可选）</span>
            <textarea
              value={editForm.locationDescription || ''}
              onChange={(e) => setEditForm({ ...editForm, locationDescription: e.target.value })}
              className={textareaClassName}
              placeholder="描述这个地点..."
              rows={3}
            />
          </label>
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => {
              setAddingLocation(false);
              setEditForm({});
            }}>
              取消
            </Button>
            <div className="flex-1" />
            <Button onClick={handleSaveNewLocation}>
              保存
            </Button>
          </div>
        </div>
      </DraggableResizableModal>

      <DraggableResizableModal
        isOpen={addingConnection}
        onClose={() => { setAddingConnection(false); setEditForm({}); }}
        title="添加连接"
        initialWidth={500}
        initialHeight={450}
        className="overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">添加连接</h3>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">起始地点</span>
            <select
              value={editForm.connectionFrom || ''}
              onChange={(e) => setEditForm({ ...editForm, connectionFrom: e.target.value })}
              className={selectClassName}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">连接类型</span>
            <Input
              value={editForm.connectionType || ''}
              onChange={(e) => setEditForm({ ...editForm, connectionType: e.target.value })}
              placeholder="例如：道路、河流、传送门等"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">目标地点</span>
            <select
              value={editForm.connectionTo || ''}
              onChange={(e) => setEditForm({ ...editForm, connectionTo: e.target.value })}
              className={selectClassName}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">连接描述（可选）</span>
            <textarea
              value={editForm.connectionDescription || ''}
              onChange={(e) => setEditForm({ ...editForm, connectionDescription: e.target.value })}
              className={textareaClassName}
              placeholder="描述这个连接..."
              rows={3}
            />
          </label>
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => {
              setAddingConnection(false);
              setEditForm({});
            }}>
              取消
            </Button>
            <div className="flex-1" />
            <Button onClick={handleSaveNewConnection}>
              保存
            </Button>
          </div>
        </div>
      </DraggableResizableModal>

      <DraggableResizableModal
        isOpen={!!editingLocation}
        onClose={() => { setEditingLocation(null); setEditForm({}); }}
        title={readOnly ? '查看地点' : '编辑地点'}
        initialWidth={500}
        initialHeight={400}
        className="overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">{readOnly ? '查看地点' : '编辑地点'}</h3>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">地点名称</span>
            <Input
              value={editForm.locationName || ''}
              onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
              placeholder="地点名称"
              autoFocus
              disabled={readOnly}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">地点描述</span>
            <textarea
              value={editForm.locationDescription || ''}
              onChange={(e) => setEditForm({ ...editForm, locationDescription: e.target.value })}
              className={textareaClassName}
              placeholder="描述这个地点..."
              rows={3}
              disabled={readOnly}
            />
          </label>
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => {
              setEditingLocation(null);
              setEditForm({});
            }}>
              {readOnly ? '关闭' : '取消'}
            </Button>
            {!readOnly && (
              <>
                <div className="flex-1" />
                <Button onClick={handleSaveLocation}>
                  保存
                </Button>
              </>
            )}
          </div>
        </div>
      </DraggableResizableModal>

      <DraggableResizableModal
        isOpen={!!editingConnection}
        onClose={() => { setEditingConnection(null); setEditForm({}); }}
        title={readOnly ? '查看连接' : '编辑连接'}
        initialWidth={500}
        initialHeight={450}
        className="overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">{readOnly ? '查看连接' : '编辑连接'}</h3>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">连接类型</span>
            <Input
              value={editForm.connectionType || ''}
              onChange={(e) => setEditForm({ ...editForm, connectionType: e.target.value })}
              placeholder="例如：道路、河流、传送门等"
              autoFocus
              disabled={readOnly}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">连接描述</span>
            <textarea
              value={editForm.connectionDescription || ''}
              onChange={(e) => setEditForm({ ...editForm, connectionDescription: e.target.value })}
              className={textareaClassName}
              placeholder="描述这个连接..."
              rows={3}
              disabled={readOnly}
            />
          </label>
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => {
              setEditingConnection(null);
              setEditForm({});
            }}>
              {readOnly ? '关闭' : '取消'}
            </Button>
            {!readOnly && (
              <>
                <div className="flex-1" />
                <Button onClick={handleSaveConnection}>
                  保存
                </Button>
              </>
            )}
          </div>
        </div>
      </DraggableResizableModal>
      
      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />
    </div>
  );
}
