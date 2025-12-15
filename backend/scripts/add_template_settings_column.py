#!/usr/bin/env python3
"""
添加 work_templates 表的 settings 列
数据库迁移脚本
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root / "src"))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from memos.api.core.config import get_settings

settings = get_settings()

# 创建数据库引擎
engine = create_async_engine(settings.DATABASE_URL, echo=True)


async def add_settings_column():
    """添加 settings 列到 work_templates 表"""
    async with engine.begin() as conn:
        try:
            # 检查列是否已存在
            check_sql = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'work_templates' 
            AND column_name = 'settings';
            """
            result = await conn.execute(text(check_sql))
            exists = result.fetchone()
            
            if exists:
                print("✅ settings 列已存在，跳过添加")
                return
            
            # 添加 settings 列
            alter_sql = """
            ALTER TABLE work_templates 
            ADD COLUMN settings JSON DEFAULT '{}';
            """
            await conn.execute(text(alter_sql))
            print("✅ 成功添加 settings 列到 work_templates 表")
            
        except Exception as e:
            print(f"❌ 添加 settings 列失败: {e}")
            raise


async def main():
    """主函数"""
    print("=" * 60)
    print("添加 work_templates.settings 列")
    print("=" * 60)
    print()
    
    try:
        await add_settings_column()
        print()
        print("=" * 60)
        print("✅ 迁移完成")
        print("=" * 60)
    except Exception as e:
        print(f"❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

