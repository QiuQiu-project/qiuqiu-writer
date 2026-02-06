/**
 * Hook: 章节增删改操作
 * 处理章节的保存设置和删除
 */

import { useCallback } from 'react';
import { chaptersApi, type ChapterUpdate } from '../utils/chaptersApi';

/** 章节保存数据（与 ChapterSettingsModal 的 onSave 回调参数一致） */
export interface ChapterSaveData {
  id?: string;
  title: string;
  volumeId: string;
  volumeTitle: string;
  volume_number?: number;
  chapter_number?: number;
  characters: string[];
  locations: string[];
  outline: string;
  detailOutline: string;
}

export interface UseChapterOperationsOptions {
  workId: string | null;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
  onUpdateTrigger?: () => void;
}

export interface UseChapterOperationsReturn {
  saveChapterSettings: (data: ChapterSaveData) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
}

export function useChapterOperations(options: UseChapterOperationsOptions): UseChapterOperationsReturn {
  const { workId, onSuccess, onError, onUpdateTrigger } = options;

  /** 保存章节设置（创建或更新） */
  const saveChapterSettings = useCallback(async (data: ChapterSaveData) => {
    if (!workId) {
      onError?.('作品ID缺失');
      return;
    }

    try {
      if (data.id && !isNaN(parseInt(data.id))) {
        // ===== 编辑现有章节 =====
        const chapterId = parseInt(data.id);
        const updateData: ChapterUpdate = { title: data.title };

        if (data.chapter_number !== undefined) {
          updateData.chapter_number = data.chapter_number;
        }
        if (data.volume_number !== undefined) {
          updateData.volume_number = data.volume_number;
          const isRealVolume = data.volumeId !== 'draft' && !data.volumeId.startsWith('vol');
          updateData.volume_id = isRealVolume ? Number(data.volumeId) : undefined;
        }

        // 构造 metadata
        const metadata: Record<string, unknown> = {
          outline: data.outline || '',
          detailed_outline: data.detailOutline || '',
        };
        if ((data.characters?.length > 0) || (data.locations?.length > 0)) {
          metadata.component_data = {
            characters: data.characters || [],
            locations: data.locations || [],
          };
        }
        updateData.chapter_metadata = metadata as ChapterUpdate['chapter_metadata'];

        await chaptersApi.updateChapter(chapterId, updateData);
        onUpdateTrigger?.();
        onSuccess?.('章节已更新');
      } else {
        // ===== 创建新章节 =====
        const isRealVolume = data.volumeId !== 'draft' && !data.volumeId.startsWith('vol');
        const volNum = data.volumeId === 'draft' ? 0 : parseInt(data.volumeId.replace('vol', '')) || 0;
        const dbVolumeId = isRealVolume ? Number(data.volumeId) : undefined;

        const newChapter = await chaptersApi.createChapter({
          work_id: workId,
          title: data.title,
          volume_number: volNum > 0 ? volNum : undefined,
          volume_id: dbVolumeId,
        });

        // 如果有大纲/细纲/角色数据，立即更新
        if (data.outline || data.detailOutline || data.characters?.length || data.locations?.length) {
          const metadata: Record<string, unknown> = {
            outline: data.outline || '',
            detailed_outline: data.detailOutline || '',
          };
          if (data.characters?.length || data.locations?.length) {
            metadata.component_data = {
              characters: data.characters || [],
              locations: data.locations || [],
            };
          }
          await chaptersApi.updateChapter(newChapter.id, {
            chapter_metadata: metadata as ChapterUpdate['chapter_metadata'],
          });
        }

        onUpdateTrigger?.();
        onSuccess?.('章节已创建');
      }
    } catch (err) {
      console.error('保存章节失败:', err);
      onError?.(err instanceof Error ? err.message : '保存章节失败');
    }
  }, [workId, onSuccess, onError, onUpdateTrigger]);

  /** 删除章节 */
  const deleteChapter = useCallback(async (chapterId: string) => {
    const chapterIdNum = parseInt(chapterId);
    if (isNaN(chapterIdNum)) {
      onError?.('无效的章节ID');
      return;
    }

    try {
      await chaptersApi.deleteChapter(chapterIdNum);
      onUpdateTrigger?.();
      onSuccess?.('章节已删除');
    } catch (err) {
      console.error('删除章节失败:', err);
      onError?.(err instanceof Error ? err.message : '删除章节失败');
    }
  }, [onSuccess, onError, onUpdateTrigger]);

  return {
    saveChapterSettings,
    deleteChapter,
  };
}
