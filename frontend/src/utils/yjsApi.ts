/**
 * Yjs API client for triggering synchronization and other Yjs-related tasks.
 */
import { BaseApiClient } from './baseApiClient';

export interface YjsSyncResponse {
  success: boolean;
  room: string;
}

class YjsApiClient extends BaseApiClient {
  /**
   * Force a sync from Yjs document state to MongoDB.
   * This ensures that chapter content is persisted immediately.
   */
  async forceSync(workId: string): Promise<YjsSyncResponse> {
    const roomName = `work_${workId}`;
    return await this.post<YjsSyncResponse>(`/api/v1/yjs/${roomName}/sync`);
  }
}

export const yjsApi = new YjsApiClient();
