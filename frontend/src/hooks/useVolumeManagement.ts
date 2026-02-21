/**
 * Hook: 卷管理
 * 处理卷的创建、编辑、删除和弹窗状态
 */

import { useState, useCallback } from 'react';
import { volumesApi } from '../utils/volumesApi';
import { chaptersApi } from '../utils/chaptersApi';
import type { VolumeData } from './useChapterManagement';

export interface UseVolumeManagementOptions {
  workId: string | null;
  volumes: VolumeData[];
  setVolumes: React.Dispatch<React.SetStateAction<VolumeData[]>>;
  onError?: (msg: string) => void;
}

export interface UseVolumeManagementReturn {
  isVolumePopupOpen: boolean;
  currentEditingVolume: VolumeData | null;
  isCreatingNewVolume: boolean;
  editingVolumeTitle: string;
  editingVolumeOutline: string;
  editingVolumeDetailOutline: string;
  openNewVolumePopup: () => void;
  openEditVolumePopup: (volume: VolumeData) => void;
  closeVolumePopup: () => void;
  handleSaveVolume: (title: string, volumeId?: string, outline?: string, detailOutline?: string) => Promise<void>;
  handleDeleteVolume: (volumeId: string) => Promise<void>;
}

export function useVolumeManagement(options: UseVolumeManagementOptions): UseVolumeManagementReturn {
  const { workId, volumes, setVolumes, onError } = options;

  const [isVolumePopupOpen, setIsVolumePopupOpen] = useState(false);
  const [currentEditingVolume, setCurrentEditingVolume] = useState<VolumeData | null>(null);
  const [isCreatingNewVolume, setIsCreatingNewVolume] = useState(false);
  const [editingVolumeTitle, setEditingVolumeTitle] = useState('');
  const [editingVolumeOutline, setEditingVolumeOutline] = useState('');
  const [editingVolumeDetailOutline, setEditingVolumeDetailOutline] = useState('');

  const openNewVolumePopup = useCallback(() => {
    setCurrentEditingVolume(null);
    setIsCreatingNewVolume(true);
    setEditingVolumeTitle('');
    setEditingVolumeOutline('');
    setEditingVolumeDetailOutline('');
    setIsVolumePopupOpen(true);
  }, []);

  const openEditVolumePopup = useCallback((volume: VolumeData) => {
    setCurrentEditingVolume(volume);
    setIsCreatingNewVolume(false);
    setEditingVolumeTitle(volume.title);
    setEditingVolumeOutline(volume.outline || '');
    setEditingVolumeDetailOutline(volume.detailOutline || '');
    setIsVolumePopupOpen(true);
  }, []);

  const closeVolumePopup = useCallback(() => {
    setIsVolumePopupOpen(false);
    setCurrentEditingVolume(null);
  }, []);

  /** 保存卷（创建或更新） */
  const handleSaveVolume = useCallback(async (
    title: string,
    volumeId?: string,
    outline?: string,
    detailOutline?: string,
  ) => {
    if (!workId) return;

    try {
      const isVirtual = volumeId?.startsWith('vol') && isNaN(Number(volumeId));

      if (volumeId && !isVirtual) {
        // 更新真实卷
        await volumesApi.updateVolume(parseInt(volumeId), {
          title,
          outline,
          detail_outline: detailOutline,
        });
      } else {
        // 创建新卷（或迁移虚拟卷）
        let volumeNumber = 1;
        if (isVirtual && volumeId) {
          const num = parseInt(volumeId.replace('vol', ''));
          if (!isNaN(num)) volumeNumber = num;
        } else {
          const maxVolNum = volumes.reduce((max, vol) => {
            return Math.max(max, vol.volume_number || 0);
          }, 0);
          volumeNumber = maxVolNum + 1;
        }

        const savedVolume = await volumesApi.createVolume(workId, {
          title,
          volume_number: volumeNumber,
          outline,
          detail_outline: detailOutline,
        });

        // 迁移虚拟卷下的章节
        if (isVirtual) {
          const virtualVol = volumes.find(v => v.id === volumeId);
          if (virtualVol && virtualVol.chapters.length > 0) {
            await Promise.all(
              virtualVol.chapters.map(chap =>
                chaptersApi.updateChapter(parseInt(chap.id), { volume_id: savedVolume.id })
              ),
            );
          }
        }
      }

      // 更新本地卷数据
      setVolumes(prev => {
        if (volumeId && !isVirtual) {
          return prev.map(vol =>
            vol.id === volumeId
              ? { ...vol, title, outline: outline || '', detailOutline: detailOutline || '' }
              : vol,
          );
        }
        // 对于新建卷，触发外部 updateTrigger 重新加载即可
        return prev;
      });

      closeVolumePopup();
    } catch {
      
      onError?.('保存卷信息失败');
    }
  }, [workId, volumes, setVolumes, closeVolumePopup, onError]);

  /** 删除卷 */
  const handleDeleteVolume = useCallback(async (volumeId: string) => {
    try {
      const isVirtual = volumeId.startsWith('vol') && isNaN(Number(volumeId));

      if (!isVirtual) {
        await volumesApi.deleteVolume(parseInt(volumeId));
      } else {
        // 虚拟卷：将其下章节移至未分卷
        const virtualVol = volumes.find(v => v.id === volumeId);
        if (virtualVol) {
          await Promise.all(
            virtualVol.chapters.map(chap =>
              chaptersApi.updateChapter(parseInt(chap.id), { volume_number: 0 })
            ),
          );
        }
      }

      // 从本地移除
      setVolumes(prev => prev.filter(v => v.id !== volumeId));
      closeVolumePopup();
    } catch {
      
      onError?.('删除卷失败');
    }
  }, [volumes, setVolumes, closeVolumePopup, onError]);

  return {
    isVolumePopupOpen,
    currentEditingVolume,
    isCreatingNewVolume,
    editingVolumeTitle,
    editingVolumeOutline,
    editingVolumeDetailOutline,
    openNewVolumePopup,
    openEditVolumePopup,
    closeVolumePopup,
    handleSaveVolume,
    handleDeleteVolume,
  };
}
