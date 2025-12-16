/**
 * 角色管理API客户端
 * 对接后端角色接口 /api/v1/characters
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface Character {
  id: number;
  work_id: number;
  name: string;
  display_name?: string;
  description?: string;
  avatar_url?: string;
  gender?: string;
  age?: number;
  personality?: Record<string, any>;
  appearance?: Record<string, any>;
  background?: Record<string, any>;
  relationships?: Record<string, any>;
  tags?: string[];
  is_main_character: boolean;
  is_active: boolean;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CharacterListResponse {
  characters: Character[];
  total: number;
}

class CharactersApiClient {
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
   * 获取作品的角色列表
   */
  async listCharacters(workId: number): Promise<CharacterListResponse> {
    return this.request<CharacterListResponse>(
      `/api/v1/characters/?work_id=${workId}`
    );
  }

  /**
   * 获取角色详情
   */
  async getCharacter(characterId: number): Promise<Character> {
    return this.request<Character>(`/api/v1/characters/${characterId}`);
  }
}

export const charactersApi = new CharactersApiClient();


