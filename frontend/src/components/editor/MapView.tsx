import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, MapPin, ArrowRight } from 'lucide-react';
import { ExtensionCategory, Graph, register } from '@antv/g6';
import { ReactNode } from '@antv/g6-extension-react';
import type { GraphData } from '@antv/g6';
import './MapView.css';

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
    <div className="location-node-react">
      <div className="location-pin-icon">
        <MapPin size={24} />
      </div>
      <div className="location-name-label">{name || data.id}</div>
    </div>
  );
};

export default function MapView() {
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
          component: (data: any) => <LocationNode data={data} />,
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
        } catch (e) {
          console.warn('Error destroying existing graph:', e);
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
            component: (data: any) => <LocationNode data={data} />,
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
          labelPlacement: 'center',
        } as any,
        behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      });

      graph.render();
      graphRef.current = graph;

      // 节点点击事件
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
        } catch (e) {
          console.warn('Error destroying graph:', e);
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
      alert('请至少创建两个地点才能添加连接');
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
        alert('这两个地点之间已经存在连接');
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

  return (
    <div className="map-view">
      <div className="map-header">
        <h2 className="map-title">地图</h2>
        <div className="map-actions">
          <button className="action-btn" onClick={handleAddLocation}>
            <Plus size={16} />
            <span>添加地点</span>
          </button>
          <button className="action-btn" onClick={handleAddConnection}>
            <Plus size={16} />
            <span>添加连接</span>
          </button>
        </div>
      </div>

      <div className="map-content">
        <div className="map-canvas" ref={containerRef}></div>

        <div className="map-sidebar">
          <div className="sidebar-section">
            <h4>地点列表</h4>
            <div className="location-list">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className={`location-item ${editingLocation === location.id ? 'active' : ''}`}
                  onClick={() => {
                    setEditingLocation(location.id);
                    setEditForm({
                      locationName: location.name,
                      locationDescription: location.description,
                    });
                  }}
                >
                  <div className="location-info">
                    <div className="location-name">{location.name}</div>
                    {location.description && (
                      <div className="location-description">{location.description}</div>
                    )}
                  </div>
                  <div className="location-actions">
                    <button
                      className="action-icon-btn"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLocation(location.id);
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
            <h4>连接列表</h4>
            <div className="connection-list">
              {connections.map((connection) => {
                const fromLoc = locations.find((l) => l.id === connection.from);
                const toLoc = locations.find((l) => l.id === connection.to);
                return (
                  <div
                    key={connection.id}
                    className={`connection-item ${editingConnection === connection.id ? 'active' : ''}`}
                    onClick={() => {
                      setEditingConnection(connection.id);
                      setEditForm({
                        connectionType: connection.type,
                        connectionDescription: connection.description,
                      });
                    }}
                  >
                    <div className="connection-item-content">
                      <span className="connection-from">{fromLoc?.name || '未知'}</span>
                      <ArrowRight size={14} />
                      <span className="connection-type">{connection.type || '连接'}</span>
                      <ArrowRight size={14} />
                      <span className="connection-to">{toLoc?.name || '未知'}</span>
                    </div>
                    {connection.description && (
                      <div className="connection-description">{connection.description}</div>
                    )}
                    <div className="connection-actions">
                      <button
                        className="action-icon-btn"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConnection(connection.id);
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

      {/* 添加地点弹窗 */}
      {addingLocation && (
        <div className="edit-modal-overlay" onClick={() => { setAddingLocation(false); setEditForm({}); }}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h4>添加地点</h4>
            <div className="modal-form">
              <label>
                <span>地点名称</span>
                <input
                  type="text"
                  value={editForm.locationName || ''}
                  onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
                  className="edit-input"
                  placeholder="地点名称"
                  autoFocus
                />
              </label>
              <label>
                <span>地点描述（可选）</span>
                <textarea
                  value={editForm.locationDescription || ''}
                  onChange={(e) => setEditForm({ ...editForm, locationDescription: e.target.value })}
                  className="edit-textarea"
                  placeholder="描述这个地点..."
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setAddingLocation(false);
                    setEditForm({});
                  }}
                >
                  取消
                </button>
                <div className="footer-spacer" />
                <button className="save-btn" onClick={handleSaveNewLocation}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加连接弹窗 */}
      {addingConnection && (
        <div className="edit-modal-overlay" onClick={() => { setAddingConnection(false); setEditForm({}); }}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h4>添加连接</h4>
            <div className="modal-form">
              <label>
                <span>起始地点</span>
                <select
                  value={editForm.connectionFrom || ''}
                  onChange={(e) => setEditForm({ ...editForm, connectionFrom: e.target.value })}
                  className="edit-select"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>连接类型</span>
                <input
                  type="text"
                  value={editForm.connectionType || ''}
                  onChange={(e) => setEditForm({ ...editForm, connectionType: e.target.value })}
                  className="edit-input"
                  placeholder="例如：道路、河流、传送门等"
                  autoFocus
                />
              </label>
              <label>
                <span>目标地点</span>
                <select
                  value={editForm.connectionTo || ''}
                  onChange={(e) => setEditForm({ ...editForm, connectionTo: e.target.value })}
                  className="edit-select"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>连接描述（可选）</span>
                <textarea
                  value={editForm.connectionDescription || ''}
                  onChange={(e) => setEditForm({ ...editForm, connectionDescription: e.target.value })}
                  className="edit-textarea"
                  placeholder="描述这个连接..."
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setAddingConnection(false);
                    setEditForm({});
                  }}
                >
                  取消
                </button>
                <div className="footer-spacer" />
                <button className="save-btn" onClick={handleSaveNewConnection}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑地点弹窗 */}
      {editingLocation && (
        <div className="edit-modal-overlay" onClick={() => { setEditingLocation(null); setEditForm({}); }}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h4>编辑地点</h4>
            <div className="modal-form">
              <label>
                <span>地点名称</span>
                <input
                  type="text"
                  value={editForm.locationName || ''}
                  onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
                  className="edit-input"
                  placeholder="地点名称"
                  autoFocus
                />
              </label>
              <label>
                <span>地点描述</span>
                <textarea
                  value={editForm.locationDescription || ''}
                  onChange={(e) => setEditForm({ ...editForm, locationDescription: e.target.value })}
                  className="edit-textarea"
                  placeholder="地点描述"
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setEditingLocation(null);
                    setEditForm({});
                  }}
                >
                  取消
                </button>
                <div className="footer-spacer" />
                <button className="save-btn" onClick={handleSaveLocation}>
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 连接信息弹窗 */}
      {editingConnection && (() => {
        const connection = connections.find((c) => c.id === editingConnection);
        const fromLoc = locations.find((l) => l.id === connection?.from);
        const toLoc = locations.find((l) => l.id === connection?.to);
        return connection ? (
          <div className="edit-modal-overlay" onClick={() => { setEditingConnection(null); setEditForm({}); }}>
            <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
              <h4>连接详情</h4>
              <div className="modal-form">
                <div className="relation-info-display">
                  <div className="relation-characters">
                    <span className="relation-char-name">{fromLoc?.name || '未知'}</span>
                    <ArrowRight size={20} />
                    <span className="relation-type-display">{connection.type}</span>
                    <ArrowRight size={20} />
                    <span className="relation-char-name">{toLoc?.name || '未知'}</span>
                  </div>
                  {connection.description && (
                    <div className="relation-desc-display">
                      <span className="desc-label">连接描述：</span>
                      <span className="desc-text">{connection.description}</span>
                    </div>
                  )}
                </div>
                <div className="modal-actions">
                  <button
                    className="cancel-btn"
                    onClick={() => {
                      setEditingConnection(null);
                      setEditForm({});
                    }}
                  >
                    关闭
                  </button>
                  <div className="footer-spacer" />
                  <button
                    className="save-btn"
                    onClick={() => {
                      setEditingConnection(null);
                      setEditForm({
                        connectionType: connection.type,
                        connectionDescription: connection.description,
                      });
                      // 可以在这里添加编辑表单
                    }}
                  >
                    编辑
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
