# DeepSeek AI 配置指南

## 快速配置

### 1. 配置环境变量

在 `.env` 文件中添加以下配置：

```bash
# DeepSeek API 配置
OPENAI_API_KEY=sk-5b8dc562ef4647738b008c011bbf4acc
OPENAI_API_BASE=https://api.deepseek.com
DEFAULT_AI_MODEL=deepseek-chat
```

### 2. 或者通过命令行设置

```bash
export OPENAI_API_KEY=sk-5b8dc562ef4647738b008c011bbf4acc
export OPENAI_API_BASE=https://api.deepseek.com
export DEFAULT_AI_MODEL=deepseek-chat
```

### 3. 重启后端服务

配置完成后，重启后端服务使配置生效：

```bash
# 如果使用启动脚本
./start_ai_api.sh

# 或直接启动
python -m memos.api.product_api --port 8001
```

## 配置说明

### 环境变量

- `OPENAI_API_KEY`: DeepSeek API 密钥（必填）
  - 格式：`sk-xxxxxxxxxxxxx`
  - 获取地址：https://platform.deepseek.com/api_keys

- `OPENAI_API_BASE`: DeepSeek API 地址（必填）
  - 默认值：`https://api.deepseek.com`
  - DeepSeek 使用 OpenAI 兼容的 API，所以可以直接使用

- `DEFAULT_AI_MODEL`: 默认使用的模型（可选）
  - `deepseek-chat`: 通用对话模型（推荐，性价比高）
  - `deepseek-reasoner`: 推理模型（更强大但更慢）

### 可选配置

- `MOS_CHAT_MODEL`: MemOS 聊天模型（可选）
  - 如果使用 DeepSeek，设置为 `deepseek-chat`

- `MOS_CHAT_TEMPERATURE`: 生成温度（可选）
  - 默认值：`0.7`
  - 范围：0.0 - 2.0

- `MOS_MAX_TOKENS`: 最大 token 数（可选）
  - 默认值：`8000`

## 验证配置

### 1. 检查环境变量

```bash
# 检查环境变量是否设置
echo $OPENAI_API_KEY
echo $OPENAI_API_BASE
echo $DEFAULT_AI_MODEL
```

### 2. 测试 API 连接

启动服务后，访问健康检查接口：

```bash
curl http://localhost:8001/ai/health
```

如果配置正确，应该返回服务状态和可用模型列表。

### 3. 测试章节分析

使用前端或 API 工具测试章节分析功能，确认 DeepSeek 正常工作。

## 注意事项

1. **API Key 安全**：
   - 不要将 API Key 提交到代码仓库
   - 使用 `.env` 文件并添加到 `.gitignore`
   - 生产环境建议使用环境变量或密钥管理服务

2. **API 限制**：
   - DeepSeek 有 API 调用频率限制
   - 如果遇到限流，请稍后重试

3. **模型选择**：
   - `deepseek-chat`: 适合大多数场景，响应快，成本低
   - `deepseek-reasoner`: 适合需要复杂推理的场景，但响应较慢

4. **兼容性**：
   - DeepSeek 使用 OpenAI 兼容的 API
   - 可以直接替换 OpenAI 配置，无需修改代码

## 故障排查

### 问题1：API Key 无效

**错误信息**：`Invalid API Key`

**解决方法**：
- 检查 API Key 是否正确
- 确认 API Key 是否已激活
- 检查 API Key 是否有足够的余额

### 问题2：无法连接到 API

**错误信息**：`Failed to fetch` 或 `Connection error`

**解决方法**：
- 检查网络连接
- 确认 `OPENAI_API_BASE` 是否正确设置为 `https://api.deepseek.com`
- 检查防火墙设置

### 问题3：模型不存在

**错误信息**：`Model not found`

**解决方法**：
- 确认 `DEFAULT_AI_MODEL` 设置为 `deepseek-chat` 或 `deepseek-reasoner`
- 检查模型名称拼写是否正确

## 相关文档

- DeepSeek 官方文档：https://platform.deepseek.com/docs
- API 密钥管理：https://platform.deepseek.com/api_keys
- 模型列表：https://platform.deepseek.com/models





