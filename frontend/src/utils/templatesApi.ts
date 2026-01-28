/**
 * 模板管理API客户端
 * 对接后端模板接口 /api/v1/templates
 */

import { BaseApiClient } from './baseApiClient';

export interface TemplateConfig {
  templateId: string;
  modules: unknown[];
}

export interface WorkTemplate {
  id: number;
  name: string;
  description?: string;
  work_type: string;
  category?: string;
  template_config?: TemplateConfig | Record<string, unknown>; // 这里可以是 TemplateConfig 或更复杂的结构
  is_public?: boolean;
  is_system?: boolean;
  settings?: Record<string, unknown>;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  creator_id?: number;
  usage_count?: number;
}

class TemplatesApiClient extends BaseApiClient {

  /**
   * 保存作品的模板配置到数据库
   */
  async saveWorkTemplateConfig(workId: number, templateConfig: TemplateConfig): Promise<{ message: string; work_id: number; template_config: TemplateConfig }> {
    return this.post<{ message: string; work_id: number; template_config: TemplateConfig }>(
      `/api/v1/templates/works/${workId}/template-config`,
      templateConfig
    );
  }

  /**
   * 获取作品的模板配置
   */
  async getWorkTemplateConfig(workId: number): Promise<{ work_id: number; template_config: TemplateConfig | null; message?: string }> {
    return this.get<{ work_id: number; template_config: TemplateConfig | null; message?: string }>(
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
    settings?: Record<string, unknown>;
    tags?: string[];
  }): Promise<WorkTemplate> {
    return this.post<WorkTemplate>('/api/v1/templates/', templateData);
  }

  /**
   * 更新模板
   */
  async updateTemplate(
    templateId: number,
    templateData: {
      name?: string;
      description?: string;
      template_config?: TemplateConfig;
      settings?: Record<string, unknown>;
      category?: string;
      is_public?: boolean;
      tags?: string[];
    }
  ): Promise<WorkTemplate> {
    return this.put<WorkTemplate>(`/api/v1/templates/${templateId}`, templateData);
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
  }): Promise<WorkTemplate[]> {
    return this.get<WorkTemplate[]>('/api/v1/templates', params);
  }
}

export const templatesApi = new TemplatesApiClient();
