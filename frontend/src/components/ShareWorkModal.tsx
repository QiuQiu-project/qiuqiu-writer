import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { worksApi, type WorkCollaborator } from '../utils/worksApi';
import './ShareWorkModal.css';

interface ShareWorkModalProps {
  isOpen: boolean;
  workId: string;
  workTitle: string;
  onClose: () => void;
}

const PERMISSION_OPTIONS = [
  { value: 'admin', label: '可管理', desc: '可编辑内容并管理共享设置' },
  { value: 'editor', label: '可编辑', desc: '可编辑文档内容' },
  { value: 'reader', label: '可阅读', desc: '仅可查看内容' },
];

function getPermLabel(p: string) {
  return PERMISSION_OPTIONS.find(o => o.value === p)?.label ?? p;
}

function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string; size?: number }) {
  const initial = (name || '?')[0].toUpperCase();
  const colors = ['#4e6ef2', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="swm-avatar" style={{ width: size, height: size }} />;
  }
  return (
    <div className="swm-avatar-initial" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {initial}
    </div>
  );
}

function PermSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    
    const updatePosition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        // Dropdown width is 240px (from CSS)
        // Align right edge of dropdown with right edge of button
        const left = Math.max(10, rect.right - 240); 
        const top = rect.bottom + 4;
        setCoords({ top, left });
      }
    };

    updatePosition();
    
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current?.contains(target) || 
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <div className="swm-perm-wrap">
      <button ref={btnRef} className="swm-perm-btn" onClick={() => setOpen(o => !o)}>
        {getPermLabel(value)}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && createPortal(
        <div 
          className="swm-perm-dropdown" 
          ref={dropdownRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {PERMISSION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`swm-perm-option ${value === opt.value ? 'active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <div className="swm-perm-opt-label">
                {opt.label}
                {value === opt.value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </div>
              <div className="swm-perm-opt-desc">{opt.desc}</div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function ShareWorkModal({ isOpen, workId, workTitle, onClose }: ShareWorkModalProps) {
  const [collaborators, setCollaborators] = useState<WorkCollaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [newPerm, setNewPerm] = useState('editor');
  const [adding, setAdding] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && workId) {
      fetchCollaborators();
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setCollaborators([]);
      setInputVal('');
      setErrMsg('');
    }
  }, [isOpen, workId]);

  const fetchCollaborators = async () => {
    setLoading(true);
    try {
      setCollaborators(await worksApi.getCollaborators(workId));
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleInvite = async () => {
    const val = inputVal.trim();
    if (!val) return;
    setAdding(true);
    setErrMsg('');
    try {
      await worksApi.addCollaborator(workId, val, newPerm as 'admin' | 'editor' | 'reader');
      setInputVal('');
      await fetchCollaborators();
      showToast('邀请成功');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '邀请失败');
    } finally {
      setAdding(false);
    }
  };

  const handlePermChange = async (userId: string, perm: string) => {
    try {
      await worksApi.updateCollaborator(workId, userId, { permission: perm });
      setCollaborators(prev => prev.map(c => c.user_id === userId ? { ...c, permission: perm as WorkCollaborator['permission'] } : c));
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '更新失败');
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      await worksApi.updateCollaborator(workId, userId, { permission: 'editor' });
      setCollaborators(prev => prev.map(c => c.user_id === userId ? { ...c, permission: 'editor' } : c));
      showToast('已批准申请');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await worksApi.removeCollaborator(workId, userId);
      setCollaborators(prev => prev.filter(c => c.user_id !== userId));
      showToast('已移除协作者');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '移除失败');
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/novel/editor?workId=${workId}`;
    
    // 尝试使用 navigator.clipboard (仅在安全上下文 HTTPS/localhost 可用)
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('链接已复制'))
        .catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // 避免滚动到底部
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        showToast('链接已复制');
      } else {
        showToast('复制失败，请手动复制');
      }
    } catch (err) {
      showToast('复制失败，请手动复制');
    }
  };

  const pendingCollaborators = collaborators.filter(c => c.permission === 'pending');
  const activeCollaborators = collaborators.filter(c => c.permission !== 'pending');

  if (!isOpen) return null;

  return (
    <div className="swm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="swm-dialog">
        {/* Header */}
        <div className="swm-head">
          <span className="swm-head-title">共享</span>
          <button className="swm-head-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Work name */}
        <div className="swm-work-name">
          <svg className="swm-doc-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>{workTitle}</span>
        </div>

        {/* Invite row */}
        <div className="swm-invite-row">
          <div className="swm-invite-input-wrap">
            <svg className="swm-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              ref={inputRef}
              className="swm-invite-input"
              placeholder="输入用户名或邮箱邀请协作者"
              value={inputVal}
              onChange={e => { setInputVal(e.target.value); setErrMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              disabled={adding}
            />
          </div>
          <PermSelect value={newPerm} onChange={setNewPerm} />
          <button className="swm-invite-btn" onClick={handleInvite} disabled={adding || !inputVal.trim()}>
            {adding ? '邀请中…' : '邀请'}
          </button>
        </div>

        {errMsg && <div className="swm-err">{errMsg}</div>}

        {/* Pending Requests */}
        {pendingCollaborators.length > 0 && (
          <>
            <div className="swm-section-label">待审核申请</div>
            <div className="swm-list" style={{ marginBottom: '16px' }}>
              {pendingCollaborators.map(c => {
                 const displayName = c.display_name || c.username || c.user_id;
                 return (
                   <div key={c.user_id} className="swm-collab-row">
                      <Avatar name={displayName} avatarUrl={c.avatar_url} size={32} />
                      <div className="swm-collab-info">
                        <span className="swm-collab-name">{displayName}</span>
                        {c.username && c.display_name && (
                          <span className="swm-collab-sub">@{c.username}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                         <button 
                           onClick={() => handleApprove(c.user_id)}
                           style={{
                             padding: '4px 12px',
                             background: 'var(--primary, #4e6ef2)',
                             color: '#fff',
                             border: 'none',
                             borderRadius: '4px',
                             fontSize: '12px',
                             cursor: 'pointer'
                           }}
                         >
                           批准
                         </button>
                         <button 
                           onClick={() => handleRemove(c.user_id)}
                           style={{
                             padding: '4px 12px',
                             background: 'rgba(255, 77, 79, 0.1)',
                             color: '#ff4d4f',
                             border: 'none',
                             borderRadius: '4px',
                             fontSize: '12px',
                             cursor: 'pointer'
                           }}
                         >
                           拒绝
                         </button>
                      </div>
                   </div>
                 );
              })}
            </div>
          </>
        )}

        {/* Collaborators */}
        <div className="swm-section-label">已共享</div>
        <div className="swm-list">
          {loading ? (
            <div className="swm-list-empty">加载中…</div>
          ) : activeCollaborators.length === 0 ? (
            <div className="swm-list-empty">暂无协作者</div>
          ) : (
            activeCollaborators.map(c => {
              const displayName = c.display_name || c.username || c.user_id;
              return (
                <div key={c.user_id} className="swm-collab-row">
                  <Avatar name={displayName} avatarUrl={c.avatar_url} size={32} />
                  <div className="swm-collab-info">
                    <span className="swm-collab-name">{displayName}</span>
                    {c.username && c.display_name && (
                      <span className="swm-collab-sub">@{c.username}</span>
                    )}
                  </div>
                  {c.permission === 'owner' ? (
                    <span className="swm-owner-tag">所有者</span>
                  ) : (
                    <PermSelect value={c.permission} onChange={v => handlePermChange(c.user_id, v)} />
                  )}
                  {c.permission !== 'owner' && (
                    <button className="swm-remove-btn" onClick={() => handleRemove(c.user_id)} title="移除">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Copy link */}
        <div className="swm-footer">
          <button className="swm-copy-link-btn" onClick={handleCopyLink}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            复制链接
          </button>
        </div>

        {/* Toast */}
        {toast && createPortal(
          <div className="swm-toast">{toast}</div>,
          document.body
        )}
      </div>
    </div>
  );
}
