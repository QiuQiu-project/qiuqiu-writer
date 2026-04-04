import { useState, useEffect, useMemo } from 'react';
import DraggableResizableModal from '../../common/DraggableResizableModal';
import { X, Code, Eye, User, MapPin, Box, Layers } from 'lucide-react';

interface GeneratedDataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  rawData: string;
  dataKey?: string;
}

export function GeneratedDataPreviewModal({
  isOpen,
  onClose,
  onSave,
  rawData,
  dataKey
}: GeneratedDataPreviewModalProps) {
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'json'>('preview');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Clean up markdown code blocks
      let cleaned = rawData;
      const match = rawData.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        cleaned = match[1];
      }
      setTimeout(() => setContent(cleaned), 0);
      
      // Auto-switch to json if parsing fails initially
      try {
        JSON.parse(cleaned);
        setTimeout(() => setActiveTab('preview'), 0);
      } catch (e) {
        setTimeout(() => {
          setActiveTab('json');
          setError((e as Error).message);
        }, 0);
      }
    }
  }, [isOpen, rawData]);

  const validateJSON = (str: string) => {
    try {
      JSON.parse(str);
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const parsedData = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      // Smart extraction logic similar to handleSave
      let finalData = parsed;
      if (dataKey && !Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
        if (Object.prototype.hasOwnProperty.call(parsed, dataKey)) {
             finalData = parsed[dataKey];
        }
      }
      return finalData;
    } catch {
      return null;
    }
  }, [content, dataKey]);

  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(trimmed);
      let finalData: unknown = parsed;
      // 按 dataKey 提取子字段
      if (dataKey && !Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
        if (Object.prototype.hasOwnProperty.call(parsed, dataKey)) {
          const extracted = (parsed as Record<string, unknown>)[dataKey];
          if (extracted !== null && extracted !== undefined) {
            finalData = extracted;
          }
        }
      }
      onSave(finalData);
    } catch {
      // 非 JSON → 作为纯文本字符串保存
      onSave(trimmed);
    }
    onClose();
  };

  const renderPreview = () => {
    if (!parsedData) {
      return (
        <div className="empty-preview">
          <p>无法解析 JSON 数据，请切换到 JSON 编辑模式修正。</p>
        </div>
      );
    }

    // Determine type
    const isArray = Array.isArray(parsedData);
    
    // 1. Character List / Faction List / Location List
    if (isArray) {
      const firstItem = parsedData[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        // Check for common fields
        const hasName = 'name' in firstItem;
        
        if (hasName) {
           return (
             <div className="preview-cards-grid">
               {parsedData.map((item: any, index: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                 <div key={index} className="preview-card">
                   <div className="preview-card-header">
                     <div className="preview-card-icon">
                        {dataKey?.includes('character') ? <User size={18} /> :
                         dataKey?.includes('location') ? <MapPin size={18} /> :
                         dataKey?.includes('faction') ? <Layers size={18} /> :
                         <Box size={18} />}
                     </div>
                     <div className="preview-card-title">{item.name || '未命名'}</div>
                   </div>
                   {Object.entries(item).map(([key, value]) => {
                     if (key === 'name' || key === 'id') return null;
                     if (typeof value === 'object') return null; // Skip nested objects for simple card view
                     return (
                       <div key={key} className="preview-card-field">
                         <span className="preview-card-label">{key}:</span>
                         <span className="preview-card-value">{String(value)}</span>
                       </div>
                     );
                   })}
                 </div>
               ))}
             </div>
           );
        }
      }
      
      // Timeline items (often has 'time' or 'date')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isTimeline = parsedData.some((item: any) => item.time || item.date || item.year);
      if (isTimeline) {
         return (
           <div className="preview-timeline">
             {parsedData.map((item: any, index: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
               <div key={index} className="preview-timeline-item">
                 <div className="preview-timeline-dot"></div>
                 <div className="preview-timeline-time">{item.time || item.date || item.year || '未知时间'}</div>
                 <div className="preview-timeline-content">
                   <div className="preview-card-title">{item.event || item.title || item.name || '未命名事件'}</div>
                   {item.description && <div className="preview-card-field">{item.description}</div>}
                   {Object.entries(item).map(([key, value]) => {
                     if (['time', 'date', 'year', 'event', 'title', 'name', 'description'].includes(key)) return null;
                     if (typeof value === 'object') return null;
                     return (
                       <div key={key} className="preview-card-field">
                         <span className="preview-card-label">{key}:</span>
                         <span className="preview-card-value">{String(value)}</span>
                       </div>
                     );
                   })}
                 </div>
               </div>
             ))}
           </div>
         );
      }
      
      // Generic List
      return (
        <div className="preview-list">
          {parsedData.map((item: any, index: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
             <div key={index} className="preview-list-item">
               {typeof item === 'object' ? (
                 <div style={{ width: '100%' }}>
                   {Object.entries(item).map(([key, value]) => (
                     <div key={key} className="preview-key-value-row">
                       <span className="preview-kv-key">{key}:</span>
                       <span className="preview-kv-value">{JSON.stringify(value)}</span>
                     </div>
                   ))}
                 </div>
               ) : (
                 <span>{String(item)}</span>
               )}
             </div>
          ))}
        </div>
      );
    }
    
    // 2. Object (Key-Value)
    if (typeof parsedData === 'object' && parsedData !== null) {
      return (
        <div className="preview-key-value">
          {Object.entries(parsedData).map(([key, value]) => (
            <div key={key} className="preview-list-item">
               <div className="preview-key-value-row" style={{ width: '100%', border: 'none' }}>
                 <span className="preview-kv-key" style={{ width: '180px' }}>{key}</span>
                 <span className="preview-kv-value">
                   {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                 </span>
               </div>
            </div>
          ))}
        </div>
      );
    }

    return <div>{String(parsedData)}</div>;
  };

  if (!isOpen) return null;

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={800}
      initialHeight={600}
      className="generated-data-preview-modal"
      handleClassName=".modal-header"
    >
        <div className="modal-header">
          <h3>AI 生成结果预览</h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        
        <div className="preview-tabs">
          <div 
            className={`preview-tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            <Eye size={16} />
            <span>预览模式</span>
          </div>
          <div 
            className={`preview-tab ${activeTab === 'json' ? 'active' : ''}`}
            onClick={() => setActiveTab('json')}
          >
            <Code size={16} />
            <span>JSON 代码</span>
          </div>
        </div>
        
        <div className="modal-body">
          {activeTab === 'preview' ? (
            <div className="preview-content">
              {renderPreview()}
            </div>
          ) : (
            <div className="form-group" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0, padding: '16px' }}>
              <textarea 
                className="raw-json-editor"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  validateJSON(e.target.value);
                }}
                spellCheck={false}
              />
              {error && <div className="error-message" style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>JSON 格式错误: {error}</div>}
            </div>
          )}
        </div>
        
        <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '16px' }}>
          {dataKey && (
             <div className="info-message" style={{ fontSize: '12px', color: '#666', marginRight: 'auto' }}>
               将保存到: <strong>{dataKey}</strong>
               {error && <span style={{ color: '#f59e0b', marginLeft: '8px' }}>（非标准 JSON，将作为文本保存）</span>}
             </div>
          )}
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={handleSave} disabled={!content.trim()}>确认并保存</button>
        </div>
    </DraggableResizableModal>
  );
}
