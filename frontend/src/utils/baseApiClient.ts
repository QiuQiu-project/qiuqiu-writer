/**
 * 基础 API 客户端类
 * 所有 API 客户端都应该继承这个类，以统一处理认证、错误处理等
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export class BaseApiClient {
  protected baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取认证头
   */
  protected getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * 统一的请求方法
   * 处理认证、错误处理、网络错误等
   */
  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal, // 支持 AbortSignal
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
    } catch (error) {
      // 处理网络错误（Failed to fetch）
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        const errorMsg = `无法连接到服务器 (${this.baseUrl})。可能的原因：
1. 后端服务未运行（检查 http://localhost:8001 是否可访问）
2. 网络连接问题
3. CORS 配置问题
4. 防火墙阻止了连接`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      // 重新抛出其他错误
      throw error;
    }
  }

  /**
   * GET 请求的便捷方法
   */
  protected async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint;
    if (params) {
      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
      const queryString = queryParams.toString();
      if (queryString) {
        url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
      }
    }
    return this.request<T>(url);
  }

  /**
   * POST 请求的便捷方法
   */
  protected async post<T>(endpoint: string, data?: any, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      signal,
    });
  }

  /**
   * PUT 请求的便捷方法
   */
  protected async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE 请求的便捷方法
   */
  protected async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  /**
   * PATCH 请求的便捷方法
   */
  protected async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}




