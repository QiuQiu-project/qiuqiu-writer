/**
 * 新建集时从小说章节导入
 * 流程：选择小说 → 选择单章节（单选）→ AI 转换为剧情简介
 */
import { useState, useEffect } from 'react';
import { X, BookOpen, Search, ChevronRight, Layers, Check, AlertCircle, Loader, Sparkles } from 'lucide-react';
import { worksApi, type Work } from '../../utils/worksApi';
import { chaptersApi, type Chapter } from '../../utils/chaptersApi';
import { dramaChatComplete } from '../../utils/dramaApi';
import type { DramaEpisode } from './dramaTypes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ImportEpisodeFromChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (patch: Partial<DramaEpisode>) => void;
  workId?: string | null;
  episodeNumber: number;
}

type Step = 'select' | 'preview' | 'importing';

function buildSynopsisFallback(rawContent: string, title: string): string {
  const plain = rawContent
    .replace(/\s+/g, ' ')
    .replace(/[【】[\]<>]/g, ' ')
    .trim();
  if (!plain) return `${title}：请根据原章节内容补充剧情简介。`;
  return plain.length > 220 ? `${plain.slice(0, 220)}...` : plain;
}

export default function ImportEpisodeFromChapterModal({
  isOpen,
  onClose,
  onImport,
  workId,
  episodeNumber,
}: ImportEpisodeFromChapterModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [novels, setNovels] = useState<Work[]>([]);
  const [loadingNovels, setLoadingNovels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNovel, setSelectedNovel] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [importingTitle, setImportingTitle] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStep('select');
    setSelectedNovel(null);
    setChapters([]);
    setSelectedChapterId(null);
    setError('');
    setSearchQuery('');

    setLoadingNovels(true);
    worksApi.listWorks({ work_type: 'long', size: 100 })
      .then(res => setNovels(res.works))
      .catch(() => setError('加载小说列表失败'))
      .finally(() => setLoadingNovels(false));
  }, [isOpen]);

  const handleSelectNovel = async (novel: Work) => {
    setSelectedNovel(novel);
    setStep('preview');
    setLoadingChapters(true);
    setError('');
    try {
      let allChapters: Chapter[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await chaptersApi.listChapters({
          work_id: novel.id,
          page,
          size: 100,
          sort_by: 'chapter_number',
          sort_order: 'asc',
          skipCache: true,
        });
        allChapters = [...allChapters, ...res.chapters];
        hasMore = res.chapters.length === 100;
        page++;
      }
      setChapters(allChapters);
    } catch {
      setError('加载章节失败，请重试');
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedNovel || selectedChapterId === null) return;
    const ch = chapters.find(c => c.id === selectedChapterId);
    if (!ch) return;

    setStep('importing');
    setImportingTitle(ch.title);
    setError('');

    let chapterContent = '';
    try {
      const doc = await chaptersApi.getChapterDocument(ch.id);
      if (doc.content) chapterContent = doc.content;
    } catch { /* 忽略内容拉取失败，回退到 outline */ }

    const rawContent = chapterContent || ch.content || (ch.metadata?.outline as string) || '';
    let synopsis = buildSynopsisFallback(rawContent, ch.title || `第${episodeNumber}集`);

    if (rawContent && workId) {
      const prompt = [
        `请将以下小说章节内容转换为剧本集数的剧情简介（100-200字），要求：`,
        `1. 保留核心情节和关键冲突`,
        `2. 语言简洁，适合剧本创作参考`,
        `3. 直接输出简介内容，不要标题或说明`,
        `\n章节标题：${ch.title}`,
        `\n章节内容：\n${rawContent.slice(0, 3000)}`,
      ].join('\n');

      try {
        const result = await dramaChatComplete(prompt, workId);
        if (result.trim()) synopsis = result.trim();
      } catch { /* AI 失败时保留原文 */ }
    }

    const patch: Partial<DramaEpisode> = {
      title: ch.title || `第${episodeNumber}集`,
      synopsis,
      sourceChapterId: ch.id,
      sourceChapterTitle: ch.title,
    };

    onImport(patch);
    onClose();
  };

  const filteredNovels = novels.filter(n =>
    !searchQuery || (n.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stepTitle =
    step === 'select'
      ? `新建第${episodeNumber}集 · 从小说导入`
      : step === 'preview'
      ? `选择章节 · 「${selectedNovel?.title}」`
      : 'AI 转换中...';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[560px] p-0 gap-0 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between px-5 py-4 border-b border-border shrink-0 space-y-0">
          <DialogTitle className="flex items-center gap-2.5 text-sm font-semibold">
            <BookOpen size={18} className="text-primary/70" />
            {stepTitle}
          </DialogTitle>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="shrink-0">
            <X size={16} />
          </Button>
        </DialogHeader>

        {/* Steps */}
        <div className="flex items-center px-5 py-3.5 border-b border-border shrink-0">
          <StepItem label="选择小说" number={1} status={step === 'select' ? 'active' : 'done'} />
          <div className="flex-1 h-px bg-border mx-2.5" />
          <StepItem label="选择章节" number={2} status={step === 'preview' || step === 'importing' ? 'active' : 'idle'} done={step === 'importing'} />
          <div className="flex-1 h-px bg-border mx-2.5" />
          <StepItem label="完成导入" number={3} status={step === 'importing' ? 'active' : 'idle'} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 min-h-0">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 mb-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: 选择小说 */}
          {step === 'select' && (
            <div className="space-y-3.5">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="搜索小说..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {loadingNovels ? (
                <LoadingState label="加载中..." />
              ) : filteredNovels.length === 0 ? (
                <EmptyState icon={<BookOpen size={32} />} message={searchQuery ? '没有找到匹配的小说' : '还没有小说作品'} />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredNovels.map(novel => (
                    <button
                      key={novel.id}
                      className="flex items-center gap-3 px-3.5 py-3 bg-muted/30 border border-border rounded-xl cursor-pointer transition-all text-left w-full hover:bg-muted/60 hover:border-primary/30 group"
                      onClick={() => handleSelectNovel(novel)}
                    >
                      <div className="w-10 h-[52px] rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary/60 shrink-0 overflow-hidden">
                        {novel.cover_image
                          ? <img src={novel.cover_image} alt={novel.title} className="w-full h-full object-cover" />
                          : <BookOpen size={20} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-foreground truncate mb-1">{novel.title}</span>
                        <div className="text-xs text-muted-foreground">{novel.word_count?.toLocaleString() || 0} 字</div>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/70" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: 选择章节（单选） */}
          {step === 'preview' && selectedNovel && (
            <div>
              {loadingChapters ? (
                <LoadingState label="加载章节中..." />
              ) : (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 text-sm font-semibold text-muted-foreground">
                    <Layers size={15} />
                    <span>选择一个章节作为本集内容（{chapters.length} 章）</span>
                  </div>
                  {chapters.length === 0 ? (
                    <EmptyState message="该小说暂无章节" />
                  ) : (
                    <ScrollArea className="h-60 rounded-xl border border-border bg-muted/20 p-2">
                      <div className="flex flex-col gap-0.5">
                        {chapters.map((ch, i) => (
                          <label
                            key={ch.id}
                            className={cn(
                              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-sm transition-colors',
                              selectedChapterId === ch.id
                                ? 'bg-primary/10 text-foreground'
                                : 'text-muted-foreground hover:bg-muted/50'
                            )}
                          >
                            <input
                              type="radio"
                              name="episode-chapter"
                              className="accent-primary cursor-pointer shrink-0"
                              checked={selectedChapterId === ch.id}
                              onChange={() => setSelectedChapterId(ch.id)}
                            />
                            <span className="text-xs font-semibold text-muted-foreground/60 w-5 text-right shrink-0">{i + 1}</span>
                            <span className="flex-1 truncate">{ch.title}</span>
                            {ch.metadata?.outline && (
                              <span className="text-[10px] text-emerald-500/70 shrink-0" title="有大纲">✓</span>
                            )}
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: 转换中 */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center gap-3.5 py-12">
              <Loader size={28} className="animate-spin text-primary" />
              <p className="text-sm text-foreground">AI 正在转换「{importingTitle}」</p>
              <p className="text-xs text-muted-foreground">将章节内容转为剧情简介...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && !loadingChapters && (
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-border shrink-0">
            <Button variant="outline" size="sm" onClick={() => setStep('select')}>
              返回
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmImport}
              disabled={selectedChapterId === null}
              className="gap-1.5"
            >
              <Sparkles size={14} />
              AI 转换导入
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Sub-components ─── */

function StepItem({
  label,
  number,
  status = 'idle',
  done = false,
}: {
  label: string;
  number: number;
  status?: 'active' | 'done' | 'idle';
  done?: boolean;
}) {
  const isDone = status === 'done' || done;
  return (
    <div className={cn(
      'flex items-center gap-1.5 text-xs font-medium transition-colors',
      status === 'active' ? 'text-primary' : isDone ? 'text-emerald-500' : 'text-muted-foreground'
    )}>
      <div className={cn(
        'w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold transition-all',
        status === 'active'
          ? 'bg-primary/20 border-primary/50 text-primary'
          : isDone
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
          : 'bg-muted/50 border-border'
      )}>
        {isDone ? <Check size={10} /> : number}
      </div>
      <span>{label}</span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-8 text-muted-foreground text-sm">
      <Loader size={20} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ icon, message }: { icon?: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-10 text-muted-foreground text-sm text-center">
      {icon}
      <p>{message}</p>
    </div>
  );
}
