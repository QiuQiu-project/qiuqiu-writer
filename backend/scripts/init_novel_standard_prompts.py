#!/usr/bin/env python3
"""
初始化"小说标准模板"各组件的 Prompt 模板
每个组件创建三个 prompt：generate（生成）、validate（校验）、analysis（分析）
"""

import asyncio
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select

from memos.api.core.config import get_settings
from memos.api.models.prompt_template import PromptTemplate
from memos.api.models.template import WorkTemplate

settings = get_settings()
engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ──────────────────────────────────────────────
# Prompt 定义
# 每条记录：(component_id, component_type, data_key, prompt_category, name, description, prompt_content)
# ──────────────────────────────────────────────
PROMPTS = [

    # ======== 基本信息 ========

    # genre - 题材类型
    (
        "genre", "multiselect", None, "generate",
        "题材类型 - 生成",
        "根据作品简介推荐适合的题材标签",
        """\
# 角色
你是一位资深编辑，擅长分析小说类型并精准定位题材。

# 任务
根据以下作品信息，从候选题材中推荐最契合的 1-3 个题材标签，并给出简短理由。

候选题材：言情、悬疑、科幻、玄幻、都市

# 作品信息
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "recommended": ["题材1", "题材2"],
  "reason": "推荐理由"
}
```\
""",
    ),
    (
        "genre", "multiselect", None, "validate",
        "题材类型 - 校验",
        "检查所选题材是否与作品内容相符",
        """\
# 角色
你是一位专业的文学顾问，负责审核作品题材标注的准确性。

# 任务
对照作品简介，判断已选题材是否恰当，指出不匹配之处并给出调整建议。

# 作品信息
已选题材：@work.metadata.genre
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "is_valid": true,
  "issues": ["问题描述（若无则为空列表）"],
  "suggestions": ["调整建议（若无则为空列表）"]
}
```\
""",
    ),
    (
        "genre", "multiselect", None, "analysis",
        "题材类型 - 从章节提取",
        "从章节内容中识别作品所属题材类型",
        """\
# 角色
你是一位网文分类专家，擅长通过阅读内容判断小说题材。

# 任务
阅读以下章节内容，识别该小说所属的 1-3 个题材类型。

候选题材：言情、悬疑、科幻、玄幻、都市、历史、武侠、二次元、游戏、职场、家庭、轻小说

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
["题材1", "题材2"]
```\
""",
    ),

    # summary - 作品简介
    (
        "summary", "textarea", None, "generate",
        "作品简介 - 生成",
        "根据已有信息生成吸引人的作品简介",
        """\
# 角色
你是一位顶级文案策划，擅长为小说撰写能抓住读者眼球的简介。

# 任务
根据以下作品信息，生成一段 150-300 字的作品简介。要求：点明主角、核心冲突、故事钩子，语言流畅有张力。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc
主线剧情：@work.metadata.mainline

# 输出
直接输出简介正文，不需要额外说明。\
""",
    ),
    (
        "summary", "textarea", None, "validate",
        "作品简介 - 校验",
        "检查简介是否清晰展现核心冲突和吸引力",
        """\
# 角色
你是一位严格的编辑，负责审核作品简介的质量。

# 任务
评估当前简介在以下维度的表现，并指出改进方向：
1. 是否清晰介绍主角
2. 是否点明核心冲突
3. 是否包含吸引读者继续阅读的钩子
4. 语言是否流畅精炼

# 当前简介
@work.metadata.summary

# 输出格式（JSON）
```json
{
  "score": 85,
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["不足1", "不足2"],
  "improved_version": "改进后的简介（如有必要）"
}
```\
""",
    ),
    (
        "summary", "textarea", None, "analysis",
        "作品简介 - 从章节提取",
        "从章节内容中提炼作品核心信息，生成或更新作品简介",
        """\
# 角色
你是一位专业编辑，善于从章节内容中提炼作品的核心卖点与故事主线。

# 任务
阅读以下章节内容，提炼出主角信息、核心冲突、故事背景，生成一段 150-250 字的作品简介。
要求：点明主角、核心矛盾、故事钩子，语言流畅有张力。

# 已有简介（供参考，如有则在此基础上补充完善）
{component_data.summary}

# 章节内容
@chapter.content

# 输出
直接输出简介正文，不需要额外说明。\
""",
    ),

    # cover - 封面图
    (
        "cover", "image", None, "generate",
        "封面图 - 生成描述",
        "根据作品信息生成封面设计描述，供设计参考",
        """\
# 角色
你是一位擅长视觉设计的创意总监，了解各类小说封面的设计规律。

# 任务
根据作品信息，生成一段详细的封面设计描述，包括构图、主视觉元素、色调、氛围等。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "composition": "构图描述",
  "main_elements": ["元素1", "元素2"],
  "color_palette": "主色调描述",
  "atmosphere": "整体氛围",
  "reference_style": "参考风格"
}
```\
""",
    ),
    (
        "cover", "image", None, "validate",
        "封面图 - 校验",
        "评估封面是否符合题材风格和市场定位",
        """\
# 角色
你是一位资深书籍装帧顾问，对各类型小说封面有丰富的审美经验。

# 任务
根据作品的题材和调性，评估封面设计的合适程度，并提出改进建议。

# 作品信息
题材：@work.metadata.genre
作品简介：@work.metadata.summary

# 输出格式（JSON）
```json
{
  "is_suitable": true,
  "match_score": 80,
  "issues": ["问题描述"],
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "cover", "image", None, "analysis",
        "封面图 - 从章节提取描述",
        "从章节内容中提取适合封面设计的视觉元素描述",
        """\
# 角色
你是一位视觉策划师，善于从文字内容中提炼适合封面设计的关键视觉元素。

# 任务
阅读以下章节内容，提取其中最具视觉冲击力的场景、人物形象、氛围色调等信息，生成封面设计方向描述。

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
{
  "main_character": "主角外貌关键词",
  "key_scene": "最具代表性的场景描述",
  "atmosphere": "整体氛围（如：神秘、热血、温情）",
  "color_tone": "建议色调",
  "visual_elements": ["视觉元素1", "视觉元素2"]
}
```\
""",
    ),

    # ======== 角色设定 ========

    # char-cards - 角色卡片
    (
        "char-cards", "character-card", "characters", "generate",
        "角色卡片 - 生成",
        "根据作品设定生成完整的角色档案",
        """\
# 角色
你是一位经验丰富的小说策划，擅长构建立体、有深度的角色体系。

# 任务
根据以下作品信息，生成主要角色的档案，包含主角（1-2名）和配角（2-3名），每个角色需包含基本信息、性格特点、背景故事和行为动机。

# 作品信息
题材：@work.metadata.genre
作品简介：@work.metadata.summary
主线剧情：@work.metadata.mainline
世界背景：@work.metadata.world-desc

# 输出格式（JSON）
```json
{
  "characters": [
    {
      "name": "角色姓名",
      "role": "protagonist/supporting/antagonist",
      "gender": "male/female/other",
      "age": "年龄或年龄段",
      "appearance": "外貌描述",
      "personality": ["性格特点1", "性格特点2"],
      "background": "背景故事",
      "motivation": "行为动机",
      "abilities": ["能力/技能1", "能力/技能2"]
    }
  ]
}
```\
""",
    ),
    (
        "char-cards", "character-card", "characters", "validate",
        "角色卡片 - 校验",
        "检查角色设定的完整性和内在一致性",
        """\
# 角色
你是一位专注于角色塑造的文学编辑，擅长发现角色设定中的漏洞和矛盾。

# 任务
审查当前角色列表，重点检查：
1. 角色信息是否完整（姓名、性格、动机等）
2. 角色性格与其背景故事是否自洽
3. 角色间是否有足够的对比和张力
4. 主角的成长弧光是否清晰

# 作品信息
作品简介：@work.metadata.summary
角色数据：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "overall_score": 80,
  "character_issues": [
    {
      "character_name": "角色名",
      "issues": ["问题描述"]
    }
  ],
  "structural_issues": ["角色结构问题"],
  "suggestions": ["改进建议1", "改进建议2"]
}
```\
""",
    ),
    (
        "char-cards", "character-card", "characters", "analysis",
        "角色卡片 - 从章节提取",
        "从章节内容中提取出现的人物信息，生成或更新角色档案",
        """\
# 角色
你是一位专业的小说编辑，擅长从章节内容中识别并整理人物信息。

# 任务
仔细阅读以下章节内容，提取所有出现的角色（主角和配角），整理其姓名、性别、外貌、性格、身份等信息。
- 如果某角色在已有档案中存在，补充或修正其信息
- 如果是新出现的角色，创建新档案
- 只提取章节中有明确描写的信息，不要臆造

# 已有角色档案（供参考）
{component_data.characters}

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
[
  {
    "name": "角色姓名",
    "role": "protagonist/supporting/antagonist",
    "gender": "male/female/other",
    "age": "年龄或年龄段（如不明则留空）",
    "appearance": "外貌描述（来自章节原文）",
    "personality": ["性格特点1", "性格特点2"],
    "background": "背景信息（来自章节内容）",
    "motivation": "行为动机（如章节中有体现）",
    "abilities": ["能力/技能（如有描写）"]
  }
]
```\
""",
    ),

    # char-relations - 人物关系
    (
        "char-relations", "relation-graph", "character_relations", "generate",
        "人物关系 - 生成",
        "根据角色列表构建合理的人物关系网络",
        """\
# 角色
你是一位擅长设计复杂人物关系的故事策划师。

# 任务
根据现有角色列表，为每对关键角色之间设计合理的关系，关系类型包括：亲属、朋友、敌对、恋人、师徒等。关系应服务于主线剧情，制造戏剧张力。

# 作品信息
主线剧情：@work.metadata.mainline
角色列表：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "relations": [
    {
      "source": "角色A姓名",
      "target": "角色B姓名",
      "type": "family/friend/enemy/lover/mentor",
      "description": "关系详细描述",
      "tension_level": "high/medium/low"
    }
  ]
}
```\
""",
    ),
    (
        "char-relations", "relation-graph", "character_relations", "validate",
        "人物关系 - 校验",
        "检查人物关系是否清晰且无逻辑矛盾",
        """\
# 角色
你是一位专注于叙事逻辑的编辑，善于发现人物关系中的矛盾与漏洞。

# 任务
审查当前人物关系图，检查：
1. 关系是否存在逻辑矛盾（如 A 与 B 是朋友，但 B 与 A 是敌人）
2. 关系强度分配是否合理，是否存在孤立角色
3. 关系是否能为主线剧情提供足够的冲突驱动

# 作品信息
主线剧情：@work.metadata.mainline
人物关系：@work.metadata.character_relations

# 输出格式（JSON）
```json
{
  "is_consistent": true,
  "contradictions": ["矛盾描述"],
  "isolated_characters": ["孤立角色名"],
  "conflict_coverage": "冲突覆盖评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "char-relations", "relation-graph", "character_relations", "analysis",
        "人物关系 - 从章节提取",
        "从章节内容中提取角色之间的关系",
        """\
# 角色
你是一位叙事分析师，擅长从文本中识别角色间的互动关系。

# 任务
阅读以下章节内容，提取章节中出现的角色之间的关系。
- 只提取章节中有明确互动或描述的关系
- 如果已有关系档案，补充新发现的关系，或更新已有关系的描述
- 关系类型：family（亲属）、friend（朋友）、enemy（敌对）、lover（恋人）、mentor（师徒）、colleague（同事）、other（其他）

# 已有人物关系（供参考）
{component_data.character_relations}

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
[
  {
    "source": "角色A姓名",
    "target": "角色B姓名",
    "type": "family/friend/enemy/lover/mentor/colleague/other",
    "description": "关系描述（来自章节内容）",
    "tension_level": "high/medium/low"
  }
]
```\
""",
    ),

    # char-timeline - 角色时间线
    (
        "char-timeline", "timeline", "character_timeline", "generate",
        "角色时间线 - 生成",
        "根据剧情和角色生成按时序排列的角色事件时间线",
        """\
# 角色
你是一位擅长构建故事时间轴的叙事策划师。

# 任务
根据主线剧情和角色设定，为关键角色生成时间线事件，标注故事中的重要节点：起点、转折、高潮、结局。

# 作品信息
主线剧情：@work.metadata.mainline
角色列表：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "timeline": [
    {
      "time_label": "故事开端",
      "event": "事件描述",
      "characters_involved": ["角色A", "角色B"],
      "significance": "high/medium/low",
      "emotional_tone": "积极/消极/中性"
    }
  ]
}
```\
""",
    ),
    (
        "char-timeline", "timeline", "character_timeline", "validate",
        "角色时间线 - 校验",
        "检查时间线是否存在时序矛盾和逻辑漏洞",
        """\
# 角色
你是一位严谨的故事逻辑审核员，专门检查叙事时序问题。

# 任务
检查角色时间线，重点关注：
1. 时序是否存在矛盾（后发生的事件是否依赖于未发生的事件）
2. 关键角色在时间线上的行动轨迹是否合理
3. 时间线节奏是否均衡（是否有过于密集或空白的时期）

# 作品信息
角色时间线：@work.metadata.character_timeline

# 输出格式（JSON）
```json
{
  "is_consistent": true,
  "timeline_conflicts": ["冲突描述"],
  "pacing_issues": ["节奏问题描述"],
  "logic_gaps": ["逻辑漏洞描述"],
  "suggestions": ["修正建议"]
}
```\
""",
    ),
    (
        "char-timeline", "timeline", "character_timeline", "analysis",
        "角色时间线 - 从章节提取",
        "从章节内容中提取关键事件，补充到角色时间线",
        """\
# 角色
你是一位叙事记录员，负责从章节内容中整理故事发生的关键事件节点。

# 任务
阅读以下章节内容，提取本章中发生的关键事件，按时序整理为时间线条目。
- 只记录有明确情节意义的事件（转折、冲突、重要对话等）
- 标注涉及的角色

# 已有时间线（供参考，避免重复）
{component_data.character_timeline}

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
[
  {
    "time_label": "故事阶段或章节标识",
    "event": "事件描述",
    "characters_involved": ["角色A", "角色B"],
    "significance": "high/medium/low",
    "emotional_tone": "积极/消极/中性/紧张"
  }
]
```\
""",
    ),

    # ======== 世界设定 ========

    # era - 时代背景
    (
        "era", "select", None, "generate",
        "时代背景 - 生成",
        "根据题材和剧情推荐最适合的时代背景",
        """\
# 角色
你是一位熟悉各类小说世界观构建的策划顾问。

# 任务
根据作品题材和简介，推荐最适合的时代背景，并说明理由。
可选时代：古代、现代、未来、架空

# 作品信息
题材：@work.metadata.genre
作品简介：@work.metadata.summary
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "recommended_era": "推荐时代",
  "reason": "推荐理由",
  "alternative": "备选时代及理由"
}
```\
""",
    ),
    (
        "era", "select", None, "validate",
        "时代背景 - 校验",
        "检查时代背景与故事情节是否协调一致",
        """\
# 角色
你是一位历史与世界观顾问，负责确保故事背景与情节的一致性。

# 任务
评估当前所选时代背景是否与作品题材、剧情和角色设定相符，指出潜在的不协调之处。

# 作品信息
已选时代：@work.metadata.era
题材：@work.metadata.genre
作品简介：@work.metadata.summary
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "is_consistent": true,
  "inconsistencies": ["不一致之处描述"],
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "era", "select", None, "analysis",
        "时代背景 - 从章节提取",
        "从章节内容中识别故事所处的时代背景",
        """\
# 角色
你是一位熟悉各类小说背景的分析师，能够从文字细节中判断故事时代。

# 任务
阅读以下章节内容，根据文中出现的环境描写、道具、语言习惯、社会背景等细节，判断故事所处的时代背景。

可选时代：古代、现代、未来、架空

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
{
  "era": "古代/现代/未来/架空",
  "evidence": ["判断依据1（来自章节）", "判断依据2（来自章节）"]
}
```\
""",
    ),

    # world-desc - 世界描述
    (
        "world-desc", "textarea", None, "generate",
        "世界描述 - 生成",
        "根据题材和时代背景生成详细的世界描述",
        """\
# 角色
你是一位世界观构建专家，擅长为小说创作沉浸感强的故事背景。

# 任务
根据以下作品信息，生成一段 200-400 字的世界描述，涵盖地理环境、社会结构、文化风貌、核心矛盾等维度。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
主线剧情：@work.metadata.mainline

# 输出
直接输出世界描述正文，语言生动有代入感，不需要额外说明。\
""",
    ),
    (
        "world-desc", "textarea", None, "validate",
        "世界描述 - 校验",
        "检查世界描述的自洽性和内在逻辑完整性",
        """\
# 角色
你是一位专注于世界观审核的编辑，善于发现设定漏洞。

# 任务
审查当前世界描述，检查：
1. 世界描述是否自洽（内部逻辑是否矛盾）
2. 描述的详细程度是否足以支撑主线剧情
3. 世界的独特性是否足够（是否有鲜明的区别于其他作品的特色）

# 作品信息
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "consistency_score": 85,
  "logic_issues": ["逻辑问题描述"],
  "depth_assessment": "描述深度评估",
  "uniqueness_score": 70,
  "improvement_suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "world-desc", "textarea", None, "analysis",
        "世界描述 - 从章节提取",
        "从章节内容中提取世界观信息，生成或补充世界描述",
        """\
# 角色
你是一位世界观整理专家，善于从章节描写中提炼故事世界的构成要素。

# 任务
阅读以下章节内容，提取其中涉及的世界观元素：地理环境、社会结构、文化习俗、科技/魔法体系等，整合成一段世界描述。
- 只提取章节中有明确描写的内容
- 如果已有世界描述，在其基础上补充新信息

# 已有世界描述（供参考，如有则补充完善）
{component_data.world-desc}

# 章节内容
@chapter.content

# 输出
直接输出世界描述正文，语言简洁客观，不需要额外说明。\
""",
    ),

    # rules - 世界规则
    (
        "rules", "keyvalue", None, "generate",
        "世界规则 - 生成",
        "根据世界描述生成该世界的核心规则体系",
        """\
# 角色
你是一位专注于奇幻体系构建的世界观设计师，擅长制定逻辑自洽的世界规则。

# 任务
根据世界描述和题材，为故事世界设计 5-8 条核心规则，每条规则需包含名称和详细说明。
规则应涵盖：自然法则、社会规范、超自然/科技体系、禁忌或限制等维度。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc

# 输出格式（JSON）
```json
{
  "rules": [
    {
      "name": "规则名称",
      "description": "规则详细说明",
      "category": "自然/社会/超自然/科技/禁忌"
    }
  ]
}
```\
""",
    ),
    (
        "rules", "keyvalue", None, "validate",
        "世界规则 - 校验",
        "检查世界规则是否自洽、无矛盾且服务于剧情",
        """\
# 角色
你是一位逻辑严谨的世界观审核员，专门检查设定体系的内在一致性。

# 任务
审查当前世界规则，重点检查：
1. 规则之间是否存在矛盾
2. 规则是否与世界描述一致
3. 规则是否能为主线剧情创造有意义的约束和冲突

# 作品信息
世界描述：@work.metadata.world-desc
世界规则：@work.metadata.rules
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "consistency_score": 85,
  "rule_conflicts": ["矛盾描述"],
  "story_integration": "规则与剧情整合度评估",
  "missing_rules": ["建议补充的规则类型"],
  "suggestions": ["修正建议"]
}
```\
""",
    ),
    (
        "rules", "keyvalue", None, "analysis",
        "世界规则 - 从章节提取",
        "从章节内容中提取世界的运行规则或设定约束",
        """\
# 角色
你是一位世界观分析师，擅长从故事内容中识别世界的隐性或显性规则。

# 任务
阅读以下章节内容，提取其中出现的世界规则、设定约束或特殊体系（如修炼等级、魔法规则、社会法律、禁忌等）。
- 只提取章节中有明确体现的规则
- 每条规则用"名称: 描述"的形式表达

# 已有世界规则（供参考，避免重复）
{component_data.rules}

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
[
  {
    "key": "规则名称",
    "value": "规则详细描述（来自章节内容）"
  }
]
```\
""",
    ),

    # factions - 势力设定
    (
        "factions", "faction", "factions", "generate",
        "势力设定 - 生成",
        "根据世界观背景生成主要势力、组织或阵营",
        """\
# 角色
你是一位擅长政治格局设计的故事策划师，善于构建权力博弈的多方势力。

# 任务
根据世界观背景，生成故事中的 3-5 个主要势力，每个势力需包含名称、简介、内部等级、核心目标和与其他势力的关系。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
世界描述：@work.metadata.world-desc
世界规则：@work.metadata.rules

# 输出格式（JSON）
```json
{
  "factions": [
    {
      "name": "势力名称",
      "description": "势力简介",
      "hierarchy": ["最高层", "中层", "基层"],
      "goal": "核心目标",
      "territory": "控制范围",
      "strength": "strong/medium/weak",
      "allies": ["盟友势力"],
      "enemies": ["敌对势力"]
    }
  ]
}
```\
""",
    ),
    (
        "factions", "faction", "factions", "validate",
        "势力设定 - 校验",
        "检查势力设定的层次和相互关系是否合理",
        """\
# 角色
你是一位政治格局顾问，善于评估故事中势力分布的合理性。

# 任务
审查当前势力设定，检查：
1. 势力之间的强弱对比是否合理
2. 势力关系（盟友/敌对）是否存在矛盾
3. 势力体系是否能为主线剧情提供足够的冲突来源

# 作品信息
世界描述：@work.metadata.world-desc
势力设定：@work.metadata.factions
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "balance_score": 80,
  "relationship_conflicts": ["关系矛盾描述"],
  "story_conflict_potential": "冲突潜力评估",
  "missing_roles": ["建议补充的势力类型"],
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "factions", "faction", "factions", "analysis",
        "势力设定 - 从章节提取",
        "从章节内容中提取出现的势力、组织或阵营信息",
        """\
# 角色
你是一位政治格局分析师，善于从故事内容中识别势力结构。

# 任务
阅读以下章节内容，提取其中出现的势力、组织、阵营或帮派，整理其基本信息。
- 只提取章节中有明确提及或描写的势力
- 如果已有势力档案，补充新发现的势力或更新已有信息

# 已有势力档案（供参考）
{component_data.factions}

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
[
  {
    "name": "势力名称",
    "description": "势力简介（来自章节内容）",
    "hierarchy": ["已知层级（如有描写）"],
    "goal": "已知目标（如有体现）",
    "territory": "控制范围（如有描写）",
    "strength": "strong/medium/weak/unknown",
    "allies": ["已知盟友势力"],
    "enemies": ["已知敌对势力"]
  }
]
```\
""",
    ),

    # ======== 剧情设计 ========

    # mainline - 主线剧情
    (
        "mainline", "textarea", None, "generate",
        "主线剧情 - 生成",
        "根据角色设定和世界观构建完整的主线剧情",
        """\
# 角色
你是一位顶级故事策划师，擅长构建逻辑严密、情感饱满的叙事弧线。

# 任务
根据以下作品信息，生成一段 300-500 字的主线剧情描述，包含：故事起点、核心冲突升级过程、高潮决战、结局走向。结构遵循三幕式叙事。

# 作品信息
题材：@work.metadata.genre
时代背景：@work.metadata.era
作品简介：@work.metadata.summary
角色设定：@work.metadata.characters
世界描述：@work.metadata.world-desc

# 输出
直接输出主线剧情正文，语言简洁有力，不需要额外说明。\
""",
    ),
    (
        "mainline", "textarea", None, "validate",
        "主线剧情 - 校验",
        "检查主线剧情的结构完整性和逻辑一致性",
        """\
# 角色
你是一位资深故事编辑，专注于叙事结构的完整性和逻辑自洽。

# 任务
审查当前主线剧情，检查：
1. 是否具备完整的三幕结构（起承转合）
2. 核心冲突是否贯穿始终并有合理升级
3. 情节逻辑是否自洽（是否有明显漏洞）
4. 结局是否与前期铺垫相符

# 主线剧情
@work.metadata.mainline

# 作品信息
题材：@work.metadata.genre
角色设定：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "structure_score": 80,
  "structure_issues": ["结构问题描述"],
  "logic_issues": ["逻辑漏洞描述"],
  "conflict_arc": "冲突弧线评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "mainline", "textarea", None, "analysis",
        "主线剧情 - 从章节提取",
        "从章节内容中提炼主线剧情走向，生成或更新主线描述",
        """\
# 角色
你是一位资深编辑，擅长从章节内容中梳理故事主线脉络。

# 任务
阅读以下章节内容，提炼本章对主线剧情的贡献：核心事件、冲突进展、主角行动。
综合已有主线信息，生成一段完整的主线剧情描述，包含故事走向和关键节点。

# 已有主线剧情（供参考，如有则在此基础上补充）
{component_data.mainline}

# 章节内容
@chapter.content

# 输出
直接输出主线剧情正文，结构清晰，涵盖已知的起承转合，不需要额外说明。\
""",
    ),

    # conflicts - 核心冲突
    (
        "conflicts", "keyvalue", None, "generate",
        "核心冲突 - 生成",
        "提炼并细化故事中的核心冲突层次",
        """\
# 角色
你是一位专注于戏剧冲突设计的故事顾问，擅长构建多层次的叙事张力。

# 任务
根据主线剧情，提炼并细化 3-5 个核心冲突，每个冲突需包含冲突类型、冲突双方、冲突本质和对故事的影响。
冲突类型：人与人、人与自我、人与社会、人与自然、人与命运

# 作品信息
主线剧情：@work.metadata.mainline
角色设定：@work.metadata.characters
世界描述：@work.metadata.world-desc

# 输出格式（JSON）
```json
{
  "conflicts": [
    {
      "name": "冲突名称",
      "type": "人与人/人与自我/人与社会/人与自然/人与命运",
      "parties": ["冲突方A", "冲突方B"],
      "essence": "冲突本质描述",
      "story_impact": "对故事的影响",
      "intensity": "high/medium/low"
    }
  ]
}
```\
""",
    ),
    (
        "conflicts", "keyvalue", None, "validate",
        "核心冲突 - 校验",
        "检查各冲突是否层次分明且相互关联",
        """\
# 角色
你是一位叙事结构审核员，专注于评估冲突设计的合理性和完整性。

# 任务
审查当前核心冲突列表，检查：
1. 冲突之间是否层次分明（主次关系是否清晰）
2. 冲突是否相互关联、共同指向主题
3. 是否存在冗余或矛盾的冲突

# 核心冲突
@work.metadata.conflicts

# 作品信息
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "hierarchy_clarity": "high/medium/low",
  "redundant_conflicts": ["冗余冲突描述"],
  "missing_conflict_types": ["建议补充的冲突类型"],
  "thematic_alignment": "冲突与主题的契合度评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "conflicts", "keyvalue", None, "analysis",
        "核心冲突 - 从章节提取",
        "从章节内容中识别并提取核心冲突",
        """\
# 角色
你是一位叙事分析师，擅长识别故事中的冲突层次和矛盾关系。

# 任务
阅读以下章节内容，识别本章中体现的冲突（人与人、人与自我、人与社会、人与自然、人与命运），整理为结构化数据。
- 只提取章节中有明确体现的冲突
- 如果已有冲突档案，补充新发现的冲突类型

# 已有核心冲突（供参考）
{component_data.conflicts}

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
[
  {
    "key": "冲突名称",
    "value": "冲突描述：冲突双方 + 冲突本质 + 在本章的具体体现"
  }
]
```\
""",
    ),

    # turning-points - 关键转折
    (
        "turning-points", "list", None, "generate",
        "关键转折 - 生成",
        "根据主线剧情设计具有戏剧性的关键转折点",
        """\
# 角色
你是一位故事节奏大师，擅长在恰当的时机设置出人意料又在情理之中的转折。

# 任务
根据主线剧情，设计 3-6 个关键转折点，每个转折点需明确发生时机、转折内容、读者情绪变化。

# 作品信息
主线剧情：@work.metadata.mainline
核心冲突：@work.metadata.conflicts
角色设定：@work.metadata.characters

# 输出格式（JSON）
```json
{
  "turning_points": [
    {
      "name": "转折名称",
      "timing": "故事前段/中段/后段",
      "description": "转折内容描述",
      "trigger": "触发原因",
      "emotional_shift": "读者情绪变化（如：惊喜/心痛/愤怒）",
      "plot_impact": "对后续剧情的影响"
    }
  ]
}
```\
""",
    ),
    (
        "turning-points", "list", None, "validate",
        "关键转折 - 校验",
        "检查转折点是否具有足够戏剧性且符合逻辑",
        """\
# 角色
你是一位故事逻辑审核员，专注于检查情节转折的合理性。

# 任务
审查当前关键转折点列表，检查：
1. 每个转折是否有充分的前期铺垫（是否突兀）
2. 转折后的发展是否符合人物性格逻辑
3. 转折点的分布是否合理（是否集中或稀疏）

# 关键转折
@work.metadata.turning-points

# 作品信息
主线剧情：@work.metadata.mainline

# 输出格式（JSON）
```json
{
  "foreshadowing_adequacy": "铺垫充分度评估",
  "abrupt_turns": ["突兀转折描述"],
  "character_consistency_issues": ["性格逻辑问题"],
  "distribution_assessment": "分布合理性评估",
  "suggestions": ["改进建议"]
}
```\
""",
    ),
    (
        "turning-points", "list", None, "analysis",
        "关键转折 - 从章节提取",
        "从章节内容中识别关键转折点",
        """\
# 角色
你是一位叙事节奏分析师，擅长识别故事中的转折节点。

# 任务
阅读以下章节内容，识别本章中发生的关键转折点（情节反转、重要揭露、人物决策的关键时刻等）。
- 只提取有明确叙事意义的转折，不记录日常情节推进
- 如果已有转折档案，补充本章新发现的转折

# 已有关键转折（供参考，避免重复）
{component_data.turning-points}

# 章节内容
@chapter.content

# 输出格式（JSON）
```json
[
  "转折描述：时机 + 转折内容 + 对故事的影响"
]
```\
""",
    ),
]


async def init_novel_standard_prompts():
    """为小说标准模板的每个组件初始化三个 prompt"""
    async with AsyncSessionLocal() as db:
        try:
            # 查找小说标准模板
            stmt = select(WorkTemplate).where(
                WorkTemplate.name == "小说标准模板",
                WorkTemplate.is_system == True,
            )
            result = await db.execute(stmt)
            template = result.scalar_one_or_none()

            if not template:
                print("❌ 未找到「小说标准模板」，请先运行 init_work_templates.py")
                return

            print(f"✅ 找到模板：{template.name}（ID: {template.id}）")
            print()

            created = 0
            skipped = 0
            updated = 0

            for (comp_id, comp_type, data_key, category,
                 name, description, prompt_content) in PROMPTS:

                # 检查是否已存在
                check = select(PromptTemplate).where(
                    PromptTemplate.work_template_id == template.id,
                    PromptTemplate.component_id == comp_id,
                    PromptTemplate.prompt_category == category,
                )
                existing = (await db.execute(check)).scalar_one_or_none()

                if existing:
                    # analysis prompt 始终覆盖更新（保证内容与脚本同步）
                    if category == "analysis":
                        existing.name = name
                        existing.description = description
                        existing.prompt_content = prompt_content
                        print(f"  🔄 更新: {name}")
                        updated += 1
                    else:
                        print(f"  ⏭  跳过（已存在）: {name}")
                        skipped += 1
                    continue

                pt = PromptTemplate(
                    name=name,
                    description=description,
                    template_type=f"component_{category}",
                    prompt_content=prompt_content,
                    version="1.0",
                    is_default=False,
                    is_active=True,
                    variables={},
                    template_metadata={},
                    usage_count=0,
                    component_id=comp_id,
                    component_type=comp_type,
                    prompt_category=category,
                    data_key=data_key,
                    work_template_id=template.id,
                )
                db.add(pt)
                print(f"  ✅ 创建: {name}")
                created += 1

            await db.commit()

            print()
            print("=" * 60)
            print(f"✅ 初始化完成！创建 {created} 条，更新 {updated} 条，跳过 {skipped} 条")
            print("=" * 60)

        except Exception as e:
            await db.rollback()
            print(f"❌ 初始化失败: {e}")
            import traceback
            traceback.print_exc()
            raise


async def main():
    print("=" * 60)
    print("初始化小说标准模板组件 Prompt")
    print("=" * 60)
    print()
    try:
        await init_novel_standard_prompts()
    except Exception as e:
        print(f"❌ 失败: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
