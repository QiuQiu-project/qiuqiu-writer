#!/usr/bin/env python3
"""
测试前后端接口对接
验证所有接口是否正常工作
"""

import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from memos.api.core.database import engine
from sqlalchemy import text

async def test_database():
    """测试数据库连接"""
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        print("✅ 数据库连接正常")
        return True
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        return False

async def main():
    """主测试函数"""
    print("=" * 60)
    print("前后端接口对接测试")
    print("=" * 60)
    print()
    
    # 测试数据库
    print("1. 测试数据库连接...")
    db_ok = await test_database()
    print()
    
    # 测试路由注册
    print("2. 检查路由注册...")
    try:
        from memos.api.ai_api import app
        routes = [route.path for route in app.routes if hasattr(route, "path")]
        
        # 检查关键接口
        required_routes = [
            "/ai/analyze-chapter",
            "/ai/health",
            "/api/documents/",
            "/api/v1/works/",
            "/api/v1/chapters/",
        ]
        
        print(f"   已注册 {len(routes)} 个路由")
        print()
        print("   关键接口检查:")
        for route in required_routes:
            if any(route in r for r in routes):
                print(f"   ✅ {route}")
            else:
                print(f"   ❌ {route} (未找到)")
        
        print()
        print("   所有路由列表:")
        for route in sorted(routes):
            if route not in ["/", "/docs", "/openapi.json", "/redoc"]:
                print(f"      - {route}")
        
    except Exception as e:
        print(f"   ❌ 路由检查失败: {e}")
    
    print()
    print("=" * 60)
    print("测试完成")
    print("=" * 60)
    print()
    print("💡 提示:")
    print("   - 启动后端: ./start_ai_api.sh")
    print("   - 查看API文档: http://localhost:8001/docs")
    print("   - 测试健康检查: curl http://localhost:8001/ai/health")

if __name__ == "__main__":
    asyncio.run(main())





