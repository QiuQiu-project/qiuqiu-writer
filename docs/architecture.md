# 系统架构

## 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器 / 客户端                        │
│   ┌──────────────────┐          ┌──────────────────────┐     │
│   │   用户端前端       │          │      管理后台          │     │
│   │ React 19 + Vite  │          │  React 18 + Ant Design│     │
│   │    端口 5173      │          │      独立端口          │     │
│   └────────┬─────────┘          └──────────┬───────────┘     │
└────────────┼──────────────────────────────┼─────────────────┘
             │ HTTP / WebSocket              │ HTTP
             ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI 后端 (端口 8001)                    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  路由层   │  │  服务层   │  │  模型层   │  │  Schema层 │  │
│  │ routers/ │→ │services/ │→ │ models/  │  │ schemas/  │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
│                     │                                       │
│                  ┌──┴──┐                                    │
│                  │ LLM │ (ai_service / llms/)               │
│                  └─────┘                                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │PostgreSQL│  │  Redis   │  │ MongoDB  │
    │ 主数据库  │  │ 缓存/会话 │  │ShareDB文档│
    └──────────┘  └──────────┘  └──────────┘
```

---

## 前端架构

### 目录结构

```
frontend/src/
├── main.tsx              # 入口：调用 initTheme() 后渲染 React 应用
├── App.tsx               # 路由定义（React Router v7，懒加载）
├── pages/                # 页面组件
│   ├── HomePage.tsx      # 首页 / 落地页
│   ├── UserWorksPage.tsx # 用户个人作品库
│   ├── NovelEditorPage.tsx   # 小说编辑器
│   ├── ScriptEditorPage.tsx  # 剧本编辑器
│   ├── WorksPage.tsx     # 公开作品广场
│   └── UGCPlaza.tsx      # UGC 内容广场
├── components/
│   ├── layout/           # 主布局、导航
│   ├── auth/             # 登录、注册、权限守卫
│   ├── editor/           # TipTap 编辑器（含 Yjs 插件）
│   ├── home/             # 首页专属组件
│   └── common/           # 通用 UI 组件
└── utils/
    ├── baseApiClient.ts  # 基础 HTTP 客户端（axios 封装）
    ├── api.ts            # 通用 API 调用
    ├── authApi.ts        # 认证相关 API
    ├── chaptersApi.ts    # 章节 API
    ├── bookAnalysisApi.ts# 书籍分析 API
    ├── chatApi.ts        # AI 聊天 API
    └── theme.ts          # 主题系统
```

### 路由结构

| 路径 | 页面 | 是否需要登录 |
|------|------|:---:|
| `/` | 首页 | 否 |
| `/works` | 跳转到个人作品页 | 是 |
| `/users/:userId` | 用户作品库 | 是 |
| `/novel` | 小说广场 | 否 |
| `/script` | 剧本广场 | 否 |
| `/ugc-plaza` | UGC 内容广场 | 否 |
| `/novel/editor` | 小说编辑器 | 是 |
| `/script/editor` | 剧本编辑器 | 是 |

### 主题系统

- 通过 `<html data-theme="dark|light">` 属性切换
- 所有颜色使用 CSS 变量，定义在 `src/index.css`
- **不允许**在组件中硬编码颜色值

### API 代理（开发环境）

`vite.config.ts` 配置的代理规则：

| 前缀 | 转发目标 |
|------|----------|
| `/api` | `http://127.0.0.1:8000` |
| `/ai` | `http://127.0.0.1:8000` |
| `/v1` | `http://127.0.0.1:8000` |

---

## 后端架构

### 目录结构

```
backend/src/memos/api/
├── server_api.py         # FastAPI 应用入口，注册路由、中间件、异常处理
├── routers/              # HTTP 路由层（薄层，委托给 services）
│   ├── auth_router.py
│   ├── work_router.py
│   ├── chapter_router.py
│   ├── ai_router.py      # ~99KB，AI 功能路由
│   ├── product_router.py # ~89KB，产品级 AI 功能
│   ├── admin_router.py
│   ├── feedback_router.py
│   ├── template_router.py
│   ├── prompt_template_router.py
│   ├── volume_router.py
│   ├── sharedb_router.py
│   └── yjs_router.py
├── services/             # 业务逻辑层
├── models/               # SQLAlchemy ORM 模型（PostgreSQL）
├── schemas/              # Pydantic 请求/响应 Schema
├── llms/                 # AI 模型提供商封装
└── core/
    └── config.py         # Settings 类（从 .env 加载所有配置）
```

### 分层职责

```
路由层 (routers/)
  ├── 接收 HTTP 请求，解析参数
  ├── 调用服务层方法
  └── 返回标准化响应

服务层 (services/)
  ├── 实现业务逻辑
  ├── 调用 ORM 操作数据库
  ├── 调用 AI 接口
  └── 处理复杂业务规则

模型层 (models/)
  ├── SQLAlchemy 异步 ORM
  └── PostgreSQL 表定义

Schema 层 (schemas/)
  ├── 请求体验证（Pydantic BaseModel）
  └── 响应体序列化
```

---

## 数据库设计

### PostgreSQL（主数据库）

| 表 | 说明 |
|----|------|
| `users` | 用户账户（id, username, email, password_hash, 个人资料） |
| `works` | 创作作品（id, title, work_type, status, owner_id, word_count） |
| `chapters` | 章节（id, work_id, chapter_number, volume_number, word_count） |
| `volumes` | 卷（id, work_id, volume_number, title, outline） |
| `templates` | 作品模板 |
| `prompt_templates` | AI 提示词模板（含版本管理） |
| `feedback` | 用户反馈 |
| `yjs_documents` | Yjs 快照存储（二进制） |

### MongoDB（ShareDB 文档存储）

用于实时协同编辑的文档操作存储：

```json
{
  "document_id": "chapter_{chapter_id}",
  "content": { /* 文档内容（JSON 格式） */ },
  "version": 42,
  "metadata": { /* 附加元数据 */ }
}
```

### Redis（缓存与会话）

- Session 存储：`session:{user_id}`
- Token 黑名单（登出后的 JWT）
- 接口响应缓存

---

## 实时协同编辑

### 架构

```
浏览器 A          浏览器 B
   │                 │
   │  WebSocket      │  WebSocket
   └────────┬────────┘
            ▼
      Yjs WS Handler
      (yjs_ws_handler.py)
            │
            ▼
      Yjs Service
      (yjs_service.py)
            │
    ┌───────┴───────┐
    ▼               ▼
PostgreSQL        MongoDB
(Yjs 快照)      (ShareDB 文档)
```

### 技术方案

- **CRDT 算法**：Yjs（y-websocket + y-indexeddb + y-webrtc）
- **文档同步**：ShareDB + MongoDB 后端
- **离线支持**：y-indexeddb 本地持久化
- **版本管理**：Yjs 快照 API（可标记、恢复历史版本）

---

## AI 集成

### AI 服务层

```
ai_router.py / product_router.py
         │
         ▼
   ai_service.py
         │
   ┌─────┴──────┐
   ▼            ▼
llms/          book_analysis_service.py
(提供商封装)    (书籍分析，最大服务 87KB)
```

### 支持的 AI 提供商

| 提供商 | 配置方式 |
|--------|---------|
| DeepSeek（默认） | `OPENAI_API_BASE=https://api.deepseek.com/v1` |
| OpenAI | `OPENAI_API_BASE=https://api.openai.com/v1` |
| Ollama（本地） | `OPENAI_API_BASE=http://localhost:11434/v1` |
| 任意 OpenAI 兼容接口 | 修改 `OPENAI_API_BASE` 即可 |

### 可选高级功能

| 功能 | 依赖 | 配置 |
|------|------|------|
| 语义搜索 | Qdrant 向量数据库 | `DISABLE_QDRANT=false` |
| 记忆系统 | Neo4j + MemOS | `DISABLE_NEO4J=false` |
| 偏好记忆 | MemOS | `ENABLE_PREFERENCE_MEMORY=true` |
