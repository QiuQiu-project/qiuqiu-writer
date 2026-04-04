/**
 * 版本冲突解决对话框
 * 当检测到本地版本和线上版本不一致时，允许用户选择如何处理
 */

import { useState } from 'react';
import DraggableResizableModal from '../common/DraggableResizableModal';
import { X, Download, Upload, GitMerge, AlertTriangle, Eye, EyeOff } from 'lucide-react';

export interface VersionConflictInfo {
  documentId: string;
  localVersion: number;
  remoteVersion: number;
  localContent: string;
  remoteContent: string;
  localTimestamp?: string;
  remoteTimestamp?: string;
}

export type ConflictResolution = 'keep_local' | 'keep_remote' | 'merge' | 'cancel';

export interface VersionConflictModalProps {
  isOpen: boolean;
  conflictInfo: VersionConflictInfo | null;
  onResolve: (resolution: ConflictResolution) => void;
  onClose: () => void;
}

export default function VersionConflictModal({
  isOpen,
  conflictInfo,
  onResolve,
  onClose,
}: VersionConflictModalProps) {
  const [showLocalPreview, setShowLocalPreview] = useState(false);
  const [showRemotePreview, setShowRemotePreview] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ConflictResolution | null>(null);

  // 记录上一次的冲突文档ID，用于在冲突变化时重置状态
  const [prevDocId, setPrevDocId] = useState<string | null>(null);

  if (conflictInfo?.documentId !== prevDocId) {
    setPrevDocId(conflictInfo?.documentId || null);
    setShowLocalPreview(false);
    setShowRemotePreview(false);
    setSelectedResolution(null);
  }

  if (!isOpen || !conflictInfo) return null;

  const { localVersion, remoteVersion, localContent, remoteContent, localTimestamp, remoteTimestamp } = conflictInfo;

  // 计算内容差异（简单实现：显示字符数和行数）
  const getContentStats = (content: string) => {
    const textContent = content.replace(/<[^>]*>/g, ''); // 移除HTML标签
    const lines = textContent.split('\n').filter(line => line.trim().length > 0);
    return {
      chars: textContent.length,
      lines: lines.length,
      words: textContent.split(/\s+/).filter(w => w.length > 0).length,
    };
  };

  const localStats = getContentStats(localContent);
  const remoteStats = getContentStats(remoteContent);

  // 简单的文本预览（移除HTML标签，限制长度）
  const getPreview = (content: string, maxLength: number = 500) => {
    const textContent = content.replace(/<[^>]*>/g, '').trim();
    if (textContent.length <= maxLength) return textContent;
    return textContent.substring(0, maxLength) + '...';
  };

  const handleResolve = (resolution: ConflictResolution) => {
    setSelectedResolution(resolution);
    onResolve(resolution);
  };

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={900}
      initialHeight={700}
      className="version-conflict-modal"
      handleClassName=".version-conflict-header"
    >
        <div className="version-conflict-header">
            <div className="version-conflict-title">
            <AlertTriangle size={24} className="icon-warning" />
            <h3>检测到版本冲突</h3>
          </div>
          <button className="version-conflict-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="version-conflict-body">
          <div className="version-conflict-info">
            <p>
              本地版本 <strong>v{localVersion}</strong> 与线上版本 <strong>v{remoteVersion}</strong> 不一致。
              请选择如何处理：
            </p>
          </div>

          <div className="version-comparison">
            {/* 本地版本 */}
            <div className="version-card local-version">
              <div className="version-card-header">
                <div className="version-card-title">
                  <Download size={18} />
                  <span>本地版本 (v{localVersion})</span>
                </div>
                {localTimestamp && (
                  <span className="version-timestamp">{new Date(localTimestamp).toLocaleString()}</span>
                )}
              </div>
              <div className="version-stats">
                <span>{localStats.chars.toLocaleString()} 字符</span>
                <span>{localStats.words.toLocaleString()} 词</span>
                <span>{localStats.lines} 行</span>
              </div>
              <div className="version-preview">
                <button
                  className="preview-toggle"
                  onClick={() => setShowLocalPreview(!showLocalPreview)}
                >
                  {showLocalPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showLocalPreview ? '隐藏预览' : '显示预览'}
                </button>
                {showLocalPreview && (
                  <div className="preview-content">
                    {getPreview(localContent)}
                  </div>
                )}
              </div>
            </div>

            {/* 线上版本 */}
            <div className="version-card remote-version">
              <div className="version-card-header">
                <div className="version-card-title">
                  <Upload size={18} />
                  <span>线上版本 (v{remoteVersion})</span>
                </div>
                {remoteTimestamp && (
                  <span className="version-timestamp">{new Date(remoteTimestamp).toLocaleString()}</span>
                )}
              </div>
              <div className="version-stats">
                <span>{remoteStats.chars.toLocaleString()} 字符</span>
                <span>{remoteStats.words.toLocaleString()} 词</span>
                <span>{remoteStats.lines} 行</span>
              </div>
              <div className="version-preview">
                <button
                  className="preview-toggle"
                  onClick={() => setShowRemotePreview(!showRemotePreview)}
                >
                  {showRemotePreview ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showRemotePreview ? '隐藏预览' : '显示预览'}
                </button>
                {showRemotePreview && (
                  <div className="preview-content">
                    {getPreview(remoteContent)}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="version-conflict-actions">
            <button
              className={`action-btn keep-local ${selectedResolution === 'keep_local' ? 'selected' : ''}`}
              onClick={() => handleResolve('keep_local')}
              disabled={selectedResolution !== null}
            >
              <Download size={18} />
              <span>保留本地版本</span>
              <small>使用本地版本覆盖线上版本</small>
            </button>

            <button
              className={`action-btn keep-remote ${selectedResolution === 'keep_remote' ? 'selected' : ''}`}
              onClick={() => handleResolve('keep_remote')}
              disabled={selectedResolution !== null}
            >
              <Upload size={18} />
              <span>保留线上版本</span>
              <small>使用线上版本覆盖本地版本</small>
            </button>

            <button
              className={`action-btn merge ${selectedResolution === 'merge' ? 'selected' : ''}`}
              onClick={() => handleResolve('merge')}
              disabled={selectedResolution !== null}
            >
              <GitMerge size={18} />
              <span>自动合并</span>
              <small>智能合并两个版本的内容</small>
            </button>
          </div>

          {selectedResolution && (
            <div className="resolution-status">
              <p>正在处理您的选择...</p>
            </div>
          )}
        </div>

        <div className="version-conflict-footer">
          <button className="cancel-btn" onClick={onClose} disabled={selectedResolution !== null}>
            取消
          </button>
          </div>
    </DraggableResizableModal>
  );
}
