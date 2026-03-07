/**
 * API client for 球球写作 backend (MemOS)
 */

import type { SyncResponse } from '../types/sharedb';

import { BaseApiClient } from './baseApiClient';

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

class ApiClient extends BaseApiClient {
  // Document operations
  async createDocument(
    userId: string,
    title: string = '未命名文档',
    content: string = '',
    memCubeId?: string
  ): Promise<Document> {
    const response = await this.post<ApiResponse<Document>>('/api/documents/', {
      user_id: userId,
      title,
      content,
      mem_cube_id: memCubeId,
    });
    return response.data;
  }

  async listDocuments(userId: string, memCubeId?: string): Promise<Document[]> {
    const params: Record<string, string | number | boolean | undefined> = { user_id: userId };
    if (memCubeId) {
      params.mem_cube_id = memCubeId;
    }
    const response = await this.get<ApiResponse<Document[]>>('/api/documents/', params);
    return response.data;
  }

  async getDocument(
    docId: string,
    userId: string,
    memCubeId?: string
  ): Promise<Document> {
    const params: Record<string, string | number | boolean | undefined> = { user_id: userId };
    if (memCubeId) {
      params.mem_cube_id = memCubeId;
    }
    const response = await this.get<ApiResponse<Document>>(`/api/documents/${docId}/`, params);
    return response.data;
  }

  async updateDocument(
    docId: string,
    userId: string,
    updates: { title?: string; content?: string },
    memCubeId?: string
  ): Promise<Document> {
    const queryParams = new URLSearchParams({ user_id: userId });
    if (memCubeId) {
      queryParams.append('mem_cube_id', memCubeId);
    }
    
    const response = await this.request<ApiResponse<Document>>(`/api/documents/${docId}/?${queryParams.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.data;
  }

  async deleteDocument(
    docId: string,
    userId: string,
    memCubeId?: string
  ): Promise<void> {
    const queryParams = new URLSearchParams({ user_id: userId });
    if (memCubeId) {
      queryParams.append('mem_cube_id', memCubeId);
    }
    await this.request(`/api/documents/${docId}/?${queryParams.toString()}`, {
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
    const response = await this.post<ApiResponse<SyncResponse>>('/v1/sharedb/documents/sync/', data);
    return response.data;
  }

}

export const apiClient = new ApiClient();
