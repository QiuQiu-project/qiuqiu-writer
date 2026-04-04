import { useState } from 'react';
import { Plus, Trash2, Sparkles, User } from 'lucide-react';
import CharacterTimeline from './CharacterTimeline';
import CharacterRelations from './CharacterRelations';
import { cn } from '@/lib/utils';

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
  readOnly?: boolean;
}

const tabBtnClass = 'px-4 py-2 border-none bg-transparent text-sm rounded-[6px] cursor-pointer transition-all font-medium shrink-0';
const actionBtnClass = 'flex items-center gap-1.5 px-5 py-2.5 border border-[var(--accent-primary)] text-sm font-medium rounded-[8px] cursor-pointer transition-all hover:[background:var(--accent-light)] hover:[border-color:var(--accent-hover)]';

export default function Characters({ availableCharacters = [], readOnly }: CharactersProps) {
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
    <div className="w-full h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-6 py-5 border-b max-md:px-4" style={{ borderColor: 'var(--border-light)' }}>
        <h2 className="text-lg font-semibold m-0 mb-4" style={{ color: 'var(--text-primary)' }}>角色</h2>
        <div className="flex gap-2 max-md:overflow-x-auto max-md:pb-1 max-md:[scrollbar-width:none] max-md:[-webkit-overflow-scrolling:touch]">
          <button
            className={cn(tabBtnClass, activeTab === 'list' ? 'font-semibold' : 'hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]')}
            style={activeTab === 'list' ? { background: 'var(--accent-primary)', color: 'var(--text-inverse)' } : { color: 'var(--text-secondary)' }}
            onClick={() => setActiveTab('list')}
          >
            角色列表
          </button>
          <button
            className={cn(tabBtnClass, activeTab === 'relationships' ? 'font-semibold' : 'hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]')}
            style={activeTab === 'relationships' ? { background: 'var(--accent-primary)', color: 'var(--text-inverse)' } : { color: 'var(--text-secondary)' }}
            onClick={() => setActiveTab('relationships')}
          >
            人物关系
          </button>
          {selectedCharacter && (
            <button
              className={cn(tabBtnClass, activeTab === 'timeline' ? 'font-semibold' : 'hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]')}
              style={activeTab === 'timeline' ? { background: 'var(--accent-primary)', color: 'var(--text-inverse)' } : { color: 'var(--text-secondary)' }}
              onClick={() => setActiveTab('timeline')}
            >
              {selectedCharacter.name} - 时间线
            </button>
          )}
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="flex-1 p-6 overflow-y-auto max-md:p-4">
          {!readOnly && (
            <div className="flex gap-3 mb-6 max-md:flex-wrap max-md:gap-2">
              <button className={actionBtnClass} style={{ background: 'var(--bg-primary)', color: 'var(--accent-primary)' }}>
                <Plus size={16} />
                <span>添加角色</span>
              </button>
              <button className={actionBtnClass} style={{ background: 'var(--bg-primary)', color: 'var(--accent-primary)' }}>
                <Sparkles size={16} />
                <span>生成角色</span>
              </button>
            </div>
          )}

          {/* 主要角色 */}
          <div className="mb-8">
            <h3 className="text-base font-semibold m-0 mb-4" style={{ color: 'var(--text-primary)' }}>主要角色</h3>
            <div className="grid gap-4 mb-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] max-md:[grid-template-columns:1fr]">
              {mainCharacters.map((character) => (
                <div
                  key={character.id}
                  className="group border rounded-xl p-4 cursor-pointer transition-all hover:[border-color:var(--accent-primary)] hover:[box-shadow:var(--shadow)] hover:-translate-y-0.5"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
                  onClick={() => handleCharacterClick(character)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{character.name}</span>
                        <span className="text-[13px] px-2 py-0.5 rounded-[4px]" style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>{character.gender}</span>
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        className="w-8 h-8 p-0 border-none bg-transparent rounded-[6px] cursor-pointer flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:[background:var(--error-light)]"
                        style={{ color: 'var(--text-tertiary)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // 处理删除逻辑
                        }}
                        title="删除角色"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="text-sm line-clamp-3" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {character.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 次要角色 */}
          <div>
            <h3 className="text-base font-semibold m-0 mb-4" style={{ color: 'var(--text-primary)' }}>次要角色</h3>
            {secondaryCharacters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 gap-4" style={{ color: 'var(--text-tertiary)' }}>
                <User size={48} style={{ opacity: 0.5 }} />
                <p className="text-sm m-0">暂无次要角色</p>
              </div>
            ) : (
              <div className="grid gap-4 mb-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] max-md:[grid-template-columns:1fr]">
                {secondaryCharacters.map((character) => (
                  <div
                    key={character.id}
                    className="group border rounded-xl p-4 cursor-pointer transition-all hover:[border-color:var(--accent-primary)] hover:[box-shadow:var(--shadow)] hover:-translate-y-0.5"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
                    onClick={() => handleCharacterClick(character)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{character.name}</span>
                          <span className="text-[13px] px-2 py-0.5 rounded-[4px]" style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>{character.gender}</span>
                        </div>
                      </div>
                      {!readOnly && (
                        <button
                          className="w-8 h-8 p-0 border-none bg-transparent rounded-[6px] cursor-pointer flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:[background:var(--error-light)]"
                          style={{ color: 'var(--text-tertiary)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // 处理删除逻辑
                          }}
                          title="删除角色"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="text-sm line-clamp-3" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {character.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!readOnly && (
              <div className="flex gap-3 mt-4">
                <button className={actionBtnClass} style={{ background: 'var(--bg-primary)', color: 'var(--accent-primary)' }}>
                  <Plus size={16} />
                  <span>添加角色</span>
                </button>
                <button className={actionBtnClass} style={{ background: 'var(--bg-primary)', color: 'var(--accent-primary)' }}>
                  <Sparkles size={16} />
                  <span>生成角色</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'relationships' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <CharacterRelations />
        </div>
      )}

      {activeTab === 'timeline' && selectedCharacter && (
        <div className="flex-1 flex flex-col overflow-hidden">
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
