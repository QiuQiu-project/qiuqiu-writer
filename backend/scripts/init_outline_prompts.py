#!/usr/bin/env python3
"""
初始化大纲生成（outline_generation）和细纲生成（detailed_outline_generation）全局 Prompt 模板

这两个模板是全局模板（work_template_id=NULL），用于章节设置弹窗中的 AI 大纲/细纲生成功能。

变量说明（@ 语法）：
  @work_title              作品标题
  @work_genre              作品类型
  @all_characters          作品所有角色（格式化文本，来自 work_metadata.component_data）
  @previous_chapters_summary  前文章节摘要（按章节号升序）
  @chapter_title           本章章节标题（由前端传入）
  @chapter_characters      本章出场人物（由前端传入，格式: "- 角色A\n- 角色B"）
  @locations               本章主要地点（由前端传入，格式: "- 地点A\n- 地点B"）
  @current_chapter_outline 本章大纲（细纲生成时由前端传入）
"""

import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select

from memos.api.core.config import get_settings
from memos.api.models.prompt_template import PromptTemplate

settings = get_settings()
engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ─── Prompt 内容定义 ──────────────────────────────────────────────────────────

OUTLINE_GENERATION_PROMPT = """\
你是一位专业的网络小说写作顾问，擅长根据作品背景和前文情节为作者规划章节结构。

## 作品信息
- 标题：@work_title
- 类型：@work_genre

## 前文章节摘要
@previous_chapters_summary

## 本章基础信息
- 章节标题：@chapter_title
- 出场人物：
@chapter_characters
- 主要场景/地点：
@locations

## 作品角色（参考）
@all_characters

---

## 任务
请根据以上信息，为本章生成一份简洁有效的**大纲**，帮助作者把握本章的方向和节奏。

大纲应包含以下要素：
1. **本章核心目标** — 这一章要完成什么叙事功能（如：推进主线、塑造角色、制造悬念等）
2. **主要情节脉络** — 3~5 个关键情节节点，按顺序列出
3. **核心冲突/驱动力** — 本章的主要矛盾或推动故事的动力
4. **情感基调** — 本章的整体氛围与情感走向
5. **结尾钩子** — 章末悬念或伏笔，引导读者继续阅读

## 输出要求
- 直接输出大纲内容，**不要 JSON 格式**
- 语言简洁，条理清晰，便于写作参考
- 总字数控制在 400 字以内
"""

DETAILED_OUTLINE_GENERATION_PROMPT = """\
你是一位专业的网络小说写作顾问，擅长将章节大纲拆解为详细的场景细纲，帮助作者有条不紊地写作。

## 作品信息
- 标题：@work_title
- 类型：@work_genre

## 前文章节摘要
@previous_chapters_summary

## 本章基础信息
- 章节标题：@chapter_title
- 出场人物：
@chapter_characters
- 主要场景/地点：
@locations

## 本章大纲
@current_chapter_outline

---

## 任务
请根据以上大纲，将本章拆解为 3~6 个**详细场景**，形成可直接用于写作的**细纲**。

每个场景应包含以下信息：
- **场景序号与标题**（如：场景一 · 初遇）
- **时间与地点**
- **登场人物**
- **核心动作/事件** — 本场景发生了什么
- **关键对话要点** — 需要传达的信息或情感（若有）
- **情绪/氛围变化** — 本场景的情绪走向
- **场景出口** — 如何过渡到下一场景

## 输出要求
- 直接输出细纲内容，**不要 JSON 格式**
- 按场景顺序编排，层次清晰，便于按图索骥地写作
- 总字数控制在 600 字以内
"""


# ─── 初始化函数 ───────────────────────────────────────────────────────────────

async def _upsert_prompt(
    db: AsyncSession,
    template_type: str,
    name: str,
    description: str,
    prompt_content: str,
    version: str = "1.0",
    force_update: bool = False,
) -> None:
    """若同类型默认全局模板已存在则跳过（或按 force_update 强制更新），否则创建。"""
    stmt = select(PromptTemplate).where(
        PromptTemplate.template_type == template_type,
        PromptTemplate.work_template_id == None,
        PromptTemplate.is_default == True,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        if force_update:
            existing.name = name
            existing.description = description
            existing.prompt_content = prompt_content
            existing.version = version
            await db.commit()
            print(f"🔄 已更新：[{template_type}] {name} (id={existing.id})")
        else:
            print(f"✅ 已存在，跳过：[{template_type}] {existing.name} (id={existing.id})")
        return

    template = PromptTemplate(
        name=name,
        description=description,
        template_type=template_type,
        prompt_content=prompt_content,
        version=version,
        is_default=True,
        is_active=True,
        work_template_id=None,  # 全局模板
        creator_id=None,        # 系统创建
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    print(f"✅ 已创建：[{template_type}] {name} (id={template.id})")


async def init_outline_prompts(force_update: bool = False) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await _upsert_prompt(
                db,
                template_type="outline_generation",
                name="章节大纲生成",
                description="根据作品背景、前文摘要、本章出场人物和地点，生成章节大纲（纯文本输出）",
                prompt_content=OUTLINE_GENERATION_PROMPT,
                version="1.0",
                force_update=force_update,
            )
            await _upsert_prompt(
                db,
                template_type="detailed_outline_generation",
                name="章节细纲生成",
                description="在大纲基础上，将本章拆解为详细的场景细纲（纯文本输出）",
                prompt_content=DETAILED_OUTLINE_GENERATION_PROMPT,
                version="1.0",
                force_update=force_update,
            )
        except Exception as e:
            await db.rollback()
            print(f"❌ 初始化失败: {e}")
            raise


async def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="初始化大纲/细纲生成 Prompt 模板")
    parser.add_argument(
        "--force", action="store_true",
        help="强制更新已存在的默认模板（覆盖 prompt 内容）"
    )
    args = parser.parse_args()

    print("🚀 开始初始化大纲/细纲生成 Prompt 模板...")
    try:
        await init_outline_prompts(force_update=args.force)
        print("✅ 初始化完成")
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
