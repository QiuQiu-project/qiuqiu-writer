"""
数据库连接和会话管理模块
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from memos.api.core.config import get_settings

settings = get_settings()

# 创建异步数据库引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=30,
    pool_timeout=30,
    pool_recycle=3600,
)

# 创建异步会话工厂
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# 创建同步会话工厂（用于Alembic迁移）
SessionLocal = sessionmaker(
    bind=create_async_engine(settings.DATABASE_URL, future=True).sync_engine,
    autocommit=False,
    autoflush=False,
)

# 创建基础模型类
Base = declarative_base()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    获取异步数据库会话

    用于依赖注入，自动管理会话生命周期
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """
    获取异步数据库会话（别名，用于兼容性）

    这是 get_async_session 的别名，用于保持与旧代码的兼容性
    """
    async for session in get_async_session():
        yield session


def get_sync_session():
    """
    获取同步数据库会话

    用于Alembic迁移等同步操作
    """
    return SessionLocal()


async def init_db():
    """
    初始化数据库表结构

    在应用启动时调用，创建所有表
    """
    async with engine.begin() as conn:
        # 导入所有模型以确保它们被注册
        from memos.api.models import (
            user, work, chapter, template, volume,
            characters, writing, system, document, prompt_template,
            admin, yjs_document, invitation_code, feedback,
            work_chat_message, prompt_experiment, prompt_rating,
        )

        # 创建所有表
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """
    关闭数据库连接

    在应用关闭时调用
    """
    await engine.dispose()