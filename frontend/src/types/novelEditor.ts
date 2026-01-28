// 小说编辑器相关的类型定义

// ShareDB 文档类型
export interface ShareDBDocument {
  document_id: string;
  content: string;
  version?: number;
  document_exists?: boolean;
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

// 同步响应类型
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

// 章节完整数据类型
export interface ChapterFullData {
  id: string;
  volumeId: string;
  volumeTitle: string;
  title: string;
  chapter_number?: number;
  characters: string[];
  locations: string[];
  outline: string;
  detailOutline: string;
}
