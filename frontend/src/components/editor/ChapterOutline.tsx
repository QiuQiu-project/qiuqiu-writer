import { useState } from 'react';
import { FileText, Edit2 } from 'lucide-react';
import './ChapterOutline.css';

export interface OutlineChapter {
  id: string;
  title: string;
  outline?: string;
  detailOutline?: string;
}

export interface OutlineVolume {
  id: string;
  title: string;
  outline?: string;
  detailOutline?: string;
  chapters: OutlineChapter[];
}

interface ChapterOutlineProps {
  volumes: OutlineVolume[];
  onEditVolume?: (volume: OutlineVolume) => void;
  onEditChapter?: (chapter: OutlineChapter, volumeId: string, volumeTitle: string) => void;
}

export default function ChapterOutline({ volumes, onEditVolume, onEditChapter }: ChapterOutlineProps) {
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'outline' | 'detail'>('outline');

  return (
    <div className="chapter-outline">
      <div className="outline-header">
        <h2 className="outline-title">章细纲和大纲</h2>
        <div className="outline-tabs">
          <button
            className={`tab-btn ${viewMode === 'outline' ? 'active' : ''}`}
            onClick={() => setViewMode('outline')}
          >
            大纲
          </button>
          <button
            className={`tab-btn ${viewMode === 'detail' ? 'active' : ''}`}
            onClick={() => setViewMode('detail')}
          >
            细纲
          </button>
        </div>
      </div>

      <div className="outline-content">
        <div className="outline-sidebar">
          <div className="outline-list">
            {volumes.map((volume) => (
              <div key={volume.id} className="outline-item volume-item">
                <div
                  className={`item-header ${selectedVolume === volume.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedVolume(volume.id);
                    setSelectedChapter(null);
                  }}
                >
                  <FileText size={16} />
                  <span>{volume.title}</span>
                  {onEditVolume && (
                    <button 
                      className="item-action-btn" 
                      title="编辑卷"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditVolume(volume);
                      }}
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>
                {volume.chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className={`outline-item chapter-item ${selectedChapter === chapter.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedVolume(volume.id);
                      setSelectedChapter(chapter.id);
                    }}
                  >
                    <span>{chapter.title}</span>
                    {onEditChapter && (
                      <button 
                        className="item-action-btn" 
                        title="编辑章节"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditChapter(chapter, volume.id, volume.title);
                        }}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="outline-detail">
          {selectedChapter ? (
            (() => {
              const volume = volumes.find(v => v.id === selectedVolume);
              const chapter = volume?.chapters.find(c => c.id === selectedChapter);
              if (!chapter) return <div className="empty-state">请选择章节</div>;
              
              const content = viewMode === 'outline' ? chapter.outline : chapter.detailOutline;
              return (
                <div className="detail-content">
                  <h3>{chapter.title} - {viewMode === 'outline' ? '大纲' : '细纲'}</h3>
                  <div className="content-text">
                    {content ? (
                      <pre>{content}</pre>
                    ) : (
                      <div className="empty-text">暂无{viewMode === 'outline' ? '大纲' : '细纲'}内容</div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : selectedVolume ? (
            (() => {
              const volume = volumes.find(v => v.id === selectedVolume);
              if (!volume) return <div className="empty-state">请选择卷</div>;
              
              const content = viewMode === 'outline' ? volume.outline : volume.detailOutline;
              return (
                <div className="detail-content">
                  <h3>{volume.title} - {viewMode === 'outline' ? '大纲' : '细纲'}</h3>
                  <div className="content-text">
                    {content ? (
                      <pre>{content}</pre>
                    ) : (
                      <div className="empty-text">暂无{viewMode === 'outline' ? '大纲' : '细纲'}内容</div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="empty-state">请选择卷或章节查看大纲</div>
          )}
        </div>
      </div>
    </div>
  );
}

