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
  /** 列表刷新（会重新拉取章节列表） */
  onUpdateTrigger?: () => void;
  /** 仅编辑保存时调用，不触发列表刷新，用于只更新本地数据避免跳章 */
  onSuccessEdit?: (data: ChapterSaveData) => void;
}

export interface UseChapterOperationsReturn {
  saveChapterSettings: (data: ChapterSaveData) => Promise<void>;
  deleteChapter: (chapterId: string, options?: { skipRefresh?: boolean }) => Promise<void>;
  restoreChapter: (chapterId: string) => Promise<void>;
}

export function useChapterOperations(options: UseChapterOperationsOptions): UseChapterOperationsReturn {
  const { workId, onSuccess, onError, onUpdateTrigger, onSuccessEdit } = options;

  /** 保存章节设置（创建或更新）。大纲/细纲按表单原有格式（字符串）写入。 */
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
        if (onSuccessEdit) {
          onSuccessEdit(data);
        } else {
          onUpdateTrigger?.();
        }
        onSuccess?.('章节已更新');
      } else {
        // ===== 创建新章节 =====
        const isRealVolume = data.volumeId !== 'draft' && !data.volumeId.startsWith('vol');
        const volNum = data.volumeId === 'draft' ? 0 : parseInt(data.volumeId.replace('vol', '')) || 0;
        const dbVolumeId = isRealVolume ? Number(data.volumeId) : undefined;

        const hasFormData = data.outline || data.detailOutline || data.characters?.length || data.locations?.length;
        const metadata: Record<string, unknown> = {
          outline: data.outline || '',
          detailed_outline: data.detailOutline || '',
        };
        if (data.characters?.length || data.locations?.length) {
          metadata.component_data = { characters: data.characters || [], locations: data.locations || [] };
        }
        const createPayload: Parameters<typeof chaptersApi.createChapter>[0] = {
          work_id: workId,
          title: data.title,
          chapter_number: data.chapter_number,
          volume_number: volNum >= 0 ? volNum : undefined,
          volume_id: dbVolumeId,
        };
        if (hasFormData) {
          createPayload.chapter_metadata = metadata;
        }

        const newChapter = await chaptersApi.createChapter(createPayload);

        if (newChapter && !createPayload.chapter_metadata && (data.outline || data.detailOutline || data.characters?.length || data.locations?.length)) {
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
  }, [workId, onSuccess, onError, onUpdateTrigger, onSuccessEdit]);

  /** 删除章节；skipRefresh 为 true 时不触发 refetch，由调用方用乐观更新保持 UI */
  const deleteChapter = useCallback(async (chapterId: string, options?: { skipRefresh?: boolean }) => {
    const chapterIdNum = parseInt(chapterId);
    if (isNaN(chapterIdNum)) {
      onError?.('无效的章节ID');
      return;
    }

    try {
      await chaptersApi.deleteChapter(chapterIdNum);
      if (!options?.skipRefresh) {
        onUpdateTrigger?.();
      }
      onSuccess?.('章节已删除');
    } catch (err) {
      console.error('删除章节失败:', err);
      onError?.(err instanceof Error ? err.message : '删除章节失败');
    }
  }, [onSuccess, onError, onUpdateTrigger]);

  /** 恢复已软删除的章节 */
  const restoreChapter = useCallback(async (chapterId: string) => {
    const chapterIdNum = parseInt(chapterId);
    if (isNaN(chapterIdNum)) {
      onError?.('无效的章节ID');
      return;
    }
    try {
      await chaptersApi.restoreChapter(chapterIdNum);
      onUpdateTrigger?.();
      onSuccess?.('章节已恢复');
    } catch (err) {
      console.error('恢复章节失败:', err);
      onError?.(err instanceof Error ? err.message : '恢复章节失败');
    }
  }, [onSuccess, onError, onUpdateTrigger]);

  return {
    saveChapterSettings,
    deleteChapter,
    restoreChapter,
  };
}
