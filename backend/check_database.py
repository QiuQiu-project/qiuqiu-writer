#!/usr/bin/env python3
"""检查数据库状态"""
import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from memos.api.core.database import engine
from sqlalchemy import text

async def check():
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
            )
            tables = [row[0] for row in result]
            if tables:
                print(f"✅ 数据库已初始化，共有 {len(tables)} 个表:")
                for table in tables:
                    print(f"  - {table}")
            else:
                print("⚠️  数据库中没有表，需要运行 init_database.py 初始化")
    except Exception as e:
        print(f"❌ 检查失败: {e}")

if __name__ == "__main__":
    asyncio.run(check())


