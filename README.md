<div align="center">

<img src="frontend/public/logo.svg" width="64" height="64" alt="logo" />

# 球球写作

**让创作更简单，让故事更精彩**

专业的 AI 写作助手，帮助你从灵感到成稿，轻松完成每一部作品。

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

![hero](docs/screenshots/hero.png)

---

## 功能亮点

### 🖊️ 智能写作工作台

整理、管理并继续完善你的小说与剧本创作资产。支持卡片与列表两种视图，快速定位每一部作品。

![workbench](docs/screenshots/workbench.png)

---

### ✨ 核心功能一览

智能写作助手、多格式支持、多人 AI 协作、云端同步、实时编辑、多层记忆系统——一站式满足各类创作需求。

![features](docs/screenshots/features.png)

---

### 📖 沉浸式编辑器

基于 TipTap 的富文本编辑器，支持小说、剧本多种写作模式，所见即所得，章节结构清晰直观。

![editor](docs/screenshots/editor.png)

---

### 🤖 AI 协作助手

在编辑器内直接与 AI 对话，辅助续写、润色、情节分析。多人协作时 AI 同步为每位作者提供实时支持。

![ai-assistant](docs/screenshots/ai-assistant.png)

---

### 🎯 适用于各类创作场景

无论你是专业作家还是写作爱好者，球球写作都能满足你的需求。

![usecases](docs/screenshots/usecases.png)

---

## 技术栈

### 前端（frontend/）
- React 19 + TypeScript + Vite
- TipTap 富文本编辑器
- Yjs CRDT 协同编辑（y-websocket、y-indexeddb、y-webrtc）
- React Router v7（懒加载路由）

### 管理后台（admin/）
- React 18 + Ant Design
- 独立 Vite 应用，与前端分离

### 后端（backend/）
- FastAPI + Python 3.10+
- Poetry 依赖管理
- SQLAlchemy ORM（PostgreSQL）
- Pydantic 请求/响应校验
- AI 集成：支持 OpenAI 兼容接口（默认 DeepSeek）、Ollama 等

### 数据库

| 服务 | 用途 | 必须 |
|------|------|------|
| PostgreSQL | 主数据库（用户、作品、章节） | ✅ |
| Redis | 缓存与会话 | ✅ |
| MongoDB | ShareDB 协同文档存储 | ✅ |
| Qdrant | 向量数据库（语义搜索） | 可选 |
| Neo4j | 图数据库（记忆功能） | 可选 |

---

## 项目结构

```
qiuqiuwriter/
├── frontend/        # 用户端前端（React 19 + TypeScript + Vite，端口 5173）
├── admin/           # 管理后台（React 18 + Ant Design，独立 Vite 应用）
├── backend/         # API 服务器（FastAPI + Python 3.10+，端口 8001）
├── docker/          # Docker 基础设施配置
│   ├── docker-compose.infra.yml   # 基础服务（PostgreSQL、Redis、MongoDB）
│   ├── docker-compose.app.yml     # 应用服务（前后端容器）
│   └── docker-compose.prod.yml    # 生产环境配置
├── deploy/          # 部署相关脚本
├── start.sh         # 一键启动脚本
└── README.md
```

---

## 快速开始

### 前置条件

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose

### 1. 启动基础设施

```bash
cd docker
docker compose -f docker-compose.infra.yml up -d postgres redis mongodb
```

### 2. 配置后端环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env，填写 OPENAI_API_KEY 等配置
```

主要配置项：

```env
# AI 服务
OPENAI_API_KEY=your_key_here
OPENAI_API_BASE=https://api.deepseek.com/v1
DEFAULT_AI_MODEL=deepseek-chat

# 数据库（与 docker-compose.infra.yml 保持一致）
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=writerai

REDIS_HOST=localhost
REDIS_PORT=6379

MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DATABASE=writerai_sharedb
```

### 3. 启动后端

```bash
cd backend
make install   # 安装依赖（首次运行）
make serve     # 启动开发服务器（端口 8001）
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev    # 启动开发服务器（端口 5173）
```

### 5. 启动管理后台（可选）

```bash
cd admin
npm install
npm run dev
```

### 一键启动（推荐）

```bash
./start.sh
```

---

## 开发命令

### 前端

```bash
cd frontend
npm run dev       # 开发服务器（端口 5173）
npm run build     # 构建生产版本
npm run lint      # ESLint 检查
npm run preview   # 预览生产构建（端口 4173）
```

### 后端

```bash
cd backend
make install      # 安装依赖
make test         # 运行测试
make format       # 格式化代码（Ruff）
make serve        # 启动开发服务器

# 运行指定测试
poetry run pytest tests/test_specific.py -v
poetry run pytest tests/ -k "test_name" -v
```

---

## API 文档

后端启动后访问：
- Swagger UI：http://localhost:8001/docs
- ReDoc：http://localhost:8001/redoc

API 路由前缀：
- 主接口：`/api/v1/`
- AI 服务：`/v1/`

---

## 生产部署

```bash
cd docker
docker compose -f docker-compose.prod.yml up -d
```

生产环境变量配置在 `docker/.env`（参考 `backend/.env.example`）。

---

## 许可证

[MIT](LICENSE)
