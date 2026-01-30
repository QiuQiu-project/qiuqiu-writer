import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface GeneratedDataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Clean up markdown code blocks
      let cleaned = rawData;
      const match = rawData.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        cleaned = match[1];
      }
      setContent(cleaned);
      validateJSON(cleaned);
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

  const handleSave = () => {
    if (!validateJSON(content)) return;
    
    try {
      const parsed = JSON.parse(content);
      // Smart extraction logic
      let finalData = parsed;
      if (dataKey && !Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
        if (Object.prototype.hasOwnProperty.call(parsed, dataKey)) {
             finalData = parsed[dataKey];
        }
      }
      
      onSave(finalData);
      onClose();
    } catch (e) {
      setError('Save failed: ' + (e as Error).message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '600px', maxWidth: '90vw' }}>
        <div className="modal-header">
          <h3>AI 生成结果预览</h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        
        <div className="modal-body">
           <div className="form-group">
             <label>生成的数据 (JSON)</label>
             <textarea 
               value={content}
               onChange={(e) => {
                 setContent(e.target.value);
                 validateJSON(e.target.value);
               }}
               rows={15}
               style={{ fontFamily: 'monospace', fontSize: '12px', width: '100%' }}
             />
             {error && <div className="error-message" style={{ color: 'red', fontSize: '12px', marginTop: '5px' }}>JSON 格式错误: {error}</div>}
           </div>
           
           {dataKey && !error && (
             <div className="info-message" style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
               将保存到数据键: <strong>{dataKey}</strong>
             </div>
           )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={handleSave} disabled={!!error}>确认并保存</button>
        </div>
      </div>
    </div>
  );
}
