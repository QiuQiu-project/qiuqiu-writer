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
  work_id: string;
  title: string;
  chapter_number: number;
  volume_number: number;
  volume_id?: number;
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
  work_id: string;
  title: string;
  chapter_number?: number;  // 可选，如果未提供，后端自动计算
  volume_number?: number;
  volume_id?: number;
  content?: string;
  /** 创建时一并写入的元数据（如大纲、细纲 JSON），可减少一次更新请求 */
  chapter_metadata?: Record<string, unknown>;
}

export interface ChapterUpdate {
  title?: string;
  content?: string;
  status?: string;
  word_count?: number;
  chapter_number?: number;
  volume_number?: number;
  volume_id?: number;
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
  content: string;
  chapter_info: Chapter;
  document_exists: boolean;
}

class ChaptersApiClient extends BaseApiClient {

  /**
   * 获取章节文档内容（直接从 ShareDB/MongoDB 获取）
   */
  async getChapterDocument(chapterId: number): Promise<ChapterDocumentResponse> {
    return this.get<ChapterDocumentResponse>(`/api/v1/chapters/${chapterId}/document`);
  }

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
    work_id: string;
    page?: number;
    size?: number;
    status?: string;
    include_deleted?: boolean;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    /** 为 true 时跳过缓存，直接请求服务端（如回收站列表需每次拉最新） */
    skipCache?: boolean;
  }): Promise<ChapterListResponse> {
    const cacheKey = `chapters_list_${params.work_id}_${params.page || 1}_${params.size || 100}_${params.status || ''}_${params.include_deleted || false}_${params.sort_by || 'chapter_number'}_${params.sort_order || 'asc'}`;
    const skipCache = params.skipCache === true;

    // 1. 未要求跳过缓存时，优先从本地缓存获取
    if (!skipCache) {
      const cached = await localCacheManager.get<ChapterListResponse>(cacheKey);
      if (cached) {
        console.log('✅ [ChaptersApi] 从缓存加载章节列表（本地优先）:', cacheKey);
        this.listChaptersFromServer(params, cacheKey).catch(err => {
          console.warn('⚠️ [ChaptersApi] 后台刷新章节列表失败:', err);
        });
        return cached;
      }
    }

    // 2. 从服务器获取（回收站等场景 skipCache 时不做缓存写入）
    try {
      return await this.listChaptersFromServer(params, cacheKey, skipCache);
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
      work_id: string;
      page?: number;
      size?: number;
      status?: string;
      include_deleted?: boolean;
      sort_by?: string;
      sort_order?: 'asc' | 'desc';
      skipCache?: boolean;
    },
    cacheKey: string,
    skipCache?: boolean
  ): Promise<ChapterListResponse> {
    // 从 params 中移除 skipCache，避免发送到后端
    const queryParams: Record<string, unknown> = { ...params };
    delete queryParams.skipCache;
    const response = await this.get<ChapterListResponse>('/api/v1/chapters/', queryParams);

    // 非跳过缓存时才写入（回收站列表不缓存，避免删除后仍看到旧空列表）
    if (!skipCache && response && response.chapters) {
      try {
        await localCacheManager.set(cacheKey, {
          ...response,
          cached_at: new Date().toISOString(),
        }, 1, { synced: true });
        console.log('✅ [ChaptersApi] 已缓存章节列表:', cacheKey);

        for (const chapter of response.chapters) {
          const chapterCacheKey = `chapter_info_${chapter.id}`;
          await localCacheManager.set(chapterCacheKey, {
            ...chapter,
            cached_at: new Date().toISOString(),
          }, 1, { synced: true });
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
        }, 1, { synced: true });
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
   * 删除章节（软删除，可恢复）
   */
  async deleteChapter(chapterId: number): Promise<void> {
    await this.delete(`/api/v1/chapters/${chapterId}`);
  }

  /**
   * 恢复已软删除的章节
   */
  async restoreChapter(chapterId: number): Promise<Chapter> {
    return this.post<Chapter>(`/api/v1/chapters/${chapterId}/restore`, {});
  }

  /**
   * 创建章节版本（保存为历史记录）
   */
  async createChapterVersion(
    chapterId: number,
    versionData: {
      content: string;
      change_description?: string;
    }
  ): Promise<ChapterVersion> {
    return this.post<ChapterVersion>(`/api/v1/chapters/${chapterId}/versions`, versionData);
  }

  /**
   * 获取章节版本列表
   */
  async listChapterVersions(
    chapterId: number,
    page?: number,
    size?: number,
    skipCache?: boolean
  ): Promise<{ versions: ChapterVersion[]; total: number; page: number; size: number }> {
    const cacheKey = `chapter_versions_${chapterId}_${page || 1}_${size || 20}`;
    
    // 优先从缓存获取
    if (!skipCache) {
      const cached = await localCacheManager.get<{ versions: ChapterVersion[]; total: number; page: number; size: number }>(cacheKey);
      if (cached) {
        console.log('✅ [ChaptersApi] 从缓存加载版本列表:', cacheKey);
        // 后台刷新
        this.get<{ versions: ChapterVersion[]; total: number; page: number; size: number }>(`/api/v1/chapters/${chapterId}/versions`, { page, size }).then(res => {
          localCacheManager.set(cacheKey, res, 1, { synced: true });
        }).catch(() => {});
        return cached;
      }
    }

    const response = await this.get<{ versions: ChapterVersion[]; total: number; page: number; size: number }>(`/api/v1/chapters/${chapterId}/versions`, { page, size });
    
    // 写入缓存
    if (response && response.versions) {
      await localCacheManager.set(cacheKey, response, 1, { synced: true });
    }
    
    return response;
  }

  /** Yjs 原生快照（Git 式版本）列表 */
  async listYjsSnapshots(
    chapterId: number,
    page?: number,
    size?: number,
    skipCache?: boolean
  ): Promise<{ snapshots: YjsSnapshotMeta[]; total: number; page: number; size: number }> {
    const cacheKey = `chapter_snapshots_${chapterId}_${page || 1}_${size || 20}`;
    
    // 优先从缓存获取
    if (!skipCache) {
      const cached = await localCacheManager.get<{ snapshots: YjsSnapshotMeta[]; total: number; page: number; size: number }>(cacheKey);
      if (cached) {
        console.log('✅ [ChaptersApi] 从缓存加载快照列表:', cacheKey);
        // 后台刷新
        this.get<{ snapshots: YjsSnapshotMeta[]; total: number; page: number; size: number }>(`/api/v1/chapters/${chapterId}/yjs-snapshots`, { page, size }).then(res => {
          localCacheManager.set(cacheKey, res, 1, { synced: true });
        }).catch(() => {});
        return cached;
      }
    }

    const response = await this.get<{ snapshots: YjsSnapshotMeta[]; total: number; page: number; size: number }>(`/api/v1/chapters/${chapterId}/yjs-snapshots`, { page, size });
    
    // 写入缓存
    if (response && response.snapshots) {
      await localCacheManager.set(cacheKey, response, 1, { synced: true });
    }
    
    return response;
  }

  /** 创建 Yjs 快照，snapshot 为 base64 编码的 Y.encodeStateAsUpdate 结果 */
  async createYjsSnapshot(
    chapterId: number,
    snapshotBase64: string,
    label?: string
  ): Promise<YjsSnapshotMeta> {
    return this.post(`/api/v1/chapters/${chapterId}/yjs-snapshots`, {
      snapshot: snapshotBase64,
      label: label || undefined,
    });
  }

  /**
   * 获取单个章节版本详情
   */
  async getChapterVersion(
    chapterId: number,
    versionId: number
  ): Promise<ChapterVersion> {
    const cacheKey = `chapter_version_detail_${chapterId}_${versionId}`;
    
    const cached = await localCacheManager.get<ChapterVersion>(cacheKey);
    if (cached) {
      console.log('✅ [ChaptersApi] 从缓存加载版本详情:', cacheKey);
      return cached;
    }

    const response = await this.get<ChapterVersion>(`/api/v1/chapters/${chapterId}/versions/${versionId}`);
    if (response) {
      await localCacheManager.set(cacheKey, response, 1, { synced: true });
    }
    return response;
  }

  /** 获取单个 Yjs 快照（含 snapshot base64，用于恢复） */
  async getYjsSnapshot(
    chapterId: number,
    snapshotId: number
  ): Promise<YjsSnapshotMeta & { snapshot: string }> {
    const cacheKey = `chapter_snapshot_detail_${chapterId}_${snapshotId}`;
    
    const cached = await localCacheManager.get<YjsSnapshotMeta & { snapshot: string }>(cacheKey);
    if (cached) {
      console.log('✅ [ChaptersApi] 从缓存加载快照详情:', cacheKey);
      return cached;
    }

    const response = await this.get<YjsSnapshotMeta & { snapshot: string }>(`/api/v1/chapters/${chapterId}/yjs-snapshots/${snapshotId}`);
    if (response) {
      await localCacheManager.set(cacheKey, response, 1, { synced: true });
    }
    return response;
  }
}

export interface YjsSnapshotMeta {
  id: number;
  chapter_id: number;
  label: string | null;
  created_at: string | null;
}

export const chaptersApi = new ChaptersApiClient();

