#!/usr/bin/env python3
"""
WawaWriter API服务
包含AI分析、产品API和服务器API等所有接口
"""

import os
import logging

# 在导入其他模块之前设置 Hugging Face 缓存环境变量
# 默认使用本地缓存模式，避免每次启动都尝试网络连接
if os.getenv("HF_LOCAL_FILES_ONLY", "true").lower() in ("true", "1", "yes"):
    os.environ["HF_LOCAL_FILES_ONLY"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from memos.api.exceptions import APIExceptionHandler
from memos.api.middleware.request_context import RequestContextMiddleware
from memos.api.routers.ai_router import router as ai_router

# 配置日志
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# 创建FastAPI应用
app = FastAPI(
    title="WawaWriter API",
    description="WawaWriter API服务 - 包含AI分析、产品API和服务器API",
    version="1.0.0",
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加请求上下文中间件
app.add_middleware(RequestContextMiddleware, source="ai_api")

# 注册所有路由
try:
    app.include_router(ai_router)
    logger.info("✅ AI router registered successfully")
except Exception as e:
    logger.error(f"❌ Failed to register AI router: {e}")

# 注册WriterAI应用路由
# 使用直接导入路由文件的方式，避免触发 memos.__init__.py 的导入
try:
    # 直接导入路由模块，避免通过 memos.api.routers 包导入
    import importlib
    
    # 导入各个路由模块
    auth_router_module = importlib.import_module('memos.api.routers.auth_router')
    admin_router_module = importlib.import_module('memos.api.routers.admin_router')
    chapters_router_module = importlib.import_module('memos.api.routers.chapters_router')
    volumes_router_module = importlib.import_module('memos.api.routers.volumes_router')
    templates_router_module = importlib.import_module('memos.api.routers.templates_router')
    works_router_module = importlib.import_module('memos.api.routers.works_router')
    prompt_template_router_module = importlib.import_module('memos.api.routers.prompt_template_router')
    
    # 获取路由对象
    auth_router = auth_router_module.router
    admin_router = admin_router_module.router
    chapters_router = chapters_router_module.router
    volumes_router = volumes_router_module.router
    templates_router = templates_router_module.router
    works_router = works_router_module.router
    prompt_template_router = prompt_template_router_module.router
    
    logger.info(f"📋 Works router prefix: {works_router.prefix}")
    logger.info(f"📋 Works router routes count: {len(works_router.routes)}")
    for route in works_router.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            methods = list(route.methods) if hasattr(route, 'methods') else []
            logger.info(f"  {methods} {route.path}")
    
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(chapters_router)
    app.include_router(volumes_router)
    app.include_router(templates_router)
    app.include_router(works_router)
    app.include_router(prompt_template_router)
    logger.info("✅ WriterAI application routers registered successfully")
except Exception as e:
    logger.error(f"❌ WriterAI application routers not available: {e}", exc_info=True)

# 尝试注册产品路由
try:
    from memos.api.routers.product_router import router as product_router
    app.include_router(product_router)
    logger.info("✅ Product router registered successfully")
except Exception as e:
    logger.warning(f"⚠️  Product router not available: {e}")

# 尝试注册服务器路由
try:
    from memos.api.routers.server_router import router as server_router
    app.include_router(server_router)
    logger.info("✅ Server router registered successfully")
except Exception as e:
    logger.warning(f"⚠️  Server router not available: {e}")

# 注册 ShareDB 路由
try:
    from memos.api.routers.sharedb_router import router as sharedb_router
    app.include_router(sharedb_router)
    logger.info("✅ ShareDB router registered successfully")
except Exception as e:
    logger.warning(f"⚠️  ShareDB router not available: {e}", exc_info=True)

# 注册 Yjs WebSocket 路由（实时协作编辑）
try:
    from memos.api.routers.yjs_router import router as yjs_router
    app.include_router(yjs_router)
    logger.info("✅ Yjs WebSocket router registered successfully")
except Exception as e:
    logger.warning(f"⚠️  Yjs WebSocket router not available: {e}", exc_info=True)

# Yjs 数据表初始化：启动时确保 yjs_documents 表存在
@app.on_event("startup")
async def startup_yjs_table():
    try:
        from memos.api.core.database import engine, Base
        from memos.api.models.yjs_document import YjsDocument  # noqa: F401 - register model
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("✅ Database tables ensured (including yjs_documents)")
    except Exception as e:
        logger.error(f"❌ Failed to ensure database tables: {e}")

# Yjs 文档持久化：应用关闭时保存所有活跃房间
@app.on_event("shutdown")
async def shutdown_yjs():
    try:
        from memos.api.services.yjs_ws_handler import yjs_ws_manager
        await yjs_ws_manager.shutdown()
        logger.info("✅ Yjs documents persisted on shutdown")
    except Exception as e:
        logger.error(f"❌ Failed to persist Yjs documents: {e}")

# 异常处理
app.exception_handler(ValueError)(APIExceptionHandler.value_error_handler)
app.exception_handler(Exception)(APIExceptionHandler.global_exception_handler)




@app.get("/")
async def root():
    """根路径"""
    endpoints = {
        "ai": {
            "health": "/ai/health",
            "analyze": "/ai/analyze-chapter",
            "prompt": "/ai/default-prompt",
        },
        "writerai": {
            "auth": "/api/v1/auth/*",
            "admin": "/api/v1/admin/auth/*",
            "chapters": "/api/v1/chapters/*",
            "templates": "/api/v1/templates/*",
            "works": "/api/v1/works/*",
        },
        "docs": "/docs",
    }
    
    # 动态添加其他路由的端点
    try:
        endpoints["product"] = "/product/*"
    except:
        pass
    
    # 添加所有注册的路由信息（用于调试）
    registered_routes = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            methods = list(route.methods) if hasattr(route, 'methods') else []
            registered_routes.append({
                "methods": methods,
                "path": route.path
            })
    
    return {
        "service": "WawaWriter API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": endpoints,
        "registered_routes": registered_routes[:50],  # 只返回前50个路由，避免响应过大
    }


if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="启动AI接口服务")
    parser.add_argument("--port", type=int, default=8001, help="服务端口")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="服务主机")
    parser.add_argument("--workers", type=int, default=1, help="工作进程数")
    args = parser.parse_args()

    logger.info(f"🚀 Starting AI API服务 on {args.host}:{args.port}")
    
    uvicorn.run(
        "memos.api.ai_api:app",
        host=args.host,
        port=args.port,
        workers=args.workers,
        reload=False,
    )

