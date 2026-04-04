import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DraggableResizableModal from './common/DraggableResizableModal';
import { worksApi, type WorkCollaborator } from '../utils/worksApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ShareWorkModalProps {
  isOpen: boolean;
  workId: string;
  workTitle: string;
  onClose: () => void;
  /** 编辑器路径，用于生成分享链接。默认 '/novel/editor' */
  editorPath?: string;
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
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}

function PermSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let dropdownHeight = 0;
        if (dropdownRef.current) {
          dropdownHeight = dropdownRef.current.offsetHeight;
        }

        let left = rect.right - 240;
        if (left < 10) {
          left = Math.max(10, rect.left);
        }
        if (left + 240 > viewportWidth - 10) {
          left = viewportWidth - 250;
        }

        let top = rect.bottom + 4;
        const spaceBelow = viewportHeight - rect.bottom;
        if (spaceBelow < (dropdownHeight || 200) + 10 && rect.top > (dropdownHeight || 200) + 10) {
          top = rect.top - (dropdownHeight || 200) - 4;
        }

        setCoords({ top, left });
      }
    };

    updatePosition();

    const rafId = requestAnimationFrame(updatePosition);

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
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        className="flex h-[34px] cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-border bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted/50 hover:text-foreground font-[inherit]"
        onClick={() => setOpen(o => !o)}
      >
        {getPermLabel(value)}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M1.5 3.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div
          className="fixed z-[10300] w-60 rounded-xl border border-border bg-popover p-1 shadow-xl"
          ref={dropdownRef}
          style={{ top: coords.top, left: coords.left }}
        >
          {PERMISSION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={cn(
                'block w-full rounded-md px-3 py-2.5 text-left font-[inherit] transition-colors hover:bg-muted/60',
                value === opt.value && 'bg-primary/10'
              )}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <div className={cn(
                'flex items-center justify-between text-[13px] font-medium',
                value === opt.value ? 'text-primary' : 'text-foreground'
              )}>
                {opt.label}
                {value === opt.value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function ShareWorkModal({ isOpen, workId, workTitle, onClose, editorPath = '/novel/editor' }: ShareWorkModalProps) {
  const [collaborators, setCollaborators] = useState<WorkCollaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [newPerm, setNewPerm] = useState('editor');
  const [adding, setAdding] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [toast, setToast] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchCollaborators = useCallback(async () => {
    setLoading(true);
    try {
      setCollaborators(await worksApi.getCollaborators(workId));
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    if (isOpen && workId) {
      fetchCollaborators();
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setCollaborators([]);
      setInputVal('');
      setErrMsg('');
    }
  }, [isOpen, workId, fetchCollaborators]);

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
    const url = `${window.location.origin}${editorPath}?workId=${workId}`;

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
    } catch {
      showToast('复制失败，请手动复制');
    }
  };

  const pendingCollaborators = collaborators.filter(c => c.permission === 'pending');
  const activeCollaborators = collaborators.filter(c => c.permission !== 'pending');

  if (!isOpen) return null;

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={onClose}
      initialWidth={600}
      initialHeight={600}
      className="swm-dialog"
      handleClassName=".swm-head"
    >
      {/* Header */}
      <div className="swm-head flex items-center justify-between px-5 pt-4">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">共享</span>
        <button
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          onClick={onClose}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Work name */}
      <div className="flex items-center gap-1.5 overflow-hidden border-b border-border px-5 pb-3.5 pt-1.5 text-xs text-muted-foreground">
        <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{workTitle}</span>
      </div>

      {/* Invite row */}
      <div className="flex items-center gap-2 px-5 py-3.5 flex-wrap sm:flex-nowrap">
        <div className="relative min-w-0 flex-1 sm:min-w-0 w-full sm:w-auto">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            ref={inputRef}
            className="h-[34px] pl-8 text-[13px]"
            placeholder="输入用户名或邮箱邀请协作者"
            value={inputVal}
            onChange={e => { setInputVal(e.target.value); setErrMsg(''); }}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            disabled={adding}
          />
        </div>
        <PermSelect value={newPerm} onChange={setNewPerm} />
        <Button
          className="h-[34px] shrink-0 px-4 text-[13px]"
          onClick={handleInvite}
          disabled={adding || !inputVal.trim()}
        >
          {adding ? '邀请中…' : '邀请'}
        </Button>
      </div>

      {/* Error */}
      {errMsg && (
        <div className="mx-5 mb-2 rounded-md border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 text-xs text-red-300">
          {errMsg}
        </div>
      )}

      {/* Pending Requests */}
      {pendingCollaborators.length > 0 && (
        <>
          <div className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            待审核申请
          </div>
          <div className="mb-4 max-h-[400px] overflow-y-auto px-3">
            {pendingCollaborators.map(c => {
              const displayName = c.display_name || c.username || c.user_id;
              return (
                <div key={c.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                  <Avatar name={displayName} avatarUrl={c.avatar_url} size={32} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-foreground">
                      {displayName}
                    </span>
                    {c.username && c.display_name && (
                      <span className="text-[11px] text-muted-foreground">@{c.username}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(c.user_id)}
                      className="cursor-pointer rounded border-none bg-primary px-3 py-1 text-xs text-white transition-opacity hover:opacity-80"
                    >
                      批准
                    </button>
                    <button
                      onClick={() => handleRemove(c.user_id)}
                      className="cursor-pointer rounded border-none bg-destructive/10 px-3 py-1 text-xs text-destructive transition-opacity hover:opacity-80"
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
      <div className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        已共享
      </div>
      <div className="max-h-[400px] overflow-y-auto px-3">
        {loading ? (
          <div className="py-5 text-center text-[13px] text-muted-foreground">加载中…</div>
        ) : activeCollaborators.length === 0 ? (
          <div className="py-5 text-center text-[13px] text-muted-foreground">暂无协作者</div>
        ) : (
          activeCollaborators.map(c => {
            const displayName = c.display_name || c.username || c.user_id;
            return (
              <div key={c.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                <Avatar name={displayName} avatarUrl={c.avatar_url} size={32} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-foreground">
                    {displayName}
                  </span>
                  {c.username && c.display_name && (
                    <span className="text-[11px] text-muted-foreground">@{c.username}</span>
                  )}
                </div>
                {c.permission === 'owner' ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    所有者
                  </span>
                ) : (
                  <PermSelect value={c.permission} onChange={v => handlePermChange(c.user_id, v)} />
                )}
                {c.permission !== 'owner' && (
                  <button
                    className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-red-300"
                    onClick={() => handleRemove(c.user_id)}
                    title="移除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Copy link footer */}
      <div className="mt-2 border-t border-border px-5 pb-4 pt-2.5">
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 py-1.5 text-[13px] font-medium text-muted-foreground font-[inherit] transition-colors hover:bg-muted/40 hover:text-foreground"
          onClick={handleCopyLink}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          复制链接
        </button>
      </div>

      {/* Toast */}
      {toast && createPortal(
        <div className="pointer-events-none fixed left-1/2 top-10 z-[99999] flex -translate-x-1/2 items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-5 py-2.5 text-sm text-white shadow-lg backdrop-blur-md">
          {toast}
        </div>,
        document.body
      )}
    </DraggableResizableModal>
  );
}
