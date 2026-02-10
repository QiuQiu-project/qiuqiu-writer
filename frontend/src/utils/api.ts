/**
 * API client for 球球写作 backend (MemOS)
 */

import type { ShareDBDocument, SyncResponse } from '../types/sharedb';

import { API_BASE_URL } from './apiConfig';

export interface Document {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  mem_cube_id?: string | null;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

class ApiClient {
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
  ): Promise<ApiResponse<T>> {
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

  // Document operations
  async createDocument(
    userId: string,
    title: string = '未命名文档',
    content: string = '',
    memCubeId?: string
  ): Promise<Document> {
    const response = await this.request<Document>('/api/documents/', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        title,
        content,
        mem_cube_id: memCubeId,
      }),
    });
    return response.data;
  }

  async listDocuments(userId: string, memCubeId?: string): Promise<Document[]> {
    const params = new URLSearchParams({ user_id: userId });
    if (memCubeId) {
      params.append('mem_cube_id', memCubeId);
    }
    const response = await this.request<Document[]>(
      `/api/documents/?${params.toString()}`
    );
    return response.data;
  }

  async getDocument(
    docId: string,
    userId: string,
    memCubeId?: string
  ): Promise<Document> {
    const params = new URLSearchParams({ user_id: userId });
    if (memCubeId) {
      params.append('mem_cube_id', memCubeId);
    }
    const response = await this.request<Document>(
      `/api/documents/${docId}?${params.toString()}`
    );
    return response.data;
  }

  async updateDocument(
    docId: string,
    userId: string,
    updates: { title?: string; content?: string },
    memCubeId?: string
  ): Promise<Document> {
    const params = new URLSearchParams({ user_id: userId });
    if (memCubeId) {
      params.append('mem_cube_id', memCubeId);
    }
    const response = await this.request<Document>(
      `/api/documents/${docId}?${params.toString()}`,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
    return response.data;
  }

  async deleteDocument(
    docId: string,
    userId: string,
    memCubeId?: string
  ): Promise<void> {
    const params = new URLSearchParams({ user_id: userId });
    if (memCubeId) {
      params.append('mem_cube_id', memCubeId);
    }
    await this.request(`/api/documents/${docId}?${params.toString()}`, {
      method: 'DELETE',
    });
  }

  // ShareDB operations
  /**
   * 同步 ShareDB 文档
   */
  async syncShareDBDocument(data: {
    doc_id: string;
    version?: number;
    content: string;
    create_version?: boolean;
    base_version?: number;
    base_content?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SyncResponse> {
    const response = await this.request<SyncResponse>('/v1/sharedb/documents/sync', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.data;
  }

  /**
   * 获取 ShareDB 文档
   */
  async getShareDBDocument(docId: string): Promise<ShareDBDocument> {
    const response = await this.request<ShareDBDocument>(`/v1/sharedb/documents/${docId}`);
    return response.data;
  }
}

export const apiClient = new ApiClient();
