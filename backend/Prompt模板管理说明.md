# Prompt模板管理说明

## 当前实现

### Prompt处理流程

1. **前端调用API时**：前端不需要传递prompt，只需要传递内容
2. **后端自动获取**：后端会从数据库获取默认的prompt模板
3. **模板格式化**：后端将prompt模板中的变量（如`{content}`）替换为实际内容

### 代码示例

#### 前端调用（不需要传递prompt）
```typescript
// frontend/src/utils/bookAnalysisApi.ts
export async function analyzeChapterContent(
  content: string,
  onProgress?: (progress: AnalysisProgress) => void,
  settings?: AnalysisSettings
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/ai/analyze-chapter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      // prompt 由后端从数据库获取，不在这里传递
      settings: settings || {},
    }),
  });
  // ...
}
```

#### 后端处理（自动获取prompt）
```python
# backend/src/memos/api/routers/ai_router.py
async def analyze_chapter(
    request: AnalyzeChapterRequest,
    db: AsyncSession = Depends(get_async_db),
):
    # 如果没有提供prompt，从数据库获取默认模板
    prompt = request.prompt
    if not prompt:
        book_analysis_service = BookAnalysisService(db)
        prompt_template = await book_analysis_service.get_default_prompt_template("chapter_analysis")
        if prompt_template:
            prompt = prompt_template.format_prompt(content=request.content)
        else:
            # 使用AI服务的默认prompt
            prompt = ai_service.get_default_prompt().format(content=request.content)
    # ...
```

## 前端获取Prompt模板（可选）

如果前端需要预览或选择prompt模板，可以使用以下API：

### 1. 获取默认模板
```typescript
import { getDefaultPromptTemplate } from '@/utils/bookAnalysisApi';

// 获取默认的章节分析模板
const template = await getDefaultPromptTemplate('chapter_analysis');
if (template) {
  
  
}
```

### 2. 获取模板列表
```typescript
import { getPromptTemplates } from '@/utils/bookAnalysisApi';

// 获取所有章节分析模板
const templates = await getPromptTemplates('chapter_analysis', true);
templates.forEach(t => {
  
});
```

### 3. 获取模板内容（字符串）
```typescript
import { getAnalysisPromptFromBackend } from '@/utils/bookAnalysisApi';

// 获取prompt内容字符串（已格式化）
const promptContent = await getAnalysisPromptFromBackend('chapter_analysis');
```

## API接口

### 后端API

1. **获取默认模板**
   - `GET /api/v1/prompt-templates/type/{template_type}/default`
   - 返回指定类型的默认prompt模板

2. **获取模板列表**
   - `GET /api/v1/prompt-templates?template_type={type}&is_active={true|false}`
   - 支持按类型和状态过滤

3. **获取模板详情**
   - `GET /api/v1/prompt-templates/{template_id}`
   - 获取指定ID的模板详情

4. **创建模板**
   - `POST /api/v1/prompt-templates/`
   - 创建新的prompt模板

5. **更新模板**
   - `PUT /api/v1/prompt-templates/{template_id}`
   - 更新现有模板

6. **删除模板**
   - `DELETE /api/v1/prompt-templates/{template_id}`
   - 删除模板

## 设计优势

1. **集中管理**：所有prompt模板存储在数据库中，便于统一管理和版本控制
2. **灵活配置**：可以创建多个模板，设置默认模板，随时切换
3. **前端简化**：前端不需要关心prompt的具体内容，只需要调用API
4. **向后兼容**：如果数据库中没有模板，会使用代码中的默认prompt

## 使用场景

### 场景1：默认使用（推荐）
前端直接调用分析API，后端自动使用默认模板：
```typescript
await analyzeChapterContent(content, onProgress);
```

### 场景2：预览模板
前端需要预览当前使用的prompt：
```typescript
const template = await getDefaultPromptTemplate('chapter_analysis');
// 显示模板内容给用户
```

### 场景3：选择模板
前端需要让用户选择不同的模板：
```typescript
const templates = await getPromptTemplates('chapter_analysis', true);
// 显示模板列表供用户选择
// 如果用户选择了特定模板，可以在请求中传递template_id（需要后端支持）
```

## 注意事项

1. **当前实现**：前端调用分析API时，prompt完全由后端管理，前端不需要传递
2. **如果需要自定义**：可以在请求中传递`prompt`参数，后端会优先使用传递的prompt
3. **模板变量**：prompt模板中的`{content}`变量会被后端自动替换为实际内容
4. **权限控制**：创建、更新、删除模板需要用户认证和权限检查

