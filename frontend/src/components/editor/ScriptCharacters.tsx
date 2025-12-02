import { useState } from 'react';
import { Plus, Sparkles, Users } from 'lucide-react';
import CharacterRelations from './CharacterRelations';
import './ScriptCharacters.css';

export default function ScriptCharacters() {
  const [activeTab, setActiveTab] = useState<'list' | 'relations'>('list');

  return (
    <div className="script-characters">
      <div className="characters-header">
        <h2 className="characters-title">角色</h2>
        <div className="characters-tabs">
          <button
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            角色列表
          </button>
          <button
            className={`tab-btn ${activeTab === 'relations' ? 'active' : ''}`}
            onClick={() => setActiveTab('relations')}
          >
            人物关系
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="characters-content">
          {/* 主要角色 */}
          <div className="character-section">
            <div className="section-header">
              <h3 className="section-title">主要角色</h3>
              <div className="section-actions">
                <button className="btn btn-secondary btn-sm">
                  <Plus size={14} />
                  <span>添加角色</span>
                </button>
                <button className="btn btn-primary btn-sm">
                  <Sparkles size={14} />
                  <span>生成角色</span>
                </button>
              </div>
            </div>
            <div className="characters-list">
              <div className="empty-characters">
                <Users size={48} />
                <p>暂无主要角色</p>
              </div>
            </div>
          </div>

          {/* 次要角色 */}
          <div className="character-section">
            <div className="section-header">
              <h3 className="section-title">次要角色</h3>
              <div className="section-actions">
                <button className="btn btn-secondary btn-sm">
                  <Plus size={14} />
                  <span>添加角色</span>
                </button>
                <button className="btn btn-primary btn-sm">
                  <Sparkles size={14} />
                  <span>生成角色</span>
                </button>
              </div>
            </div>
            <div className="characters-list">
              <div className="empty-characters">
                <Users size={48} />
                <p>暂无次要角色</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'relations' && (
        <div className="characters-relations-content">
          <CharacterRelations />
        </div>
      )}
    </div>
  );
}

