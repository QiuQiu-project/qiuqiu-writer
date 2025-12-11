import { useState } from 'react';
import { Plus, Trash2, Sparkles, User } from 'lucide-react';
import CharacterTimeline from './CharacterTimeline';
import CharacterRelations from './CharacterRelations';
import './Characters.css';

interface Character {
  id: string;
  name: string;
  gender: '男' | '女';
  description: string;
  type: 'main' | 'secondary';
}

const mockCharacters: Character[] = [
  {
    id: '1',
    name: '苏逸飞',
    gender: '男',
    description: '表面上浪荡不羁,玩世不恭,言语轻佻得让人以为他什...',
    type: 'main',
  },
  {
    id: '2',
    name: '林小雨',
    gender: '女',
    description: '女主角，温柔善良，拥有治愈能力',
    type: 'main',
  },
  {
    id: '3',
    name: '霍明月',
    gender: '女',
    description: '热情、坦率、敢爱敢恨、占有欲强、略带冲动、在人前...',
    type: 'main',
  },
  {
    id: '4',
    name: '陈小鱼',
    gender: '女',
    description: '外表粗糙,内心却细腻柔软,对人有天然的善意和人情...',
    type: 'main',
  },
  {
    id: '5',
    name: '顾星河',
    gender: '女',
    description: '坚信自己是世界的"主角"和"天选之人",活在自己宏大...',
    type: 'main',
  },
];

interface CharactersProps {
  availableCharacters?: Array<{ id: string; name: string; avatar?: string; gender?: string; description?: string; type?: string }>;
}

export default function Characters({ availableCharacters = [] }: CharactersProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'relationships' | 'timeline'>('list');
  const [selectedCharacter, setSelectedCharacter] = useState<{ id: string; name: string } | null>(null);

  // 使用传入的角色数据，如果没有则使用 mock 数据
  const characters: Character[] = availableCharacters.length > 0
    ? availableCharacters.map(char => ({
        id: char.id,
        name: char.name,
        gender: (char.gender as '男' | '女') || '男',
        description: char.description || '',
        type: (char.type === '主要角色' || char.type === 'main' ? 'main' : 'secondary') as 'main' | 'secondary',
      }))
    : mockCharacters;

  const mainCharacters = characters.filter(c => c.type === 'main');
  const secondaryCharacters = characters.filter(c => c.type === 'secondary');

  const handleCharacterClick = (character: Character) => {
    setSelectedCharacter({ id: character.id, name: character.name });
    setActiveTab('timeline');
  };

  return (
    <div className="characters-page">
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
            className={`tab-btn ${activeTab === 'relationships' ? 'active' : ''}`}
            onClick={() => setActiveTab('relationships')}
          >
            人物关系
          </button>
          {selectedCharacter && (
            <button
              className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
              onClick={() => setActiveTab('timeline')}
            >
              {selectedCharacter.name} - 时间线
            </button>
          )}
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="characters-content">
          <div className="characters-actions">
            <button className="action-btn primary">
              <Plus size={16} />
              <span>添加角色</span>
            </button>
            <button className="action-btn">
              <Sparkles size={16} />
              <span>生成角色</span>
            </button>
          </div>

          {/* 主要角色 */}
          <div className="characters-section">
            <h3 className="section-title">主要角色</h3>
            <div className="characters-grid">
              {mainCharacters.map((character) => (
                <div
                  key={character.id}
                  className="character-card"
                  onClick={() => handleCharacterClick(character)}
                >
                  <div className="character-header">
                    <div className="character-info">
                      <div className="character-name-row">
                        <span className="character-name">{character.name}</span>
                        <span className="character-gender">{character.gender}</span>
                      </div>
                    </div>
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        // 处理删除逻辑
                      }}
                      title="删除角色"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="character-description">
                    {character.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 次要角色 */}
          <div className="characters-section">
            <h3 className="section-title">次要角色</h3>
            {secondaryCharacters.length === 0 ? (
              <div className="empty-section">
                <User size={48} />
                <p>暂无次要角色</p>
              </div>
            ) : (
              <div className="characters-grid">
                {secondaryCharacters.map((character) => (
                  <div
                    key={character.id}
                    className="character-card"
                    onClick={() => handleCharacterClick(character)}
                  >
                    <div className="character-header">
                      <div className="character-info">
                        <div className="character-name-row">
                          <span className="character-name">{character.name}</span>
                          <span className="character-gender">{character.gender}</span>
                        </div>
                      </div>
                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          // 处理删除逻辑
                        }}
                        title="删除角色"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="character-description">
                      {character.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="section-actions">
              <button className="action-btn primary">
                <Plus size={16} />
                <span>添加角色</span>
              </button>
              <button className="action-btn">
                <Sparkles size={16} />
                <span>生成角色</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'relationships' && (
        <div className="relationships-content">
          <CharacterRelations />
        </div>
      )}

      {activeTab === 'timeline' && selectedCharacter && (
        <div className="timeline-content-wrapper">
          <CharacterTimeline
            filterCharacterId={selectedCharacter.id}
            characterName={selectedCharacter.name}
            onBack={() => setActiveTab('list')}
          />
        </div>
      )}
    </div>
  );
}

