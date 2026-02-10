/**
 * 认证API客户端
 * 对接后端认证接口
 */

import { API_BASE_URL } from './apiConfig';

export interface LoginRequest {
  username_or_email: string;
  password: string;
  device_info?: Record<string, unknown>;
}

export interface RegisterRequest {
  invitation_code: string;
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  display_name?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserInfo;
  expires_in: number;
}

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  is_superuser?: boolean;
}

export interface AuthError {
  detail: string;
}

class AuthApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 登录
   */
  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error: AuthError = await response.json().catch(() => ({
        detail: response.statusText,
      }));
      throw new Error(error.detail || '登录失败');
    }

    return response.json();
  }

  /**
   * 注册
   */
  async register(data: RegisterRequest): Promise<TokenResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // 处理422验证错误
      if (response.status === 422 && errorData.detail) {
        const errors = Array.isArray(errorData.detail) 
          ? errorData.detail 
          : [errorData.detail];
        const errorMessages = (errors as unknown[]).map((err) => {
          if (typeof err === 'string') return err;
          if (typeof err === 'object' && err !== null && 'msg' in err) {
            const e = err as { msg?: string; loc?: unknown };
            const loc = Array.isArray(e.loc) ? e.loc.join('.') : '';
            const msg = e.msg ?? '';
            return `${loc}: ${msg}`.trim();
          }
          return JSON.stringify(err);
        });
        throw new Error(errorMessages.join('; ') || '数据验证失败');
      }
      
      // 处理其他错误
      const error: AuthError = errorData.detail 
        ? { detail: typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail) }
        : { detail: errorData.message || response.statusText || '注册失败' };
      throw new Error(error.detail);
    }

    return response.json();
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<UserInfo> {
    const token = this.getToken();
    if (!token) {
      throw new Error('未登录');
    }

    const response = await fetch(`${this.baseUrl}/api/v1/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        throw new Error('登录已过期，请重新登录');
      }
      throw new Error('获取用户信息失败');
    }

    const data = await response.json();
    return data.user || data;
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    const token = this.getToken();
    const refreshToken = this.getRefreshToken();
    if (!token) {
      return;
    }

    try {
      await fetch(`${this.baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
      });
    } catch (error) {
      console.error('登出请求失败:', error);
    } finally {
      this.clearToken();
    }
  }

  /**
   * 刷新令牌
   */
  async refreshToken(): Promise<TokenResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('刷新令牌不存在');
    }

    const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      this.clearToken();
      throw new Error('刷新令牌失败，请重新登录');
    }

    const data = await response.json();
    this.setToken(data.access_token);
    this.setRefreshToken(data.refresh_token);
    return data;
  }

  /**
   * Token管理
   */
  setToken(token: string): void {
    localStorage.setItem('access_token', token);
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  setRefreshToken(token: string): void {
    localStorage.setItem('refresh_token', token);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  clearToken(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_info');
  }

  setUserInfo(user: UserInfo): void {
    localStorage.setItem('user_info', JSON.stringify(user));
  }

  getUserInfo(): UserInfo | null {
    const userStr = localStorage.getItem('user_info');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * 更新用户资料
   */
  async updateProfile(data: Partial<UserInfo>): Promise<UserInfo> {
    const token = this.getToken();
    if (!token) {
      throw new Error('未登录');
    }

    const response = await fetch(`${this.baseUrl}/api/v1/auth/me`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        throw new Error('登录已过期，请重新登录');
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || '更新用户资料失败');
    }

    const result = await response.json();
    const updatedUser = result.user || result;
    this.setUserInfo(updatedUser);
    return updatedUser;
  }
}

export const authApi = new AuthApiClient();
