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

export interface Work {
  id: number;
  owner_id: number;
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
      [key: string]: any;
    }>;
    [key: string]: any;
  };
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
      [key: string]: any;
    }>;
    [key: string]: any;
  };
}

export interface WorkListResponse {
  works: Work[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

class WorksApiClient extends BaseApiClient {

  /**
   * 创建作品
   */
  async createWork(workData: WorkCreate): Promise<Work> {
    // 将前端类型转换为后端类型
    const backendData = {
      ...workData,
      work_type: mapWorkTypeToBackend(workData.work_type),
    };
    
    console.log('📤 [worksApi.createWork] 发送创建作品请求:', {
      endpoint: '/api/v1/works/',
      data: backendData,
    });
    
    try {
      const response = await this.post<any>('/api/v1/works/', backendData);
      
      console.log('📥 [worksApi.createWork] 收到响应:', response);
      
      if (!response || !response.id) {
        console.error('❌ [worksApi.createWork] 响应中没有作品ID:', response);
        throw new Error('创建作品失败：服务器未返回作品ID');
      }
      
      // 将后端类型转换为前端类型
      const work: Work = {
        ...response,
        work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
      };
      
      console.log('✅ [worksApi.createWork] 作品创建成功，转换后的作品:', work);
      
      return work;
    } catch (error) {
      console.error('❌ [worksApi.createWork] 请求失败:', error);
      throw error;
    }
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
    
    const response = await this.get<any>('/api/v1/works', backendParams);
    
    // 转换作品类型
    return {
      ...response,
      works: response.works?.map((work: any) => ({
        ...work,
        work_type: mapWorkTypeToFrontend(work.work_type as BackendWorkType),
      })) || [],
    };
  }

  /**
   * 获取公开作品列表
   */
  async getPublicWorks(params?: {
    page?: number;
    size?: number;
    work_type?: FrontendWorkType | string;
    category?: string;
    genre?: string;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
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
    
    const response = await this.get<any>('/api/v1/works/public', backendParams);
    
    // 转换作品类型
    return {
      ...response,
      works: response.works?.map((work: any) => ({
        ...work,
        work_type: mapWorkTypeToFrontend(work.work_type as BackendWorkType),
      })) || [],
    };
  }

  /**
   * 获取作品详情
   * 支持缓存降级：数据库查询失败时自动从缓存加载
   */
  async getWork(
    workId: number,
    include_collaborators?: boolean,
    include_chapters?: boolean,
    check_recovery?: boolean
  ): Promise<Work> {
    try {
      // 先尝试从数据库获取
      const response = await this.get<any>(`/api/v1/works/${workId}`, {
        include_collaborators,
        include_chapters,
        check_recovery,
      });
      
      // 转换作品类型
      const work: Work = {
        ...response,
        work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
      };
      
      // 缓存作品信息到本地
      if (work && work.id) {
        await this.cacheWork(work);
      }
      
      return work;
    } catch (error) {
      // 数据库查询失败，尝试从缓存加载
      console.warn('⚠️ [WorksApi] 数据库查询失败，尝试从缓存加载:', {
        workId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      const cacheKey = `work_${workId}_info`;
      const cachedWork = await localCacheManager.get<Work>(cacheKey);
      
      if (cachedWork) {
        console.log('✅ [WorksApi] 从缓存加载作品数据:', cacheKey);
        // 标记为缓存数据，以便调用方知道这是缓存数据
        return {
          ...cachedWork,
          _fromCache: true, // 标记为缓存数据
        } as Work & { _fromCache?: boolean };
      }
      
      // 缓存也没有，抛出原始错误
      console.error('❌ [WorksApi] 数据库查询失败且缓存中无数据:', workId);
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
        }, 1);
        console.log(`✅ [WorksApi] 已缓存作品信息: ${cacheKey}`);
      } catch (error) {
        console.warn(`⚠️ [WorksApi] 缓存作品信息失败: ${error}`);
      }
    }
  }

  /**
   * 更新作品
   */
  async updateWork(workId: number, updates: WorkUpdate): Promise<Work> {
    // 如果包含 work_type，需要转换为后端类型
    const backendUpdates = { ...updates };
    if (updates.work_type) {
      backendUpdates.work_type = mapWorkTypeToBackend(updates.work_type) as any;
    }
    
    const response = await this.put<any>(`/api/v1/works/${workId}`, backendUpdates);
    
    // 转换作品类型
    return {
      ...response,
      work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
    };
  }

  /**
   * 恢复作品
   * 从本地缓存或存储中恢复作品
   */
  async recoverWork(workId: number, workData?: WorkCreate): Promise<Work> {
    // 关键修复：将前端类型转换为后端类型
    const backendData = workData ? {
      ...workData,
      work_type: mapWorkTypeToBackend(workData.work_type),
    } : {};
    
    const response = await this.post<any>(
      `/api/v1/works/${workId}/recover`,
      backendData
    );
    
    // 转换作品类型
    return {
      ...response,
      work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
    };
  }

  /**
   * 删除作品
   */
  async deleteWork(workId: number): Promise<void> {
    await this.delete(`/api/v1/works/${workId}`);
  }

  /**
   * 发布作品
   */
  async publishWork(workId: number): Promise<Work> {
    const response = await this.post<Work>(`/api/v1/works/${workId}/publish`);
    return {
      ...response,
      work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
    };
  }

  /**
   * 归档作品
   */
  async archiveWork(workId: number): Promise<Work> {
    const response = await this.post<Work>(`/api/v1/works/${workId}/archive`);
    return {
      ...response,
      work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
    };
  }
}

export const worksApi = new WorksApiClient();

