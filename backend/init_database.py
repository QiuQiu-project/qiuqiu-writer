#!/usr/bin/env python3
"""
数据库初始化脚本
创建数据库和所有表结构
"""

import asyncio
import sys
from pathlib import Path

# 添加 src 目录到 Python 路径
backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from memos.api.core.database import init_db, engine, close_db
from memos.api.core.config import get_settings
from memos.log import get_logger

logger = get_logger(__name__)


async def create_database_if_not_exists():
    """如果数据库不存在，则创建它"""
    settings = get_settings()
    
    # 连接到默认的 postgres 数据库来创建新数据库
    from sqlalchemy.ext.asyncio import create_async_engine
    
    # 构建连接到 postgres 数据库的 URL（用于创建新数据库）
    admin_url = (
        f"postgresql+asyncpg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@"
        f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/postgres"
    )
    
    admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    
    from sqlalchemy import text
    
    try:
        async with admin_engine.begin() as conn:
            # 检查数据库是否存在
            result = await conn.execute(
                text(f"SELECT 1 FROM pg_database WHERE datname = '{settings.POSTGRES_DB}'")
            )
            exists = result.fetchone() is not None
            
            if not exists:
                logger.info(f"数据库 '{settings.POSTGRES_DB}' 不存在，正在创建...")
                await conn.execute(text(f'CREATE DATABASE "{settings.POSTGRES_DB}"'))
                logger.info(f"✅ 数据库 '{settings.POSTGRES_DB}' 创建成功")
            else:
                logger.info(f"✅ 数据库 '{settings.POSTGRES_DB}' 已存在")
    finally:
        await admin_engine.dispose()


async def main():
    """主函数：初始化数据库"""
    settings = get_settings()
    
    logger.info("=" * 60)
    logger.info("数据库初始化脚本")
    logger.info("=" * 60)
    logger.info(f"数据库配置:")
    logger.info(f"  - 主机: {settings.POSTGRES_HOST}")
    logger.info(f"  - 端口: {settings.POSTGRES_PORT}")
    logger.info(f"  - 数据库: {settings.POSTGRES_DB}")
    logger.info(f"  - 用户: {settings.POSTGRES_USER}")
    logger.info("")
    
    try:
        # 首先创建数据库（如果不存在）
        logger.info("正在检查数据库是否存在...")
        await create_database_if_not_exists()
        
        # 测试数据库连接
        logger.info("正在测试数据库连接...")
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("✅ 数据库连接成功")
        
        # 初始化数据库表
        logger.info("正在创建数据库表...")
        await init_db()
        logger.info("✅ 数据库表创建成功")
        
        logger.info("")
        logger.info("=" * 60)
        logger.info("数据库初始化完成！")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"❌ 数据库初始化失败: {e}", exc_info=True)
        logger.error("")
        logger.error("请检查:")
        logger.error("  1. PostgreSQL 服务是否正在运行")
        logger.error("  2. 用户权限是否足够（需要 CREATEDB 权限）")
        logger.error("  3. 连接配置是否正确")
        logger.error("")
        logger.error("手动创建数据库的命令:")
        logger.error(f"  createdb -U {settings.POSTGRES_USER} {settings.POSTGRES_DB}")
        logger.error("")
        logger.error("或者使用 psql:")
        logger.error(f"  psql -U {settings.POSTGRES_USER} -c 'CREATE DATABASE {settings.POSTGRES_DB};'")
        sys.exit(1)
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())

