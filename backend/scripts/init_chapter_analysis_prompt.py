#!/usr/bin/env python3
"""
初始化章节分析Prompt模板（JSON格式，包含大纲和细纲）
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select

from memos.api.core.config import get_settings
from memos.api.models.prompt_template import PromptTemplate

settings = get_settings()

# 创建数据库引擎
engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_chapter_analysis_prompt():
    """初始化章节分析prompt模板（JSON格式）"""
    async with AsyncSessionLocal() as db:
        try:
            # 检查是否已存在默认模板
            stmt = select(PromptTemplate).where(
                PromptTemplate.template_type == "chapter_analysis",
                PromptTemplate.is_default == True
            )
            result = await db.execute(stmt)
            existing_template = result.scalar_one_or_none()
            
            if existing_template:
                print(f"✅ 默认章节分析prompt模板已存在: {existing_template.id} - {existing_template.name}")
                # 可以选择更新现有模板
                # existing_template.prompt_content = new_prompt_content
                # await db.commit()
                return
            
            # 创建新的JSON格式prompt模板
            prompt_content = """# 角色
你是一位经验丰富的小说编辑和金牌剧情分析师。你擅长解构故事，洞察每一章节的功能、节奏和情感，并能将其转化为高度结构化的分析报告。

# 任务
我将提供一部小说的章节正文。你的任务是通读并深刻理解这个章节，然后分析并提取以下信息：
1. 章节基本信息（标题、章节号、概要）
2. 章节大纲（核心功能、关键情节点、画面感、氛围、结尾钩子）
3. 章节细纲（详细的小节划分）

# 输出格式要求
**必须严格按照以下JSON格式输出，不要添加任何其他文字：**

```json
{
  "chapter_number": 章节号（数字）,
  "title": "章节标题",
  "summary": "章节概要（2-3句话）",
  "outline": {
    "core_function": "本章核心功能/目的",
    "key_points": ["关键情节点1", "关键情节点2"],
    "visual_scenes": ["画面1", "画面2"],
    "atmosphere": ["氛围1", "氛围2"],
    "hook": "结尾钩子"
  },
  "detailed_outline": {
    "sections": [
      {
        "section_number": 1,
        "title": "小节标题",
        "content": "小节内容概要"
      }
    ]
  }
}
```

# 重要提示
1. **必须输出有效的JSON格式**，不要添加任何Markdown代码块标记外的文字
2. 章节号必须准确提取，统一转换为阿拉伯数字
3. **每一章必须包含outline（大纲）和detailed_outline（细纲）字段**，这是必需字段，不能省略
4. outline字段必须包含：core_function（核心功能）、key_points（关键情节点）、visual_scenes（画面感）、atmosphere（氛围）、hook（结尾钩子）
5. detailed_outline字段必须包含sections数组，每个section包含section_number、title、content

# 章节内容
{content}

# 开始分析
请严格按照上述JSON格式输出分析结果："""
            
            # 创建默认模板
            template = PromptTemplate(
                name="章节分析模板（JSON格式）",
                description="用于章节分析的模板，返回JSON格式数据，包含大纲和细纲",
                template_type="chapter_analysis",
                prompt_content=prompt_content,
                version="2.0",
                is_default=True,
                is_active=True,
                variables={
                    "content": "章节内容"
                },
                template_metadata={
                    "source": "system",
                    "format": "json",
                    "features": [
                        "章节大纲提取",
                        "章节细纲提取",
                        "结构化JSON输出"
                    ]
                },
                creator_id=None,  # 系统创建
            )
            
            db.add(template)
            await db.commit()
            await db.refresh(template)
            
            print(f"✅ 成功创建默认章节分析prompt模板: {template.id} - {template.name}")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ 初始化失败: {e}")
            raise


async def main():
    """主函数"""
    print("🚀 开始初始化章节分析Prompt模板（JSON格式）...")
    try:
        await init_chapter_analysis_prompt()
        print("✅ 初始化完成")
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

