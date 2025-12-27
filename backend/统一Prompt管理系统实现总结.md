# 统一Prompt管理系统实现总结

## 实现概述

根据需求，实现了一个统一的Prompt管理系统，将所有prompt模板存储在数据库中，并提供了一个统一的类来管理prompt的获取、格式化和响应处理。

## 实现的功能

### 1. 统一的Prompt上下文服务 (`PromptContextService`)

**文件位置**: `backend/src/memos/api/services/prompt_context_service.py`

**核心功能**:

1. **环境信息收集** (`build_context`)
   - 自动获取作品信息
   - 自动获取所有角色信息
   - 自动提取当前章节使用的角色
   - 自动获取前N章的内容、大纲、细纲
   - 自动获取地点信息
   - 支持自定义数据

2. **Prompt格式化** (`format_prompt`)
   - 根据模板类型自动收集所需的环境信息
   - 自动从ShareDB获取章节内容（如果需要）
   - 支持变量替换
   - 支持额外变量覆盖

3. **AI响应处理** (`process_ai_response`)
   - 根据模板类型自动解析AI响应
   - 自动存储到相应的数据库表
   - 支持角色生成/提取
   - 支持章节生成
   - 支持章节元数据更新（大纲、细纲、总结）

### 2. Prompt模板初始化脚本

**文件位置**: `backend/scripts/init_unified_prompts.py`

**功能**:
- 初始化6种新的prompt模板类型：
  - `character_generation`: 角色生成
  - `character_extraction`: 角色提取
  - `chapter_generation`: 章节生成
  - `chapter_summary`: 章节总结
  - `outline_generation`: 大纲生成
  - `detailed_outline_generation`: 细纲生成

### 3. 使用文档

**文件位置**: `backend/统一Prompt管理使用指南.md`

包含完整的使用说明和示例代码。

## 支持的Prompt类型

| 类型 | 说明 | 自动收集的信息 |
|------|------|----------------|
| `character_generation` | 角色生成 | 作品信息、所有角色、前文摘要 |
| `character_extraction` | 角色提取 | 章节内容 |
| `chapter_generation` | 章节生成 | 作品信息、所有角色、当前章节使用的角色、前文内容/大纲/细纲 |
| `chapter_summary` | 章节总结 | 章节信息、章节内容 |
| `outline_generation` | 大纲生成 | 章节信息、章节内容、前文大纲 |
| `detailed_outline_generation` | 细纲生成 | 章节信息、章节内容、章节大纲、前文细纲 |
| `book_analysis` | 作品分析 | （使用现有服务） |
| `chapter_analysis` | 章节分析 | （使用现有服务） |

## 核心类和方法

### PromptContextService

```python
class PromptContextService:
    async def initialize()  # 初始化服务（初始化ShareDB）
    async def build_context(...)  # 构建上下文
    async def get_prompt_template(...)  # 获取prompt模板
    async def format_prompt(...)  # 格式化prompt（异步）
    async def process_ai_response(...)  # 处理AI响应并存储
```

### PromptContext

```python
class PromptContext:
    work: Optional[Work]  # 作品信息
    current_chapter: Optional[Chapter]  # 当前章节
    all_characters: List[Character]  # 所有角色
    chapter_characters: List[Character]  # 当前章节使用的角色
    previous_chapters: List[Chapter]  # 前文章节
    previous_chapters_content: List[str]  # 前文内容
    previous_outlines: List[Dict]  # 前文大纲
    previous_detailed_outlines: List[Dict]  # 前文细纲
    locations: List[Location]  # 地点信息
    custom_data: Dict[str, Any]  # 自定义数据
```

## 使用流程

1. **初始化服务**
   ```python
   prompt_service = PromptContextService(db)
   await prompt_service.initialize()
   ```

2. **构建上下文**
   ```python
   context = await prompt_service.build_context(
       work_id=1,
       chapter_id=5,
       include_previous_chapters=3
   )
   ```

3. **获取模板**
   ```python
   template = await prompt_service.get_prompt_template("character_generation")
   ```

4. **格式化prompt**
   ```python
   prompt = await prompt_service.format_prompt(template, context)
   ```

5. **调用AI**
   ```python
   ai_response = await ai_service.generate(prompt)
   ```

6. **处理响应**
   ```python
   result = await prompt_service.process_ai_response(
       template_type="character_generation",
       ai_response=ai_response,
       context=context,
       work_id=1,
       user_id=1
   )
   ```

## 技术特点

1. **自动化**: 自动收集所需的环境信息，无需手动拼接
2. **类型安全**: 根据模板类型自动处理响应并存储
3. **可扩展**: 易于添加新的prompt类型和处理逻辑
4. **一致性**: 统一的接口和流程
5. **智能**: 自动从ShareDB获取章节内容，自动提取章节使用的角色

## 数据库集成

- 使用现有的 `PromptTemplate` 模型
- 自动存储生成的角色到 `characters` 表
- 自动创建/更新章节到 `chapters` 表
- 自动更新章节元数据（大纲、细纲、总结）
- 与ShareDB集成，自动获取章节内容

## 下一步建议

1. **改进角色提取算法**: 当前使用简单的文本匹配，可以改进为更智能的NLP方法
2. **添加缓存机制**: 对于频繁访问的环境信息，可以添加缓存
3. **添加批量处理**: 支持批量生成多个角色或章节
4. **添加模板版本管理**: 支持模板的版本控制和回滚
5. **添加使用统计**: 记录每个模板的使用次数和效果

## 文件清单

- `backend/src/memos/api/services/prompt_context_service.py` - 核心服务类
- `backend/scripts/init_unified_prompts.py` - 初始化脚本
- `backend/统一Prompt管理使用指南.md` - 使用文档
- `backend/统一Prompt管理系统实现总结.md` - 本文档

## 运行初始化

```bash
cd backend
python scripts/init_unified_prompts.py
```

这将创建所有新的prompt模板类型。

## 总结

成功实现了一个统一的Prompt管理系统，满足了以下需求：

✅ 将所有prompt放在一个表中（使用现有的`prompt_templates`表）

✅ 支持多种prompt类型（角色生成、角色提取、章节生成等）

✅ 自动获取环境信息（所有角色、当前章节使用角色、前文文本、前文大纲细纲等）

✅ 统一的类来管理prompt的获取、格式化和响应处理

✅ 自动将生成的信息存储到数据库

系统设计灵活、可扩展，易于维护和使用。





