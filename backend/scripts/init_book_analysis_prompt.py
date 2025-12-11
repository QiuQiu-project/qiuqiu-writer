#!/usr/bin/env python3
"""
初始化拆书分析Prompt模板
将默认的拆书分析prompt插入数据库
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
from memos.api.services.book_analysis_service import BookAnalysisService

settings = get_settings()

# 创建数据库引擎
engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_default_prompt():
    """初始化默认的拆书分析prompt模板"""
    async with AsyncSessionLocal() as db:
        try:
            # 检查是否已存在默认模板
            stmt = select(PromptTemplate).where(
                PromptTemplate.template_type == "book_analysis",
                PromptTemplate.is_default == True
            )
            result = await db.execute(stmt)
            existing_template = result.scalar_one_or_none()
            
            if existing_template:
                print(f"✅ 默认拆书分析prompt模板已存在: {existing_template.id} - {existing_template.name}")
                return
            
            # 获取增强的prompt内容
            book_analysis_service = BookAnalysisService(db)
            prompt_content = book_analysis_service.get_enhanced_book_analysis_prompt()
            
            # 创建默认模板
            template = PromptTemplate(
                name="增强拆书分析模板",
                description="用于拆书功能的增强分析模板，能够识别角色、地图、章节大纲和细纲，并返回结构化JSON数据",
                template_type="book_analysis",
                prompt_content=prompt_content,
                version="1.0",
                is_default=True,
                is_active=True,
                variables={
                    "content": "章节内容"
                },
                template_metadata={
                    "source": "system",
                    "features": [
                        "角色识别",
                        "地图/地点识别",
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
            
            print(f"✅ 成功创建默认拆书分析prompt模板: {template.id} - {template.name}")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ 初始化失败: {e}")
            raise


async def main():
    """主函数"""
    print("🚀 开始初始化拆书分析Prompt模板...")
    try:
        await init_default_prompt()
        print("✅ 初始化完成")
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

