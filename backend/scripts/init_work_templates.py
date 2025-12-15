#!/usr/bin/env python3
"""
初始化作品模板
将默认的作品模板插入数据库
"""

import asyncio
import sys
import json
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.future import select

from memos.api.core.config import get_settings
from memos.api.models.template import WorkTemplate

settings = get_settings()

# 创建数据库引擎
engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# 默认模板配置（从前端 WorkInfoManager.tsx 中提取）
DEFAULT_TEMPLATES = [
    {
        "id": "novel-standard",
        "name": "小说标准模板",
        "description": "通用小说创作模板",
        "work_type": "novel",
        "category": "standard",
        "is_system": True,
        "is_public": True,
        "template_config": {
            "id": "novel-standard",
            "name": "小说标准模板",
            "description": "通用小说创作模板",
            "modules": [
                {
                    "id": "basic-info",
                    "name": "基本信息",
                    "icon": "FileText",
                    "color": "#3b82f6",
                    "components": [
                        {
                            "id": "genre",
                            "type": "multiselect",
                            "label": "题材类型",
                            "config": {
                                "options": [
                                    {"label": "言情", "value": "romance", "color": "#ec4899"},
                                    {"label": "悬疑", "value": "mystery", "color": "#8b5cf6"},
                                    {"label": "科幻", "value": "scifi", "color": "#06b6d4"},
                                    {"label": "玄幻", "value": "fantasy", "color": "#f59e0b"},
                                    {"label": "都市", "value": "urban", "color": "#10b981"},
                                ],
                                "maxCount": 3
                            },
                            "value": []
                        },
                        {
                            "id": "summary",
                            "type": "textarea",
                            "label": "作品简介",
                            "config": {"placeholder": "输入作品简介..."},
                            "value": ""
                        },
                        {
                            "id": "cover",
                            "type": "image",
                            "label": "封面图",
                            "config": {},
                            "value": ""
                        },
                    ]
                },
                {
                    "id": "characters",
                    "name": "角色设定",
                    "icon": "Users",
                    "color": "#8b5cf6",
                    "components": [
                        {
                            "id": "char-tabs",
                            "type": "tabs",
                            "label": "角色管理",
                            "config": {
                                "tabs": [
                                    {
                                        "id": "list",
                                        "label": "角色列表",
                                        "components": [
                                            {
                                                "id": "char-cards",
                                                "type": "character-card",
                                                "label": "角色卡片",
                                                "config": {},
                                                "value": []
                                            }
                                        ]
                                    },
                                    {
                                        "id": "relations",
                                        "label": "关系图谱",
                                        "components": [
                                            {
                                                "id": "char-relations",
                                                "type": "relation-graph",
                                                "label": "人物关系",
                                                "config": {
                                                    "nodeTypes": [
                                                        {"type": "protagonist", "label": "主角", "color": "#ef4444"},
                                                        {"type": "supporting", "label": "配角", "color": "#3b82f6"},
                                                        {"type": "antagonist", "label": "反派", "color": "#6b7280"},
                                                    ],
                                                    "relationTypes": [
                                                        {"type": "family", "label": "亲属", "color": "#ec4899"},
                                                        {"type": "friend", "label": "朋友", "color": "#10b981"},
                                                        {"type": "enemy", "label": "敌对", "color": "#ef4444"},
                                                        {"type": "lover", "label": "恋人", "color": "#f472b6"},
                                                    ]
                                                },
                                                "value": {"characters": [], "relations": []}
                                            }
                                        ]
                                    },
                                    {
                                        "id": "timeline",
                                        "label": "时间线",
                                        "components": [
                                            {
                                                "id": "char-timeline",
                                                "type": "timeline",
                                                "label": "角色时间线",
                                                "config": {},
                                                "value": []
                                            }
                                        ]
                                    },
                                ]
                            },
                            "value": None
                        },
                    ]
                },
                {
                    "id": "world",
                    "name": "世界设定",
                    "icon": "Map",
                    "color": "#10b981",
                    "components": [
                        {
                            "id": "era",
                            "type": "select",
                            "label": "时代背景",
                            "config": {
                                "options": [
                                    {"label": "古代", "value": "ancient"},
                                    {"label": "现代", "value": "modern"},
                                    {"label": "未来", "value": "future"},
                                    {"label": "架空", "value": "fictional"},
                                ]
                            },
                            "value": ""
                        },
                        {
                            "id": "world-desc",
                            "type": "textarea",
                            "label": "世界描述",
                            "config": {"placeholder": "描述故事发生的世界..."},
                            "value": ""
                        },
                        {
                            "id": "rules",
                            "type": "keyvalue",
                            "label": "世界规则",
                            "config": {},
                            "value": []
                        },
                        {
                            "id": "factions",
                            "type": "faction",
                            "label": "势力设定",
                            "config": {},
                            "value": [],
                            "generatePrompt": "根据世界观背景，生成故事中的主要势力、组织或阵营，包含势力名称、简介、内部等级体系"
                        },
                    ]
                },
                {
                    "id": "plot",
                    "name": "剧情设计",
                    "icon": "Zap",
                    "color": "#f59e0b",
                    "components": [
                        {
                            "id": "mainline",
                            "type": "textarea",
                            "label": "主线剧情",
                            "config": {"placeholder": "描述主要剧情线..."},
                            "value": ""
                        },
                        {
                            "id": "conflicts",
                            "type": "keyvalue",
                            "label": "核心冲突",
                            "config": {},
                            "value": []
                        },
                        {
                            "id": "turning-points",
                            "type": "list",
                            "label": "关键转折",
                            "config": {},
                            "value": []
                        },
                    ]
                },
            ]
        }
    },
    {
        "id": "novel-romance",
        "name": "言情小说模板",
        "description": "重点突出感情线和人物关系",
        "work_type": "novel",
        "category": "romance",
        "is_system": True,
        "is_public": True,
        "template_config": {
            "id": "novel-romance",
            "name": "言情小说模板",
            "description": "重点突出感情线和人物关系",
            "modules": [
                {
                    "id": "basic-info",
                    "name": "基本信息",
                    "icon": "FileText",
                    "color": "#3b82f6",
                    "components": [
                        {
                            "id": "subgenre",
                            "type": "multiselect",
                            "label": "感情类型",
                            "config": {
                                "options": [
                                    {"label": "甜宠", "value": "sweet", "color": "#f472b6"},
                                    {"label": "虐恋", "value": "angst", "color": "#6b7280"},
                                    {"label": "先婚后爱", "value": "marriage-first", "color": "#ec4899"},
                                    {"label": "破镜重圆", "value": "reunion", "color": "#8b5cf6"},
                                    {"label": "暗恋", "value": "secret-love", "color": "#06b6d4"},
                                    {"label": "双向奔赴", "value": "mutual", "color": "#10b981"},
                                ],
                                "maxCount": 3
                            },
                            "value": []
                        },
                        {
                            "id": "summary",
                            "type": "textarea",
                            "label": "作品简介",
                            "config": {},
                            "value": ""
                        },
                    ]
                },
                {
                    "id": "main-cp",
                    "name": "主CP设定",
                    "icon": "Heart",
                    "color": "#ec4899",
                    "components": [
                        {
                            "id": "cp-tabs",
                            "type": "tabs",
                            "label": "CP管理",
                            "config": {
                                "tabs": [
                                    {
                                        "id": "profiles",
                                        "label": "人物档案",
                                        "components": [
                                            {
                                                "id": "female-lead",
                                                "type": "keyvalue",
                                                "label": "女主角",
                                                "config": {},
                                                "value": []
                                            },
                                            {
                                                "id": "male-lead",
                                                "type": "keyvalue",
                                                "label": "男主角",
                                                "config": {},
                                                "value": []
                                            },
                                        ]
                                    },
                                    {
                                        "id": "love-line",
                                        "label": "感情线",
                                        "components": [
                                            {
                                                "id": "stages",
                                                "type": "timeline",
                                                "label": "感情发展",
                                                "config": {},
                                                "value": []
                                            },
                                        ]
                                    },
                                    {
                                        "id": "relations",
                                        "label": "关系图",
                                        "components": [
                                            {
                                                "id": "cp-relations",
                                                "type": "relation-graph",
                                                "label": "CP关系",
                                                "config": {
                                                    "nodeTypes": [
                                                        {"type": "female", "label": "女性", "color": "#ec4899"},
                                                        {"type": "male", "label": "男性", "color": "#3b82f6"},
                                                    ],
                                                    "relationTypes": [
                                                        {"type": "lover", "label": "恋人", "color": "#ef4444"},
                                                        {"type": "rival", "label": "情敌", "color": "#f59e0b"},
                                                        {"type": "friend", "label": "闺蜜/兄弟", "color": "#10b981"},
                                                    ]
                                                },
                                                "value": {"characters": [], "relations": []}
                                            }
                                        ]
                                    },
                                ]
                            },
                            "value": None
                        },
                    ]
                },
                {
                    "id": "sweet-points",
                    "name": "甜蜜设计",
                    "icon": "Sparkles",
                    "color": "#f472b6",
                    "components": [
                        {
                            "id": "sweet-moments",
                            "type": "keyvalue",
                            "label": "甜蜜高光",
                            "config": {},
                            "value": []
                        },
                        {
                            "id": "conflicts",
                            "type": "keyvalue",
                            "label": "感情冲突",
                            "config": {},
                            "value": []
                        },
                    ]
                },
            ]
        }
    },

]


async def init_default_templates():
    """初始化默认的作品模板"""
    async with AsyncSessionLocal() as db:
        try:
            created_count = 0
            updated_count = 0
            
            for template_data in DEFAULT_TEMPLATES:
                # 检查是否已存在（通过 name 和 is_system 字段）
                template_config = template_data["template_config"]
                template_id_in_config = template_config.get("id")
                
                # 查询是否已存在相同名称的系统模板
                stmt = select(WorkTemplate).where(
                    WorkTemplate.name == template_data["name"],
                    WorkTemplate.is_system == True
                )
                result = await db.execute(stmt)
                existing_template = result.scalar_one_or_none()
                
                if existing_template:
                    # 更新现有模板
                    existing_template.name = template_data["name"]
                    existing_template.description = template_data["description"]
                    existing_template.work_type = template_data["work_type"]
                    existing_template.category = template_data.get("category")
                    existing_template.template_config = template_config
                    existing_template.settings = existing_template.settings or {}  # 保留现有设置或使用默认值
                    existing_template.is_system = template_data["is_system"]
                    existing_template.is_public = template_data["is_public"]
                    updated_count += 1
                    print(f"✅ 更新模板: {template_data['name']} (ID: {existing_template.id})")
                else:
                    # 创建新模板
                    template = WorkTemplate(
                        name=template_data["name"],
                        description=template_data["description"],
                        work_type=template_data["work_type"],
                        category=template_data.get("category"),
                        template_config=template_config,
                        settings={},  # 默认设置
                        is_system=template_data["is_system"],
                        is_public=template_data["is_public"],
                        creator_id=None,  # 系统创建
                        tags=[],
                        usage_count=0
                    )
                    
                    db.add(template)
                    created_count += 1
                    print(f"✅ 创建模板: {template_data['name']}")
            
            await db.commit()
            
            print()
            print("=" * 60)
            print(f"✅ 模板初始化完成！")
            print(f"   - 创建: {created_count} 个")
            print(f"   - 更新: {updated_count} 个")
            print("=" * 60)
            
        except Exception as e:
            await db.rollback()
            print(f"❌ 初始化模板失败: {e}")
            import traceback
            traceback.print_exc()
            raise


async def main():
    """主函数"""
    print("=" * 60)
    print("初始化作品模板")
    print("=" * 60)
    print()
    
    try:
        await init_default_templates()
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

