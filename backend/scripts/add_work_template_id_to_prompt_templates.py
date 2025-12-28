#!/usr/bin/env python3
"""
数据库迁移脚本：为 prompt_templates 表添加 work_template_id 字段
"""

import asyncio
import sys
from pathlib import Path

# 添加 src 目录到 Python 路径
backend_dir = Path(__file__).parent.parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from sqlalchemy import text
from memos.api.core.database import engine, close_db
from memos.api.core.config import get_settings
from memos.log import get_logger

logger = get_logger(__name__)

# 同时使用 print 确保输出可见
def log_info(msg):
    print(msg)
    logger.info(msg)

def log_error(msg, exc_info=False):
    print(f"ERROR: {msg}")
    logger.error(msg, exc_info=exc_info)


async def add_work_template_id_column():
    """为 prompt_templates 表添加 work_template_id 字段"""
    settings = get_settings()
    
    log_info("=" * 60)
    log_info("数据库迁移：添加 work_template_id 字段到 prompt_templates 表")
    log_info("=" * 60)
    
    try:
        async with engine.begin() as conn:
            # 检查字段是否已存在
            check_column_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'prompt_templates' 
                AND column_name = 'work_template_id'
            """)
            result = await conn.execute(check_column_query)
            column_exists = result.fetchone() is not None
            
            if column_exists:
                log_info("✅ work_template_id 字段已存在，跳过添加")
                return
            
            log_info("正在添加 work_template_id 字段...")
            
            # 添加 work_template_id 字段
            alter_table_query = text("""
                ALTER TABLE prompt_templates 
                ADD COLUMN work_template_id INTEGER,
                ADD CONSTRAINT fk_prompt_templates_work_template_id 
                    FOREIGN KEY (work_template_id) 
                    REFERENCES work_templates(id) 
                    ON DELETE CASCADE
            """)
            await conn.execute(alter_table_query)
            log_info("✅ work_template_id 字段添加成功")
            
            # 创建索引
            log_info("正在创建索引...")
            create_index_query = text("""
                CREATE INDEX IF NOT EXISTS idx_prompt_templates_template_component 
                ON prompt_templates(work_template_id, component_id, prompt_category)
            """)
            await conn.execute(create_index_query)
            log_info("✅ 索引创建成功")
            
            # 创建单独的 work_template_id 索引（如果不存在）
            create_single_index_query = text("""
                CREATE INDEX IF NOT EXISTS idx_prompt_templates_work_template_id 
                ON prompt_templates(work_template_id)
            """)
            await conn.execute(create_single_index_query)
            log_info("✅ work_template_id 单独索引创建成功")
            
        log_info("")
        log_info("=" * 60)
        log_info("数据库迁移完成！")
        log_info("=" * 60)
        
    except Exception as e:
        log_error(f"❌ 数据库迁移失败: {e}", exc_info=True)
        raise


async def main():
    """主函数"""
    try:
        await add_work_template_id_column()
    except Exception as e:
        log_error(f"迁移失败: {e}")
        sys.exit(1)
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())

