/**
 * 认证API客户端
 * 对接后端认证接口
 */

import { BaseApiClient } from './baseApiClient';

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

class AuthApiClient extends BaseApiClient {
  /**
   * 登录
   */
  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const data = await this.post<TokenResponse>('/api/v1/auth/login', credentials);
    return data;
  }

  /**
   * 注册
   */
  async register(data: RegisterRequest): Promise<TokenResponse> {
    return await this.post<TokenResponse>('/api/v1/auth/register', data);
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<UserInfo> {
    if (!this.isAuthenticated()) {
      throw new Error('未登录');
    }

    try {
      const data = await this.get<UserInfo | { user: UserInfo }>('/api/v1/auth/me');
      return 'user' in data ? data.user : data;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        this.clearToken();
        throw new Error('登录已过期，请重新登录');
      }
      throw err;
    }
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
      await this.post('/api/v1/auth/logout', refreshToken ? { refresh_token: refreshToken } : {});
    } catch {
      // ignore
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

    try {
      const data = await this.post<TokenResponse>('/api/v1/auth/refresh', { refresh_token: refreshToken });
      this.setToken(data.access_token);
      this.setRefreshToken(data.refresh_token);
      return data;
    } catch {
      this.clearToken();
      throw new Error('刷新令牌失败，请重新登录');
    }
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
    if (!this.isAuthenticated()) {
      throw new Error('未登录');
    }

    try {
      const result = await this.put<UserInfo | { user: UserInfo }>('/api/v1/auth/me', data);
      const updatedUser = 'user' in result ? result.user : result;
      this.setUserInfo(updatedUser);
      return updatedUser;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        this.clearToken();
        throw new Error('登录已过期，请重新登录');
      }
      throw err;
    }
  }
}

export const authApi = new AuthApiClient();
