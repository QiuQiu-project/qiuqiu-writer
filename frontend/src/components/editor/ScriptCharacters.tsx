import { useState } from 'react';
import { Plus, Sparkles, Users } from 'lucide-react';
import CharacterRelations from './CharacterRelations';
import { cn } from '@/lib/utils';

const tabBtnClass = 'px-4 py-2 border-none text-sm font-medium cursor-pointer rounded-[var(--radius-sm)] transition-all border-b-2';
const btnSecSmClass = 'flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-[var(--radius-sm)] cursor-pointer transition-all whitespace-nowrap hover:[background:var(--bg-secondary)] hover:[border-color:var(--border-hover)]';
const btnPriSmClass = 'flex items-center gap-1.5 px-3 py-1.5 text-sm border-none rounded-[var(--radius-sm)] cursor-pointer transition-all whitespace-nowrap hover:[background:var(--accent-hover)]';

export default function ScriptCharacters() {
  const [activeTab, setActiveTab] = useState<'list' | 'relations'>('list');

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex justify-between items-center px-6 py-5 border-b max-md:flex-col max-md:items-start max-md:gap-3 max-md:px-4"
        style={{ borderColor: 'var(--border-light)' }}
      >
        <h2 className="text-xl font-bold m-0" style={{ color: 'var(--text-primary)' }}>角色</h2>
        <div className="flex gap-2 max-md:w-full max-md:overflow-x-auto max-md:pb-1">
          <button
            className={cn(tabBtnClass, 'max-md:whitespace-nowrap max-md:shrink-0', activeTab === 'list' ? 'font-semibold border-b-[var(--accent-primary)]' : 'border-b-transparent hover:[color:var(--text-primary)] hover:[background:var(--bg-secondary)]')}
            style={{ color: activeTab === 'list' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('list')}
          >
            角色列表
          </button>
          <button
            className={cn(tabBtnClass, 'max-md:whitespace-nowrap max-md:shrink-0', activeTab === 'relations' ? 'font-semibold border-b-[var(--accent-primary)]' : 'border-b-transparent hover:[color:var(--text-primary)] hover:[background:var(--bg-secondary)]')}
            style={{ color: activeTab === 'relations' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('relations')}
          >
            人物关系
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="flex-1 overflow-y-auto p-6 max-md:p-4">
          {/* 主要角色 */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4 max-md:flex-col max-md:items-start max-md:gap-3">
              <h3 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>主要角色</h3>
              <div className="flex gap-2 max-md:w-full max-md:overflow-x-auto">
                <button className={btnSecSmClass} style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>
                  <Plus size={14} />
                  <span>添加角色</span>
                </button>
                <button className={btnPriSmClass} style={{ background: 'var(--accent-primary)', color: 'var(--text-inverse)' }}>
                  <Sparkles size={14} />
                  <span>生成角色</span>
                </button>
              </div>
            </div>
            <div className="min-h-[200px]">
              <div className="flex flex-col items-center justify-center py-12 gap-4" style={{ color: 'var(--text-tertiary)' }}>
                <Users size={48} style={{ opacity: 0.5 }} />
                <p className="text-sm m-0">暂无主要角色</p>
              </div>
            </div>
          </div>

          {/* 次要角色 */}
          <div>
            <div className="flex justify-between items-center mb-4 max-md:flex-col max-md:items-start max-md:gap-3">
              <h3 className="text-base font-semibold m-0" style={{ color: 'var(--text-primary)' }}>次要角色</h3>
              <div className="flex gap-2 max-md:w-full max-md:overflow-x-auto">
                <button className={btnSecSmClass} style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>
                  <Plus size={14} />
                  <span>添加角色</span>
                </button>
                <button className={btnPriSmClass} style={{ background: 'var(--accent-primary)', color: 'var(--text-inverse)' }}>
                  <Sparkles size={14} />
                  <span>生成角色</span>
                </button>
              </div>
            </div>
            <div className="min-h-[200px]">
              <div className="flex flex-col items-center justify-center py-12 gap-4" style={{ color: 'var(--text-tertiary)' }}>
                <Users size={48} style={{ opacity: 0.5 }} />
                <p className="text-sm m-0">暂无次要角色</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'relations' && (
        <div className="flex-1 overflow-hidden">
          <CharacterRelations />
        </div>
      )}
    </div>
  );
}
