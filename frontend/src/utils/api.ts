/**
 * API client for WawaWriter backend (MemOS)
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

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

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
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
}

export const apiClient = new ApiClient();

