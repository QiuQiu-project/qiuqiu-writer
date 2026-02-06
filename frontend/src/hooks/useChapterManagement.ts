/**
 * Hook: 章节管理
 * 加载并维护章节列表、卷列表和 chaptersData 映射
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { chaptersApi, type Chapter } from '../utils/chaptersApi';
import { volumesApi, type Volume } from '../utils/volumesApi';
import type { ChapterFullData } from '../types/document';

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

  // 用 ref 避免闭包旧值问题
  const chaptersDataRef = useRef<Record<string, ChapterFullData>>({});
  useEffect(() => { chaptersDataRef.current = chaptersData; }, [chaptersData]);

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

  // ===== 加载章节列表 =====
  useEffect(() => {
    if (!workId) return;

    const loadChapters = async () => {
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

        // 选择章节
        if (allChapters.length > 0) {
          const urlChapterId = searchParams.get('chapterId');
          let targetChapterId: string | null = null;

          if (urlChapterId) {
            const chapterIdNum = parseInt(urlChapterId);
            if (!isNaN(chapterIdNum) && allChapters.some(c => c.id === chapterIdNum)) {
              targetChapterId = urlChapterId;
            }
          }

          if (!targetChapterId) {
            const maxChapter = allChapters.reduce((max, chapter) => {
              return (chapter.chapter_number ?? 0) > (max.chapter_number ?? 0) ? chapter : max;
            }, allChapters[0]);
            targetChapterId = String(maxChapter.id);

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

  return {
    selectedChapter,
    chaptersData,
    volumes,
    setSelectedChapter,
    setVolumes,
    updateChapterTitle,
  };
}
