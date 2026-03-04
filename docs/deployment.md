# 部署指南

## 部署架构

```
           用户浏览器
               │
               ▼
          Nginx (80/443)
         /            \
        ▼              ▼
   前端静态文件      API 反向代理
   (/usr/share/      → 后端 FastAPI
    nginx/html)       (端口 8001)
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         PostgreSQL     Redis      MongoDB
```

---

## Docker Compose 部署（推荐）

### 准备工作

1. 服务器安装 Docker 和 Docker Compose

2. 克隆代码仓库：
   ```bash
   git clone <repo-url> qiuqiuwriter
   cd qiuqiuwriter
   ```

3. 配置环境变量：
   ```bash
   cp backend/.env.example docker/.env
   # 编辑 docker/.env，填写生产配置
   ```

### 生产关键配置（`docker/.env`）

```env
# AI 服务（必填）
OPENAI_API_KEY=sk-your-production-key
OPENAI_API_BASE=https://api.deepseek.com/v1
DEFAULT_AI_MODEL=deepseek-chat

# 数据库（使用 Docker 服务名，不是 localhost）
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=StrongProductionPassword!
POSTGRES_DB=writerai

MONGODB_HOST=mongodb
MONGODB_PORT=27017
MONGODB_DATABASE=writerai_sharedb

REDIS_HOST=redis
REDIS_PORT=6379

# 服务器配置
API_HOST=0.0.0.0
API_PORT=8001
```

> **注意：** 生产环境中数据库主机名使用 Docker Compose 服务名（`postgres`、`mongodb`、`redis`），而非 `localhost`。

### 启动生产环境

```bash
cd docker
docker compose -f docker-compose.prod.yml up -d
```

### 查看运行状态

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

### 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并重启应用容器（基础设施不受影响）
docker compose -f docker-compose.prod.yml up -d --build backend frontend
```

---

## 镜像构建

项目提供构建脚本：

```bash
# 构建后端镜像
./build_image.sh
```

或手动构建：

```bash
# 后端
docker build -t qiuqiuwriter-backend:latest ./backend

# 前端（Nginx 镜像）
docker build -t qiuqiuwriter-frontend:latest ./frontend
```

---

## 仅启动基础设施

如果后端/前端在宿主机运行（开发调试场景）：

```bash
cd docker
docker compose -f docker-compose.infra.yml up -d postgres redis mongodb
```

可选启动向量数据库（语义搜索功能）：

```bash
docker compose -f docker-compose.infra.yml up -d qdrant
```

可选启动图数据库（记忆功能）：

```bash
docker compose -f docker-compose.infra.yml up -d neo4j
```

---

## Nginx 配置说明

前端容器使用 Nginx 提供静态文件服务，并将 API 请求反向代理到后端。

关键代理规则：

```nginx
# API 代理
location /api/ {
    proxy_pass http://backend:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# AI 接口代理
location /ai/ {
    proxy_pass http://backend:8001;
}

# WebSocket 支持（实时协同编辑）
location /api/v1/yjs/ {
    proxy_pass http://backend:8001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# 前端 SPA 路由（所有未匹配路径回退到 index.html）
location / {
    try_files $uri $uri/ /index.html;
}
```

> **注意：** Nginx 配置使用服务名（`backend`）而非硬编码 IP，确保容器间正常通信。

---

## 数据备份

### PostgreSQL 备份

```bash
# 备份
docker exec qiuqiuwriter-postgres pg_dump -U postgres writerai > backup_$(date +%Y%m%d).sql

# 恢复
docker exec -i qiuqiuwriter-postgres psql -U postgres writerai < backup_20240101.sql
```

### MongoDB 备份

```bash
# 备份
docker exec qiuqiuwriter-mongodb mongodump --db writerai_sharedb --out /tmp/mongodump
docker cp qiuqiuwriter-mongodb:/tmp/mongodump ./mongodump_$(date +%Y%m%d)

# 恢复
docker cp ./mongodump qiuqiuwriter-mongodb:/tmp/mongodump
docker exec qiuqiuwriter-mongodb mongorestore /tmp/mongodump
```

项目根目录的 `backup.sh` 提供自动化备份脚本：

```bash
./backup.sh
```

---

## 健康检查

项目提供健康检查脚本：

```bash
./health_check.sh
```

所有 Docker 服务均配置了内置健康检查，可通过以下命令查看：

```bash
docker compose ps   # STATUS 列显示 healthy / unhealthy
```

---

## 定时任务

```bash
# 安装 cron 定时任务（自动备份、健康检查等）
./install_cron.sh

# 生产环境任务配置
./setup_prod_tasks.sh
```

---

## 日志管理

生产环境 Docker 配置了日志大小限制：
- 单文件最大：100MB
- 最多保留：3 个文件

查看日志：

```bash
# 实时查看后端日志
docker compose logs -f backend

# 查看最近 100 行
docker compose logs --tail=100 backend
```

---

## 常用运维命令

```bash
# 停止所有容器（保留数据卷）
docker compose down

# 停止并删除所有数据（⚠️ 危险操作，数据不可恢复）
docker compose down -v

# 进入后端容器调试
docker exec -it qiuqiuwriter-backend bash

# 进入 PostgreSQL 控制台
docker exec -it qiuqiuwriter-postgres psql -U postgres writerai

# 查看容器资源使用
docker stats
```
