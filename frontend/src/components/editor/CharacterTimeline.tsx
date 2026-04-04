import { useState } from 'react';
import { Plus, Edit2, Trash2, User, MapPin, Calendar, FileText } from 'lucide-react';

interface CharacterInfo {
  id: string;
  name: string;
  age?: number;
  gender?: string;
  occupation?: string;
  description?: string;
  avatar?: string;
}

interface TimelineEvent {
  id: string;
  characterId: string;
  character: string;
  time: string;
  event: string;
  description?: string;
  location?: string;
  characterInfo?: CharacterInfo;
}

const mockCharacters: CharacterInfo[] = [
  {
    id: '1',
    name: '苏逸飞',
    age: 25,
    gender: '男',
    occupation: '程序员',
    description: '主角，从现代穿越到异世界，拥有特殊能力',
  },
  {
    id: '2',
    name: '林小雨',
    age: 22,
    gender: '女',
    occupation: '学生',
    description: '女主角，温柔善良，拥有治愈能力',
  },
];

const mockEvents: TimelineEvent[] = [
  {
    id: '1',
    characterId: '1',
    character: '苏逸飞',
    time: '第一卷 第1章',
    event: '主角登场',
    description: '从噩梦中醒来，发现自己不在末日废墟',
    location: '起始之城',
    characterInfo: mockCharacters[0],
  },
  {
    id: '2',
    characterId: '1',
    character: '苏逸飞',
    time: '第一卷 第2章',
    event: '获得能力',
    description: '觉醒特殊能力，开始探索新世界',
    location: '起始之城',
    characterInfo: mockCharacters[0],
  },
  {
    id: '3',
    characterId: '2',
    character: '林小雨',
    time: '第一卷 第3章',
    event: '角色登场',
    description: '女主角首次出现',
    location: '魔法学院',
    characterInfo: mockCharacters[1],
  },
];

interface CharacterTimelineProps {
  filterCharacterId?: string | null;
  characterName?: string;
  onBack?: () => void;
}

export default function CharacterTimeline({ filterCharacterId, characterName, onBack }: CharacterTimelineProps) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [filterCharacter, setFilterCharacter] = useState<string | null>(filterCharacterId || null);
  const effectiveFilterCharacter = filterCharacter ?? filterCharacterId ?? null;

  const filteredEvents = effectiveFilterCharacter
    ? mockEvents.filter(event => event.characterId === effectiveFilterCharacter)
    : mockEvents;

  const selectedEventData = mockEvents.find(e => e.id === selectedEvent);

  return (
    <div className="character-timeline">
      <div className="timeline-header">
        <div className="timeline-title-section">
          <h2 className="timeline-title">
            {characterName ? `${characterName} - 角色时间线` : '角色时间线'}
          </h2>
          {characterName && onBack && (
            <button
              className="back-to-characters-btn"
              onClick={onBack}
            >
              返回角色列表
            </button>
          )}
        </div>
        <div className="header-actions">
          <select
            className="character-filter"
            value={effectiveFilterCharacter || ''}
            onChange={(e) => setFilterCharacter(e.target.value || null)}
          >
            <option value="">全部角色</option>
            {mockCharacters.map(char => (
              <option key={char.id} value={char.id}>{char.name}</option>
            ))}
          </select>
          <button className="add-event-btn">
            <Plus size={16} />
            <span>添加事件</span>
          </button>
        </div>
      </div>

      <div className="timeline-content-wrapper">
        <div className="timeline-content">
          <div className="timeline-list">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className={`timeline-item ${selectedEvent === event.id ? 'active' : ''}`}
                onClick={() => setSelectedEvent(event.id)}
              >
                <div className="timeline-marker" />
                <div className="timeline-content-item">
                  <div className="timeline-header-item">
                    <span className="timeline-character">{event.character}</span>
                    <span className="timeline-time">{event.time}</span>
                  </div>
                  <div className="timeline-event">{event.event}</div>
                  {event.description && (
                    <div className="timeline-description">{event.description}</div>
                  )}
                  <div className="timeline-meta">
                    {event.location && (
                      <span className="timeline-meta-item">
                        <MapPin size={12} />
                        {event.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="timeline-actions">
                  <button className="timeline-action-btn" title="编辑">
                    <Edit2 size={14} />
                  </button>
                  <button className="timeline-action-btn" title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 角色详情面板 */}
        {selectedEventData && selectedEventData.characterInfo && (
          <div className="character-detail-panel">
            <div className="panel-header">
              <h3>角色信息</h3>
              <button
                className="close-panel-btn"
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </button>
            </div>
            <div className="panel-content">
              <div className="character-avatar-section">
                <div className="character-avatar">
                  {selectedEventData.characterInfo.avatar ? (
                    <img src={selectedEventData.characterInfo.avatar} alt={selectedEventData.characterInfo.name} />
                  ) : (
                    <User size={32} />
                  )}
                </div>
                <h4 className="character-name">{selectedEventData.characterInfo.name}</h4>
              </div>

              <div className="character-info-section">
                <div className="info-item">
                  <span className="info-label">年龄</span>
                  <span className="info-value">{selectedEventData.characterInfo.age || '未知'}岁</span>
                </div>
                <div className="info-item">
                  <span className="info-label">性别</span>
                  <span className="info-value">{selectedEventData.characterInfo.gender || '未知'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">职业</span>
                  <span className="info-value">{selectedEventData.characterInfo.occupation || '未知'}</span>
                </div>
                {selectedEventData.location && (
                  <div className="info-item">
                    <span className="info-label">当前位置</span>
                    <span className="info-value">
                      <MapPin size={14} />
                      {selectedEventData.location}
                    </span>
                  </div>
                )}
                {selectedEventData.characterInfo.description && (
                  <div className="info-item full-width">
                    <span className="info-label">角色描述</span>
                    <div className="info-value description-text">
                      {selectedEventData.characterInfo.description}
                    </div>
                  </div>
                )}
              </div>

              <div className="event-detail-section">
                <h5 className="section-title">事件详情</h5>
                <div className="event-detail-item">
                  <Calendar size={14} />
                  <span>{selectedEventData.time}</span>
                </div>
                <div className="event-detail-item">
                  <FileText size={14} />
                  <span>{selectedEventData.event}</span>
                </div>
                {selectedEventData.description && (
                  <div className="event-description">
                    {selectedEventData.description}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
