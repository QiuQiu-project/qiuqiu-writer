# WriterAI Backend

智能写作平台后端服务，提供用户管理、作品创作、实时协作等功能。

## 🚀 功能特性

### 核心功能
- **用户认证系统**: JWTtoken认证，支持注册、登录、权限管理
- **作品管理**: 支持小说、剧本等多种作品类型的创建和管理
- **实时协作编辑**: 基于ShareDB的多人实时协作章节编辑
- **模板系统**: 动态作品信息模板，支持自定义字段
- **权限控制**: 细粒度的作品访问和编辑权限管理
- **审计日志**: 完整的用户操作审计追踪

### 技术特性
- **异步架构**: 基于FastAPI的高性能异步API
- **多数据库支持**: PostgreSQL + Redis + MongoDB + Qdrant
- **实时通信**: WebSocket支持实时协作
- **缓存优化**: Redis缓存提升响应速度
- **安全防护**: 完善的安全中间件和认证机制

## 🏗️ 技术架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   前端应用      │───▶│  FastAPI服务    │───▶│   PostgreSQL    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │     Redis       │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   ShareDB/MongoDB│
                       └─────────────────┘
```

### 技术栈
- **Web框架**: FastAPI + Uvicorn
- **数据库**: PostgreSQL (主数据库) + Redis (缓存) + MongoDB (ShareDB) + Qdrant (向量数据库)
- **认证**: JWT + bcrypt密码加密
- **实时协作**: ShareDB + WebSocket
- **数据验证**: Pydantic
- **ORM**: SQLAlchemy (异步)
- **缓存**: Redis
- **容器化**: Docker

## 📦 安装部署

### 环境要求
- Python 3.8+
- PostgreSQL 12+
- Redis 6+
- MongoDB 4.4+ (可选，用于ShareDB)
- Qdrant 1.0+ (可选，用于向量搜索)

### 本地开发

1. **克隆项目**
```bash
git clone <repository-url>
cd backend
```

2. **创建虚拟环境**
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. **安装依赖**
```bash
pip install -r requirements.txt
```

4. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等信息
```

5. **初始化数据库**
```bash
# 创建数据表
python -c "from app.main import app; import asyncio; asyncio.run(app.router.startup())"
```

6. **启动服务**
```bash
python run.py
# 或使用 uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker部署

1. **构建镜像**
```bash
docker build -t writerai-backend .
```

2. **运行容器**
```bash
docker run -d \
  --name writerai-backend \
  -p 8000:8000 \
  --env-file .env \
  writerai-backend
```

## 🔧 配置说明

### 环境变量配置

主要配置项说明：

```bash
# 应用基础配置
DEBUG=true
HOST=0.0.0.0
PORT=8000

# 数据库配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=writerai

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379

# 安全配置
SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=43200
```

## 📚 API文档

启动服务后，可以通过以下地址访问API文档：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 主要API端点

#### 认证相关
- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `POST /api/v1/auth/refresh` - 刷新token
- `POST /api/v1/auth/logout` - 用户登出

#### 作品管理
- `GET /api/v1/works/` - 获取作品列表
- `POST /api/v1/works/` - 创建作品
- `GET /api/v1/works/{work_id}` - 获取作品详情
- `PUT /api/v1/works/{work_id}` - 更新作品
- `DELETE /api/v1/works/{work_id}` - 删除作品

#### 章节管理
- `GET /api/v1/chapters/` - 获取章节列表
- `POST /api/v1/chapters/` - 创建章节
- `WebSocket /api/v1/chapters/{chapter_id}/collaborate` - 实时协作

#### 模板管理
- `GET /api/v1/templates/` - 获取模板列表
- `POST /api/v1/templates/` - 创建模板
- `POST /api/v1/templates/{template_id}/fields` - 添加模板字段

## 🔐 安全特性

- **JWT Token认证**: 支持访问token和刷新token机制
- **密码加密**: bcrypt加密存储用户密码
- **CORS配置**: 可配置跨域访问策略
- **请求限流**: 防止API滥用
- **输入验证**: Pydantic数据验证
- **SQL注入防护**: SQLAlchemy ORM防护
- **审计日志**: 完整的用户操作记录

## 🧪 测试

### 运行测试
```bash
# 运行所有测试
pytest

# 运行特定测试文件
pytest tests/test_auth.py

# 运行测试并生成覆盖率报告
pytest --cov=app tests/
```

## 🔧 项目结构

```
backend/
├── app/
│   ├── api/              # API路由模块
│   │   ├── auth.py       # 认证API
│   │   ├── works.py      # 作品管理API
│   │   ├── templates.py  # 模板管理API
│   │   └── chapters.py   # 章节管理API
│   ├── core/             # 核心模块
│   │   ├── config.py     # 配置管理
│   │   ├── security.py   # 安全认证
│   │   ├── database.py   # 数据库连接
│   │   └── redis.py      # Redis客户端
│   ├── models/           # 数据模型
│   │   ├── user.py       # 用户模型
│   │   ├── work.py       # 作品模型
│   │   ├── chapter.py    # 章节模型
│   │   ├── template.py   # 模板模型
│   │   └── system.py     # 系统模型
│   ├── schemas/          # Pydantic模式
│   │   ├── auth.py       # 认证模式
│   │   ├── work.py       # 作品模式
│   │   ├── chapter.py    # 章节模式
│   │   └── template.py   # 模板模式
│   ├── services/         # 业务服务
│   │   ├── user_service.py
│   │   ├── work_service.py
│   │   ├── chapter_service.py
│   │   ├── template_service.py
│   │   └── sharedb_service.py
│   └── main.py           # 应用入口
├── tests/                # 测试文件
├── requirements.txt      # 项目依赖
├── .env.example         # 环境变量示例
├── run.py               # 启动脚本
└── README.md            # 项目文档
```

## 📝 开发规范

### 代码规范
- 使用 Black 进行代码格式化
- 使用 isort 进行导入排序
- 使用 flake8 进行代码质量检查
- 使用 mypy 进行类型检查

```bash
# 代码格式化
black app/
isort app/

# 代码检查
flake8 app/
mypy app/
```

### 提交规范
使用 Conventional Commits 规范：

```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建/工具相关
```

## 📊 性能优化

- **异步数据库操作**: 使用asyncpg提升数据库性能
- **Redis缓存**: 缓存热点数据和Session信息
- **连接池**: 数据库连接池管理
- **响应压缩**: gzip压缩API响应
- **静态资源CDN**: 静态文件使用CDN加速

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证。查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到问题或有建议，请：

1. 查看 [FAQ](docs/FAQ.md)
2. 搜索 [Issues](../../issues)
3. 创建新的 [Issue](../../issues/new)

## 🗺️ 路线图

- [ ] AI写作助手集成
- [ ] 多语言支持
- [ ] 文件导入导出
- [ ] 移动端适配
- [ ] 微服务架构重构
- [ ] 性能监控系统
- [ ] 自动化测试覆盖率提升

## 📞 联系我们

- 项目主页: [GitHub Repository]
- 文档网站: [Documentation Site]
- 邮箱: support@writerai.com
