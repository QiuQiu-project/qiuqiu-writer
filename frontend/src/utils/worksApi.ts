/**
 * 作品管理API客户端
 * 对接后端作品接口 /api/v1/works
 */

import { BaseApiClient } from './baseApiClient';
import { localCacheManager } from './localCacheManager';

// 前端使用的作品类型（用户友好）
export type FrontendWorkType = 'long' | 'short' | 'script' | 'video';

// 后端使用的作品类型（API规范）
export type BackendWorkType = 'novel' | 'short_story' | 'script' | 'film_script';

// 作品类型映射：前端 -> 后端
const WORK_TYPE_MAP: Record<FrontendWorkType, BackendWorkType> = {
  'long': 'novel',
  'short': 'short_story',
  'script': 'script',
  'video': 'film_script',
};

// 作品类型映射：后端 -> 前端
const REVERSE_WORK_TYPE_MAP: Record<BackendWorkType, FrontendWorkType> = {
  'novel': 'long',
  'short_story': 'short',
  'script': 'script',
  'film_script': 'video',
};

/**
 * 将前端作品类型转换为后端类型
 */
function mapWorkTypeToBackend(frontendType: FrontendWorkType): BackendWorkType {
  return WORK_TYPE_MAP[frontendType] || 'novel';
}

/**
 * 将后端作品类型转换为前端类型
 */
function mapWorkTypeToFrontend(backendType: BackendWorkType): FrontendWorkType {
  return REVERSE_WORK_TYPE_MAP[backendType] || 'long';
}

export interface WorkCollaborator {
  id: number;
  work_id: string;
  user_id: string;
  permission: 'owner' | 'admin' | 'editor' | 'reader' | 'pending';
  role?: string;
  invited_by?: string;
  joined_at: string;
  created_at: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
}

export interface Work {
  id: string;
  owner_id: string;
  title: string;
  description?: string;
  work_type: FrontendWorkType;
  status: string;
  category?: string;
  genre?: string;
  is_public: boolean;
  word_count: number;
  created_at: string;
  updated_at: string;
  cover_image?: string;
  metadata?: {
    characters?: Array<{
      name: string;
      display_name?: string;
      description?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  collaborators?: Array<{
    user_id: string;
    permission: 'owner' | 'admin' | 'editor' | 'reader' | 'pending';
    role?: string;
    joined_at?: string;
  }>;
}

export interface WorkCreate {
  title: string;
  description?: string;
  work_type: FrontendWorkType;
  category?: string;
  genre?: string;
  is_public?: boolean;
}

export interface WorkUpdate {
  title?: string;
  description?: string;
  work_type?: 'long' | 'short' | 'script' | 'video';
  category?: string;
  genre?: string;
  status?: string;
  is_public?: boolean;
  word_count?: number;
  metadata?: {
    characters?: Array<{
      name: string;
      display_name?: string;
      description?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
}

export interface WorkListResponse {
  works: Work[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

type BackendWorkResponse = Omit<Work, 'work_type'> & { work_type: BackendWorkType };

interface WorkListResponseBackend extends Omit<WorkListResponse, 'works'> {
  works: BackendWorkResponse[];
}

class WorksApiClient extends BaseApiClient {
  private mapBackendWork(response: BackendWorkResponse): Work {
    return {
      ...response,
      work_type: mapWorkTypeToFrontend(response.work_type),
    };
  }

  /**
   * 创建作品
   */
  async createWork(workData: WorkCreate): Promise<Work> {
    // 将前端类型转换为后端类型
    const backendData = {
      ...workData,
      work_type: mapWorkTypeToBackend(workData.work_type),
    };
    
    const response = await this.post<BackendWorkResponse>('/api/v1/works/', backendData);
    
    if (!response || !response.id) {
      throw new Error('创建作品失败：服务器未返回作品ID');
    }
    
    // 转换作品类型
    const work = this.mapBackendWork(response);
    
    // 更新缓存
    await this.cacheWork(work);
    
    return work;
  }

  /**
   * 获取作品列表
   */
  async listWorks(params?: {
    page?: number;
    size?: number;
    work_type?: FrontendWorkType | string;
    status?: string;
    category?: string;
    genre?: string;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    include_collaborators?: boolean;
  }): Promise<WorkListResponse> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // 如果是 work_type，需要转换为后端类型
          if (key === 'work_type' && typeof value === 'string') {
            const frontendType = value as FrontendWorkType;
            if (WORK_TYPE_MAP[frontendType]) {
              queryParams.append(key, mapWorkTypeToBackend(frontendType));
            } else {
              queryParams.append(key, String(value));
            }
          } else {
            queryParams.append(key, String(value));
          }
        }
      });
    }
    // 转换 work_type 参数
    const backendParams = params ? {
      ...params,
      work_type: params.work_type && typeof params.work_type === 'string' && WORK_TYPE_MAP[params.work_type as FrontendWorkType]
        ? mapWorkTypeToBackend(params.work_type as FrontendWorkType)
        : params.work_type
    } : undefined;
    
    const response = await this.get<WorkListResponseBackend>('/api/v1/works/', backendParams);
    
    // 转换作品类型
    return {
      ...response,
      works: response.works?.map((work) => this.mapBackendWork(work)) || [],
    };
  }

  /**
   * 获取公开作品列表
   */
  async getPublicWorks(params?: {
    page?: number;
    size?: number;
    category?: string;
    genre?: string;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<WorkListResponse> {
    return this.get<WorkListResponse>('/api/v1/works/public', params);
  }

  /**
   * 导出作品
   */
  async exportWork(workId: string, params: {
    format: 'text' | 'word';
    chapter_ids?: string[];
  }): Promise<Blob> {
    const response = await this.requestRaw(`/api/v1/works/${workId}/export`, {
      method: 'POST',
      body: JSON.stringify(params),
    });

    if (!response.ok) {
       const errorData = await response.json().catch(() => ({}));
       throw new Error(errorData.detail || '导出失败');
    }

    return await response.blob();
  }

  /**
   * 获取作品详情
   * 支持缓存降级：数据库查询失败时自动从缓存加载
   */
  async getWork(
    workId: string,
    include_collaborators?: boolean,
    include_chapters?: boolean,
    check_recovery?: boolean
  ): Promise<Work> {
    try {
      // 先尝试从数据库获取
      const response = await this.get<BackendWorkResponse>(`/api/v1/works/${workId}`, {
        include_collaborators,
        include_chapters,
        check_recovery,
      });
      
      // 转换作品类型
      const work = this.mapBackendWork(response);
      
      // 缓存作品信息到本地
      if (work && work.id) {
        await this.cacheWork(work);
      }
      
      return work;
    } catch (error) {
      // 数据库查询失败，尝试从缓存加载
            
      const cacheKey = `work_${workId}_info`;
      const cachedWork = await localCacheManager.get<Work>(cacheKey);
      
      if (cachedWork) {
        
        // 标记为缓存数据，以便调用方知道这是缓存数据
        return {
          ...cachedWork,
          _fromCache: true, // 标记为缓存数据
        } as Work & { _fromCache?: boolean };
      }
      
      // 缓存也没有，抛出原始错误
      
      throw error;
    }
  }

  /**
   * 缓存作品信息
   */
  private async cacheWork(work: Work): Promise<void> {
    if (work && work.id) {
      const cacheKey = `work_${work.id}_info`;
      try {
        await localCacheManager.set(cacheKey, {
          ...work,
          cached_at: new Date().toISOString(),
        }, 1, { synced: true });
        
      } catch {
        // Ignore cache error
      }
    }
  }

  /**
   * 更新作品
   */
  async updateWork(workId: string, updates: WorkUpdate): Promise<Work> {
    // 如果包含 work_type，需要转换为后端类型
    const { work_type, ...restUpdates } = updates;
    const backendUpdates: Omit<WorkUpdate, 'work_type'> & { work_type?: BackendWorkType } = {
      ...restUpdates,
      ...(work_type ? { work_type: mapWorkTypeToBackend(work_type) } : {}),
    };
    
    const response = await this.put<BackendWorkResponse>(`/api/v1/works/${workId}`, backendUpdates);
    
    // 转换作品类型
    const work = this.mapBackendWork(response);
    
    // 更新缓存
    await this.cacheWork(work);
    
    return work;
  }

  /**
   * 恢复作品
   * 从本地缓存或存储中恢复作品
   */
  async recoverWork(workId: string, workData?: WorkCreate): Promise<Work> {
    // 关键修复：将前端类型转换为后端类型
    const backendData = workData ? {
      ...workData,
      work_type: mapWorkTypeToBackend(workData.work_type),
    } : {};
    
    const response = await this.post<BackendWorkResponse>(
      `/api/v1/works/${workId}/recover/`,
      backendData
    );
    
    // 转换作品类型
    const work = this.mapBackendWork(response);
    
    // 更新缓存
    await this.cacheWork(work);
    
    return work;
  }

  /**
   * 删除作品
   */
  async deleteWork(workId: string): Promise<void> {
    await this.delete(`/api/v1/works/${workId}`);
  }

  /**
   * 发布作品
   */
  async publishWork(workId: string): Promise<Work> {
    const response = await this.post<BackendWorkResponse>(`/api/v1/works/${workId}/publish/`);
    const work = this.mapBackendWork(response);
    await this.cacheWork(work);
    return work;
  }

  /**
   * 归档作品
   */
  async archiveWork(workId: string): Promise<Work> {
    const response = await this.post<BackendWorkResponse>(`/api/v1/works/${workId}/archive/`);
    const work = this.mapBackendWork(response);
    await this.cacheWork(work);
    return work;
  }
  /**
   * 申请成为协作者
   */
  async applyCollaborator(workId: string): Promise<WorkCollaborator> {
    return this.post<WorkCollaborator>(`/api/v1/works/${workId}/collaborators/apply`, {});
  }

  /**
   * 获取作品协作者列表
   */
  async getCollaborators(workId: string): Promise<WorkCollaborator[]> {
    return this.get<WorkCollaborator[]>(`/api/v1/works/${workId}/collaborators`);
  }

  /**
   * 添加协作者（通过用户名或邮箱）
   */
  async addCollaborator(workId: string, usernameOrEmail: string, permission: 'admin' | 'editor' | 'reader', role?: string): Promise<WorkCollaborator> {
    return this.post<WorkCollaborator>(`/api/v1/works/${workId}/collaborators`, {
      username_or_email: usernameOrEmail,
      permission,
      role,
    });
  }

  /**
   * 更新协作者权限
   */
  async updateCollaborator(workId: string, userId: string, updates: { permission?: string; role?: string }): Promise<WorkCollaborator> {
    return this.put<WorkCollaborator>(`/api/v1/works/${workId}/collaborators/${userId}`, updates);
  }

  /**
   * 移除协作者
   */
  async removeCollaborator(workId: string, userId: string): Promise<void> {
    await this.delete(`/api/v1/works/${workId}/collaborators/${userId}`);
  }
}

export const worksApi = new WorksApiClient();
