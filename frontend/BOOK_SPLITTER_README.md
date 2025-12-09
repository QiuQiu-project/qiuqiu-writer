# 拆书功能说明文档

## 功能概述

拆书功能是基于 [SmartReads](https://github.com/Ggbond626/SmartReads) 项目的逻辑实现的小说章节分析工具，可以帮助作者快速分析小说章节的结构、剧情和情感。

## 功能特点

### 1. 智能章节拆分
- 支持 TXT 格式小说文件上传
- 自动识别章节标题（支持"第X章"、"第X回"等格式）
- 可配置每组章节数（10/20/50/100/200章）
- 自动将长篇小说拆分为多个章节组

### 2. AI 章节分析
基于 SmartReads 的分析提示词，对每个章节组进行深度分析，包括：
- **章节号**：准确提取章节编号
- **章节标题**：提取章节标题
- **核心剧情梗概**：2-3句精炼概括
- **核心功能/目的**：分析章节的战略意义
- **画面感/镜头序列**：3-5个关键视觉画面（JSON 格式）
- **关键情节点**：驱动故事的关键节点（JSON 格式）
- **章节氛围/情绪**：情感体验描述（JSON 格式）
- **结尾钩子**：章节结尾的悬念设置

### 3. 结果管理
- 实时显示分析进度
- 支持查看所有章节组的分析结果
- 支持下载分析结果为 Markdown 文件

## 使用方法

### 访问入口
1. 从小说写作页面（`/novel`）点击"小说拆书"卡片
2. 直接访问 `/book-splitter` 路由

### 操作流程
1. **上传文件**：点击"选择 TXT 文件"按钮，选择小说文件
2. **配置拆分**：选择每组章节数（默认 50 章/组）
3. **执行拆分**：点击"执行拆分"按钮
4. **选择章节组**：从拆分结果中选择要分析的章节组（默认选择前 3 组）
5. **开始分析**：点击"开始 AI 分析"按钮
6. **查看结果**：在右侧面板查看分析结果
7. **下载结果**：点击下载按钮保存为 Markdown 文件

## 技术实现

### 核心文件

#### 1. `BookSplitterPage.tsx`
主页面组件，包含：
- 文件上传处理
- 章节拆分逻辑（来自 SmartReads）
- 章节组选择管理
- 分析流程控制
- 结果展示

#### 2. `bookAnalysisApi.ts`
API 服务层，包含：
- `getAnalysisPrompt()`: 生成分析提示词（与 SmartReads 一致）
- `analyzeChapterContent()`: 调用 AI 分析单个章节组
- `analyzeMultipleChapterGroups()`: 批量分析章节组
- `testAPIConnection()`: 测试 API 连接

#### 3. `BookSplitterPage.css`
样式文件，采用紫色渐变玻璃态设计风格

### 章节拆分算法

```typescript
// 使用正则表达式匹配章节标题
const chapterPattern = /^第[零一二三四五六七八九十百千0-9]+[章回节]/gm;

// 提取所有章节
// 按指定大小分组
// 生成章节组数据
```

### AI 分析提示词

分析提示词完全来自 SmartReads 项目，确保分析结果的一致性和专业性。提示词包含：
- 角色定义（小说编辑和剧情分析师）
- 任务说明（生成章节规划分析表）
- 表格结构规则（8 列结构）
- 学习范例
- 输出要求

## 后端接口规划

### ⚠️ 重要提示
**当前后端接口尚未实现**，代码中使用模拟数据。实际使用时将从 memos 后端获取 AI 模型服务。

### 待实现的后端接口

#### 1. 章节分析接口
```
POST /api/ai/analyze-chapter
```

**请求体：**
```json
{
  "content": "章节内容",
  "prompt": "分析提示词",
  "settings": {
    "model": "模型名称",
    "temperature": 0.7,
    "maxTokens": 4000
  }
}
```

**响应：**
- 使用 Server-Sent Events (SSE) 流式返回分析结果
- 格式：`data: {JSON}\n\n`
- 完成标记：`data: [DONE]\n\n`

#### 2. 健康检查接口
```
GET /api/ai/health
```

**响应：**
```json
{
  "code": 200,
  "message": "服务正常",
  "data": {
    "status": "healthy",
    "model": "可用模型列表"
  }
}
```

### 集成步骤

1. **后端实现**
   - 在 memos 后端实现上述接口
   - 配置 AI 模型服务（如 OpenAI、Claude 等）
   - 实现流式响应处理

2. **前端配置**
   - 在 `bookAnalysisApi.ts` 中取消注释真实 API 调用代码
   - 删除或注释模拟数据代码
   - 配置 API 基础 URL（通过环境变量 `VITE_API_URL`）

3. **测试验证**
   - 测试 API 连接
   - 测试单章节分析
   - 测试批量分析
   - 测试错误处理

## 代码位置

```
frontend/
├── src/
│   ├── pages/
│   │   ├── BookSplitterPage.tsx      # 主页面组件
│   │   └── BookSplitterPage.css      # 样式文件
│   ├── utils/
│   │   └── bookAnalysisApi.ts        # API 服务层
│   └── App.tsx                        # 路由配置
└── BOOK_SPLITTER_README.md            # 本文档
```

## 依赖关系

### 前端依赖
- React
- React Router
- TypeScript
- Lucide React（图标库）

### 后端依赖（待实现）
- memos 后端框架
- AI 模型服务（OpenAI API 兼容接口）

## 未来优化方向

1. **缓存机制**
   - 实现章节拆分结果缓存
   - 实现分析结果缓存
   - 使用 localStorage 持久化

2. **设置面板**
   - AI 模型选择
   - 温度参数调整
   - Token 限制配置
   - API 密钥管理

3. **结果优化**
   - Markdown 格式渲染
   - 表格美化显示
   - 导出多种格式（PDF、Word）
   - 结果对比功能

4. **文件支持**
   - 支持 EPUB 格式
   - 支持 PDF 格式
   - 支持在线文本粘贴

5. **批量处理**
   - 并发分析优化
   - 断点续传
   - 错误重试机制

## 参考资料

- [SmartReads 项目](https://github.com/Ggbond626/SmartReads)
- SmartReads 核心逻辑文件：
  - `SmartReads/src/hooks/useAnalyzer.js` - 分析逻辑
  - `SmartReads/src/components/Sidebar/PreprocessPanel/PreprocessPanel.jsx` - 拆分逻辑

## 联系方式

如有问题或建议，请联系开发团队。

