import { useState, useRef } from 'react';
import DraggableResizableModal from './common/DraggableResizableModal';
import { X, Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { getSchema, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import { createWorkFromFile } from '../utils/bookAnalysisApi';
import { convertTextToHtml } from '../utils/editorHelpers';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImportWorkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (workId: string, workTitle: string) => void;
}

interface Chapter {
  id: string;
  title: string;
  content: string;
  number: number;
  volumeNumber?: number;
  originalVolumeNumber?: number;
  originalChapterNumber?: number;
}

/**
 * 将章节 HTML 内容直接写入 Yjs IndexedDB（y-indexeddb），
 * 与编辑器使用同一个存储，消除 fetchInitialContent 桥接和竞争条件。
 */
async function writeChaptersToYjsIndexedDB(
  workId: string,
  chapters: Array<{ chapterId: number; htmlContent: string }>
): Promise<void> {
  const ydoc = new Y.Doc();
  const idbProvider = new IndexeddbPersistence(`work_${workId}`, ydoc);

  // 等待加载已有数据（新作品则为空）
  await idbProvider.whenSynced;

  const extensions = [StarterKit.configure({ history: false })];
  const schema = getSchema(extensions);

  // 在单次事务中写入所有章节，减少 IndexedDB 写入次数
  ydoc.transact(() => {
    for (const { chapterId, htmlContent } of chapters) {
      // 与编辑器保持一致：field 格式为 chapter_${chapterId}
      const fragment = ydoc.getXmlFragment(`chapter_${chapterId}`);

      // 只写入空 fragment，避免覆盖已有内容
      if (fragment.length === 0 && htmlContent) {
        try {
          const json = generateJSON(htmlContent, extensions);
          prosemirrorJSONToYXmlFragment(schema, json, fragment);
        } catch {
          // 单章节失败不影响其他章节
        }
      }
    }
  });

  // 等待 IndexedDB 持久化完成
  await new Promise<void>(resolve => setTimeout(resolve, 500));

  idbProvider.destroy();
  ydoc.destroy();
}

export default function ImportWorkModal({ isOpen, onClose, onSuccess }: ImportWorkModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'splitting' | 'creating' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 读取文本文件
  const readTextFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  // 章节拆分逻辑
  const splitTextToChapters = async (content: string): Promise<Chapter[]> => {
    // 支持识别：第X章、第X卷第Y章、第X回、Chapter X 等格式
    const headingPattern = /(^\s*(?:第\s*[0-9一二三四五六七八九十百千零]+\s*[卷]\s*第\s*[0-9一二三四五六七八九十百千零]+\s*[章回节]|第\s*[0-9一二三四五六七八九十百千零]+\s*[章回节卷篇]|(?:Chapter|CHAPTER)\s*\d+|序章|楔子|尾声|后记|番外)[^\n]*\n)/gm;
    const parts = content.split(headingPattern);
    const chapters: Chapter[] = [];
    let currentVolumeNumber = 1;

    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] && parts[i + 1]) {
        const heading = parts[i].trim();
        const content = parts[i + 1].trim();

        if (content) {
          let volumeNumber = 1;
          let chapterNumber = 0;
          let originalVolumeNumber: number | undefined;
          let originalChapterNumber: number | undefined;

          // 优先匹配：第X卷第Y章 格式
          const volumeChapterMatch = heading.match(/第\s*([0-9一二三四五六七八九十百千零]+)\s*卷\s*第\s*([0-9一二三四五六七八九十百千零]+)\s*[章回节]/);
          if (volumeChapterMatch) {
            const volNumStr = volumeChapterMatch[1];
            if (/[一二三四五六七八九十百千零]/.test(volNumStr)) {
              volumeNumber = convertChineseNumberToArabic(volNumStr);
            } else {
              volumeNumber = parseInt(volNumStr, 10);
            }

            const chNumStr = volumeChapterMatch[2];
            if (/[一二三四五六七八九十百千零]/.test(chNumStr)) {
              chapterNumber = convertChineseNumberToArabic(chNumStr);
            } else {
              chapterNumber = parseInt(chNumStr, 10);
            }

            originalVolumeNumber = volumeNumber;
            originalChapterNumber = chapterNumber;
            currentVolumeNumber = volumeNumber;
          } else {
            const volumeMatch = heading.match(/第\s*([0-9一二三四五六七八九十百千零]+)\s*卷/);
            if (volumeMatch) {
              const volNumStr = volumeMatch[1];
              if (/[一二三四五六七八九十百千零]/.test(volNumStr)) {
                volumeNumber = convertChineseNumberToArabic(volNumStr);
              } else {
                volumeNumber = parseInt(volNumStr, 10);
              }
              currentVolumeNumber = volumeNumber;
              chapterNumber = 1;
            } else {
              const chapterMatch = heading.match(/第\s*([0-9一二三四五六七八九十百千零]+)\s*[章回节卷篇]|(?:Chapter|CHAPTER)\s*(\d+)/);
              if (chapterMatch) {
                const cnNum = chapterMatch[1];
                const enNum = chapterMatch[2];
                if (enNum) {
                  chapterNumber = parseInt(enNum, 10);
                } else if (cnNum) {
                  if (/[一二三四五六七八九十百千零]/.test(cnNum)) {
                    chapterNumber = convertChineseNumberToArabic(cnNum);
                  } else {
                    chapterNumber = parseInt(cnNum, 10);
                  }
                }
                volumeNumber = currentVolumeNumber;
                originalChapterNumber = chapterNumber;
              } else {
                volumeNumber = currentVolumeNumber;
                chapterNumber = 0;
              }
            }
          }

          chapters.push({
            id: `chapter-${volumeNumber}-${chapterNumber}`,
            title: heading,
            content: content,
            number: chapterNumber,
            volumeNumber: volumeNumber,
            originalVolumeNumber: originalVolumeNumber,
            originalChapterNumber: originalChapterNumber
          });
        }
      }
    }

    if (chapters.length === 0) {
      chapters.push({
        id: 'chapter-1',
        title: '全文',
        content: content,
        number: 1,
        volumeNumber: 1
      });
    }

    // 修正章节号为递增顺序
    let globalChapterNumber = 1;
    let currentVolume = 1;
    let lastChapterNumber = 0;
    let lastGlobalChapterNumber = 0;

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const origVolNum = chapter.originalVolumeNumber || chapter.volumeNumber || 1;
      let volNum = origVolNum;
      const origChNum = chapter.originalChapterNumber || chapter.number || 0;

      if (origChNum === 0 || chapter.title.match(/序章|楔子|尾声|后记|番外/)) {
        chapter.number = 0;
        continue;
      }

      if (origVolNum > currentVolume) {
        currentVolume = origVolNum;
        volNum = origVolNum;
      } else {
        volNum = currentVolume;
      }

      if (!chapter.originalVolumeNumber && origChNum < lastChapterNumber && lastChapterNumber > 0) {
        currentVolume = currentVolume + 1;
        volNum = currentVolume;
      }

      if (volNum > (chapter.originalVolumeNumber || 1) && lastGlobalChapterNumber > 0) {
        globalChapterNumber = lastGlobalChapterNumber + 1;
      } else if (origChNum === lastChapterNumber && lastChapterNumber > 0) {
        globalChapterNumber = lastGlobalChapterNumber + 1;
      } else if (origChNum < lastChapterNumber && lastChapterNumber > 0 && !chapter.originalVolumeNumber) {
        globalChapterNumber = lastGlobalChapterNumber + 1;
      } else {
        if (lastGlobalChapterNumber > 0) {
          globalChapterNumber = lastGlobalChapterNumber + 1;
        } else {
          globalChapterNumber = 1;
        }
      }

      chapter.number = globalChapterNumber;
      chapter.volumeNumber = volNum;

      lastChapterNumber = origChNum;
      lastGlobalChapterNumber = globalChapterNumber;
    }

    return chapters;
  };

  // 转换中文数字为阿拉伯数字
  const convertChineseNumberToArabic = (cnNum: string): number => {
    const cnNums: Record<string, number> = {
      '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000
    };

    let result = 0;
    let temp = 0;
    let unit = 1;

    for (let i = cnNum.length - 1; i >= 0; i--) {
      const char = cnNum[i];
      const num = cnNums[char];

      if (num === undefined) continue;

      if (num >= 10) {
        unit = num;
        if (temp === 0) temp = 1;
      } else {
        temp = num;
      }

      result += temp * unit;
      if (num < 10) {
        temp = 0;
        unit = 1;
      }
    }

    return result || 1;
  };

  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.match(/\.(txt|md)$/i)) {
        setErrorMessage('请选择 .txt 或 .md 格式的文件');
        return;
      }
      setFile(selectedFile);
      setErrorMessage('');
      setStatus('idle');
    }
  };

  // 处理导入
  const handleImport = async () => {
    if (!file) {
      setErrorMessage('请先选择文件');
      return;
    }

    try {
      setStatus('uploading');
      setProgress('正在读取文件...');
      setErrorMessage('');

      const content = await readTextFile(file);
      setProgress('正在拆分章节...');
      setStatus('splitting');

      const chapters = await splitTextToChapters(content);

      setProgress(`正在创建作品和 ${chapters.length} 个章节...`);
      setStatus('creating');

      // 将纯文本转换为 HTML，发送给后端
      const chaptersData = chapters.map(ch => ({
        chapter_number: ch.number,
        title: ch.title,
        content: convertTextToHtml(ch.content),
        volume_number: ch.volumeNumber || 1
      }));

      const result = await createWorkFromFile(file.name, chaptersData);

      // 将章节内容写入 Yjs IndexedDB（与编辑器共用同一存储），
      // 确保打开编辑器时直接从 Yjs 读取内容，无需 fetchInitialContent 回退。
      if (result.work_id && result.created_chapters?.length) {
        setProgress('正在写入本地缓存...');

        const isCountMatch = result.created_chapters.length === chaptersData.length;
        const consumedIndices = new Set<number>();
        const chaptersForYjs: Array<{ chapterId: number; htmlContent: string }> = [];

        for (let index = 0; index < result.created_chapters.length; index++) {
          const createdChapter = result.created_chapters[index];
          let matchIndex = -1;

          if (isCountMatch) {
            // 数量一致时直接按顺序索引对应，最准确
            matchIndex = index;
          } else {
            // 精确匹配：章节号 + 卷号 + 标题
            matchIndex = chaptersData.findIndex((ch, idx) =>
              !consumedIndices.has(idx) &&
              ch.chapter_number === createdChapter.chapter_number &&
              ch.volume_number === createdChapter.volume_number &&
              ch.title === createdChapter.title
            );
            // 宽松匹配：章节号 + 卷号
            if (matchIndex === -1) {
              matchIndex = chaptersData.findIndex((ch, idx) =>
                !consumedIndices.has(idx) &&
                ch.chapter_number === createdChapter.chapter_number &&
                ch.volume_number === createdChapter.volume_number
              );
            }
          }

          if (matchIndex !== -1) {
            consumedIndices.add(matchIndex);
            chaptersForYjs.push({
              chapterId: createdChapter.chapter_id,
              htmlContent: chaptersData[matchIndex].content,
            });
          }
        }

        await writeChaptersToYjsIndexedDB(result.work_id, chaptersForYjs);
      }

      setStatus('success');
      setProgress(`成功创建作品 "${result.work_title}"，共 ${result.chapters_created} 个章节`);

      setTimeout(() => {
        if (onSuccess) {
          onSuccess(result.work_id, result.work_title);
        }
        handleClose();
      }, 2000);

    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '导入失败，请重试');
    }
  };

  // 关闭弹窗
  const handleClose = () => {
    setFile(null);
    setStatus('idle');
    setProgress('');
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={handleClose}
      initialWidth={600}
      initialHeight={500}
      className="import-work-modal"
      handleClassName=".import-work-modal-header"
    >
      {/* Header */}
      <div className="import-work-modal-header flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xl font-semibold text-foreground">
          导入作品
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          aria-label="关闭"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X size={20} />
        </Button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {status === 'success' ? (
          <div className="flex flex-col items-center gap-4 px-5 py-10 text-center">
            <CheckCircle size={48} className="text-green-500" />
            <h3 className="m-0 text-xl font-semibold text-foreground">导入成功！</h3>
            <p className="m-0 text-muted-foreground">{progress}</p>
          </div>
        ) : (
          <>
            {/* File upload area */}
            <div className="min-w-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                onChange={handleFileSelect}
                className="hidden"
                id="file-input"
                disabled={status !== 'idle'}
              />
              <label
                htmlFor="file-input"
                className={cn(
                  'block min-w-0 overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30 px-5 py-10 text-center transition-all',
                  status === 'idle'
                    ? 'cursor-pointer hover:border-primary hover:bg-muted/50'
                    : 'cursor-not-allowed opacity-60'
                )}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-2 text-foreground">
                    <FileText size={32} className="text-primary" />
                    <span className="break-words">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024).toFixed(2)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Upload size={32} className="text-primary" />
                    <span className="break-words">点击选择文件或拖拽文件到此处</span>
                    <span className="text-xs text-muted-foreground">支持 .txt 和 .md 格式</span>
                  </div>
                )}
              </label>
            </div>

            {/* Progress */}
            {(status === 'uploading' || status === 'splitting' || status === 'creating') && (
              <div className="mb-5 mt-4 flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-4 text-foreground">
                <Loader2 size={20} className="animate-spin shrink-0" />
                <span>{progress}</span>
              </div>
            )}

            {/* Error */}
            {status === 'error' && errorMessage && (
              <div className="mb-5 mt-4 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-4 text-destructive">
                <AlertCircle size={20} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
        {status === 'success' ? (
          <Button onClick={handleClose}>关闭</Button>
        ) : (
          <Button
            onClick={handleImport}
            disabled={!file || status !== 'idle'}
          >
            {status === 'idle' ? '开始导入' : '导入中...'}
          </Button>
        )}
      </div>
    </DraggableResizableModal>
  );
}
