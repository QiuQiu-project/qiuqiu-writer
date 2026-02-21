/**
 * 基础 API 客户端类
 * 所有 API 客户端都应该继承这个类，以统一处理认证、错误处理等
 */

import { API_BASE_URL } from './apiConfig';

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
    
    // 添加请求日志
    console.log(`📤 [BaseApiClient] ${options.method || 'GET'} ${url}`, {
      headers: this.getAuthHeaders(),
      body: options.body,
    });
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal, // 支持 AbortSignal
        headers: {
          ...this.getAuthHeaders(),
          ...options.headers,
        },
      });

      console.log(`📥 [BaseApiClient] 响应状态: ${response.status} ${response.statusText}`, {
        url,
        ok: response.ok,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ [BaseApiClient] 请求失败:`, {
          url,
          status: response.status,
          statusText: response.statusText,
          errorData,
        });
        throw new Error(
          errorData.detail || errorData.message || `API request failed: ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log(`✅ [BaseApiClient] 请求成功:`, {
        url,
        data,
      });
      return data;
    } catch (error) {
      // 处理网络错误
      if (
         error instanceof TypeError &&
         (error.message === 'Failed to fetch' ||
           error.message === 'NetworkError when attempting to fetch resource.' ||
           error.message.toLowerCase().includes('network error') ||
           error.message.includes('Network request failed'))
       ) {
        const hostDesc = this.baseUrl || '当前域名（相对路径，依赖代理）';
        const errorMsg = `无法连接到服务器 (${hostDesc})。可能的原因：
1. 后端服务未运行（开发时检查 Vite 代理目标，如 http://127.0.0.1:8001）
2. 网络连接问题
3. CORS 或代理配置问题
4. 防火墙阻止了连接
原始错误: ${error.message}`;
        console.error(`❌ [BaseApiClient] 网络错误:`, errorMsg);
        throw new Error(errorMsg);
      }
      // 重新抛出其他错误
      console.error(`❌ [BaseApiClient] 请求异常:`, error);
      throw error;
    }
  }

  /**
   * GET 请求的便捷方法
   */
  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
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
  async post<T>(endpoint: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      signal,
    });
  }

  /**
   * PUT 请求的便捷方法
   */
  protected async put<T>(endpoint: string, data?: unknown): Promise<T> {
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
  protected async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * 返回原始 Response，不解析 JSON、不根据 ok 抛错，供流式或自定义处理使用
   */
  async requestRaw(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    return fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers,
      },
    });
  }
}



