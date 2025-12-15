# Prompt上下文增强说明

## 概述

系统现在支持更细粒度的上下文信息获取，包括：
- 当前章节的正文、大纲、细纲
- 前n章的大纲、细纲、正文（可以分别设置数量）

## 新增功能

### 1. 当前章节信息

现在会自动获取当前章节的：
- **正文**：从ShareDB获取章节内容
- **大纲**：从章节metadata中获取
- **细纲**：从章节metadata中获取

### 2. 分别设置前n章的数量

可以分别设置需要获取的前n章数量：
- `include_previous_chapters`: 基本信息数量（用于摘要等）
- `include_previous_content`: 前n章的正文数量
- `include_previous_outlines`: 前n章的大纲数量
- `include_previous_detailed_outlines`: 前n章的细纲数量

## 新增变量

### 当前章节相关变量

#### 英文变量
- `{current_chapter_content}`: 当前章节正文
- `{current_chapter_outline}`: 当前章节大纲（JSON格式）
- `{current_chapter_detailed_outline}`: 当前章节细纲（JSON格式）

#### 中文变量
- `{当前章节内容}`: 当前章节正文
- `{当前章节大纲}`: 当前章节大纲（JSON格式）
- `{当前章节细纲}`: 当前章节细纲（JSON格式）

### 兼容旧变量

- `{content}` / `{章节内容}`: 当前章节内容（与`{当前章节内容}`相同）
- `{outline}` / `{大纲}`: 当前章节大纲（与`{当前章节大纲}`相同）

## 使用示例

### 示例1：分别设置前n章的数量

```python
context = await prompt_service.build_context(
    work_id=1,
    chapter_id=10,
    include_previous_chapters=5,  # 获取前5章的基本信息（用于摘要）
    include_previous_content=2,  # 只获取前2章的正文（节省资源）
    include_previous_outlines=5,  # 获取前5章的大纲
    include_previous_detailed_outlines=1  # 只获取前1章的细纲
)
```

### 示例2：在Prompt中使用当前章节信息

```markdown
# 章节生成Prompt

当前章节信息：
- 标题：{章节标题}
- 章节号：第{章节号}章
- 正文：{当前章节内容}
- 大纲：{当前章节大纲}
- 细纲：{当前章节细纲}

前文信息：
- 前文摘要：{前文摘要}
- 前文内容：{前文内容}
- 前文大纲：{前文大纲}
- 前文细纲：{前文细纲}

请根据以上信息生成下一章。
```

### 示例3：只使用大纲和细纲（不获取正文）

```python
# 如果只需要大纲和细纲，不获取正文，可以节省大量资源
context = await prompt_service.build_context(
    work_id=1,
    chapter_id=10,
    include_previous_chapters=5,
    include_previous_content=0,  # 不获取正文
    include_previous_outlines=5,  # 获取前5章的大纲
    include_previous_detailed_outlines=3  # 获取前3章的细纲
)
```

## 性能优化

通过分别设置前n章的数量，可以：

1. **节省资源**：如果只需要大纲，就不获取正文（正文通常很大）
2. **提高速度**：减少ShareDB查询次数
3. **灵活配置**：根据prompt的实际需求获取信息

### 性能对比

**优化前**（获取前5章的所有信息）：
- 5次ShareDB查询（获取正文）
- 5次数据库查询（获取大纲和细纲）

**优化后**（只获取前2章正文，前5章大纲）：
- 2次ShareDB查询（只获取前2章正文）
- 5次数据库查询（获取前5章大纲）
- **节省60%的ShareDB查询**

## 自动按需获取

系统会自动分析prompt中使用的变量，只获取需要的信息：

```python
# 系统会自动判断需要获取哪些信息
prompt = await prompt_service.format_prompt(
    template=template,
    work_id=1,
    chapter_id=10,
    auto_build_context=True  # 自动按需获取
)
```

如果prompt中使用了`{前文大纲}`但没有使用`{前文内容}`，系统只会获取大纲，不会获取正文。

## 注意事项

1. **默认值**：如果不指定`include_previous_content`、`include_previous_outlines`、`include_previous_detailed_outlines`，它们会使用`include_previous_chapters`的值

2. **数量限制**：系统会取最大值来获取章节列表，然后分别截取需要的信息

3. **空值处理**：如果章节没有大纲或细纲，会返回空字典`{}`，格式化后会显示为"无"

4. **JSON格式**：大纲和细纲以JSON格式提供，便于在prompt中使用

## 总结

通过这次增强，系统现在支持：

✅ **当前章节完整信息**：正文、大纲、细纲

✅ **分别设置前n章数量**：大纲、细纲、正文可以独立设置

✅ **性能优化**：只获取需要的信息，节省资源

✅ **自动识别**：根据prompt使用的变量自动判断需要获取哪些信息

✅ **向后兼容**：保留旧变量名，不影响现有代码

