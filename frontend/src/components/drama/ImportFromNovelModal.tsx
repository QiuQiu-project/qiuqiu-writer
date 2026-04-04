/**
 * 从小说导入到剧本的弹窗
 * 流程：选择小说 → 预览角色/章节 → AI转换导入
 */
import { useState, useEffect } from 'react';
import { X, BookOpen, Search, ChevronRight, Users, Layers, Check, AlertCircle, Loader, Sparkles } from 'lucide-react';
import { worksApi, type Work } from '../../utils/worksApi';
import { chaptersApi, type Chapter } from '../../utils/chaptersApi';
import { dramaChatComplete } from '../../utils/dramaApi';
import type { DramaCharacter, DramaEpisode, DramaMeta } from './dramaTypes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

function buildSynopsisFallback(rawContent: string, title: string): string {
  const plain = rawContent
    .replace(/\s+/g, ' ')
    .replace(/[【】[\]<>]/g, ' ')
    .trim();
  if (!plain) return `${title}：请根据原章节内容补充剧情简介。`;
  return plain.length > 220 ? `${plain.slice(0, 220)}...` : plain;
}

interface ImportFromNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (patch: Partial<DramaMeta>) => void;
  workId?: string | null;
}

type Step = 'select' | 'preview' | 'importing';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ImportFromNovelModal({ isOpen, onClose, onImport, workId }: ImportFromNovelModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [novels, setNovels] = useState<Work[]>([]);
  const [loadingNovels, setLoadingNovels] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNovel, setSelectedNovel] = useState<Work | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<number>>(new Set());
  const [importCharacters, setImportCharacters] = useState(true);
  const [error, setError] = useState('');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, title: '' });

  useEffect(() => {
    if (!isOpen) return;
    setStep('select');
    setSelectedNovel(null);
    setChapters([]);
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
      setSelectedChapterIds(new Set(allChapters.map(c => c.id)));
    } catch {
      setError('加载章节失败，请重试');
    } finally {
      setLoadingChapters(false);
    }
  };

  const toggleChapter = (id: number) => {
    setSelectedChapterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllChapters = () => {
    if (selectedChapterIds.size === chapters.length) {
      setSelectedChapterIds(new Set());
    } else {
      setSelectedChapterIds(new Set(chapters.map(c => c.id)));
    }
  };

  const extractCharacters = (novel: Work): DramaCharacter[] => {
    const rawChars = novel.metadata?.characters || [];
    return (rawChars as Record<string, string>[]).map((c, i) => ({
      id: genId(),
      name: c.display_name || c.name || `角色${i + 1}`,
      role: c.role || (i === 0 ? '主角' : '配角'),
      description: c.description || '',
      appearance: c.appearance || '',
      personality: c.personality || '',
    }));
  };

  const handleConfirmImport = async () => {
    if (!selectedNovel) return;
    setStep('importing');
    setError('');

    const selectedChapters = chapters.filter(c => selectedChapterIds.has(c.id));
    setImportProgress({ current: 0, total: selectedChapters.length, title: '' });

    const contentMap = new Map<number, string>();
    await Promise.allSettled(
      selectedChapters.map(async (ch) => {
        try {
          const doc = await chaptersApi.getChapterDocument(ch.id);
          if (doc.content) contentMap.set(ch.id, doc.content);
        } catch { /* 忽略单章拉取失败 */ }
      })
    );

    const episodes: DramaEpisode[] = [];
    for (let i = 0; i < selectedChapters.length; i++) {
      const ch = selectedChapters[i];
      setImportProgress({ current: i + 1, total: selectedChapters.length, title: ch.title });

      const chapterContent = contentMap.get(ch.id) || ch.content || (ch.metadata?.outline as string) || '';
      let synopsis = buildSynopsisFallback(chapterContent, ch.title || `第${i + 1}集`);

      if (chapterContent && workId) {
        const prompt = [
          `请将以下小说章节内容转换为剧本集数的剧情简介（100-200字），要求：`,
          `1. 保留核心情节和关键冲突`,
          `2. 语言简洁，适合剧本创作参考`,
          `3. 直接输出简介内容，不要标题或说明`,
          `\n章节标题：${ch.title}`,
          `\n章节内容：\n${chapterContent.slice(0, 3000)}`,
        ].join('\n');
        try {
          const result = await dramaChatComplete(prompt, workId);
          if (result.trim()) synopsis = result.trim();
        } catch { void 0; }
      }

      episodes.push({
        id: genId(),
        number: i + 1,
        title: ch.title || `第${i + 1}集`,
        synopsis,
        script: '',
        scenes: [],
        sourceChapterId: ch.id,
        sourceChapterTitle: ch.title,
      });
    }

    const characters = importCharacters ? extractCharacters(selectedNovel) : [];
    let extractedOutline = selectedNovel.description || '';
    let extractedCharacters = characters;

    if (workId && selectedChapters.length > 0) {
      setImportProgress({ current: selectedChapters.length, total: selectedChapters.length, title: '正在提取大纲与角色...' });
      let combinedContent = '';
      for (const ch of selectedChapters) {
        if (combinedContent.length > 8000) break;
        const content = contentMap.get(ch.id) || '';
        if (content) combinedContent += `\n【${ch.title}】\n${content}\n`;
      }
      if (combinedContent) {
        const prompt = [
          `请根据以下小说内容，提取出剧本的整体大纲（约300字），以及出场的主要角色列表。`,
          `要求：严格返回 JSON 格式，不要包含任何额外的 Markdown 标记或其他文本。`,
          `JSON 格式如下：`,
          `{`,
          `  "outline": "大纲内容",`,
          `  "characters": [`,
          `    { "name": "角色名", "role": "角色身份(如男主/反派)", "description": "简短描述", "appearance": "外貌特征", "personality": "性格特点" }`,
          `  ]`,
          `}`,
          `\n小说内容：\n${combinedContent.slice(0, 8000)}`,
        ].join('\n');
        try {
          const result = await dramaChatComplete(prompt, workId, {
            systemPrompt: '你是一个专业的剧本大纲和角色提取助手。请只输出合法的JSON对象，不要任何Markdown标记。',
          });
          let jsonStr = result.trim();
          const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch?.[1]) {
            jsonStr = jsonMatch[1].trim();
          } else {
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }
          }
          const parsed = JSON.parse(jsonStr);
          if (parsed.outline) extractedOutline = parsed.outline;
          if (importCharacters && Array.isArray(parsed.characters) && parsed.characters.length > 0) {
            extractedCharacters = (parsed.characters as Record<string, string>[]).map(c => ({
              id: genId(),
              name: c.name || '未知角色',
              role: c.role || '配角',
              description: c.description || '',
              appearance: c.appearance || '',
              personality: c.personality || '',
            }));
          }
        } catch (e) {
          console.error('Failed to extract outline and characters:', e);
        }
      }
    }

    const patch: Partial<DramaMeta> = {
      episodes,
      ...(extractedCharacters.length > 0 ? { characters: extractedCharacters } : {}),
      outline: extractedOutline,
      sourceNovelId: selectedNovel.id,
      sourceNovelTitle: selectedNovel.title,
    };

    onImport(patch);
    onClose();
  };

  const filteredNovels = novels.filter(n =>
    !searchQuery || (n.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const novelCharacters = selectedNovel ? extractCharacters(selectedNovel) : [];
  const stepTitle =
    step === 'select' ? '选择小说' :
    step === 'preview' ? `导入「${selectedNovel?.title}」` :
    '导入中...';

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
          <StepItem label="预览内容" number={2} status={step === 'preview' || step === 'importing' ? 'active' : 'idle'} done={step === 'importing'} />
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
                        <div className="flex gap-1.5 text-xs text-muted-foreground">
                          <span>{novel.word_count?.toLocaleString() || 0} 字</span>
                          {novel.metadata?.characters && (
                            <span>· {(novel.metadata.characters as unknown[]).length} 个角色</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/70" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: 预览 */}
          {step === 'preview' && selectedNovel && (
            <div className="space-y-4">
              {loadingChapters ? (
                <LoadingState label="加载章节中..." />
              ) : (
                <>
                  {/* 角色导入选项 */}
                  {novelCharacters.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                          <Users size={15} />
                          <span>角色 ({novelCharacters.length})</span>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-primary cursor-pointer"
                            checked={importCharacters}
                            onChange={e => setImportCharacters(e.target.checked)}
                          />
                          <span>导入角色</span>
                        </label>
                      </div>
                      {importCharacters && (
                        <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/20 border border-border rounded-xl">
                          {novelCharacters.slice(0, 6).map(c => (
                            <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs text-muted-foreground">
                              <div className="w-4.5 h-4.5 rounded-full bg-primary/25 flex items-center justify-center text-[10px] font-bold text-primary/90">
                                {c.name.slice(0, 1)}
                              </div>
                              <span>{c.name}</span>
                              <span className="text-muted-foreground/60">{c.role}</span>
                            </div>
                          ))}
                          {novelCharacters.length > 6 && (
                            <span className="text-xs text-muted-foreground self-center px-2">+{novelCharacters.length - 6} 个</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 章节选择 */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                        <Layers size={15} />
                        <span>章节转集数</span>
                      </div>
                      <button
                        className="flex items-center gap-1.5 text-xs text-primary/80 hover:text-primary cursor-pointer bg-transparent border-none"
                        onClick={toggleAllChapters}
                      >
                        {selectedChapterIds.size === chapters.length ? '取消全选' : '全选'}
                        <span className="text-xs text-muted-foreground bg-muted/60 rounded-full px-1.5 py-0.5">
                          {selectedChapterIds.size}/{chapters.length}
                        </span>
                      </button>
                    </div>

                    <ScrollArea className="h-56 rounded-xl border border-border bg-muted/20 p-2">
                      <div className="flex flex-col gap-0.5">
                        {chapters.map((ch, i) => (
                          <label
                            key={ch.id}
                            className={cn(
                              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer text-sm transition-colors',
                              selectedChapterIds.has(ch.id)
                                ? 'bg-primary/10 text-foreground'
                                : 'text-muted-foreground hover:bg-muted/50'
                            )}
                          >
                            <input
                              type="checkbox"
                              className="accent-primary cursor-pointer shrink-0"
                              checked={selectedChapterIds.has(ch.id)}
                              onChange={() => toggleChapter(ch.id)}
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

                    {selectedChapterIds.size === 0 && (
                      <p className="text-xs text-amber-500/80 text-center mt-2">请至少选择一个章节</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: 导入中 */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center gap-3.5 py-12">
              <Loader size={28} className="animate-spin text-primary" />
              {importProgress.total > 0 ? (
                <>
                  <p className="text-sm text-foreground">AI 转换中 {importProgress.current}/{importProgress.total}</p>
                  {importProgress.title && (
                    <p className="text-xs text-muted-foreground max-w-[280px] truncate">「{importProgress.title}」</p>
                  )}
                  <div className="w-60 h-1 bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-300"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-foreground">正在准备...</p>
              )}
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
              disabled={selectedChapterIds.size === 0}
              className="gap-1.5"
            >
              <Sparkles size={14} />
              AI 转换 {selectedChapterIds.size} 集
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
