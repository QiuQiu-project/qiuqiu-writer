# WriterAI后端数据库设计

## 数据库架构概述

WriterAI后端采用混合数据库架构：
- **PostgreSQL**: 主数据库，存储用户、作品、章节等结构化数据
- **MongoDB (ShareDB)**: 实时协作编辑的内容存储
- **Redis**: 缓存和会话管理
- **Qdrant**: 向量数据库，支持AI推荐和搜索功能

## PostgreSQL 数据库设计

### 1. 用户管理

#### users 表
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(255),
    bio TEXT,
    status VARCHAR(20) DEFAULT 'active', -- active/inactive/banned
    preferences JSON DEFAULT '{}', -- 用户偏好设置
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### user_profiles 表
```sql
CREATE TABLE user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    real_name VARCHAR(100),
    gender VARCHAR(10),
    birthday DATE,
    location VARCHAR(100),
    website VARCHAR(255),
    social_links JSON DEFAULT '[]', -- 社交媒体链接
    writing_stats JSON DEFAULT '{}', -- 写作统计信息
    preferences JSON DEFAULT '{}', -- 详细用户偏好
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. 作品管理

#### works 表
```sql
CREATE TABLE works (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    subtitle VARCHAR(300),
    description TEXT,
    work_type VARCHAR(20) NOT NULL, -- novel/script/short_story/film_script
    status VARCHAR(20) DEFAULT 'draft', -- draft/published/archived
    cover_image_url VARCHAR(255),
    tags JSON DEFAULT '[]',
    category VARCHAR(50),
    genre VARCHAR(50),
    target_audience VARCHAR(50),
    language VARCHAR(10) DEFAULT 'zh-CN',
    word_count INTEGER DEFAULT 0,
    chapter_count INTEGER DEFAULT 0,
    reading_time INTEGER DEFAULT 0, -- 预估阅读时间（分钟）
    owner_id INTEGER REFERENCES users(id),
    collaborator_count INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT false,
    is_collaborative BOOLEAN DEFAULT false,
    settings JSON DEFAULT '{}', -- 作品设置
    metadata JSON DEFAULT '{}', -- 扩展元数据
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_works_owner ON works(owner_id);
CREATE INDEX idx_works_type ON works(work_type);
CREATE INDEX idx_works_status ON works(status);
CREATE INDEX idx_works_tags ON works USING GIN(tags);
```

#### work_collaborators 表
```sql
CREATE TABLE work_collaborators (
    id SERIAL PRIMARY KEY,
    work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(20) NOT NULL, -- owner/editor/reader
    role VARCHAR(50), -- writer/editor/beta_reader/etc.
    invited_by INTEGER REFERENCES users(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(work_id, user_id)
);

CREATE INDEX idx_work_collaborators_work ON work_collaborators(work_id);
CREATE INDEX idx_work_collaborators_user ON work_collaborators(user_id);
```

### 3. 作品信息模板管理

#### work_templates 表
```sql
CREATE TABLE work_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    work_type VARCHAR(20) NOT NULL,
    is_system BOOLEAN DEFAULT false, -- 系统模板 vs 用户模板
    is_public BOOLEAN DEFAULT false,
    creator_id INTEGER REFERENCES users(id),
    category VARCHAR(50),
    tags JSON DEFAULT '[]',
    template_config JSON NOT NULL, -- 模板配置信息
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_work_templates_type ON work_templates(work_type);
CREATE INDEX idx_work_templates_creator ON work_templates(creator_id);
```

#### template_fields 表
```sql
CREATE TABLE template_fields (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES work_templates(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL, -- text/textarea/select/checkbox/date/number
    field_label VARCHAR(100) NOT NULL,
    field_description TEXT,
    field_options JSON, -- 选择题选项、验证规则等
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_template_fields_template ON template_fields(template_id);
```

#### work信息扩展表 (work_info_extended)
```sql
CREATE TABLE work_info_extended (
    id SERIAL PRIMARY KEY,
    work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES work_templates(id),
    field_values JSON DEFAULT '{}', -- 存储模板字段的具体值
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(work_id, template_id)
);
```

### 4. 章节管理

#### chapters 表
```sql
CREATE TABLE chapters (
    id SERIAL PRIMARY KEY,
    work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    chapter_number INTEGER NOT NULL,
    volume_number INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft', -- draft/published/archived
    word_count INTEGER DEFAULT 0,
    estimated_reading_time INTEGER DEFAULT 0, -- 预估阅读时间（分钟）
    content_hash VARCHAR(32), -- 内容哈希，用于对比
    tags JSON DEFAULT '[]',
    summary TEXT, -- 章节简介
    notes JSON DEFAULT '{}', -- 作者备注
    metadata JSON DEFAULT '{}', -- 扩展元数据
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(work_id, chapter_number)
);

CREATE INDEX idx_chapters_work ON chapters(work_id);
CREATE INDEX idx_chapters_volume ON chapters(volume_number);
CREATE INDEX idx_chapters_status ON chapters(status);
```

#### chapter_versions 表
```sql
CREATE TABLE chapter_versions (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    content_hash VARCHAR(32),
    word_count INTEGER DEFAULT 0,
    change_description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(chapter_id, version_number)
);

CREATE INDEX idx_chapter_versions_chapter ON chapter_versions(chapter_id);
```

#### chapter_yjs_snapshots 表（Yjs 原生快照，Git 式版本历史）
```sql
CREATE TABLE chapter_yjs_snapshots (
    id SERIAL PRIMARY KEY,
    chapter_id INTEGER REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
    label VARCHAR(200),
    snapshot BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_chapter_yjs_snapshots_chapter ON chapter_yjs_snapshots(chapter_id);
```

### 5. 角色和世界观管理

#### characters 表
```sql
CREATE TABLE characters (
    id SERIAL PRIMARY KEY,
    work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100),
    description TEXT,
    avatar_url VARCHAR(255),
    gender VARCHAR(20),
    age INTEGER,
    personality JSON DEFAULT '{}', -- 性格特质
    appearance JSON DEFAULT '{}', -- 外貌描述
    background JSON DEFAULT '{}', -- 背景故事
    relationships JSON DEFAULT '{}', -- 角色关系
    tags JSON DEFAULT '[]',
    is_main_character BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_characters_work ON characters(work_id);
CREATE INDEX idx_characters_main ON characters(is_main_character);
```

#### factions 表
```sql
CREATE TABLE factions (
    id SERIAL PRIMARY KEY,
    work_id INTEGER REFERENCES works(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100),
    description TEXT,
    logo_url VARCHAR(255),
    type VARCHAR(50), -- organization/political/religious/magical/etc.
    scale VARCHAR(30), -- global/regional/local/family
    power_level INTEGER DEFAULT 0, -- 实力等级
    headquarters VARCHAR(200),
    ideology TEXT, -- 理念/宗旨
    structure JSON DEFAULT '{}', -- 组织结构
    relationships JSON DEFAULT '{}', -- 派系关系
    tags JSON DEFAULT '[]',
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_factions_work ON factions(work_id);
```

### 6. 写作辅助功能

#### writing_prompts 表
```sql
CREATE TABLE writing_prompts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    prompt_type VARCHAR(30) NOT NULL, -- scenario/dialogue/character/world_building
    category VARCHAR(50),
    tags JSON DEFAULT '[]',
    difficulty VARCHAR(20), -- beginner/intermediate/advanced
    language VARCHAR(10) DEFAULT 'zh-CN',
    is_public BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    creator_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### ai_analyses 表
```sql
CREATE TABLE ai_analyses (
    id SERIAL PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL, -- work/chapter/character
    target_id INTEGER NOT NULL,
    analysis_type VARCHAR(50) NOT NULL, -- content_analysis/plot_analysis/character_development
    model_name VARCHAR(50),
    analysis_result JSON NOT NULL,
    status VARCHAR(20) DEFAULT 'completed', -- pending/processing/completed/failed
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_analyses_target ON ai_analyses(target_type, target_id);
CREATE INDEX idx_ai_analyses_type ON ai_analyses(analysis_type);
```

### 7. 系统配置和日志

#### system_settings 表
```sql
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSON NOT NULL,
    description TEXT,
    category VARCHAR(50),
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### audit_logs 表
```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- create/update/delete/login/logout
    target_type VARCHAR(50), -- work/chapter/user
    target_id INTEGER,
    details JSON DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
```

## MongoDB (ShareDB) 数据结构

### 1. 章节协作文档
```javascript
// chapters collection
{
  _id: ObjectId,
  chapter_id: Number,           // 对应PostgreSQL的chapters.id
  work_id: Number,              // 对应PostgreSQL的works.id
  content: String,              // 富文本内容
  version: Number,              // ShareDB版本号
  last_editor_id: Number,       // 最后编辑者
  editor_cursors: {},           // 用户光标位置
  created_at: Date,
  updated_at: Date
}
```

### 2. 操作记录
```javascript
// chapter_operations collection
{
  _id: ObjectId,
  chapter_id: Number,
  version: Number,
  operation: Object,            // ShareDB操作详情
  user_id: Number,
  timestamp: Date,
  operation_type: String,       // insert/delete/retain/format
  metadata: Object
}
```

## Redis 缓存结构

### 1. 用户会话
```
session:{user_id} -> {
  user_info: {...},
  permissions: [...],
  last_activity: timestamp
}
```

### 2. 在线协作用户
```
collaborators:work:{work_id} -> Set[user_id]
collaborator_info:{user_id} -> {
  cursor_position: {...},
  current_chapter: chapter_id,
  last_seen: timestamp
}
```

### 3. 实时通知
```
notifications:{user_id} -> List[notification_data]
real_time_updates:work:{work_id} -> List[update_data]
```

## Qdrant 向量数据库设计

### 1. 作品内容向量
```json
{
  "id": "work_{work_id}",
  "vector": [0.1, 0.2, ...],
  "payload": {
    "type": "work",
    "work_id": work_id,
    "title": "作品标题",
    "description": "作品描述",
    "tags": ["标签1", "标签2"],
    "genre": "类型",
    "word_count": 50000
  }
}
```

### 2. 章节内容向量
```json
{
  "id": "chapter_{chapter_id}",
  "vector": [0.1, 0.2, ...],
  "payload": {
    "type": "chapter",
    "chapter_id": chapter_id,
    "work_id": work_id,
    "title": "章节标题",
    "content_preview": "内容预览...",
    "word_count": 2000
  }
}
```

### 3. 用户画像向量
```json
{
  "id": "user_{user_id}",
  "vector": [0.1, 0.2, ...],
  "payload": {
    "type": "user",
    "user_id": user_id,
    "preferences": {...},
    "writing_style": {...},
    "favorite_genres": [...]
  }
}
```

## 数据库索引策略

### PostgreSQL 索引
```sql
-- 复合索引
CREATE INDEX idx_works_owner_status ON works(owner_id, status);
CREATE INDEX idx_chapters_work_volume ON chapters(work_id, volume_number);
CREATE INDEX idx_chapter_versions_chapter_version ON chapter_versions(chapter_id, version_number);

-- GIN索引（JSON字段）
CREATE INDEX idx_works_tags_gin ON works USING GIN(tags);
CREATE INDEX idx_users_preferences_gin ON users USING GIN(preferences);

-- 部分索引
CREATE INDEX idx_active_users ON users(id) WHERE status = 'active';
CREATE INDEX idx_published_works ON works(id) WHERE status = 'published';
```

### Qdrant 索引
使用HNSW（Hierarchical Navigable Small World）索引，支持高效的近似最近邻搜索。

## 数据备份策略

### 1. 定期备份
- PostgreSQL：每日全量备份 + WAL归档
- MongoDB：每小时增量备份 + 每日全量备份
- Redis：每30分钟RDB快照 + AOF日志

### 2. 跨地域复制
- 主库：写入操作
- 从库：读取操作 + 灾备

### 3. 数据迁移
- 结构化数据：PostgreSQL → 导出JSON → 导入新环境
- 非结构化数据：MongoDB → mongodump/mongorestore
- 向量数据：Qdrant → Collection快照