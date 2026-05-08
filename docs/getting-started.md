# 快速开始

## 前置条件

| 工具 | 版本要求 |
|------|----------|
| Node.js | 20+（前端要求 npm ≥ 10） |
| Python | 3.10+ |
| Docker & Docker Compose | 任意最新版 |
| Poetry | 1.8+ |

## 一键启动（推荐）

```bash
# 克隆仓库后，在项目根目录执行
./start.sh
```

该脚本会自动启动基础设施容器、后端服务和前端开发服务器。

---

## 手动逐步启动

### 第一步：启动基础设施

```bash
cd docker
docker compose -f docker-compose.infra.yml up -d postgres redis mongodb
```

等待所有容器健康检查通过（约 10-30 秒）：

```bash
docker compose ps   # STATUS 列应显示 healthy
```

### 第二步：配置后端环境变量

```bash
cd backend
cp .env.example .env
```

打开 `.env`，至少填写以下必要配置：

```env
# AI 服务（必填）
OPENAI_API_KEY=your_api_key_here
OPENAI_API_BASE=https://api.deepseek.com/v1   # 或 OpenAI 官方地址
DEFAULT_AI_MODEL=deepseek-chat

# 数据库（与 docker-compose.infra.yml 保持一致，无需修改）
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=writerai
```

完整配置项说明见 [配置参考](./configuration.md)。

### 第三步：安装后端依赖并启动

```bash
cd backend
make install    # 等价于 poetry install --with extras
make serve      # 启动开发服务器，端口 8001
```

或手动启动：

```bash
source .venv/bin/activate
uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001 --reload
```

后端启动成功后，可访问 API 文档：
- Swagger UI：http://localhost:8001/docs
- ReDoc：http://localhost:8001/redoc

### 第四步：安装前端依赖并启动

```bash
cd frontend
npm ci          # 按 package-lock.json 可复现安装；新增依赖时改用 npm install <pkg>
npm run dev     # 开发服务器，端口 5173
```

前端通过 Vite 代理将 `/api`、`/ai`、`/v1` 请求转发到后端 `http://127.0.0.1:8000`。

### 第五步：启动管理后台（可选）

```bash
cd admin
npm ci
npm run dev
```

---

## 验证安装

打开浏览器访问 http://localhost:5173，若显示首页则说明前后端均已正常启动。

**首次使用注册账号：** 注册需要邀请码，可通过管理后台生成（见[管理后台功能](./features.md#管理后台)）。

---

## 常见问题

### 数据库连接失败

检查 Docker 容器是否正常运行：

```bash
docker ps
docker compose -f docker/docker-compose.infra.yml logs postgres
```

### 端口冲突

默认端口：
- 前端：5173
- 后端：8001
- PostgreSQL：5433
- MongoDB：27017
- Redis：6379

如有冲突，修改 `docker-compose.infra.yml` 中的端口映射，并同步更新 `backend/.env`。

### AI 接口无响应

确认 `.env` 中的 `OPENAI_API_KEY` 和 `OPENAI_API_BASE` 配置正确，可用 `curl` 测试：

```bash
curl -H "Authorization: Bearer $OPENAI_API_KEY" $OPENAI_API_BASE/models
```
