/**
 * 章节管理API客户端
 * 对接后端章节接口 /api/v1/chapters
 * 采用本地优先（离线优先）策略：优先使用缓存，后台刷新
 */

import { BaseApiClient } from './baseApiClient';
import { localCacheManager } from './localCacheManager';


export interface Chapter {
  outline: Record<string, unknown>;
  detailed_outline: Record<string, unknown>;
  id: number;
  work_id: number;
  title: string;
  chapter_number: number;
  volume_number: number;
  status: string;
  word_count: number;
  content?: string;
  metadata?: {
    outline?: string;
    detailed_outline?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface ChapterCreate {
  work_id: number;
  title: string;
  chapter_number?: number;  // 可选，如果未提供，后端自动计算
  volume_number?: number;
  content?: string;
}

export interface ChapterUpdate {
  title?: string;
  content?: string;
  status?: string;
  word_count?: number;
  chapter_number?: number;
  volume_number?: number;
  chapter_metadata?: {
    outline?: string;
    detailed_outline?: string;
    [key: string]: unknown;
  };
}


export interface ChapterListResponse {
  chapters: Chapter[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface ChapterVersion {
  id: number;
  chapter_id: number;
  version_number: number;
  title: string;
  content: string;
  change_description?: string;
  created_at: string;
}

export interface ChapterDocumentResponse {
  document_id: string;
  content: unknown;
  chapter_info: Chapter;
  document_exists?: boolean;
}

class ChaptersApiClient extends BaseApiClient {

  /**
   * 创建章节
   */
  async createChapter(chapterData: ChapterCreate): Promise<Chapter> {
    return this.post<Chapter>('/api/v1/chapters/', chapterData);
  }

  /**
   * 获取章节列表
   * 本地优先策略：优先使用缓存，后台刷新
   */
  async listChapters(params: {
    work_id: number;
    page?: number;
    size?: number;
    status?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<ChapterListResponse> {
    const cacheKey = `chapters_list_${params.work_id}_${params.page || 1}_${params.size || 100}_${params.sort_by || 'chapter_number'}_${params.sort_order || 'asc'}`;
    
    // 1. 优先从本地缓存获取（立即响应）
    const cached = await localCacheManager.get<ChapterListResponse>(cacheKey);
    if (cached) {
      console.log('✅ [ChaptersApi] 从缓存加载章节列表（本地优先）:', cacheKey);
      // 后台异步刷新（不阻塞用户）
      this.listChaptersFromServer(params, cacheKey).catch(err => {
        console.warn('⚠️ [ChaptersApi] 后台刷新章节列表失败:', err);
      });
      return cached;
    }
    
    // 2. 缓存没有，从服务器获取
    try {
      return await this.listChaptersFromServer(params, cacheKey);
    } catch (error) {
      // 服务器请求失败，尝试从缓存加载（降级）
      console.warn('⚠️ [ChaptersApi] 服务器请求失败，尝试从缓存加载:', {
        workId: params.work_id,
        error: error instanceof Error ? error.message : String(error),
      });
      
      const fallbackCache = await localCacheManager.get<ChapterListResponse>(cacheKey);
      if (fallbackCache) {
        console.log('✅ [ChaptersApi] 从缓存加载章节列表（降级）:', cacheKey);
        return {
          ...fallbackCache,
          _fromCache: true, // 标记为缓存数据
        } as ChapterListResponse & { _fromCache?: boolean };
      }
      
      // 缓存也没有，抛出原始错误
      throw error;
    }
  }

  /**
   * 从服务器获取章节列表并缓存
   */
  private async listChaptersFromServer(
    params: {
      work_id: number;
      page?: number;
      size?: number;
      status?: string;
      sort_by?: string;
      sort_order?: 'asc' | 'desc';
    },
    cacheKey: string
  ): Promise<ChapterListResponse> {
    const response = await this.get<ChapterListResponse>('/api/v1/chapters/', params);
    
    // 缓存响应数据
    if (response && response.chapters) {
      try {
        await localCacheManager.set(cacheKey, {
          ...response,
          cached_at: new Date().toISOString(),
        }, 1);
        console.log('✅ [ChaptersApi] 已缓存章节列表:', cacheKey);
        
        // 同时缓存每个章节的详情（用于快速访问）
        for (const chapter of response.chapters) {
          const chapterCacheKey = `chapter_info_${chapter.id}`;
          await localCacheManager.set(chapterCacheKey, {
            ...chapter,
            cached_at: new Date().toISOString(),
          }, 1);
        }
        console.log(`✅ [ChaptersApi] 已缓存 ${response.chapters.length} 个章节详情`);
      } catch (error) {
        console.warn('⚠️ [ChaptersApi] 缓存章节列表失败:', error);
      }
    }
    
    return response;
  }

  /**
   * 获取章节详情
   * 本地优先策略：优先使用缓存，后台刷新
   */
  async getChapter(
    chapterId: number,
    include_versions?: boolean
  ): Promise<Chapter> {
    const cacheKey = `chapter_info_${chapterId}`;
    
    // 1. 优先从本地缓存获取（立即响应）
    const cached = await localCacheManager.get<Chapter>(cacheKey);
    if (cached) {
      console.log('✅ [ChaptersApi] 从缓存加载章节详情（本地优先）:', cacheKey);
      // 后台异步刷新（不阻塞用户）
      this.getChapterFromServer(chapterId, include_versions, cacheKey).catch(err => {
        console.warn('⚠️ [ChaptersApi] 后台刷新章节详情失败:', err);
      });
      return cached;
    }
    
    // 2. 缓存没有，从服务器获取
    try {
      return await this.getChapterFromServer(chapterId, include_versions, cacheKey);
    } catch (error) {
      // 服务器请求失败，尝试从缓存加载（降级）
      console.warn('⚠️ [ChaptersApi] 服务器请求失败，尝试从缓存加载:', {
        chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      const fallbackCache = await localCacheManager.get<Chapter>(cacheKey);
      if (fallbackCache) {
        console.log('✅ [ChaptersApi] 从缓存加载章节详情（降级）:', cacheKey);
        return {
          ...fallbackCache,
          _fromCache: true, // 标记为缓存数据
        } as Chapter & { _fromCache?: boolean };
      }
      
      // 缓存也没有，抛出原始错误
      throw error;
    }
  }

  /**
   * 从服务器获取章节详情并缓存
   */
  private async getChapterFromServer(
    chapterId: number,
    include_versions?: boolean,
    cacheKey?: string
  ): Promise<Chapter> {
    const response = await this.get<Chapter>(`/api/v1/chapters/${chapterId}`, {
      include_versions,
    });
    
    // 缓存响应数据
    if (response && response.id) {
      const key = cacheKey || `chapter_info_${chapterId}`;
      try {
        await localCacheManager.set(key, {
          ...response,
          cached_at: new Date().toISOString(),
        }, 1);
        console.log('✅ [ChaptersApi] 已缓存章节详情:', key);
      } catch (error) {
        console.warn('⚠️ [ChaptersApi] 缓存章节详情失败:', error);
      }
    }
    
    return response;
  }

  /**
   * 更新章节
   */
  async updateChapter(
    chapterId: number,
    updates: ChapterUpdate
  ): Promise<Chapter> {
    return this.put<Chapter>(`/api/v1/chapters/${chapterId}`, updates);
  }

  /**
   * 删除章节
   */
  async deleteChapter(chapterId: number): Promise<void> {
    await this.delete(`/api/v1/chapters/${chapterId}`);
  }

  /**
   * 获取章节版本历史
   */
  async getChapterVersions(
    chapterId: number,
    page?: number,
    size?: number
  ): Promise<ChapterVersion[]> {
    return this.get<ChapterVersion[]>(
      `/api/v1/chapters/${chapterId}/versions`,
      { page, size }
    );
  }

  /**
   * 创建章节版本快照
   */
  async createChapterVersion(
    chapterId: number,
    changeDescription?: string
  ): Promise<ChapterVersion> {
    return this.post<ChapterVersion>(
      `/api/v1/chapters/${chapterId}/versions`,
      { change_description: changeDescription }
    );
  }

  /**
   * 获取章节ShareDB文档内容
   */
  async getChapterDocument(chapterId: number): Promise<ChapterDocumentResponse> {
    return this.get(`/api/v1/chapters/${chapterId}/document`);
  }
}

export const chaptersApi = new ChaptersApiClient();

