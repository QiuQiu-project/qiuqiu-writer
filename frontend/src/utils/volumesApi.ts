/**
 * API client for Volume management
 */

import { BaseApiClient } from './baseApiClient';

export interface Volume {
  id: number;
  work_id: number;
  title: string;
  volume_number: number;
  outline?: string;
  detail_outline?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VolumeCreate {
  title: string;
  volume_number: number;
  outline?: string;
  detail_outline?: string;
}

export interface VolumeUpdate {
  title?: string;
  volume_number?: number;
  outline?: string;
  detail_outline?: string;
}

class VolumesApiClient extends BaseApiClient {
  /**
   * Create a new volume
   */
  async createVolume(workId: number, data: VolumeCreate): Promise<Volume> {
    const response = await this.post<Volume>(`/api/v1/volumes/?work_id=${workId}`, data);
    return response;
  }

  /**
   * List volumes for a work
   */
  async listVolumes(workId: number): Promise<Volume[]> {
    const response = await this.get<Volume[]>(`/api/v1/volumes/?work_id=${workId}`);
    return response;
  }

  /**
   * Update a volume
   */
  async updateVolume(volumeId: number, data: VolumeUpdate): Promise<Volume> {
    const response = await this.put<Volume>(`/api/v1/volumes/${volumeId}`, data);
    return response;
  }

  /**
   * Delete a volume
   */
  async deleteVolume(volumeId: number): Promise<void> {
    await this.delete(`/api/v1/volumes/${volumeId}`);
  }
}

export const volumesApi = new VolumesApiClient();
