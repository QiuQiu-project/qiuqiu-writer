# AI接口实现文档

## 概述

本文档介绍已实现的AI拆书分析接口的架构、使用方法和部署指南。

## 架构设计

### 文件结构

```
backend/src/memos/api/
├── ai_models.py              # AI接口的数据模型定义
├── services/
│   ├── __init__.py
│   └── ai_service.py         # AI服务层（处理OpenAI调用）
├── routers/
│   ├── __init__.py
│   ├── ai_router.py          # AI接口路由
│   ├── product_router.py
│   └── server_router.py
├── product_api.py            # Product API主应用（已集成AI路由）
└── start_api.py              # Start API主应用（已集成AI路由）
```

### 模块说明

#### 1. `ai_models.py` - 数据模型层

定义了所有AI接口的请求和响应模型：

- **请求模型**:
  - `AnalyzeChapterRequest`: 章节分析请求
  - `AnalysisSettings`: AI分析设置（模型、温度、最大tokens）

- **响应模型**:
  - `SSEMessage`: 流式响应消息
  - `HealthCheckResponse`: 健康检查响应
  - `DefaultPromptResponse`: 默认提示词响应
  - `ErrorResponse`: 错误响应

#### 2. `ai_service.py` - 服务层

核心业务逻辑层，负责：

- OpenAI API调用
- 流式响应处理
- 默认提示词管理
- 错误处理和日志记录
- 服务健康检查

**关键类**:
- `AIService`: AI服务主类
  - `analyze_chapter_stream()`: 流式章节分析
  - `get_default_prompt()`: 获取默认提示词
  - `get_available_models()`: 获取可用模型列表
  - `is_healthy()`: 健康检查

#### 3. `ai_router.py` - 路由层

定义了三个API端点：

1. **POST `/api/ai/analyze-chapter`**
   - 功能：章节分析接口（流式响应）
   - 响应类型：Server-Sent Events (SSE)

2. **GET `/api/ai/health`**
   - 功能：健康检查接口
   - 响应类型：JSON

3. **GET `/api/ai/default-prompt`**
   - 功能：获取默认提示词接口
   - 响应类型：JSON

## 安装部署

### 1. 环境准备

```bash
# 进入backend目录
cd backend

# 安装依赖（使用poetry）
poetry install

# 或使用pip（需要先创建虚拟环境）
pip install -r docker/requirements.txt
```

### 2. 配置环境变量

```bash
# 复制环境变量示例文件
cp .env.ai.example .env

# 编辑.env文件，填写你的OpenAI API密钥
# OPENAI_API_KEY=your_actual_api_key_here
```

必需的环境变量：

- `OPENAI_API_KEY`: OpenAI API密钥（必填）
- `OPENAI_API_BASE`: API端点（可选，默认为OpenAI官方）
- `DEFAULT_AI_MODEL`: 默认模型（可选，默认为gpt-3.5-turbo）

### 3. 启动服务

#### 方式1：使用Product API（推荐）

```bash
# 启动Product API服务（默认端口8001）
python -m memos.api.product_api --port 8001

# 或使用Poetry
poetry run python -m memos.api.product_api --port 8001
```

#### 方式2：使用Start API

```bash
# 启动Start API服务（默认端口8000）
python -m memos.api.start_api --port 8000
```

#### 方式3：使用Docker

```bash
# 构建镜像
docker build -f docker/Dockerfile -t writerai-backend .

# 运行容器
docker run -d \
  -p 8001:8001 \
  -e OPENAI_API_KEY=your_api_key_here \
  --name writerai-backend \
  writerai-backend
```

### 4. 验证服务

访问API文档：

- Product API: http://localhost:8001/docs
- Start API: http://localhost:8000/docs

## API使用示例

### 1. 健康检查

```bash
curl -X GET http://localhost:8001/api/ai/health
```

响应示例：

```json
{
  "code": 200,
  "message": "服务正常",
  "data": {
    "status": "healthy",
    "models": [
      "gpt-3.5-turbo",
      "gpt-4",
      "gpt-4-turbo-preview",
      "gpt-4o",
      "claude-3-sonnet",
      "claude-3-opus"
    ],
    "timestamp": "2025-12-09T10:00:00Z"
  }
}
```

### 2. 获取默认提示词

```bash
curl -X GET http://localhost:8001/api/ai/default-prompt
```

响应示例：

```json
{
  "code": 200,
  "message": "成功",
  "data": {
    "prompt": "# 角色\n你是一位经验丰富的小说编辑...",
    "version": "1.0"
  }
}
```

### 3. 章节分析（流式响应）

```bash
curl -X POST http://localhost:8001/api/ai/analyze-chapter \
  -H "Content-Type: application/json" \
  -d '{
    "content": "第一章 开始\n\n这是一个故事的开始...",
    "settings": {
      "model": "gpt-4",
      "temperature": 0.7,
      "max_tokens": 4000
    }
  }'
```

响应示例（SSE格式）：

```
data: {"type": "start", "message": "开始分析章节内容..."}

data: {"type": "chunk", "content": "# 章节分析\n\n"}

data: {"type": "chunk", "content": "## 章节概要\n"}

data: {"type": "chunk", "content": "本章节描述了故事的开端..."}

...

data: {"type": "done", "message": "分析完成"}
```

### 4. JavaScript/TypeScript客户端示例

```typescript
// 使用Fetch API进行流式请求
async function analyzeChapter(content: string) {
  const response = await fetch('http://localhost:8001/api/ai/analyze-chapter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: content,
      settings: {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        max_tokens: 4000,
      },
    }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        
        switch (data.type) {
          case 'start':
            
            break;
          case 'chunk':
            
            break;
          case 'done':
            
            break;
          case 'error':
            console.error('错误:', data.message);
            break;
        }
      }
    }
  }
}
```

## 错误处理

### 错误码说明

- `400`: 请求参数错误（如缺少必填字段）
- `401`: 未授权（未配置API密钥）
- `429`: 请求过于频繁（触发限流）
- `500`: 服务器内部错误
- `503`: AI服务不可用（API密钥无效或API服务异常）

### 常见错误及解决方案

#### 1. "AI服务不可用，请检查配置"

**原因**: 未配置`OPENAI_API_KEY`环境变量

**解决方案**:
```bash
export OPENAI_API_KEY=your_api_key_here
```

#### 2. "OpenAI API error: Incorrect API key"

**原因**: API密钥无效或格式错误

**解决方案**:
1. 检查API密钥是否正确
2. 确认API密钥在OpenAI平台上是激活状态
3. 检查是否有可用额度

#### 3. "OpenAI API error: Rate limit exceeded"

**原因**: 超过API调用频率限制

**解决方案**:
1. 等待一段时间后重试
2. 升级OpenAI账户套餐
3. 实现请求队列和限流机制

## 性能优化

### 1. 缓存策略

建议对相同内容的分析结果进行缓存：

```python
# 使用Redis缓存
import hashlib
import redis

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def get_cache_key(content: str, settings: dict) -> str:
    """生成缓存键"""
    content_hash = hashlib.md5(content.encode()).hexdigest()
    settings_str = json.dumps(settings, sort_keys=True)
    settings_hash = hashlib.md5(settings_str.encode()).hexdigest()
    return f"analysis:{content_hash}:{settings_hash}"

# 在分析前检查缓存
cache_key = get_cache_key(content, settings)
cached_result = redis_client.get(cache_key)
if cached_result:
    return cached_result
```

### 2. 限流配置

使用FastAPI的限流中间件：

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@router.post("/analyze-chapter")
@limiter.limit("20/minute")  # 每分钟最多20次请求
async def analyze_chapter(request: Request, ...):
    ...
```

### 3. 并发控制

使用信号量限制并发请求数：

```python
import asyncio

# 最多同时处理10个分析请求
semaphore = asyncio.Semaphore(10)

async def analyze_chapter_stream(...):
    async with semaphore:
        # 执行分析逻辑
        ...
```

## 监控和日志

### 日志配置

日志已集成到memos的日志系统，可以通过环境变量调整日志级别：

```bash
export LOG_LEVEL=DEBUG  # DEBUG, INFO, WARNING, ERROR
```

### 关键指标监控

建议监控以下指标：

1. **API调用量**: 每小时/每天的请求数
2. **响应时间**: 首个chunk返回时间、总处理时间
3. **错误率**: 各类错误的占比
4. **Token使用量**: OpenAI API的token消耗
5. **并发数**: 同时处理的请求数

### 健康检查

设置定期健康检查：

```bash
# 每5分钟检查一次服务状态
*/5 * * * * curl -f http://localhost:8001/api/ai/health || alert
```

## 安全建议

1. **API密钥保护**
   - 不要在代码中硬编码API密钥
   - 不要将.env文件提交到版本控制系统
   - 使用环境变量或密钥管理服务

2. **请求验证**
   - 限制请求内容的最大长度（防止超大请求）
   - 验证请求参数的合法性
   - 实施请求签名验证

3. **限流保护**
   - 实现IP级别的限流
   - 实现用户级别的配额管理
   - 防止恶意请求攻击

4. **CORS配置**
   - 根据实际需求配置跨域策略
   - 生产环境中限制允许的域名

5. **日志脱敏**
   - 不要记录完整的API密钥
   - 脱敏用户敏感信息

## 测试

### 单元测试

```bash
# 运行AI接口相关的测试
pytest tests/api/test_ai_router.py -v
```

### 集成测试

```bash
# 使用示例脚本测试完整流程
python examples/api/test_ai_api.py
```

## 常见问题（FAQ）

**Q: 如何切换到其他AI模型提供商（如Azure OpenAI）？**

A: 修改环境变量：
```bash
OPENAI_API_BASE=https://your-resource.openai.azure.com/
OPENAI_API_KEY=your_azure_api_key
DEFAULT_AI_MODEL=your_deployment_name
```

**Q: 如何自定义章节分析的提示词？**

A: 在请求中传入`prompt`参数，或修改`ai_service.py`中的`DEFAULT_ANALYSIS_PROMPT`。

**Q: 流式响应在某些代理或负载均衡器后面不工作？**

A: 确保代理配置支持流式响应，例如Nginx需要添加：
```nginx
proxy_buffering off;
proxy_cache off;
```

**Q: 如何估算API调用成本？**

A: 根据OpenAI定价，gpt-3.5-turbo约为$0.002/1K tokens。一个典型的章节分析（3000字内容+4000字回复）约消耗$0.014。

## 贡献指南

欢迎提交问题和改进建议！

1. Fork本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 许可证

请参考项目根目录的LICENSE文件。

## 联系方式

如有问题或建议，请通过以下方式联系：

- 项目Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 文档: [BOOK_ANALYSIS_API_SPEC.md](../BOOK_ANALYSIS_API_SPEC.md)

## 更新日志

### v1.0.0 (2025-12-09)

- ✅ 实现章节分析接口（流式响应）
- ✅ 实现健康检查接口
- ✅ 实现默认提示词接口
- ✅ 集成到Product API和Start API
- ✅ 完善错误处理和日志记录
- ✅ 编写API文档和使用示例

