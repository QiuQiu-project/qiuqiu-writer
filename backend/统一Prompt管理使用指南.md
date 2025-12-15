# 统一Prompt管理使用指南

## 概述

本项目实现了一个统一的Prompt管理系统，将所有prompt模板存储在数据库中，并提供了一个统一的`PromptContextService`类来：

1. **收集环境信息**：自动获取作品、角色、章节、前文等上下文信息
2. **格式化Prompt**：根据模板类型自动收集所需信息并拼接完整的prompt
3. **处理AI响应**：解析AI返回的内容并自动存储到数据库

## 功能特点

### 支持的Prompt类型

- `character_generation`: 角色生成
- `character_extraction`: 角色提取
- `chapter_generation`: 章节生成
- `chapter_summary`: 章节总结
- `outline_generation`: 大纲生成
- `detailed_outline_generation`: 细纲生成
- `book_analysis`: 作品分析（已有）
- `chapter_analysis`: 章节分析（已有）

### 自动收集的环境信息

- **作品信息**：标题、描述、类型等
- **所有角色**：作品中的所有角色及其详细信息
- **当前章节使用的角色**：从章节内容中自动提取
- **前文信息**：前N章的内容、大纲、细纲
- **地点信息**：作品中的所有地点

## 初始化

### 1. 运行初始化脚本

```bash
cd backend
python scripts/init_unified_prompts.py
```

这将创建所有新的prompt模板类型。

## 使用方法

### 方法1：自动按需获取（推荐，性能最优）

系统会自动分析prompt模板中使用的变量，只获取需要的信息：

```python
# 1. 创建服务实例
prompt_service = PromptContextService(db)
await prompt_service.initialize()

# 2. 获取prompt模板
template = await prompt_service.get_prompt_template("character_generation")

# 3. 直接格式化prompt（系统会自动分析需要的变量并获取）
formatted_prompt = await prompt_service.format_prompt(
    template=template,
    work_id=1,  # 必需
    chapter_id=5,  # 可选
    auto_build_context=True  # 自动按需获取（默认True）
)
```

### 方法2：手动构建上下文（传统方式）

```python
from sqlalchemy.ext.asyncio import AsyncSession
from memos.api.services.prompt_context_service import PromptContextService

# 1. 创建服务实例
async with AsyncSessionLocal() as db:
    prompt_service = PromptContextService(db)
    await prompt_service.initialize()
    
    # 2. 构建上下文
    context = await prompt_service.build_context(
        work_id=1,
        chapter_id=5,  # 可选
        include_previous_chapters=3,  # 包含前3章
        include_characters=True,
        include_locations=True,
        custom_data={"custom_key": "custom_value"}  # 可选
    )
    
    # 3. 获取prompt模板
    template = await prompt_service.get_prompt_template(
        template_type="character_generation"
    )
    
    if not template:
        raise ValueError("未找到对应的prompt模板")
    
    # 4. 格式化prompt（异步方法，会自动获取章节内容）
    formatted_prompt = await prompt_service.format_prompt(
        template=template,
        context=context,
        additional_vars={"extra_var": "extra_value"}  # 可选
    )
    
    # 5. 调用AI服务（示例）
    ai_response = await ai_service.generate(formatted_prompt)
    
    # 6. 处理AI响应并存储
    result = await prompt_service.process_ai_response(
        template_type="character_generation",
        ai_response=ai_response,
        context=context,
        work_id=1,
        user_id=1
    )
    
    print(f"创建了 {result['characters_count']} 个角色")
```

### 使用示例

#### 示例1：生成新角色

```python
async def generate_new_character(work_id: int, user_id: int):
    """生成新角色"""
    async with AsyncSessionLocal() as db:
        prompt_service = PromptContextService(db)
        await prompt_service.initialize()
        
        # 构建上下文（包含所有角色和前文信息）
        # 可以分别设置前n章的大纲、细纲、正文数量
        context = await prompt_service.build_context(
            work_id=work_id,
            include_previous_chapters=5,  # 基本信息（摘要等）
            include_previous_content=3,  # 前3章的正文
            include_previous_outlines=5,  # 前5章的大纲
            include_previous_detailed_outlines=2  # 前2章的细纲
        )
        
        # 获取角色生成模板
        template = await prompt_service.get_prompt_template("character_generation")
        
        # 格式化prompt（会自动获取章节内容）
        prompt = await prompt_service.format_prompt(template, context)
        
        # 调用AI（这里需要你的AI服务）
        ai_response = await your_ai_service.generate(prompt)
        
        # 处理响应并存储
        result = await prompt_service.process_ai_response(
            template_type="character_generation",
            ai_response=ai_response,
            context=context,
            work_id=work_id,
            user_id=user_id
        )
        
        return result
```

#### 示例2：生成新章节

```python
async def generate_new_chapter(work_id: int, current_chapter_id: int, user_id: int):
    """生成新章节"""
    async with AsyncSessionLocal() as db:
        prompt_service = PromptContextService(db)
        await prompt_service.initialize()
        
        # 构建上下文（包含当前章节和前文信息）
        context = await prompt_service.build_context(
            work_id=work_id,
            chapter_id=current_chapter_id,
            include_previous_chapters=3
        )
        
        # 获取章节生成模板
        template = await prompt_service.get_prompt_template("chapter_generation")
        
        # 格式化prompt（会自动获取章节内容）
        prompt = await prompt_service.format_prompt(template, context)
        
        # 调用AI
        ai_response = await your_ai_service.generate(prompt)
        
        # 处理响应并存储
        result = await prompt_service.process_ai_response(
            template_type="chapter_generation",
            ai_response=ai_response,
            context=context,
            work_id=work_id,
            user_id=user_id
        )
        
        return result
```

#### 示例3：生成章节大纲

```python
async def generate_chapter_outline(work_id: int, chapter_id: int, user_id: int):
    """为章节生成大纲"""
    async with AsyncSessionLocal() as db:
        prompt_service = PromptContextService(db)
        await prompt_service.initialize()
        
        # 构建上下文
        context = await prompt_service.build_context(
            work_id=work_id,
            chapter_id=chapter_id,
            include_previous_chapters=3
        )
        
        # 获取大纲生成模板
        template = await prompt_service.get_prompt_template("outline_generation")
        
        # 格式化prompt（会自动从ShareDB获取章节内容）
        prompt = await prompt_service.format_prompt(
            template,
            context
            # 如果需要手动提供内容，可以使用 additional_vars={"content": "自定义内容"}
        )
        
        # 调用AI
        ai_response = await your_ai_service.generate(prompt)
        
        # 处理响应并存储
        result = await prompt_service.process_ai_response(
            template_type="outline_generation",
            ai_response=ai_response,
            context=context,
            work_id=work_id,
            user_id=user_id
        )
        
        return result
```

## API集成示例

### 创建API端点

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.services.prompt_context_service import PromptContextService

router = APIRouter(prefix="/api/v1/prompt", tags=["Prompt管理"])

@router.post("/generate")
async def generate_with_prompt(
    work_id: int,
    template_type: str,
    chapter_id: Optional[int] = None,
    db: AsyncSession = Depends(get_async_db),
    current_user_id: int = Depends(get_current_user_id)
):
    """使用统一Prompt服务生成内容"""
    try:
        prompt_service = PromptContextService(db)
        await prompt_service.initialize()
        
        # 构建上下文
        context = await prompt_service.build_context(
            work_id=work_id,
            chapter_id=chapter_id,
            include_previous_chapters=3
        )
        
        # 获取模板
        template = await prompt_service.get_prompt_template(template_type)
        if not template:
            raise HTTPException(400, f"未找到模板类型: {template_type}")
        
        # 格式化prompt（会自动获取章节内容）
        prompt = await prompt_service.format_prompt(template, context)
        
        # 调用AI服务（这里需要你的AI服务实现）
        # ai_response = await ai_service.generate(prompt)
        
        # 处理响应
        # result = await prompt_service.process_ai_response(
        #     template_type=template_type,
        #     ai_response=ai_response,
        #     context=context,
        #     work_id=work_id,
        #     user_id=current_user_id
        # )
        
        return {
            "prompt": prompt,
            "context_summary": {
                "work_title": context.work.title if context.work else None,
                "characters_count": len(context.all_characters),
                "previous_chapters_count": len(context.previous_chapters),
            }
        }
    except Exception as e:
        raise HTTPException(500, f"生成失败: {str(e)}")
```

## 自定义Prompt模板

### 添加新的Prompt模板

1. 在数据库中创建新的PromptTemplate记录：

```python
template = PromptTemplate(
    name="自定义模板",
    description="模板描述",
    template_type="custom_type",
    prompt_content="你的prompt内容，使用 {variable_name} 作为变量占位符",
    version="1.0",
    is_default=True,
    is_active=True,
    variables={
        "variable_name": "变量描述"
    }
)
```

2. 在`PromptContextService`中添加对应的处理逻辑（如果需要特殊处理）

### Prompt模板变量

模板中可以使用以下变量（根据模板类型自动填充）：

#### 英文变量名

- `{work_title}`: 作品标题
- `{work_description}`: 作品描述
- `{work_genre}`: 作品类型
- `{all_characters}`: 所有角色列表（格式化字符串）
- `{chapter_characters}`: 当前章节使用的角色列表
- `{current_chapter_title}`: 当前章节标题
- `{current_chapter_number}`: 当前章节号
- `{current_chapter_summary}`: 当前章节摘要
- `{content}`: 当前章节内容
- `{current_chapter_content}`: 当前章节正文（与`{content}`相同）
- `{current_chapter_outline}`: 当前章节的大纲（JSON格式）
- `{current_chapter_detailed_outline}`: 当前章节的细纲（JSON格式）
- `{outline}`: 当前章节的大纲（JSON格式，兼容旧变量名）
- `{previous_chapters_summary}`: 前文章节摘要
- `{previous_chapters_content}`: 前文内容
- `{previous_outlines}`: 前文大纲
- `{previous_detailed_outlines}`: 前文细纲
- `{locations}`: 地点列表

#### 中文变量名（推荐使用）

- `{作品标题}`: 作品标题
- `{作品描述}`: 作品描述
- `{作品类型}`: 作品类型
- `{所有角色}`: 所有角色列表（格式化字符串）
- `{章节角色}`: 当前章节使用的角色列表
- `{章节标题}`: 当前章节标题
- `{章节号}`: 当前章节号
- `{章节摘要}`: 当前章节摘要
- `{章节内容}`: 当前章节内容
- `{当前章节内容}`: 当前章节正文（与`{章节内容}`相同）
- `{当前章节大纲}`: 当前章节的大纲（JSON格式）
- `{当前章节细纲}`: 当前章节的细纲（JSON格式）
- `{大纲}`: 当前章节的大纲（JSON格式，兼容旧变量名）
- `{前文摘要}`: 前文章节摘要
- `{前文内容}`: 前文内容
- `{前文大纲}`: 前文大纲
- `{前文细纲}`: 前文细纲
- `{地点}`: 地点列表

#### 从Metadata中获取数据

支持从作品和章节的metadata中根据键获取数据：

- `{作品.xxx}`: 从作品的`work_metadata`中获取键为`xxx`的值
- `{章节.xxx}`: 从章节的`chapter_metadata`中获取键为`xxx`的值

**示例**：

如果作品的metadata中有：
```json
{
  "世界观": "现代都市",
  "时代背景": "2024年"
}
```

章节的metadata中有：
```json
{
  "核心冲突": "主角面临选择",
  "情感基调": "紧张"
}
```

那么在prompt中可以使用：
```
作品背景：{作品.世界观}，时代：{作品.时代背景}
本章核心冲突：{章节.核心冲突}，情感基调：{章节.情感基调}
```

#### 变量使用示例

```markdown
# 角色生成Prompt示例

根据以下信息生成新角色：

作品信息：
- 标题：{作品标题}
- 类型：{作品类型}
- 描述：{作品描述}

已有角色：
{所有角色}

前文摘要：
{前文摘要}

请生成一个新角色，要求与已有角色有所区别。
```

```markdown
# 章节生成Prompt示例

根据以下信息生成新章节：

作品：{作品标题}
当前章节：第{章节号}章 - {章节标题}

已有角色：
{所有角色}

当前章节使用的角色：
{章节角色}

前文内容：
{前文内容}

前文大纲：
{前文大纲}

请生成下一章的内容。
```

## 注意事项

1. **ShareDB初始化**：使用服务前需要调用`await prompt_service.initialize()`来初始化ShareDB服务

2. **章节内容获取**：章节内容存储在ShareDB中，服务会自动从ShareDB获取

3. **角色提取**：当前章节使用的角色是通过简单的文本匹配提取的，可以根据需要改进

4. **错误处理**：所有方法都包含错误处理，失败时会回滚数据库事务

5. **性能考虑**：获取前文内容时，默认只获取前3章，可以根据需要调整

## 扩展开发

### 添加新的响应处理逻辑

在`PromptContextService.process_ai_response`方法中添加新的模板类型处理：

```python
elif template_type == "your_new_type":
    return await self._process_your_new_type_response(
        ai_response, context, work_id, user_id
    )
```

然后实现对应的处理方法：

```python
async def _process_your_new_type_response(
    self,
    ai_response: str,
    context: PromptContext,
    work_id: int,
    user_id: int
) -> Dict[str, Any]:
    # 解析AI响应
    # 存储到数据库
    # 返回结果
    pass
```

## 总结

统一的Prompt管理系统提供了：

✅ **集中管理**：所有prompt模板存储在数据库中，易于管理和更新

✅ **自动化**：自动收集环境信息，无需手动拼接

✅ **类型安全**：根据模板类型自动处理响应并存储

✅ **可扩展**：易于添加新的prompt类型和处理逻辑

✅ **一致性**：统一的接口和流程，降低使用复杂度

