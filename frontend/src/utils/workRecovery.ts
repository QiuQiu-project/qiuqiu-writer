/**
 * 作品恢复工具
 * 从本地缓存恢复作品和章节到线上数据库
 */

import { localCacheManager } from './localCacheManager';
import { worksApi, type Work, type WorkCreate } from './worksApi';
import { chaptersApi, type ChapterCreate } from './chaptersApi';
import { apiClient } from './api';
import type { CachedWorkDoc, CachedChapterDoc } from '../types/document';

const STORAGE_PREFIX = 'planetwriter_cache_';

export interface RecoveryProgress {
  workId?: string;
  workTitle?: string;
  totalChapters: number;
  recoveredChapters: number;
  currentChapter?: {
    chapterId: number;
    chapterNumber: number;
    title: string;
  };
  status: 'checking' | 'recovering_work' | 'recovering_chapters' | 'completed' | 'error';
  message: string;
  error?: string;
}

/**
 * 从本地缓存获取所有作品相关的缓存键
 */
export async function getCachedWorkKeys(): Promise<string[]> {
  const keys: string[] = [];
  
  // 遍历 localStorage 查找所有作品相关的缓存
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      const cacheKey = key.replace(STORAGE_PREFIX, '');
      
      // 检查是否是作品或章节相关的缓存
      if (cacheKey.startsWith('work_') || cacheKey.includes('_chapter_')) {
        keys.push(cacheKey);
      }
    }
  }
  
  return keys;
}

/**
 * 从缓存键中提取作品ID
 */
export function extractWorkIdFromKey(key: string): string | null {
  // 格式: work_{workId}_chapter_{chapterId} 或 work_{workId}
  const match = key.match(/work_([^_]+)/);
  return match ? match[1] : null;
}

/**
 * 从缓存键中提取章节ID
 */
export function extractChapterIdFromKey(key: string): number | null {
  // 格式: work_{workId}_chapter_{chapterId}
  const match = key.match(/chapter_(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 获取本地缓存中的作品信息
 */
export async function getCachedWorkInfo(workId: string): Promise<{
  work?: CachedWorkDoc;
  chapters: Array<{
    chapterId: number;
    chapterNumber: number;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
} | null> {
  // 尝试从多个可能的缓存键获取作品信息
  // 优先使用 worksApi 缓存的作品信息（work_{workId}_info）
  const possibleKeys = [
    `work_${workId}_info`, // worksApi 缓存的作品信息（优先）
    `work_${workId}`,      // 旧格式缓存
  ];
  
  let workDoc: CachedWorkDoc | null = null;
  for (const key of possibleKeys) {
    workDoc = await localCacheManager.get<CachedWorkDoc>(key);
    if (workDoc) {
      
      break;
    }
  }
  
  // 如果直接找不到作品信息，尝试从章节缓存中推断
  if (!workDoc) {
    // 查找该作品的第一个章节，从中提取作品信息
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const cacheKey = key.replace(STORAGE_PREFIX, '');
        const chapterWorkId = extractWorkIdFromKey(cacheKey);
        if (chapterWorkId === workId) {
          const chapterDoc = await localCacheManager.get<CachedChapterDoc>(cacheKey);
          if (chapterDoc && chapterDoc.metadata) {
            // 从章节的 metadata 中提取作品信息
            workDoc = {
              title: `恢复的作品 ${workId}`,
              description: '',
              metadata: {
                work_id: workId,
                ...chapterDoc.metadata,
              },
            };
            break;
          }
        }
      }
    }
  }
  
  if (!workDoc) {
    return null;
  }
  
  // 查找所有章节缓存
  const chapters: Array<{
    chapterId: number;
    chapterNumber: number;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }> = [];
  
  // 遍历 localStorage 查找该作品的所有章节
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      const cacheKey = key.replace(STORAGE_PREFIX, '');
      const chapterWorkId = extractWorkIdFromKey(cacheKey);
      const chapterId = extractChapterIdFromKey(cacheKey);
      
      if (chapterWorkId === workId && chapterId) {
        const chapterDoc = await localCacheManager.get<CachedChapterDoc>(cacheKey);
        if (chapterDoc && chapterDoc.content) {
          const metadata = chapterDoc.metadata || {};
          chapters.push({
            chapterId,
            chapterNumber: metadata.chapter_number || 0,
            title: metadata.title || chapterDoc.title || `第${metadata.chapter_number || 0}章`,
            // 统一格式：content 必须是字符串
            content: typeof chapterDoc.content === 'string' ? chapterDoc.content : '',
            metadata,
          });
        }
      }
    }
  }
  
  // 按章节号排序
  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  
  return {
    work: workDoc,
    chapters,
  };
}

/**
 * 检查作品是否存在于线上
 * 如果不存在但存储中有内容，返回恢复信息
 */
export async function checkWorkExists(workId: string): Promise<{
  exists: boolean;
  needsRecovery?: boolean;
  recoveryInfo?: unknown;
}> {
  try {
    // 传递 check_recovery=true 参数，让后端检查存储中是否有相关文档
    const work = await worksApi.getWork(workId, false, false, true);
    
    // 检查返回的数据是否包含恢复建议
    const workWithRecovery = work as Work & {
      needs_recovery?: boolean;
      recovery_info?: unknown;
    };
    if (workWithRecovery.needs_recovery) {
      return {
        exists: false,
        needsRecovery: true,
        recoveryInfo: workWithRecovery.recovery_info,
      };
    }
    
    return { exists: true };
  } catch (error: unknown) {
    // 404 表示不存在
    const errorWithStatus = error as { status?: number; message?: string };
    if (errorWithStatus?.status === 404 || errorWithStatus?.message?.includes('404')) {
      return { exists: false };
    }
    // 其他错误也认为不存在（可能是网络问题）
    throw error;
  }
}

/**
 * 从本地缓存恢复作品和章节
 */
export async function recoverWorkFromCache(
  workId: string,
  onProgress?: (progress: RecoveryProgress) => void
): Promise<{
  success: boolean;
  workId?: string;
  workCreated: boolean;
  chaptersCreated: number;
  error?: string;
}> {
  try {
    // 1. 从本地缓存获取作品信息
    onProgress?.({
      totalChapters: 0,
      recoveredChapters: 0,
      status: 'recovering_work',
      message: '正在从本地缓存加载作品信息...',
    });
    
    const cachedData = await getCachedWorkInfo(workId);
    
    // 检查是否有作品信息或章节信息
    const hasChapters = cachedData && cachedData.chapters.length > 0;
    const hasWorkInfo = cachedData && cachedData.work;
    
    if (!hasChapters && !hasWorkInfo) {
      return {
        success: false,
        workCreated: false,
        chaptersCreated: 0,
        error: `本地缓存中未找到作品 ${workId} 的信息`,
      };
    }
    
    // 如果只有作品信息但没有章节，仍然可以恢复作品（章节可以后续添加）
    if (!hasChapters && hasWorkInfo) {
      onProgress?.({
        totalChapters: 0,
        recoveredChapters: 0,
        status: 'recovering_work',
        message: '检测到作品信息，但未找到章节内容，将仅恢复作品信息',
      });
    }
    
    // 2. 从本地缓存提取作品信息
    const workData = cachedData?.work || {};
    const workMetadata = workData.metadata || {};
    
    // 从多个来源提取作品信息，优先级：本地缓存（worksApi缓存） > 章节metadata推断 > 默认值
    // 注意：workData 可能是 worksApi 缓存的作品信息（包含完整的 Work 对象）
    const workTitle = (workData.id ? workData.title : null) // 如果是完整的 Work 对象，直接使用 title
      || workData.title 
      || workMetadata.title 
      || workData.metadata?.title 
      || `恢复的作品 ${workId}`;
    const workDescription = (workData.id ? workData.description : null) // 如果是完整的 Work 对象，直接使用 description
      || workData.description 
      || workMetadata.description 
      || workData.metadata?.description 
      || '';
    
    // 处理作品类型：前端使用 'long'/'short'，后端使用 'novel'/'short_story'
    let workType: 'long' | 'short' | 'script' | 'video' = 'long';
    const workTypeSource = workMetadata.work_type 
      || workData.metadata?.work_type
      || (workData.id ? workData.work_type : null); // 如果是完整的 Work 对象，直接使用 work_type
    if (workTypeSource) {
      // 如果是后端类型，转换为前端类型
      if (workTypeSource === 'novel') workType = 'long';
      else if (workTypeSource === 'short_story') workType = 'short';
      else if (workTypeSource === 'script') workType = 'script';
      else if (workTypeSource === 'film_script') workType = 'video';
      else if (['long', 'short', 'script', 'video'].includes(workTypeSource)) {
        workType = workTypeSource as 'long' | 'short' | 'script' | 'video';
      }
    }
    
    const workCreateData: WorkCreate = {
      title: workTitle,
      description: workDescription,
      work_type: workType,
      category: workMetadata.category 
        || workData.metadata?.category 
        || (workData.id ? workData.category : null)
        || '',
      genre: workMetadata.genre 
        || workData.metadata?.genre 
        || (workData.id ? workData.genre : null)
        || '',
      is_public: workMetadata.is_public !== undefined
        ? workMetadata.is_public
        : (workData.metadata?.is_public !== undefined
          ? workData.metadata.is_public
          : (workData.id ? workData.is_public : false)),
    };
    
    // 3. 关键修复：直接使用 POST /api/v1/works/{workId}/recover 接口恢复作品
    // 不再先检查作品是否存在，直接调用恢复接口
    onProgress?.({
      totalChapters: 0,
      recoveredChapters: 0,
      status: 'recovering_work',
      message: '正在恢复作品...',
    });
    
    let createdWork: Work;
    try {
      // 使用恢复接口，传递作品信息
      createdWork = await worksApi.recoverWork(workId, workCreateData);
    } catch (error: unknown) {
      // 如果作品已存在，返回错误
      const errorWithStatus = error as { status?: number; message?: string };
      if (errorWithStatus?.status === 400 || errorWithStatus?.message?.includes('已存在')) {
        return {
          success: false,
          workCreated: false,
          chaptersCreated: 0,
          error: `作品 ${workId} 已存在于线上，无需恢复`,
        };
      }
      return {
        success: false,
        workCreated: false,
        chaptersCreated: 0,
        error: `恢复作品失败: ${errorWithStatus?.message || String(error)}`,
      };
    }
    
    // 4. 确定要恢复的章节列表
    const chaptersToRecover = cachedData?.chapters || [];
    const totalChapters = chaptersToRecover.length;
    
    // 如果没有章节需要恢复，只恢复作品信息
    if (totalChapters === 0) {
      onProgress?.({
        workId: createdWork.id,
        workTitle: createdWork.title,
        totalChapters: 0,
        recoveredChapters: 0,
        status: 'completed',
        message: `作品已恢复，但未找到章节内容。章节内容可能需要在编辑器中手动添加或从其他来源恢复。`,
      });
      
      return {
        success: true,
        workId: createdWork.id,
        workCreated: true,
        chaptersCreated: 0,
      };
    }
    
    onProgress?.({
      workId: createdWork.id,
      workTitle: createdWork.title,
      totalChapters: totalChapters,
      recoveredChapters: 0,
      status: 'recovering_chapters',
      message: `作品已创建，正在恢复 ${totalChapters} 个章节...`,
    });
    
    // 5. 恢复章节
    let chaptersCreated = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < chaptersToRecover.length; i++) {
      const chapter = chaptersToRecover[i];
      
      onProgress?.({
        workId: createdWork.id,
        workTitle: createdWork.title,
        totalChapters: chaptersToRecover.length,
        recoveredChapters: chaptersCreated,
        currentChapter: {
          chapterId: chapter.chapterId,
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
        },
        status: 'recovering_chapters',
        message: `正在恢复章节 ${chapter.chapterNumber}: ${chapter.title}...`,
      });
      
      try {
        // 创建章节
        const volumeNumber = typeof chapter.metadata?.volume_number === 'number'
          ? chapter.metadata.volume_number
          : 1;
        const chapterCreateData: ChapterCreate = {
          work_id: createdWork.id,
          title: chapter.title,
          chapter_number: chapter.chapterNumber,
          volume_number: volumeNumber,
          content: chapter.content,
        };
        
        const createdChapter = await chaptersApi.createChapter(chapterCreateData);
        chaptersCreated++;
        
        // 同步章节内容到 ShareDB
        const documentId = `work_${createdWork.id}_chapter_${createdChapter.id}`;
        try {
          // 使用 ShareDB 同步接口
          await apiClient.syncShareDBDocument({
            doc_id: documentId,
            version: 0,
            content: chapter.content,
            create_version: true,
          });
        } catch {
          
          // 继续处理下一个章节
        }
        
      } catch (error: unknown) {
        const errorWithMessage = error as { message?: string };
        const errorMsg = `章节 ${chapter.chapterNumber} (${chapter.title}) 恢复失败: ${errorWithMessage?.message || String(error)}`;
        errors.push(errorMsg);
        
        // 继续处理下一个章节
      }
    }
    
    if (chaptersCreated === 0 && errors.length > 0) {
      return {
        success: false,
        workCreated: true,
        chaptersCreated: 0,
        error: `所有章节恢复失败: ${errors.join('; ')}`,
      };
    }
    
    onProgress?.({
      workId: createdWork.id,
      workTitle: createdWork.title,
      totalChapters: cachedData.chapters.length,
      recoveredChapters: chaptersCreated,
      status: 'completed',
      message: `恢复完成: 成功恢复 ${chaptersCreated}/${cachedData.chapters.length} 个章节`,
    });
    
    return {
      success: true,
      workId: createdWork.id,
      workCreated: true,
      chaptersCreated,
    };
    
  } catch (error: unknown) {
    const errorWithMessage = error as { message?: string };
    const errorMsg = errorWithMessage?.message || String(error);
    onProgress?.({
      totalChapters: 0,
      recoveredChapters: 0,
      status: 'error',
      message: `恢复失败: ${errorMsg}`,
      error: errorMsg,
    });
    
    return {
      success: false,
      workCreated: false,
      chaptersCreated: 0,
      error: errorMsg,
    };
  }
}

/**
 * 获取所有可恢复的作品ID列表
 */
export async function getRecoverableWorks(): Promise<Array<{
  workId: string;
  workTitle?: string;
  chapterCount: number;
  existsOnline: boolean;
  needsRecovery?: boolean;
}>> {
  const keys = await getCachedWorkKeys();
  const workIds = new Set<string>();
  
  // 提取所有作品ID
  keys.forEach(key => {
    const workId = extractWorkIdFromKey(key);
    if (workId) {
      workIds.add(workId);
    }
  });
  
  // 检查每个作品是否存在，并获取章节数量
  const results: Array<{
    workId: string;
    workTitle?: string;
    chapterCount: number;
    existsOnline: boolean;
    needsRecovery?: boolean;
  }> = [];
  
  for (const workId of workIds) {
    try {
      const cachedData = await getCachedWorkInfo(workId);
      const checkResult = await checkWorkExists(workId).catch(() => ({ exists: false }));
      const existsOnline = typeof checkResult === 'boolean' ? checkResult : checkResult.exists;
      const needsRecovery = typeof checkResult === 'object' && 'needsRecovery' in checkResult 
        ? checkResult.needsRecovery 
        : undefined;
      
      results.push({
        workId,
        workTitle: cachedData?.work?.title || cachedData?.work?.metadata?.title,
        chapterCount: cachedData?.chapters.length || 0,
        existsOnline,
        needsRecovery,
      });
    } catch {
      
      // 继续处理下一个
    }
  }
  
  return results;
}
