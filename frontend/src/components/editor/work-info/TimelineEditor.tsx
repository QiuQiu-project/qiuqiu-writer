
import { useState, useRef, useEffect } from 'react';
import { Plus, X, Search, ChevronDown, MapPin, User, Settings } from 'lucide-react';
import type { ComponentConfig, TimelineEditForm, CharacterData } from './types';

interface TimelineCharacterSelectorProps {
  availableCharacters: Array<{ id: string; name: string }>;
  selectedCharacterIds: string[];
  selectedCharacters: string[];
  onSelectionChange: (characterIds: string[], characters: string[]) => void;
}

export function TimelineCharacterSelector({
  availableCharacters,
  selectedCharacterIds,
  selectedCharacters,
  onSelectionChange
}: TimelineCharacterSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  
  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchQuery('');
      }
    }
    
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);
  
  // 过滤角色
  const filteredCharacters = availableCharacters.filter(char => {
    const matchesSearch = char.name.toLowerCase().includes(searchQuery.toLowerCase());
    const notSelected = !selectedCharacterIds.includes(char.id);
    return matchesSearch && notSelected;
  });
  
  const handleRemoveCharacter = (charId: string) => {
    const newCharacterIds = selectedCharacterIds.filter(id => id !== charId);
    const newCharacters = selectedCharacters.filter((_, idx) => 
      selectedCharacterIds[idx] !== charId
    );
    onSelectionChange(newCharacterIds, newCharacters);
  };
  
  const handleAddCharacter = (char: { id: string; name: string }) => {
    onSelectionChange([...selectedCharacterIds, char.id], [...selectedCharacters, char.name]);
    setSearchQuery('');
  };
  
  return (
    <div className="timeline-characters-selector">
      <label className="timeline-characters-label">关联角色：</label>
      <div className="timeline-characters-tags">
        {selectedCharacterIds.map((charId) => {
          const char = availableCharacters.find(c => c.id === charId);
          if (!char) return null;
          return (
            <span key={charId} className="timeline-character-tag">
              {char.name}
              <button
                type="button"
                className="timeline-character-tag-remove"
                onClick={() => handleRemoveCharacter(charId)}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
      </div>
      <div className="timeline-character-dropdown-wrapper">
        <div
          ref={triggerRef}
          className="timeline-character-dropdown-trigger"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <span className="timeline-character-dropdown-text">
            {selectedCharacterIds.length > 0 ? `已选择 ${selectedCharacterIds.length} 个角色` : '选择角色'}
          </span>
          <ChevronDown size={16} className={`timeline-character-dropdown-arrow ${isDropdownOpen ? 'open' : ''}`} />
        </div>
        {isDropdownOpen && (
          <div ref={dropdownRef} className="timeline-character-dropdown">
            <div className="timeline-character-search">
              <Search size={16} className="timeline-character-search-icon" />
              <input
                type="text"
                className="timeline-character-search-input"
                placeholder="搜索角色..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="timeline-character-dropdown-options">
              {filteredCharacters.length > 0 ? (
                filteredCharacters.map(char => (
                  <button
                    key={char.id}
                    type="button"
                    className="timeline-character-dropdown-option"
                    onClick={() => handleAddCharacter(char)}
                  >
                    <span>{char.name}</span>
                    <Plus size={14} />
                  </button>
                ))
              ) : (
                <div className="timeline-character-dropdown-empty">
                  {searchQuery ? '未找到匹配的角色' : '所有角色已选择'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TimelineEditorProps {
  component: ComponentConfig;
  onChange: (newValue: TimelineEditForm[]) => void;
  availableCharacters: CharacterData[];
  isEditMode: boolean;
}

export default function TimelineEditor({
  component,
  onChange,
  availableCharacters,
  // isEditMode
}: TimelineEditorProps) {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TimelineEditForm>({
    characterIds: [],
    characters: [],
    time: '',
    event: '',
    description: '',
    location: ''
  });

  const events = (Array.isArray(component.value) ? component.value : []) as TimelineEditForm[];

  const handleAddEvent = () => {
    setEditingEventId('new');
    setEditForm({
      characterIds: [],
      characters: [],
      time: '',
      event: '',
      description: '',
      location: ''
    });
  };

  const handleEditEvent = (event: TimelineEditForm, index: number) => {
    setEditingEventId(index.toString());
    setEditForm({
      characterIds: event.characterIds || [],
      characters: event.characters || [],
      time: event.time || '',
      event: event.event || '',
      description: event.description || '',
      location: event.location || ''
    });
  };

  const handleSaveEvent = () => {
    if (!editForm.event.trim()) return;

    const newEvent = { ...editForm };
    const newEvents = [...events];

    if (editingEventId === 'new') {
      newEvents.push(newEvent);
    } else if (editingEventId !== null) {
      const index = parseInt(editingEventId);
      if (!isNaN(index) && index >= 0 && index < newEvents.length) {
        newEvents[index] = newEvent;
      }
    }

    onChange(newEvents);
    setEditingEventId(null);
  };

  const handleDeleteEvent = (index: number) => {
    const newEvents = events.filter((_, i) => i !== index);
    onChange(newEvents);
  };

  return (
    <div className="timeline-editor">
      {editingEventId !== null ? (
        <div className="timeline-edit-form">
          <div className="form-group">
            <label>时间点</label>
            <input 
              value={editForm.time} 
              onChange={e => setEditForm({...editForm, time: e.target.value})}
              placeholder="例如：公元2023年、第一章、童年"
            />
          </div>
          <div className="form-group">
            <label>事件标题</label>
            <input 
              value={editForm.event} 
              onChange={e => setEditForm({...editForm, event: e.target.value})}
              placeholder="输入事件标题"
            />
          </div>
          
          <TimelineCharacterSelector
            availableCharacters={availableCharacters.map(c => ({ id: c.id, name: c.name }))}
            selectedCharacterIds={editForm.characterIds}
            selectedCharacters={editForm.characters}
            onSelectionChange={(ids, names) => setEditForm({
              ...editForm,
              characterIds: ids,
              characters: names
            })}
          />
          
          <div className="form-group">
            <label>地点</label>
            <input 
              value={editForm.location} 
              onChange={e => setEditForm({...editForm, location: e.target.value})}
              placeholder="事件发生地点"
            />
          </div>
          
          <div className="form-group">
            <label>详细描述</label>
            <textarea 
              value={editForm.description} 
              onChange={e => setEditForm({...editForm, description: e.target.value})}
              placeholder="事件详细描述"
              rows={3}
            />
          </div>
          
          <div className="form-actions">
            <button className="btn-primary" onClick={handleSaveEvent}>保存</button>
            <button className="btn-secondary" onClick={() => setEditingEventId(null)}>取消</button>
          </div>
        </div>
      ) : (
        <div className="timeline-list">
          {events.map((event, index) => (
            <div key={index} className="timeline-item">
              <div className="timeline-time">{event.time}</div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="timeline-title">{event.event}</span>
                  <div className="timeline-actions">
                    <button className="icon-btn" onClick={() => handleEditEvent(event, index)} title="编辑">
                       <Settings size={14} />
                    </button>
                    <button className="icon-btn text-red" onClick={() => handleDeleteEvent(index)} title="删除">
                       <X size={14} />
                    </button>
                  </div>
                </div>
                {event.location && (
                  <div className="timeline-meta">
                    <MapPin size={14} /> {event.location}
                  </div>
                )}
                {event.characters && event.characters.length > 0 && (
                  <div className="timeline-meta">
                    <User size={14} /> {event.characters.join(', ')}
                  </div>
                )}
                {event.description && (
                  <div className="timeline-desc">{event.description}</div>
                )}
              </div>
            </div>
          ))}
          {/* Always allow adding events */}
          <button className="timeline-add-btn btn-secondary" onClick={handleAddEvent} style={{ width: '100%', marginTop: '12px', justifyContent: 'center' }}>
            <Plus size={16} /> 添加事件
          </button>
        </div>
      )}
    </div>
  );
}
