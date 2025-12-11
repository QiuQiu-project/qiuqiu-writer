/**
 * 章节管理API客户端
 * 对接后端章节接口 /api/v1/chapters
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface Chapter {
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
    [key: string]: any;
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
  chapter_metadata?: {
    outline?: string;
    detailed_outline?: string;
    [key: string]: any;
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

class ChaptersApiClient {
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
   * 创建章节
   */
  async createChapter(chapterData: ChapterCreate): Promise<Chapter> {
    return this.request<Chapter>('/api/v1/chapters/', {
      method: 'POST',
      body: JSON.stringify(chapterData),
    });
  }

  /**
   * 获取章节列表
   */
  async listChapters(params: {
    work_id: number;
    page?: number;
    size?: number;
    status?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<ChapterListResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append('work_id', String(params.work_id));
    if (params.page) queryParams.append('page', String(params.page));
    if (params.size) queryParams.append('size', String(params.size));
    if (params.status) queryParams.append('status', params.status);
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    if (params.sort_order) queryParams.append('sort_order', params.sort_order);

    return this.request<ChapterListResponse>(
      `/api/v1/chapters/?${queryParams.toString()}`
    );
  }

  /**
   * 获取章节详情
   */
  async getChapter(
    chapterId: number,
    include_versions?: boolean
  ): Promise<Chapter> {
    const queryParams = new URLSearchParams();
    if (include_versions !== undefined) {
      queryParams.append('include_versions', String(include_versions));
    }
    const query = queryParams.toString();
    return this.request<Chapter>(
      `/api/v1/chapters/${chapterId}${query ? `?${query}` : ''}`
    );
  }

  /**
   * 更新章节
   */
  async updateChapter(
    chapterId: number,
    updates: ChapterUpdate
  ): Promise<Chapter> {
    return this.request<Chapter>(`/api/v1/chapters/${chapterId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * 删除章节
   */
  async deleteChapter(chapterId: number): Promise<void> {
    await this.request(`/api/v1/chapters/${chapterId}`, {
      method: 'DELETE',
    });
  }

  /**
   * 获取章节版本历史
   */
  async getChapterVersions(
    chapterId: number,
    page?: number,
    size?: number
  ): Promise<ChapterVersion[]> {
    const queryParams = new URLSearchParams();
    if (page) queryParams.append('page', String(page));
    if (size) queryParams.append('size', String(size));
    const query = queryParams.toString();
    return this.request<ChapterVersion[]>(
      `/api/v1/chapters/${chapterId}/versions${query ? `?${query}` : ''}`
    );
  }

  /**
   * 创建章节版本快照
   */
  async createChapterVersion(
    chapterId: number,
    changeDescription?: string
  ): Promise<ChapterVersion> {
    return this.request<ChapterVersion>(
      `/api/v1/chapters/${chapterId}/versions`,
      {
        method: 'POST',
        body: JSON.stringify({
          change_description: changeDescription,
        }),
      }
    );
  }

  /**
   * 获取章节ShareDB文档内容
   */
  async getChapterDocument(chapterId: number): Promise<{
    document_id: string;
    content: any;
    chapter_info: Chapter;
  }> {
    return this.request(`/api/v1/chapters/${chapterId}/document`);
  }
}

export const chaptersApi = new ChaptersApiClient();

