/**
 * Hook: 章节管理
 * 加载并维护章节列表、卷列表和 chaptersData 映射
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { chaptersApi, type Chapter } from '../utils/chaptersApi';
import { volumesApi, type Volume } from '../utils/volumesApi';
import type { ChapterFullData } from '../types/document';
import type { ChapterSaveData } from './useChapterOperations';

export interface VolumeData {
  id: string;
  title: string;
  volume_number?: number;
  outline?: string;
  detailOutline?: string;
  chapters: Array<{
    id: string;
    volumeId: string;
    title: string;
    chapter_number?: number;
    characters?: string[];
    locations?: string[];
    outline?: string;
    detailOutline?: string;
  }>;
}

export interface UseChapterManagementOptions {
  workId: string | null;
  updateTrigger: number;
}

export interface UseChapterManagementReturn {
  selectedChapter: string | null;
  chaptersData: Record<string, ChapterFullData>;
  volumes: VolumeData[];
  setSelectedChapter: (id: string | null) => void;
  setVolumes: React.Dispatch<React.SetStateAction<VolumeData[]>>;
  updateChapterTitle: (chapterId: string, newTitle: string) => void;
  updateChapterNumber: (chapterId: string, newChapterNumber: number) => void;
  /** 仅更新本地章节数据（不重新拉列表），用于保存章节设置后保持当前选中 */
  updateChapterLocally: (chapterId: string, data: ChapterSaveData) => void;
  /** 删除章节后立即从本地状态移除（乐观更新），避免界面仍显示已删章节 */
  removeChapterLocally: (chapterId: string) => void;
  /** 已软删除的章节列表（回收站） */
  deletedChapters: Chapter[];
  /** 加载回收站列表（status=deleted） */
  loadDeletedChapters: () => Promise<void>;
}

/** 获取卷的中文数字 */
function getVolumeNumber(num: number): string {
  const numbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) return numbers[num - 1];
  if (num <= 19) return `十${numbers[num - 11]}`;
  return `${numbers[Math.floor(num / 10) - 1]}十${numbers[(num % 10) - 1] || ''}`;
}

export function useChapterManagement(options: UseChapterManagementOptions): UseChapterManagementReturn {
  const { workId, updateTrigger } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [chaptersData, setChaptersData] = useState<Record<string, ChapterFullData>>({});
  const [volumes, setVolumes] = useState<VolumeData[]>([]);
  const [deletedChapters, setDeletedChapters] = useState<Chapter[]>([]);

  // 用 ref 避免闭包旧值问题
  const chaptersDataRef = useRef<Record<string, ChapterFullData>>({});
  useEffect(() => { chaptersDataRef.current = chaptersData; }, [chaptersData]);

  /** 保存当前选中的章节 ID，用于 refetch 后保持选中（避免保存章节设置后跳到最后一章） */
  const selectedChapterRef = useRef<string | null>(null);
  useEffect(() => {
    selectedChapterRef.current = selectedChapter;
  }, [selectedChapter]);

  /** 更新本地某章节的标题（同步 chaptersData + volumes） */
  const updateChapterTitle = (chapterId: string, newTitle: string) => {
    setChaptersData(prev => ({
      ...prev,
      [chapterId]: { ...prev[chapterId], title: newTitle },
    }));
    setVolumes(prev => prev.map(vol => ({
      ...vol,
      chapters: vol.chapters.map(chap =>
        chap.id === chapterId ? { ...chap, title: newTitle } : chap
      ),
    })));
  };

  /** 更新本地某章节的章节号（同步 chaptersData + volumes） */
  const updateChapterNumber = (chapterId: string, newChapterNumber: number) => {
    setChaptersData(prev => ({
      ...prev,
      [chapterId]: { ...prev[chapterId], chapter_number: newChapterNumber },
    }));
    setVolumes(prev => prev.map(vol => ({
      ...vol,
      chapters: vol.chapters.map(chap =>
        chap.id === chapterId ? { ...chap, chapter_number: newChapterNumber } : chap
      ),
    })));
  };

  /** 仅更新本地章节数据（不重新拉列表），用于保存章节设置后保持当前选中且不刷新列表 */
  const updateChapterLocally = useCallback((chapterId: string, data: ChapterSaveData) => {
    const idStr = String(chapterId);
    setChaptersData(prev => {
      const existing = prev[idStr];
      if (!existing) return prev;
      return {
        ...prev,
        [idStr]: {
          ...existing,
          title: data.title,
          volumeId: data.volumeId,
          volumeTitle: data.volumeTitle,
          volume_number: data.volume_number,
          chapter_number: data.chapter_number,
          characters: data.characters ?? existing.characters,
          locations: data.locations ?? existing.locations,
          outline: data.outline ?? existing.outline,
          detailOutline: data.detailOutline ?? existing.detailOutline,
        },
      };
    });
    setVolumes(prev => prev.map(vol => ({
      ...vol,
      chapters: vol.chapters.map(chap =>
        chap.id === idStr
          ? {
              ...chap,
              title: data.title,
              volumeId: data.volumeId,
              chapter_number: data.chapter_number,
              characters: data.characters ?? chap.characters,
              locations: data.locations ?? chap.locations,
              outline: data.outline ?? chap.outline,
              detailOutline: data.detailOutline ?? chap.detailOutline,
            }
          : chap
      ),
    })));
  }, []);

  /** 删除章节后立即从本地状态移除（乐观更新），并选中上一个章节 */
  const removeChapterLocally = useCallback((chapterId: string) => {
    const idStr = String(chapterId);
    let selectChapterId: string | null = null;
    setVolumes(prev => {
      const orderedIds = prev.flatMap(v => v.chapters.map(c => String(c.id)));
      const idx = orderedIds.indexOf(idStr);
      const next = prev.map(vol => ({
        ...vol,
        chapters: vol.chapters.filter(c => String(c.id) !== idStr),
      }));
      const nextOrderedIds = next.flatMap(v => v.chapters.map(c => c.id));
      selectChapterId = idx > 0 ? orderedIds[idx - 1] : (nextOrderedIds[0] ?? null);
      return next;
    });
    setChaptersData(prev => {
      const next = { ...prev };
      delete next[idStr];
      return next;
    });
    setSelectedChapter(prev => (prev === chapterId || String(prev) === idStr ? selectChapterId : prev));
    if (selectChapterId !== null) {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.set('chapterId', selectChapterId!);
        return p;
      });
    } else {
      setSearchParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('chapterId');
        return p;
      });
    }
  }, []);

  // ===== 加载章节列表 =====
  useEffect(() => {
    if (!workId) return;

    const loadChapters = async () => {
      // 使用本次 effect 触发时的选中章节（闭包），避免刷新后误跳到最后一章
      const preserveChapterId = selectedChapter;

      try {
        // 并行获取卷列表和章节列表
        const [dbVolumes, allChapters] = await Promise.all([
          volumesApi.listVolumes(workId).catch((e: unknown) => {
            console.warn('加载卷列表失败:', e);
            return [] as Volume[];
          }),
          (async () => {
            const chapters: Chapter[] = [];
            let page = 1;
            const pageSize = 100;
            let hasMore = true;
            while (hasMore) {
              const res = await chaptersApi.listChapters({
                work_id: workId,
                page,
                size: pageSize,
                sort_by: 'chapter_number',
                sort_order: 'asc',
                skipCache: true,
              });
              chapters.push(...res.chapters);
              hasMore = res.chapters.length === pageSize;
              page++;
            }
            return chapters;
          })(),
        ]);

        // 构建卷映射
        const volumesMap = new Map<string, {
          id: string;
          title: string;
          volume_number: number;
          outline: string;
          detailOutline: string;
          chapters: Chapter[];
        }>();

        dbVolumes.forEach(vol => {
          volumesMap.set(String(vol.id), {
            id: String(vol.id),
            title: vol.title,
            volume_number: vol.volume_number,
            outline: vol.outline || '',
            detailOutline: vol.detail_outline || '',
            chapters: [],
          });
        });

        // 分配章节到卷
        allChapters.forEach(chapter => {
          if (chapter.volume_id && volumesMap.has(String(chapter.volume_id))) {
            volumesMap.get(String(chapter.volume_id))!.chapters.push(chapter);
            return;
          }
          const vNum = chapter.volume_number !== undefined ? chapter.volume_number : 0;
          const existingVol = Array.from(volumesMap.values()).find(v => v.volume_number === vNum);
          if (existingVol) {
            existingVol.chapters.push(chapter);
            return;
          }
          const virtualId = `vol${vNum}`;
          if (!volumesMap.has(virtualId)) {
            volumesMap.set(virtualId, {
              id: virtualId,
              title: vNum === 0 ? '未分卷' : `第${getVolumeNumber(vNum)}卷`,
              volume_number: vNum,
              outline: '',
              detailOutline: '',
              chapters: [],
            });
          }
          volumesMap.get(virtualId)!.chapters.push(chapter);
        });

        // 排序
        const sortedVolumes = Array.from(volumesMap.values()).sort(
          (a, b) => a.volume_number - b.volume_number,
        );

        const volumesData: VolumeData[] = sortedVolumes.map(vol => ({
          ...vol,
          chapters: vol.chapters
            .sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0))
            .map(chapter => ({
              id: String(chapter.id),
              volumeId: vol.id,
              title: chapter.title,
              chapter_number: chapter.chapter_number,
              characters: (chapter.metadata as Record<string, unknown>)?.component_data
                ? ((chapter.metadata as Record<string, unknown>).component_data as Record<string, unknown>)?.characters as string[] ?? []
                : [],
              locations: (chapter.metadata as Record<string, unknown>)?.component_data
                ? ((chapter.metadata as Record<string, unknown>).component_data as Record<string, unknown>)?.locations as string[] ?? []
                : [],
              outline: (chapter.metadata?.outline as string) || '',
              detailOutline: (chapter.metadata?.detailed_outline as string) || '',
            })),
        }));

        setVolumes(volumesData);

        // 构建 chaptersData 映射
        const chaptersDataMap: Record<string, ChapterFullData> = {};
        allChapters.forEach(chapter => {
          let volId = 'vol0';
          let volTitle = '未分卷';
          if (chapter.volume_id && volumesMap.has(String(chapter.volume_id))) {
            volId = String(chapter.volume_id);
            volTitle = volumesMap.get(volId)!.title;
          } else {
            const vNum = chapter.volume_number !== undefined ? chapter.volume_number : 0;
            const existingVol = Array.from(volumesMap.values()).find(v => v.volume_number === vNum);
            if (existingVol) {
              volId = existingVol.id;
              volTitle = existingVol.title;
            } else {
              volId = `vol${vNum}`;
              volTitle = vNum === 0 ? '未分卷' : `第${getVolumeNumber(vNum)}卷`;
            }
          }
          chaptersDataMap[String(chapter.id)] = {
            id: String(chapter.id),
            volumeId: volId,
            volumeTitle: volTitle,
            title: chapter.title,
            chapter_number: chapter.chapter_number,
            characters: (chapter.metadata as Record<string, unknown>)?.component_data
              ? ((chapter.metadata as Record<string, unknown>).component_data as Record<string, unknown>)?.characters as string[] ?? []
              : [],
            locations: (chapter.metadata as Record<string, unknown>)?.component_data
              ? ((chapter.metadata as Record<string, unknown>).component_data as Record<string, unknown>)?.locations as string[] ?? []
              : [],
            outline: (chapter.metadata?.outline as string) || '',
            detailOutline: (chapter.metadata?.detailed_outline as string) || '',
          };
        });
        setChaptersData(chaptersDataMap);

        // 选择章节：优先 URL → 刷新前选中的章节（仍在列表中）→ 最后一章，避免保存后跳到最后一章
        if (allChapters.length > 0) {
          const urlChapterId = searchParams.get('chapterId');
          let targetChapterId: string | null = null;

          if (urlChapterId) {
            const chapterIdNum = parseInt(urlChapterId, 10);
            if (!isNaN(chapterIdNum) && allChapters.some(c => c.id === chapterIdNum)) {
              targetChapterId = urlChapterId;
            }
          }
          if (!targetChapterId && preserveChapterId && allChapters.some(c => String(c.id) === preserveChapterId)) {
            targetChapterId = preserveChapterId;
          }
          if (!targetChapterId) {
            const maxChapter = allChapters.reduce((max, chapter) => {
              return (chapter.chapter_number ?? 0) > (max.chapter_number ?? 0) ? chapter : max;
            }, allChapters[0]);
            targetChapterId = String(maxChapter.id);
          }

          // 选中项与 URL 不一致时同步 URL，便于下次刷新仍能选中当前章
          const currentUrlChapterId = searchParams.get('chapterId');
          if (targetChapterId && targetChapterId !== currentUrlChapterId) {
            setSearchParams(prev => {
              const newParams = new URLSearchParams(prev);
              newParams.set('chapterId', targetChapterId!);
              return newParams;
            });
          }

          setSelectedChapter(targetChapterId);
        }
      } catch (err) {
        console.error('加载章节列表失败:', err);
      }
    };

    loadChapters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, updateTrigger]);

  /** 加载已软删除的章节（回收站）：始终跳过缓存，保证删除后能看到最新列表 */
  const loadDeletedChapters = useCallback(async () => {
    if (!workId) return;
    try {
      const res = await chaptersApi.listChapters({
        work_id: workId,
        status: 'deleted',
        page: 1,
        size: 100,
        sort_by: 'updated_at',
        sort_order: 'desc',
        skipCache: true,
      });
      setDeletedChapters(res.chapters || []);
    } catch (err) {
      console.warn('加载回收站列表失败:', err);
      setDeletedChapters([]);
    }
  }, [workId]);

  return {
    selectedChapter,
    chaptersData,
    volumes,
    setSelectedChapter,
    setVolumes,
    updateChapterTitle,
    updateChapterNumber,
    updateChapterLocally,
    removeChapterLocally,
    deletedChapters,
    loadDeletedChapters,
  };
}
