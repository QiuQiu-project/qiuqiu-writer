/**
 * 文档相关的类型定义
 */

// ShareDB 文档类型定义
export interface ShareDBDocument {
  document_id: string;
  content: string; // 统一格式：content 必须是字符串，不再支持对象格式
  version?: number;
  document_exists?: boolean; // 表示文档是否存在于 MongoDB
  metadata?: {
    work_id?: string;
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

// 同步响应类型定义
export interface SyncResponse {
  success: boolean;
  version: number;
  content: string;
  operations: Array<{
    doc_id: string;
    version: number;
    operation: unknown;
    user_id: string;
    timestamp: string;
  }>;
  error?: string;
  work?: {
    id: string;
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
  chapter_number?: number;  // 章节号
  characters: string[];
  locations: string[];
  outline: string;
  detailOutline: string;
}

// 缓存的作品文档类型
export interface CachedWorkDoc {
  id?: number;
  title?: string;
  description?: string;
  work_type?: string;
  category?: string;
  genre?: string;
  is_public?: boolean;
  metadata?: {
    title?: string;
    description?: string;
    work_type?: string;
    category?: string;
    genre?: string;
    is_public?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// 缓存的章节文档类型
export interface CachedChapterDoc {
  content?: string;
  title?: string;
  metadata?: {
    chapter_number?: number;
    title?: string;
    volume_number?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

