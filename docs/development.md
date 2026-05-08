# 开发指南

## 开发环境搭建

参考 [快速开始](./getting-started.md) 完成基础环境搭建。

---

## 后端开发

### 依赖管理

后端使用 **Poetry** 管理 Python 依赖。

```bash
cd backend

# 安装所有依赖（含可选依赖）
make install
# 等价于：poetry install --with extras

# 添加新依赖
poetry add <package-name>

# 添加开发时依赖
poetry add --group dev <package-name>

# 激活虚拟环境
source .venv/bin/activate
```

### 启动开发服务器

```bash
cd backend
make serve
# 等价于：uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001 --reload
```

`--reload` 标志在代码变更时自动重启服务。

### 代码格式化

```bash
cd backend
make format
# 等价于：ruff format . && ruff check --fix .
```

### 运行测试

```bash
cd backend
make test
# 等价于：poetry run pytest tests/ -v

# 运行单个测试文件
poetry run pytest tests/test_specific.py -v

# 运行单个测试用例
poetry run pytest tests/ -k "test_function_name" -v

# 带覆盖率报告
poetry run pytest tests/ --cov=memos --cov-report=html
```

### 数据库迁移

```bash
# 生成迁移文件
poetry run alembic revision --autogenerate -m "add_new_column"

# 执行迁移
poetry run alembic upgrade head

# 回退一个版本
poetry run alembic downgrade -1
```

### API 开发规范

**路由层（routers/）**应尽量薄，主要做：
1. 接收和验证请求参数（依赖 Pydantic Schema）
2. 调用对应的 Service 方法
3. 返回标准化响应

**服务层（services/）**包含全部业务逻辑：
- 数据库读写（通过 SQLAlchemy async session）
- 外部服务调用（AI、Redis 等）
- 业务规则校验

**Schema 层（schemas/）**定义请求/响应模型：
- 请求体用 `BaseModel` 子类
- 使用 `Field()` 添加验证规则和文档注释

**添加新接口示例：**

```python
# 1. 在 schemas/ 中定义 Schema
# schemas/example.py
from pydantic import BaseModel, Field

class ExampleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="名称")
    value: int = Field(default=0, ge=0, description="数值")

# 2. 在 services/ 中实现业务逻辑
# services/example_service.py
async def create_example(db: AsyncSession, data: ExampleCreate) -> dict:
    # 业务逻辑...
    return {"id": 1, "name": data.name}

# 3. 在 routers/ 中添加路由
# routers/example_router.py
from fastapi import APIRouter, Depends
router = APIRouter(prefix="/examples", tags=["examples"])

@router.post("/")
async def create(data: ExampleCreate, db: AsyncSession = Depends(get_db)):
    return await create_example(db, data)

# 4. 在 server_api.py 中注册路由
app.include_router(example_router, prefix="/api/v1")
```

---

## 前端开发

### 依赖管理

前端使用 **npm**（Node ≥ 20，npm ≥ 10）。`frontend/` 和 `admin/` 各有独立的 `node_modules` 与独立的 `package-lock.json`（已纳入版本控制）。

```bash
cd frontend
npm ci               # 按 lockfile 可复现安装（CI、Docker、首次 clone 均使用）
npm install <pkg>    # 仅在新增 / 升级依赖时使用，会更新 lockfile 并需提交
npm run dev          # 启动开发服务器（端口 5173）
npm run build        # 构建生产版本
npm run lint         # ESLint 检查
npm run preview      # 预览生产构建（端口 4173）
```

### 主题系统开发规范

- **禁止**在组件中使用硬编码颜色（如 `#333333`、`color: white`）
- 所有颜色必须使用 CSS 变量：

```css
/* ✅ 正确 */
color: var(--text-primary);
background: var(--bg-surface);

/* ❌ 错误 */
color: #333;
background: white;
```

CSS 变量定义在 `frontend/src/index.css` 的 `:root[data-theme="dark"]` 和 `:root[data-theme="light"]` 块中。

### 添加新页面

1. 在 `frontend/src/pages/` 创建页面组件
2. 在 `frontend/src/App.tsx` 中用懒加载注册路由：

```tsx
// App.tsx
const NewPage = lazy(() => import('./pages/NewPage'));

// 在 Routes 中添加
<Route path="/new-path" element={
  <Suspense fallback={<LoadingSpinner />}>
    <NewPage />
  </Suspense>
} />
```

3. 如果需要登录保护，用 `RequireAuth` 包裹：

```tsx
<Route path="/protected" element={
  <RequireAuth>
    <Suspense fallback={<LoadingSpinner />}>
      <ProtectedPage />
    </Suspense>
  </RequireAuth>
} />
```

### 添加 API 调用

在 `frontend/src/utils/` 中添加或扩展 API 方法：

```typescript
// utils/exampleApi.ts
import { baseApiClient } from './baseApiClient';

export const exampleApi = {
  create: (data: CreateData) =>
    baseApiClient.post('/api/v1/examples', data),

  list: (params?: ListParams) =>
    baseApiClient.get('/api/v1/examples', { params }),
};
```

### TipTap 编辑器扩展

TipTap 插件在 `frontend/src/components/editor/` 目录中：

```typescript
// 自定义扩展示例
import { Extension } from '@tiptap/core';

const MyExtension = Extension.create({
  name: 'myExtension',
  // ...
});
```

---

## 管理后台开发

```bash
cd admin
npm ci
npm run dev
```

管理后台使用 **Ant Design** 组件库，遵循 Ant Design 的设计规范和组件使用方式。

---

## 代码规范

### Python

- 使用 **Ruff** 格式化（`make format`）
- 遵循 PEP 8
- 异步函数使用 `async/await`
- 数据库操作使用 SQLAlchemy 异步 session

### TypeScript / React

- 使用 ESLint（`npm run lint`）
- 组件使用函数式组件 + Hooks
- Props 类型使用 TypeScript interface 定义
- 避免 `any` 类型

---

## 调试技巧

### 后端调试

```python
# 在代码中添加断点（配合 VS Code debugger）
import pdb; pdb.set_trace()

# 或使用 ipdb
import ipdb; ipdb.set_trace()
```

后端 API 文档在开发服务器运行时可访问：
- Swagger UI：http://localhost:8001/docs（支持直接测试接口）
- ReDoc：http://localhost:8001/redoc

### 查看实时日志

```bash
# 后端日志（开发模式下输出到终端）
# 调整日志级别
LOG_LEVEL=DEBUG make serve
```

### 数据库调试

```bash
# 连接 PostgreSQL
docker exec -it qiuqiuwriter-postgres psql -U postgres writerai

# 连接 MongoDB
docker exec -it qiuqiuwriter-mongodb mongosh writerai_sharedb

# 连接 Redis
docker exec -it qiuqiuwriter-redis redis-cli
```

---

## 项目文件结构速查

```
qiuqiuwriter/
├── frontend/src/
│   ├── main.tsx              # 前端入口
│   ├── App.tsx               # 路由配置
│   ├── pages/                # 页面组件
│   ├── components/           # 通用组件
│   └── utils/                # API 客户端、工具函数
│
├── admin/src/
│   └── ...                   # 管理后台（同 frontend 结构）
│
├── backend/src/memos/api/
│   ├── server_api.py         # FastAPI 入口
│   ├── routers/              # HTTP 路由
│   ├── services/             # 业务逻辑
│   ├── models/               # 数据库模型
│   ├── schemas/              # Pydantic Schema
│   ├── llms/                 # AI 模型封装
│   └── core/config.py        # 配置加载
│
├── docker/                   # Docker 配置
│   ├── docker-compose.infra.yml  # 基础设施
│   ├── docker-compose.app.yml    # 应用服务
│   └── docker-compose.prod.yml   # 生产环境
│
└── docs/                     # 项目文档（当前目录）
```
