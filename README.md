# QiuQiuWriter - 蛙蛙写作

一个现代化的写作应用，前端使用 React + TipTap，后端使用 MemOS 记忆系统。

## 项目结构

```
qiuqiuwriter/
├── frontend/          # React 前端应用
│   ├── src/
│   ├── package.json
│   └── ...
├── memos/            # MemOS 后端服务
│   ├── src/
│   ├── pyproject.toml
│   └── ...
└── README.md         # 本文件
```

## 快速开始

### 1. 启动后端服务

```bash
cd memos

# 激活虚拟环境
source .venv/bin/activate

# 启动依赖服务（Qdrant 和 Neo4j）
cd docker
docker-compose up -d qdrant neo4j
cd ..

# 设置环境变量
export ENABLE_PREFERENCE_MEMORY=false

# 启动 API 服务器
uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001 --workers 1
```

### 2. 启动前端服务

```bash
cd frontend

# 安装依赖（首次运行）
npm install

# 启动开发服务器
npm run dev
```

前端将在 http://localhost:5173 运行，后端在 http://localhost:8001 运行。

## 使用启动脚本（推荐）

我们提供了便捷的启动脚本：

```bash
# 启动所有服务
./start.sh

# 或者分别启动
./start-backend.sh   # 启动后端
./start-frontend.sh  # 启动前端
```

## 功能特性

- ✨ 现代化的富文本编辑器（基于 TipTap）
- 📝 文档管理和侧边栏
- 💾 自动保存功能（2秒防抖）
- 🔄 与 MemOS 后端集成
- 🎨 简洁美观的用户界面
- 📱 响应式设计

## 技术栈

### 前端
- React 19
- TypeScript
- Vite
- TipTap (富文本编辑器)
- Lucide React (图标库)

### 后端
- Python 3.10+
- FastAPI
- MemOS (记忆操作系统)
- Qdrant (向量数据库)
- Neo4j (图数据库)

## API 文档

后端 API 文档可在以下地址访问：
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## 开发

### 后端开发

```bash
cd memos
source .venv/bin/activate
# 进行开发...
```

### 前端开发

```bash
cd frontend
npm run dev
# 进行开发...
```

## 许可证

MIT

