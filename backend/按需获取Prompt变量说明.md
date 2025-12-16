# Prompt变量按需获取功能说明

## 概述

系统现在支持根据prompt模板中实际使用的变量，自动判断需要获取哪些信息，只获取必要的数据，提高效率。

## 功能特点

1. **自动分析**：解析prompt模板，提取所有使用的变量
2. **按需获取**：只获取prompt中实际需要的信息
3. **性能优化**：避免获取不必要的数据，减少数据库查询和ShareDB访问
4. **向后兼容**：仍然支持手动构建context的方式

## 使用方法

### 方法1：自动按需获取（推荐）

```python
from memos.api.services.prompt_context_service import PromptContextService

# 创建服务实例
prompt_service = PromptContextService(db)
await prompt_service.initialize()

# 获取模板
template = await prompt_service.get_prompt_template("character_generation")

# 直接格式化prompt，系统会自动分析需要的变量并获取
prompt = await prompt_service.format_prompt(
    template=template,
    work_id=1,  # 必需
    chapter_id=5,  # 可选
    auto_build_context=True  # 默认True
)
```

### 方法2：手动指定需要的变量

```python
# 先分析prompt需要的变量
requirements = prompt_service.extract_required_variables(template.prompt_content)

# 根据需要的变量构建上下文
context = await prompt_service.build_context(
    work_id=1,
    chapter_id=5,
    requirements=requirements  # 根据prompt需要的变量
)

# 格式化prompt
prompt = await prompt_service.format_prompt(
    template=template,
    context=context
)
```

### 方法3：传统方式（仍然支持）

```python
# 手动构建上下文（获取所有信息）
context = await prompt_service.build_context(
    work_id=1,
    chapter_id=5,
    include_characters=True,
    include_locations=True,
    include_previous_chapters=3
)

# 格式化prompt
prompt = await prompt_service.format_prompt(
    template=template,
    context=context
)
```

## 变量需求分析

系统会根据prompt中使用的变量，自动判断需要获取哪些信息：

| Prompt中使用的变量 | 需要获取的信息 |
|-------------------|---------------|
| `{所有角色}` / `{all_characters}` | 所有角色 |
| `{章节角色}` / `{chapter_characters}` | 所有角色 + 章节内容（用于提取章节角色） |
| `{地点}` / `{locations}` | 地点信息 |
| `{前文摘要}` / `{previous_chapters_summary}` | 前文章节基本信息 |
| `{前文内容}` / `{previous_chapters_content}` | 前文章节基本信息 + 前文内容 |
| `{前文大纲}` / `{previous_outlines}` | 前文章节基本信息 + 前文大纲 |
| `{前文细纲}` / `{previous_detailed_outlines}` | 前文章节基本信息 + 前文细纲 |
| `{章节内容}` / `{content}` | 章节内容（从ShareDB获取） |
| `{作品.xxx}` | 作品信息（总是获取） |
| `{章节.xxx}` | 章节信息（总是获取） |

## 使用示例

### 示例1：只需要角色信息的Prompt

```markdown
# Prompt模板
根据以下信息生成新角色：

作品：{作品标题}
已有角色：{所有角色}

请生成一个新角色。
```

**系统行为**：
- ✅ 获取作品信息
- ✅ 获取所有角色
- ❌ 不获取地点信息
- ❌ 不获取前文信息
- ❌ 不获取章节内容

### 示例2：需要前文摘要的Prompt

```markdown
# Prompt模板
根据前文生成新章节：

作品：{作品标题}
前文摘要：{前文摘要}

请生成下一章。
```

**系统行为**：
- ✅ 获取作品信息
- ✅ 获取前文章节基本信息（用于生成摘要）
- ❌ 不获取角色信息
- ❌ 不获取前文内容（只需要摘要）
- ❌ 不获取地点信息

### 示例3：需要完整前文信息的Prompt

```markdown
# Prompt模板
根据前文生成新章节：

作品：{作品标题}
已有角色：{所有角色}
前文内容：{前文内容}
前文大纲：{前文大纲}

请生成下一章。
```

**系统行为**：
- ✅ 获取作品信息
- ✅ 获取所有角色
- ✅ 获取前文章节基本信息
- ✅ 获取前文内容（从ShareDB）
- ✅ 获取前文大纲
- ❌ 不获取前文细纲（未使用）
- ❌ 不获取地点信息

## API使用示例

### 在API端点中使用

```python
from fastapi import APIRouter, Depends
from memos.api.services.prompt_context_service import PromptContextService

@router.post("/api/v1/prompt/format")
async def format_prompt(
    template_id: int,
    work_id: int,
    chapter_id: Optional[int] = None,
    db: AsyncSession = Depends(get_async_db)
):
    """格式化prompt（自动按需获取变量）"""
    prompt_service = PromptContextService(db)
    await prompt_service.initialize()
    
    # 获取模板
    template = await prompt_service.get_prompt_template(
        template_type="character_generation",
        template_id=template_id
    )
    
    if not template:
        raise HTTPException(404, "模板不存在")
    
    # 自动按需获取变量并格式化
    prompt = await prompt_service.format_prompt(
        template=template,
        work_id=work_id,
        chapter_id=chapter_id,
        auto_build_context=True  # 自动根据prompt需要的变量获取信息
    )
    
    return {"prompt": prompt}
```

## 性能优化效果

### 优化前（获取所有信息）
- 查询所有角色：1次数据库查询
- 查询所有地点：1次数据库查询
- 查询前N章：1次数据库查询
- 获取前N章内容：N次ShareDB查询
- 获取前N章大纲：从数据库读取
- 获取前N章细纲：从数据库读取

**总计**：2-3次数据库查询 + N次ShareDB查询

### 优化后（按需获取）
如果prompt只需要`{所有角色}`：
- 查询所有角色：1次数据库查询

**总计**：1次数据库查询

**性能提升**：减少不必要的数据库查询和ShareDB访问，特别是在处理大量章节时效果明显。

## 注意事项

1. **作品和章节信息**：总是会获取（因为metadata访问需要）
2. **章节角色提取**：如果需要`{章节角色}`，系统会自动获取章节内容来提取角色
3. **前文信息**：如果需要任何前文相关变量，会获取前文章节基本信息
4. **向后兼容**：仍然支持手动构建context的方式，不会破坏现有代码

## 最佳实践

1. **使用自动模式**：推荐使用`auto_build_context=True`，让系统自动判断
2. **明确变量需求**：在prompt模板中明确使用需要的变量，避免使用不需要的变量
3. **批量处理**：如果需要多次格式化同一个模板，可以手动构建一次context，然后重复使用

## 总结

按需获取功能可以显著提高系统性能，特别是在处理大量数据时。系统会自动分析prompt需要的变量，只获取必要的信息，减少不必要的数据库查询和ShareDB访问。


