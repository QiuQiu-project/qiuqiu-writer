# 球球写作 现代化升级计划

> **状态**：草案 v1
> **更新日期**：2026-05-07
> **适用分支**：`main`
> **预估总工时**：核心 P0+P1 约 15-25 人日；全量执行约 40-50 人日

---

## 0. 升级目标

把 球球写作 从"能跑的现代项目"升级为"具备生产级工程实践的现代项目"。具体落到三件事：

1. **可复现 + 有兜底**：锁文件、CI、smoke test，让任何一次重构都有自动化校验
2. **生产可上线**：消除默认密钥、宽松 CORS、敏感日志泄露等已知安全洞
3. **可持续维护**：拆掉巨型文件、补齐前端测试、补齐 admin 与 frontend 的版本鸿沟

**非目标（明确不做的）**：

- 不做"为了现代而现代"的框架替换（如 React → Solid，FastAPI → Litestar）
- 不做产品级新功能（如 Anthropic SDK 接入、多模型抽象）—— 这些算产品需求
- 不做 K8s 化（除非有上云需求驱动）

---

## 1. 现状评估

### 1.1 总体健康度

| 模块 | 现状 | 健康度 |
|---|---|---|
| **frontend** | React 19.2 / Vite 7.2 / TS 5.9 / Tailwind 4 / ESLint 9 | ✅ 已经很现代 |
| **admin** | React 18 / Vite 5.1 / TS 5.2 / antd 5.14 | ⚠️ 落后 frontend 一个大版本 |
| **backend** | FastAPI 0.115 / SQLAlchemy 2.0 / Python 3.10+ | ✅ 主版本现代，细节有混乱 |
| **测试** | backend 90 个测试文件；frontend / admin **零测试** | ❌ 严重缺失 |
| **CI/CD** | 无 `.github/workflows/`，无自动化 | ❌ 完全缺失 |
| **依赖锁定** | 无 JS lockfile，且 `.gitignore` 主动忽略 | ❌ 安装不可复现 |
| **可观测性** | 仅 `logging.basicConfig`，无结构化日志，无 trace 上报 | ⚠️ 已有 trace_id middleware，但未结构化 |
| **DB 迁移** | 无 Alembic，依赖 `Base.metadata.create_all` | ❌ 缺失 |
| **安全配置** | 默认 SECRET_KEY、`ALLOWED_HOSTS=["*"]`、headers 全量入日志 | ❌ P0 风险 |

### 1.2 已核对的具体问题（事实）

| 问题 | 文件位置 | 现象 |
|---|---|---|
| JS lockfile 被忽略 | `.gitignore:143` | `package-lock.json` 在忽略名单里 |
| 启动时自动建表 | `backend/src/memos/api/core/database.py:98` | `Base.metadata.create_all`，无版本控制 |
| 日志泄露敏感 header | `backend/src/memos/api/middleware/request_context.py:80-82` | 直接 `f"headers: {request.headers}"`，含 Authorization / Cookie |
| 默认 SECRET_KEY 是占位符 | `backend/src/memos/api/core/config.py:46` | `"your-super-secret-key-change-in-production"` |
| CORS / Hosts 默认全通 | `backend/src/memos/api/core/config.py:141` | `ALLOWED_HOSTS: List[str] = ["*"]` |
| Pydantic v1/v2 混用 | `backend/src/memos/api/core/config.py:143` 等 | 还在用 `@validator` 装饰器 |
| 巨型路由 | `backend/src/memos/api/routers/ai_router.py` | 2063 行 / 106KB |
| 巨型路由 | `backend/src/memos/api/routers/product_router.py` | 1958 行 / 95KB |
| 巨型 service | `backend/src/memos/api/services/sharedb_service.py` | ~100KB |
| 巨型 service | `backend/src/memos/api/services/book_analysis_service.py` | ~85KB |
| 阻塞 HTTP 调用混入 async | backend 多处 | 19 处 `requests.*` 调用，11 处 `httpx/aiohttp` 调用 |

---

## 2. 分阶段升级计划

### Phase 0 — 安全网与安全加固（2-3 天，**P0 必须先做**）

> 在做 Pydantic、admin 升级、async 化之前，先让 install / build / test 可复现，并堵住已知的安全洞。
> 拆成 5 个独立 PR，每个都可以独立 review、独立 merge、独立回滚。

#### P0-1 · 统一 JS 包管理 + 提交 lockfile

**目的**：让 install 可复现，给 CI 提供稳定基础

**决策（2026-05-08）**：选用 **npm**（Node ≥ 20，npm ≥ 10）。理由：不引入新工具、与现有 `start.sh` / `Makefile` / `deploy.sh` 兼容、Docker 镜像零改动；后续若需 monorepo 红利再评估迁 pnpm。

| 方案 | 优点 | 缺点 |
|---|---|---|
| pnpm | 磁盘节省、monorepo 友好、worktree 友好、安装快 | 引入新工具，团队需学习 |
| **npm（已选）** | 不引新工具、最保守、与现有脚本/镜像兼容 | 没有 monorepo 红利，磁盘占用高 |

**动作清单**：

- [x] 选定包管理器并在 `CLAUDE.md` / `README.md` 中写明 —— **决策：npm**（Node ≥ 20，npm ≥ 10）
- [x] 删除 `.gitignore` 那一行 `package-lock.json`
- [x] `frontend/`、`admin/` 各跑一次 `npm install` 生成 lockfile 并提交（frontend 9695 行 / 248KB；admin 3664 行 / 130KB；均通过 `npm ci` 复现校验）
- [x] 两个 `package.json` 加 `"engines": { "node": ">=20", "npm": ">=10" }`
- [x] `start.sh` / `Makefile` / `deploy.sh` 中的安装命令改为 `npm ci`（保留 `npm install` 回退路径并加警告）
- [x] 同步更新 `README.md`、`docs/getting-started.md`、`docs/development.md`、`frontend/README.md`，明确"首次 / CI / Docker 使用 `npm ci`，新增依赖才用 `npm install <pkg>`"

#### P0-2 · GitHub Actions 最小集

**目的**：每次 PR 都跑 lint + build + smoke test，refactor 才有兜底

**动作清单**：

- [ ] `.github/workflows/backend.yml`
  - 触发：`pull_request`、`push: [main]`
  - 步骤：checkout → setup-python 3.11 → `poetry install --with extras` → `ruff check` → `ruff format --check` → `pytest -x --maxfail=5`
- [ ] `.github/workflows/web.yml`
  - 触发：同上
  - matrix：`workspace: [frontend, admin]`
  - 步骤：checkout → setup-node 20（带 `cache: npm`、`cache-dependency-path: ${{ matrix.workspace }}/package-lock.json`）→ `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm run build`
- [ ] 两个 workflow 都加 `concurrency: group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true`
- [ ] **不加** Docker build / push（等 P0 稳定再上）

#### P0-3 · 日志脱敏（最紧急的安全洞）

**目的**：堵住 `request_context.py:80` 的明文 Authorization / Cookie 泄露

**动作清单**：

- [ ] 新建 `backend/src/memos/api/utils/log_redact.py`
  - 函数 `redact_headers(headers: Mapping, allowlist: set[str]) -> dict`
  - 默认白名单：`{"x-request-id", "x-trace-id", "x-env", "user-agent", "content-type", "accept"}`
  - 其余字段值替换为 `"[REDACTED]"`
- [ ] 修改 `backend/src/memos/api/middleware/request_context.py:80-82`
  - 把 `f"headers: {request.headers}"` 改成 `f"headers: {redact_headers(request.headers)}"`
- [ ] 全仓 grep 一遍 `logger.*headers`、`logger.*body`、`print.*headers`，确认没有别处遗漏
- [ ] 写一个针对 `redact_headers` 的单测

#### P0-4 · 环境变量强校验

**目的**：让生产环境无法用默认密钥 / 通配 hosts 启动

**动作清单**：

- [ ] `config.py` 加 `model_validator(mode='after')`：
  - 当 `ENVIRONMENT == "production"` 时：
    - `SECRET_KEY` 不能等于 `"your-super-secret-key-change-in-production"` 且长度 ≥ 32
    - `ALLOWED_HOSTS` 不能含 `"*"`，且必须非空
    - `CORS_ORIGINS` 不能含 `"*"`
  - 校验失败直接抛 `ValueError`，让应用启动失败（fail-fast）
- [ ] `.env.example` 补齐：
  ```
  SECRET_KEY=    # REQUIRED in production. Generate with: openssl rand -hex 32
  ALLOWED_HOSTS=localhost,127.0.0.1    # Comma-separated, NEVER use * in production
  ENVIRONMENT=development    # development | staging | production
  ```
- [ ] 在 `docs/configuration.md` 中补一段 production 部署配置清单

#### P0-5 · 最小 smoke test 脚手架

**目的**：把测试目录、配置文件先立起来，后续重构时直接往里补

**动作清单**：

- [ ] backend：`tests/test_smoke.py`
  - `test_health_endpoint` → 调 `/health` 返回 200
  - `test_app_startup` → 用 `TestClient` 启动应用不崩
- [ ] frontend：装 `vitest` + `@testing-library/react` + `happy-dom`
  - `vite.config.ts` 加 `test` 配置
  - `src/App.test.tsx` 渲染不崩
  - `package.json` 加 `"test": "vitest"`
- [ ] admin：同 frontend
- [ ] CI 工作流补 `npm test -- --run`

**Phase 0 完成判定**：
- 任何人 clone 仓库后，能用一条命令完成 backend + frontend + admin 的 install
- 任何 PR 都会自动跑 lint + build + smoke test
- 生产环境用默认 SECRET_KEY 启动会立刻报错
- 日志里搜不到 `Bearer ` 或 `Cookie:`

---

### Phase 1 — 后端基础现代化（约 1 周，P1）

#### 1.1 Alembic 接入（**注意：不是 1 天能搞定**）

**前置认识**：当前 `database.py:98` 用 `Base.metadata.create_all` 在启动时建表。接入 Alembic 是个多步迁移，不是装个包就完事。

**动作清单**：

- [ ] `poetry add alembic`，`alembic init -t async migrations`（用 async 模板，匹配 `asyncpg`）
- [ ] 配 `alembic.ini` 与 `migrations/env.py` 走 async engine + 复用 `config.py` 的 DSN
- [ ] 在**已有数据**的环境上跑 `alembic revision --autogenerate -m "baseline"`，得到首版基线
- [ ] 用 `alembic stamp head` 把基线打到现有数据库（不实际执行 SQL）
- [ ] 把 `init_db()` 里的 `Base.metadata.create_all` 改为：
  - 开发环境：保留（提速本地启动）
  - 生产环境：禁用，必须 `alembic upgrade head`
- [ ] `Makefile` 加 `make migrate` / `make migration name=xxx`
- [ ] CI 加一步：`alembic upgrade head` 跑一遍空库，确认迁移可执行
- [ ] `docs/development.md` 补一段 schema 变更流程

**风险**：autogenerate 不一定能完美捕捉所有现有 schema（特别是 enum、index 名）—— 生成基线后必须人工 diff 一遍。

#### 1.2 Pydantic v1 → v2 完整迁移

**当前状态**：FastAPI 0.115 已经走 Pydantic v2，但 schema 文件混用 `@validator` 和 `field_validator`。

**动作清单**：

- [ ] 全仓 grep `from pydantic import.*validator`、`@validator`、`@root_validator`，列清单
- [ ] 用 `bump-pydantic` 工具自动迁移：`pip install bump-pydantic && bump-pydantic backend/src`
- [ ] 人工 review 每个改动，重点看：
  - `pre=True` → `mode='before'`
  - `always=True` → 默认行为变了
  - `Optional[X] = None` 默认值校验差异
  - `Config` 类 → `model_config = ConfigDict(...)`
- [ ] 跑全量测试，重点验请求校验是否还按预期失败
- [ ] 回归测试 admin 与 frontend 调 API 的边界场景

#### 1.3 异步 HTTP 改造（仅热路径）

**前置认识**：19 处 `requests.*` 不是都要换。CLI、日志上报、reranker、批处理工具都不在 async 请求链路里，换了反而增加复杂度。

**动作清单**：

- [ ] 列出所有 `requests.*` 调用位置，按"是否在 FastAPI request handler 调用栈中"分类
- [ ] 在 async 路径里的（LLM 调用、外部 API 集成等）全部换 `httpx.AsyncClient`
  - 用单例 client（在 lifespan 里创建/关闭），不要每次新建
  - 配统一超时、重试策略
- [ ] CLI / 同步工具保留 `requests`，加注释说明"故意不 async"
- [ ] 第三方 SDK 没 async 版本的，包一层 `await asyncio.to_thread(...)`

#### 1.4 安全配置补强（接 Phase 0 之后做更深的）

- [ ] CORS：开发与生产分流，生产白名单写在 env
- [ ] Token 过期时间审视（当前 30 天 access token 偏长，见 `config.py:48`）
- [ ] 加 dependency scan：`pip-audit` + `npm audit` 进 CI

---

### Phase 2 — 拆大文件（1-2 周，P1）

> **铁律**：拆之前先补 characterization tests，否则只是文件搬家却引入行为回归。

#### 2.1 拆 `ai_router.py`（2063 行）

- [ ] 先用 `pytest --collect-only` + 实际请求录制，对每条路由写一个最小集成测试（覆盖正常 + 一个错误分支）
- [ ] 按业务域拆：
  - `routers/ai/chapters.py` — 章节生成相关
  - `routers/ai/analysis.py` — 内容分析相关
  - `routers/ai/chat.py` — 对话相关
  - `routers/ai/__init__.py` — 聚合 router
- [ ] 每个子 router 文件目标 < 500 行
- [ ] 重新跑测试，diff 对比响应

#### 2.2 拆 `product_router.py`（1958 行）

同 2.1 流程，按业务域拆成 `templates.py` / `works.py` / `volumes.py` 等。

#### 2.3 拆 `sharedb_service.py`（~100KB）与 `book_analysis_service.py`（~85KB）

- [ ] sharedb 按操作类型拆：document ops / presence / persistence
- [ ] book_analysis 按分析维度拆：character / plot / structure
- [ ] 用 `pydeps` 检查依赖图，避免 import 循环

---

### Phase 3 — admin 与前端质量（约 1 周，P1）

#### 3.1 admin 分步升级（不要一步到位）

**Step 1**：Vite 5 → 7、TypeScript 5.2 → 5.9（不动 React）
- [ ] 升级，跑 build，修类型错误
- [ ] 此时 React 还是 18，所有 antd / antd-pro 行为不变

**Step 2**：React 18 → 19 + react-router 6 → 7
- [ ] 验 antd 5.20+ 对 React 19 的支持
- [ ] 验所有自定义组件（特别是用 `forwardRef`、`useImperativeHandle` 的）
- [ ] 验 antd-pro / icons 版本兼容

**Step 3**：与 frontend 共享配置
- [ ] 抽取 `tsconfig.base.json`、`eslint.config.base.js`
- [ ] 让 frontend / admin 都 extends 共享配置

#### 3.2 frontend / admin 测试补齐

**优先级**（按价值排序）：

1. **API client**（`utils/api.ts`、`utils/authApi.ts` 等）—— 工具函数好测，覆盖率高
2. **鉴权流程**（`RequireAuth`、登录、token 刷新）—— 安全相关
3. **核心编辑路径**（TipTap + Yjs 协同编辑）—— 用 happy-dom + Yjs mock
4. **关键 hooks**（自定义 hook 单测）

起步目标 **30% 覆盖率**，后续慢慢提到 60%。

#### 3.3 E2E（可选，按需）

- [ ] 装 Playwright
- [ ] 录制核心路径：登录 → 创建作品 → 编辑章节 → 保存
- [ ] CI 加一个 nightly job 跑 E2E

---

### Phase 4 — 可观测性与架构演进（按需，P2-P3）

#### 4.1 结构化日志（接续 Phase 0 的脱敏）

- [ ] backend 引入 `structlog`，logger 全部走结构化
- [ ] 复用现有 `request_context.py` 的 trace_id，注入到每条日志
- [ ] 日志级别按环境分（生产 INFO，开发 DEBUG）

#### 4.2 OpenTelemetry

- [ ] 装 `opentelemetry-instrumentation-fastapi` + `opentelemetry-instrumentation-sqlalchemy`
- [ ] trace 推 Jaeger / Tempo
- [ ] metrics 推 Prometheus
- [ ] 复用现有 trace_id，跨服务串联

#### 4.3 frontend Sentry

- [ ] 装 `@sentry/react`，挂在 `main.tsx`
- [ ] 关联 frontend trace_id 与 backend trace_id

#### 4.4 架构演进（产品需求驱动）

- [ ] **monorepo 化**：pnpm workspaces，抽 `packages/shared-types`、`packages/api-client`
- [ ] **AI 提供商抽象**：strategy pattern，给后续接 Claude / DeepSeek / 国产模型留口
- [ ] **Anthropic SDK 接入**：算产品需求，由产品决定优先级
- [ ] **K8s 化**：算部署需求，有上云 / 弹性扩容场景再做

---

## 3. 风险与注意事项

| 风险 | 影响 | 缓解 |
|---|---|---|
| Pydantic v2 校验行为差异 | 既有请求从通过变成失败 | 先把测试覆盖率提上去再迁；线上灰度发布 |
| 拆大文件引入 import 循环 | backend 启动失败 | 用 `pydeps` 出依赖图；拆之前先 characterization test |
| admin 升级 React 19 卡 antd 生态 | admin 整体不可用 | Step 1 先升 Vite/TS 验证基础；Step 2 单独建 PR 灰度 |
| 第三方 SDK 没 async 版本 | async 化改造卡壳 | `await asyncio.to_thread(...)` 兜底；不要硬改第三方 |
| Alembic baseline 不准 | 生产数据库 schema drift | 在生产副本上 dry-run；diff 完整 schema |

---

## 4. 推荐执行顺序

```
Week 1:    Phase 0 (P0-1 → P0-2 → P0-3 + P0-4 并行 → P0-5)
Week 2:    Phase 1.1 (Alembic) + Phase 1.2 (Pydantic v2)
Week 3:    Phase 1.3 (async HTTP 热路径) + Phase 1.4 (安全补强)
Week 4-5:  Phase 2 (拆大文件，先补 characterization test)
Week 6:    Phase 3.1 (admin 分步升级)
Week 7:    Phase 3.2 (前端测试)
Week 8+:   Phase 4 (按需)
```

---

## 5. 待决策项

在动手 Phase 0 之前，需要明确：

- [x] ~~**包管理器**：pnpm（推荐）vs npm？~~ → **决议：npm**（2026-05-08，P0-1 落地）
- [x] ~~**Node 版本下限**：20.x 还是 22.x？~~ → **决议：Node ≥ 20**（2026-05-08，写入两个 `package.json` 的 `engines` 字段）
- [ ] **CI 平台**：GitHub Actions（推荐，仓库已在 GitHub）vs 其他？
- [ ] **生产环境识别方式**：用 `ENVIRONMENT` 环境变量 vs 其他约定？
- [ ] **Sentry / 可观测性平台**：自建 vs SaaS（Sentry / Datadog / 阿里云 ARMS）？
- [ ] **Phase 4 是否纳入本轮范围**，还是另起一轮？

---

## 6. 跟踪与更新

- 每个 Phase 完成后在本文档末尾追加 changelog
- 每个 PR 在描述里引用对应章节（如 `Refs: docs/upgrade-plan.md#p0-1`）
- 计划如有调整，更新本文档头部的"状态 / 更新日期"

### Changelog

- **2026-05-07** — v1 草案，待确认包管理器选型后启动 Phase 0
- **2026-05-08** — P0-1 落地：选定 npm 作为 JS 包管理器（Node ≥ 20，npm ≥ 10）；提交 `frontend/package-lock.json`（805 packages）与 `admin/package-lock.json`（205 packages）；从 `.gitignore` 移除 lockfile 忽略项；`start.sh` / `Makefile` / `deploy.sh` 切换到 `npm ci`；两个 `package.json` 加 `engines` 字段；同步更新 `README.md`、`CLAUDE.md`、`docs/getting-started.md`、`docs/development.md`、`frontend/README.md`。`npm ci` 在两个项目上验证通过（frontend 1m / admin 4s，均 exit 0）。
