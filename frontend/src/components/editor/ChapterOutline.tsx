import { useState } from 'react';
import { FileText, Plus, Edit2 } from 'lucide-react';
import './ChapterOutline.css';

interface Chapter {
  id: string;
  title: string;
  outline?: string;
  detailOutline?: string;
}

interface Volume {
  id: string;
  title: string;
  outline?: string;
  detailOutline?: string;
  chapters: Chapter[];
}

const mockVolumes: Volume[] = [
  {
    id: '1',
    title: '第一卷',
    outline: '第一卷大纲：描述故事的开端，主角的成长历程...',
    detailOutline: '第一卷细纲：详细描述每个章节的关键情节...',
    chapters: [
      {
        id: '1-1',
        title: '第1章',
        outline: '第一章大纲：主角登场，背景设定...',
        detailOutline: '第一章细纲：详细情节描述...',
      },
      {
        id: '1-2',
        title: '第2章',
        outline: '第二章大纲：冲突开始...',
      },
    ],
  },
  {
    id: '2',
    title: '第二卷',
    outline: '第二卷大纲：故事发展...',
    chapters: [
      {
        id: '2-1',
        title: '第1章',
      },
    ],
  },
];

export default function ChapterOutline() {
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
            {mockVolumes.map((volume) => (
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
                  <button className="item-action-btn" title="编辑">
                    <Edit2 size={14} />
                  </button>
                </div>
                {volume.chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className={`outline-item chapter-item ${selectedChapter === chapter.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedChapter(chapter.id);
                      setSelectedVolume(volume.id);
                    }}
                  >
                    <FileText size={14} />
                    <span>{chapter.title}</span>
                    <button className="item-action-btn" title="编辑">
                      <Edit2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <button className="add-volume-btn">
            <Plus size={16} />
            <span>添加卷</span>
          </button>
        </div>

        <div className="outline-editor">
          {selectedVolume ? (
            <div className="outline-editor-content">
              {selectedChapter ? (
                <>
                  <div className="editor-header">
                    <h3>
                      {mockVolumes
                        .find(v => v.id === selectedVolume)
                        ?.chapters.find(c => c.id === selectedChapter)?.title}
                    </h3>
                    <div className="editor-actions">
                      <button className="action-btn">
                        <Edit2 size={14} />
                        编辑
                      </button>
                    </div>
                  </div>
                  <div className="editor-body">
                    {viewMode === 'outline' ? (
                      <div className="outline-text">
                        {mockVolumes
                          .find(v => v.id === selectedVolume)
                          ?.chapters.find(c => c.id === selectedChapter)?.outline || '暂无大纲'}
                      </div>
                    ) : (
                      <div className="outline-text">
                        {mockVolumes
                          .find(v => v.id === selectedVolume)
                          ?.chapters.find(c => c.id === selectedChapter)?.detailOutline || '暂无细纲'}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="editor-header">
                    <h3>
                      {mockVolumes.find(v => v.id === selectedVolume)?.title}
                    </h3>
                    <div className="editor-actions">
                      <button className="action-btn">
                        <Edit2 size={14} />
                        编辑
                      </button>
                    </div>
                  </div>
                  <div className="editor-body">
                    {viewMode === 'outline' ? (
                      <div className="outline-text">
                        {mockVolumes.find(v => v.id === selectedVolume)?.outline || '暂无大纲'}
                      </div>
                    ) : (
                      <div className="outline-text">
                        {mockVolumes.find(v => v.id === selectedVolume)?.detailOutline || '暂无细纲'}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="outline-empty">
              <FileText size={48} />
              <p>请选择一个卷或章节查看大纲</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

