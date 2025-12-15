/**
 * 模板管理API客户端
 * 对接后端模板接口 /api/v1/templates
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface TemplateConfig {
  templateId: string;
  modules: any[];
}

class TemplatesApiClient {
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
   * 保存作品的模板配置到数据库
   */
  async saveWorkTemplateConfig(workId: number, templateConfig: TemplateConfig): Promise<{ message: string; work_id: number; template_config: TemplateConfig }> {
    return this.request<{ message: string; work_id: number; template_config: TemplateConfig }>(
      `/api/v1/templates/works/${workId}/template-config`,
      {
        method: 'POST',
        body: JSON.stringify(templateConfig),
      }
    );
  }

  /**
   * 获取作品的模板配置
   */
  async getWorkTemplateConfig(workId: number): Promise<{ work_id: number; template_config: TemplateConfig | null; message?: string }> {
    return this.request<{ work_id: number; template_config: TemplateConfig | null; message?: string }>(
      `/api/v1/templates/works/${workId}/template-config`
    );
  }

  /**
   * 创建新模板
   */
  async createTemplate(templateData: {
    name: string;
    description?: string;
    work_type: string;
    category?: string;
    template_config: TemplateConfig;
    is_public?: boolean;
    settings?: Record<string, any>;
    tags?: string[];
  }): Promise<any> {
    return this.request<any>(
      '/api/v1/templates/',
      {
        method: 'POST',
        body: JSON.stringify(templateData),
      }
    );
  }

  /**
   * 获取模板列表
   */
  async listTemplates(params?: {
    page?: number;
    size?: number;
    work_type?: string;
    category?: string;
    is_public?: boolean;
    is_system?: boolean;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    include_fields?: boolean;
  }): Promise<any[]> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request<any[]>(`/api/v1/templates/${queryString ? `?${queryString}` : ''}`);
  }
}

export const templatesApi = new TemplatesApiClient();

