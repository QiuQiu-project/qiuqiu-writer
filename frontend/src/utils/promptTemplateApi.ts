/**
 * Prompt模板管理API客户端
 * 对接后端接口 /api/v1/prompt-templates
 */

import { BaseApiClient } from './baseApiClient';

export interface PromptTemplate {
  id: number;
  name: string;
  description?: string;
  template_type: string;
  prompt_content: string;
  version?: string;
  is_default?: boolean;
  is_active?: boolean;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  usage_count?: number;
  creator_id?: number;
  component_id?: string;
  component_type?: string;
  prompt_category?: string; // 'generate' | 'validate' | 'analysis'
  work_id?: number; // 向后兼容
  work_template_id?: number; // 关联的模板ID
  created_at?: string;
  updated_at?: string;
}

export interface PromptTemplateCreate {
  name: string;
  description?: string;
  template_type: string;
  prompt_content: string;
  version?: string;
  is_default?: boolean;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  component_id?: string;
  component_type?: string;
  prompt_category?: string; // 'generate' | 'validate' | 'analysis'
  data_key?: string; // 数据存储键
  work_id?: number; // 向后兼容
  work_template_id?: number; // 关联的模板ID
}

export interface PromptTemplateUpdate {
  name?: string;
  description?: string;
  prompt_content?: string;
  version?: string;
  is_default?: boolean;
  is_active?: boolean;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
  data_key?: string; // 数据存储键
}

class PromptTemplateApiClient extends BaseApiClient {
  /**
   * 创建Prompt模板
   */
  async createPromptTemplate(templateData: PromptTemplateCreate): Promise<PromptTemplate> {
    return this.post<PromptTemplate>('/api/v1/prompt-templates/', templateData);
  }

  /**
   * 更新Prompt模板
   */
  async updatePromptTemplate(
    templateId: number,
    templateData: PromptTemplateUpdate
  ): Promise<PromptTemplate> {
    return this.put<PromptTemplate>(`/api/v1/prompt-templates/${templateId}`, templateData);
  }

  /**
   * 获取Prompt模板
   */
  async getPromptTemplate(templateId: number): Promise<PromptTemplate> {
    return this.get<PromptTemplate>(`/api/v1/prompt-templates/${templateId}`);
  }

  /**
   * 根据组件ID和类别获取Prompt模板
   */
  async getComponentPrompt(
    componentId: string,
    promptCategory: 'generate' | 'validate' | 'analysis',
    templateId?: number
  ): Promise<PromptTemplate | null> {
    try {
      const params: any = {
        component_id: componentId,
        prompt_category: promptCategory,
      };
      if (templateId) {
        params.work_template_id = templateId;
      }
      const response = await this.get<PromptTemplate[]>(
        '/api/v1/prompt-templates/',
        params
      );
      return response && response.length > 0 ? response[0] : null;
    } catch (error) {
      console.error('获取组件Prompt失败:', error);
      return null;
    }
  }

  /**
   * 创建或更新组件Prompt（如果存在则更新，不存在则创建）
   */
  async upsertComponentPrompt(
    componentId: string,
    componentType: string,
    promptCategory: 'generate' | 'validate' | 'analysis',
    promptContent: string,
    templateId?: number,
    dataKey?: string
  ): Promise<PromptTemplate> {
    // 先尝试查找现有的prompt
    const existing = await this.getComponentPrompt(componentId, promptCategory, templateId);
    
    if (existing) {
      // 更新现有prompt
      return this.updatePromptTemplate(existing.id, {
        prompt_content: promptContent,
        data_key: dataKey,
      });
    } else {
      // 创建新prompt
      return this.createPromptTemplate({
        name: `${componentId} - ${promptCategory} prompt`,
        description: `组件 ${componentId} 的 ${promptCategory} prompt`,
        template_type: `component_${promptCategory}`,
        prompt_content: promptContent,
        component_id: componentId,
        component_type: componentType,
        prompt_category: promptCategory,
        data_key: dataKey,
        work_template_id: templateId,
      });
    }
  }

  /**
   * 根据ID批量获取Prompt模板
   * @param ids Prompt模板ID数组
   * @param signal 可选的 AbortSignal，用于取消请求
   */
  async getPromptTemplatesByIds(
    ids: number[],
    signal?: AbortSignal
  ): Promise<Map<number, PromptTemplate>> {
    const result = new Map<number, PromptTemplate>();
    if (!ids || ids.length === 0) {
      return result;
    }
    
    try {
      // 使用批量查询接口
      const templates = await this.post<PromptTemplate[]>(
        '/api/v1/prompt-templates/batch',
        ids,
        signal
      );
      
      if (templates && Array.isArray(templates)) {
        templates.forEach(template => {
          result.set(template.id, template);
        });
      }
    } catch (error) {
      // 如果是取消请求，不记录错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('批量获取Prompt模板请求已取消');
        return result;
      }
      console.error('批量获取Prompt模板失败:', error);
    }
    
    return result;
  }
}

export const promptTemplateApi = new PromptTemplateApiClient();

