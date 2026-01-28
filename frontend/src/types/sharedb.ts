// ShareDB 相关类型定义

export interface ShareDBDocument {
  document_id: string;
  content: string;
  version?: number;
  document_exists?: boolean; // 表示文档是否存在于 MongoDB
  metadata?: {
    work_id?: number;
    chapter_id?: number;
    chapter_number?: number;
    title?: string;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
    outline?: string;
    detailed_outline?: string;
  };
}

export interface SyncResponse {
  success: boolean;
  version: number;
  content: string;
  operations: Array<{
    doc_id: string;
    version: number;
    operation: unknown;
    user_id: number;
    timestamp: string;
  }>;
  error?: string;
  work?: {
    id: number;
    word_count: number;
    [key: string]: unknown;
  };
  chapter?: {
    id: number;
    word_count: number;
    [key: string]: unknown;
  };
}

