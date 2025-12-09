#!/usr/bin/env python3
"""
测试文档接口是否正常工作
"""

import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

async def test_documents_api():
    """测试文档接口"""
    print("=" * 60)
    print("测试文档接口")
    print("=" * 60)
    print()
    
    # 测试1: 检查路由是否注册
    print("1. 检查路由注册...")
    try:
        from memos.api.ai_api import app
        routes = [route.path for route in app.routes if hasattr(route, "path")]
        
        doc_routes = [r for r in routes if "/api/documents" in r]
        if doc_routes:
            print(f"   ✅ 找到 {len(doc_routes)} 个文档接口:")
            for route in doc_routes:
                print(f"      - {route}")
        else:
            print("   ❌ 未找到文档接口")
            return False
    except Exception as e:
        print(f"   ❌ 检查失败: {e}")
        return False
    
    print()
    
    # 测试2: 检查接口实现
    print("2. 检查接口实现...")
    try:
        from memos.api.routers.documents_router import (
            create_document,
            list_documents,
            get_document,
            update_document,
            delete_document
        )
        print("   ✅ 所有接口函数已导入")
    except Exception as e:
        print(f"   ❌ 导入失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print()
    
    # 测试3: 检查依赖服务
    print("3. 检查依赖服务...")
    try:
        from memos.api.services.work_service import WorkService
        from memos.api.services.chapter_service import ChapterService
        from memos.api.services.sharedb_service import ShareDBService
        print("   ✅ 所有依赖服务可用")
    except Exception as e:
        print(f"   ⚠️  依赖服务检查: {e}")
    
    print()
    
    # 测试4: 检查数据库连接
    print("4. 检查数据库连接...")
    try:
        from memos.api.core.database import engine
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        print("   ✅ 数据库连接正常")
    except Exception as e:
        print(f"   ❌ 数据库连接失败: {e}")
        return False
    
    print()
    print("=" * 60)
    print("✅ 接口检查完成")
    print("=" * 60)
    print()
    print("💡 提示:")
    print("   - 接口已注册，但需要实际运行服务才能测试")
    print("   - 启动服务: ./start_ai_api.sh")
    print("   - 测试接口: curl http://localhost:8001/api/documents/?user_id=1")
    
    return True

if __name__ == "__main__":
    result = asyncio.run(test_documents_api())
    sys.exit(0 if result else 1)

