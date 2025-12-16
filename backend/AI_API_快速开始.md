# AI接口快速开始指南

## 概述

本文档将帮助您快速启动和测试AI拆书分析接口。

## 已实现的接口

根据 `BOOK_ANALYSIS_API_SPEC.md` 规范，已完整实现以下三个接口：

### 1. 章节分析接口
- **端点**: `POST /api/ai/analyze-chapter`
- **功能**: 对小说章节内容进行AI分析
- **响应方式**: 流式响应（Server-Sent Events）

### 2. 健康检查接口
- **端点**: `GET /api/ai/health`
- **功能**: 检查AI服务是否可用
- **响应方式**: JSON

### 3. 默认提示词接口
- **端点**: `GET /api/ai/default-prompt`
- **功能**: 获取默认的章节分析提示词模板
- **响应方式**: JSON

## 快速启动

### 步骤1：安装依赖

```bash
cd backend

# 使用 Poetry（推荐）
poetry install

# 或使用 pip
pip install -r docker/requirements.txt
```

### 步骤2：配置环境变量

```bash
# 设置 OpenAI API 密钥
export OPENAI_API_KEY="your_openai_api_key_here"

# 可选：设置自定义 API 端点（默认为 OpenAI 官方）
export OPENAI_API_BASE="https://api.openai.com/v1"

# 可选：设置默认模型（默认为 gpt-3.5-turbo）
export DEFAULT_AI_MODEL="gpt-3.5-turbo"
```

**或者创建 `.env` 文件**:

```bash
# 复制配置示例
cp ai_config.example .env

# 编辑 .env 文件，填写你的 API 密钥
nano .env
```

### 步骤3：启动服务

#### 方式1：使用启动脚本（推荐）

```bash
./start_ai_api.sh
```

#### 方式2：手动启动

```bash
# 使用 Poetry
poetry run python -m memos.api.product_api --port 8001

# 或直接使用 Python
python -m memos.api.product_api --port 8001
```

服务将在 `http://localhost:8001` 启动。

### 步骤4：验证服务

#### 访问API文档

打开浏览器访问：http://localhost:8001/docs

您将看到完整的API文档，包括AI接口的三个端点。

#### 测试健康检查

```bash
curl http://localhost:8001/api/ai/health
```

预期响应：
```json
{
  "code": 200,
  "message": "服务正常",
  "data": {
    "status": "healthy",
    "models": ["gpt-3.5-turbo", "gpt-4", ...],
    "timestamp": "2025-12-09T10:00:00Z"
  }
}
```

#### 运行测试脚本

```bash
python examples/api/test_ai_api.py
```

该脚本会依次测试所有三个AI接口。

## 使用示例

### 示例1：章节分析（使用curl）

```bash
curl -X POST http://localhost:8001/api/ai/analyze-chapter \
  -H "Content-Type: application/json" \
  -d '{
    "content": "第一章 开始\n\n这是一个故事的开始...",
    "settings": {
      "model": "gpt-3.5-turbo",
      "temperature": 0.7,
      "max_tokens": 4000
    }
  }'
```

### 示例2：章节分析（使用Python）

```python
import requests
import json

url = "http://localhost:8001/api/ai/analyze-chapter"

data = {
    "content": "第一章 开始\n\n这是一个故事的开始...",
    "settings": {
        "model": "gpt-3.5-turbo",
        "temperature": 0.7,
        "max_tokens": 4000
    }
}

# 流式请求
with requests.post(url, json=data, stream=True) as response:
    for line in response.iter_lines():
        if line:
            line_str = line.decode('utf-8')
            if line_str.startswith('data: '):
                message = json.loads(line_str[6:])
                if message['type'] == 'chunk':
                    print(message['content'], end='', flush=True)
                elif message['type'] == 'done':
                    print(f"\n分析完成: {message['message']}")
```

### 示例3：章节分析（使用TypeScript）

```typescript
async function analyzeChapter(content: string) {
  const response = await fetch('http://localhost:8001/api/ai/analyze-chapter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
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
    const { done, value } = await reader!.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'chunk') {
          console.log(data.content);
        }
      }
    }
  }
}
```

## 项目结构

```
backend/
├── src/memos/api/
│   ├── ai_models.py              # AI接口数据模型
│   ├── services/
│   │   └── ai_service.py         # AI服务层
│   ├── routers/
│   │   └── ai_router.py          # AI路由定义
│   ├── product_api.py            # 主应用（已集成AI路由）
│   └── start_api.py              # 备用入口（已集成AI路由）
├── examples/api/
│   └── test_ai_api.py            # 测试脚本
├── docs/
│   └── AI_API_README.md          # 详细文档
├── ai_config.example              # 配置示例
├── start_ai_api.sh               # 快速启动脚本
├── BOOK_ANALYSIS_API_SPEC.md     # 原始API规范
└── AI_API_快速开始.md             # 本文档
```

## 常见问题

### Q1: 启动时提示"OPENAI_API_KEY not set"

**解决方案**: 设置环境变量
```bash
export OPENAI_API_KEY="your_api_key_here"
```

### Q2: 如何获取OpenAI API密钥？

访问：https://platform.openai.com/api-keys

### Q3: 可以使用其他AI模型吗？

可以！支持所有OpenAI兼容的API，包括：
- OpenAI官方模型（gpt-3.5-turbo, gpt-4等）
- Azure OpenAI
- 本地部署的模型（如LocalAI、Ollama等）

只需修改 `OPENAI_API_BASE` 环境变量即可。

### Q4: 如何自定义分析提示词？

两种方式：
1. 在请求中传入 `prompt` 参数
2. 修改 `src/memos/api/services/ai_service.py` 中的 `DEFAULT_ANALYSIS_PROMPT`

### Q5: 流式响应在Nginx后面不工作？

需要在Nginx配置中添加：
```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 300s;
```

## 性能指标

- **首次响应时间**: < 2秒
- **建议并发数**: 最多10个并发请求
- **单次分析超时**: 60秒
- **推荐限流**: 每分钟20次请求

## 后续步骤

1. **前端集成**: 参考 `frontend/` 目录中的React组件
2. **生产部署**: 参考 `docker/` 目录中的Docker配置
3. **监控告警**: 建议设置健康检查和日志监控
4. **性能优化**: 考虑添加缓存和限流机制

## 获取帮助

- 详细文档: [docs/AI_API_README.md](docs/AI_API_README.md)
- API规范: [BOOK_ANALYSIS_API_SPEC.md](BOOK_ANALYSIS_API_SPEC.md)
- 测试脚本: [examples/api/test_ai_api.py](examples/api/test_ai_api.py)

## 更新日志

- **2025-12-09**: 完成AI接口实现，包括所有三个端点
- 集成到Product API和Start API
- 添加完整的错误处理和日志记录
- 编写文档和示例代码

---

**祝您使用愉快！** 🎉


