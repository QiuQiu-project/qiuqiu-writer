/**
 * 反馈 API 客户端
 */

import { BaseApiClient } from './baseApiClient';

export interface FeedbackCreate {
  type: 'bug' | 'suggestion' | 'other';
  title: string;
  description: string;
  context?: {
    work_id?: string | null;
    chapter_id?: string | null;
    page_url?: string;
  };
}

export class FeedbackApi extends BaseApiClient {
  async submit(data: FeedbackCreate): Promise<void> {
    await this.post<void>('/api/v1/feedback', data);
  }
}

export const feedbackApi = new FeedbackApi();
