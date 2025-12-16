/**
 * 作品管理API客户端
 * 对接后端作品接口 /api/v1/works
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

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
}

export interface WorkListResponse {
  works: Work[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

class WorksApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || errorData.message || `API request failed: ${response.statusText}`
      );
    }

    return response.json();
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
    
    const response = await this.request<any>('/api/v1/works/', {
      method: 'POST',
      body: JSON.stringify(backendData),
    });
    
    // 将后端类型转换为前端类型
    return {
      ...response,
      work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
    };
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
    const query = queryParams.toString();
    const response = await this.request<any>(
      `/api/v1/works${query ? `?${query}` : ''}`
    );
    
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
    const query = queryParams.toString();
    const response = await this.request<any>(
      `/api/v1/works/public${query ? `?${query}` : ''}`
    );
    
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
   */
  async getWork(
    workId: number,
    include_collaborators?: boolean,
    include_chapters?: boolean
  ): Promise<Work> {
    const queryParams = new URLSearchParams();
    if (include_collaborators !== undefined) {
      queryParams.append('include_collaborators', String(include_collaborators));
    }
    if (include_chapters !== undefined) {
      queryParams.append('include_chapters', String(include_chapters));
    }
    const query = queryParams.toString();
    const response = await this.request<any>(
      `/api/v1/works/${workId}${query ? `?${query}` : ''}`
    );
    
    // 转换作品类型
    return {
      ...response,
      work_type: mapWorkTypeToFrontend(response.work_type as BackendWorkType),
    };
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
    
    const response = await this.request<any>(`/api/v1/works/${workId}`, {
      method: 'PUT',
      body: JSON.stringify(backendUpdates),
    });
    
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
    const url = `${this.baseUrl}/api/v1/works/${workId}`;
    console.log('删除作品请求URL:', url);
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    console.log('删除作品响应状态:', response.status, response.statusText);
    console.log('删除作品响应头:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      let errorData: any = {};
      try {
        const text = await response.text();
        console.log('删除作品错误响应体:', text);
        if (text) {
          errorData = JSON.parse(text);
        }
      } catch (parseErr) {
        console.warn('解析错误响应失败:', parseErr);
      }
      
      const errorMessage = errorData.detail || errorData.message || `删除作品失败: ${response.statusText} (${response.status})`;
      console.error('删除作品失败:', errorMessage);
      throw new Error(errorMessage);
    }

    // DELETE请求可能返回空响应(204)或JSON响应(200)
    // 尝试解析响应，如果没有内容或解析失败，也视为成功
    try {
      const text = await response.text();
      if (text) {
        const data = JSON.parse(text);
        console.log('删除作品成功响应:', data);
      } else {
        console.log('删除作品成功（空响应）');
      }
    } catch (parseErr) {
      // 如果解析失败，可能是空响应，也视为成功
      console.log('删除作品成功（无法解析响应，可能是空响应）');
    }
  }

  /**
   * 发布作品
   */
  async publishWork(workId: number): Promise<Work> {
    return this.request<Work>(`/api/v1/works/${workId}/publish`, {
      method: 'POST',
    });
  }

  /**
   * 归档作品
   */
  async archiveWork(workId: number): Promise<Work> {
    return this.request<Work>(`/api/v1/works/${workId}/archive`, {
      method: 'POST',
    });
  }
}

export const worksApi = new WorksApiClient();

