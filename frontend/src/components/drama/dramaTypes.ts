// 剧本模块共享类型定义

export type SubjectType = '角色' | '场景' | '宠物';

export interface DramaCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  appearance: string;
  personality: string;
  imageUrl?: string;
  imageUrls?: string[];  // 多视角图片库
  subjectType?: '角色' | '宠物';  // 主体分类（默认角色）
}

export interface DramaScene {
  id: string;
  location: string;
  time: string;
  description: string;
  imageUrl?: string;
  imageUrls?: string[];  // 多视角图片库
  episodeId?: string; // 全局场景库 — 记录来源集数
}

// 镜头类型
export type ShotType = 'wide' | 'medium' | 'close' | 'extreme-close' | 'bird-eye' | 'low-angle';

// 单格分镜
export interface DramaPanel {
  id: string;
  index: number;           // 格序号（1,2,3...）
  shotType: ShotType;      // 镜头类型
  sceneId?: string;        // 关联场景库中的场景
  actTitle?: string;       // 所属场次标题（如 "INT. 办公室 - 白天"）
  actIndex?: number;       // 场次序号（1,2,3...）
  characters: string[];    // 出现的角色名列表
  action: string;          // 动作/环境描述
  dialogue?: string;       // 台词（可空）
  emotion?: string;        // 情绪基调
  imageUrl?: string;       // 生成的分镜图URL
  imagePrompt?: string;    // 图片生成提示词（可手动编辑）
  contextRefPanelIds?: string[];  // 上文参考分镜格 ID（跨集，多选，生图时作为参考）
}

// 分镜脚本（整集）
export interface DramaStoryboard {
  episodeId: string;
  panels: DramaPanel[];
  generatedAt?: number;    // 生成时间戳
}

// 生产阶段状态
export type StageStatus = 'empty' | 'done';

// 生产状态（每集）
export interface EpisodeProductionStatus {
  script: StageStatus;
  storyboard: StageStatus;
  panels: StageStatus;
  video: StageStatus;
}

export interface DramaEpisode {
  id: string;
  number: number;
  title: string;
  synopsis: string;
  script: string;
  scenes: DramaScene[];
  videoUrl?: string;
  sourceChapterId?: number;
  sourceChapterTitle?: string;
  storyboard?: DramaStoryboard;  // 分镜脚本
}

export interface DramaMeta {
  genre: string;
  style: string;
  totalEpisodes: number;
  outline: string;
  characters: DramaCharacter[];
  episodes: DramaEpisode[];
  scenes?: DramaScene[]; // 全局场景库（跨集复用）
  sourceNovelId?: string;
  sourceNovelTitle?: string;
  [key: string]: unknown;
}

// ── 本地 Drama AI 任务（纯前端执行，不经过 WebSocket）──────────

export type LocalDramaTaskType = 'extract-characters' | 'extract-scenes' | 'gen-script';
export type LocalDramaTaskStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface LocalDramaTask {
  /** 前端生成的唯一 ID */
  local_id: string;
  type: LocalDramaTaskType;
  /** 面向用户的命令描述 */
  query: string;
  episode_id: string;
  episode_title: string;
  status: LocalDramaTaskStatus;
  /** 流式文本（gen-script 专用） */
  streamContent?: string;
  /** 结构化结果（extract 专用，用于显示数量） */
  result?: unknown[];
  error?: string;
  created_at: number;
  /** 用于中断 gen-script 流式请求 */
  abortController?: AbortController;
}
