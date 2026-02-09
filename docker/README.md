# qiuqiuwriter Docker 部署

本目录为**多镜像统一编排**：每个中间件使用官方镜像，通过一份 `docker-compose.yml` 统一启停，便于开发与生产环境一致。

## 服务说明

| 服务       | 镜像               | 端口        | 说明           |
|------------|--------------------|-------------|----------------|
| postgres   | postgres:16-alpine | 5432        | 主业务数据库   |
| redis      | redis:7-alpine     | 6379        | 缓存 / 会话    |
| mongodb    | mongo:7            | 27017       | ShareDB 文档库 |
| qdrant     | qdrant/qdrant      | 6333, 6334  | 向量库（可选）  |
| neo4j      | neo4j:5.26.4       | 7474, 7687  | 图库（可选）   |
| backend    | 自建 Dockerfile    | 8000        | 后端 API（可选）|

## 快速开始

### 1. 准备环境

```bash
cd docker
cp .env.example .env
# 按需修改 .env（如数据库密码）
```

### 2. 只启动基础设施（推荐本地开发）

应用在本机运行，仅用 Docker 提供数据库与中间件：

```bash
docker compose up -d postgres redis mongodb
```

本机后端 `.env` 使用：

- `POSTGRES_HOST=localhost`  
- `REDIS_HOST=localhost`  
- `MONGODB_HOST=localhost`  
- 端口与 `docker/.env` 中一致（如 5432、6379、27017）

### 3. 启动基础设施 + 向量/图库

```bash
docker compose up -d postgres redis mongodb qdrant neo4j
```

### 4. 连同后端一起用 Docker 跑

```bash
docker compose up -d
```

此时后端容器内已通过服务名连接：`postgres`、`redis`、`mongodb`、`qdrant`、`neo4j`，无需改 `.env` 中的 host。

## 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f [服务名]

# 停止并删除容器（保留数据卷）
docker compose down

# 停止并删除容器与数据卷（慎用）
docker compose down -v
```

## 数据持久化

以下卷会持久化，`docker compose down` 不会删除：

- `postgres_data`：PostgreSQL 数据
- `redis_data`：Redis 数据
- `mongodb_data`：MongoDB 数据
- `qdrant_data`：Qdrant 数据
- `neo4j_data` / `neo4j_logs`：Neo4j 数据与日志

## 生产建议

1. 在 `.env` 中为 **POSTGRES_PASSWORD**、**NEO4J_PASSWORD** 等设置强密码。  
2. 需要 Redis 密码时，在 `.env` 中设置 `REDIS_PASSWORD`，并在 `docker-compose.yml` 中为 redis 服务启用带 `--requirepass` 的 command。  
3. MongoDB 若启用认证，需在 compose 中配置 `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` 等，并与后端 `MONGODB_*` 配置一致。  
4. 对外只暴露必要端口，或通过 Nginx/负载均衡反向代理后端与前端。
