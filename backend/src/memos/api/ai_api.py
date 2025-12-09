#!/usr/bin/env python3
"""
WawaWriter API服务
包含AI分析、产品API和服务器API等所有接口
自动发现并注册routers目录下的所有路由
"""

import importlib
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from memos.api.exceptions import APIExceptionHandler
from memos.api.middleware.request_context import RequestContextMiddleware

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


def auto_register_routers():
    """
    自动发现并注册routers目录下的所有路由
    扫描routers目录，尝试导入每个模块的router并注册
    """
    routers_dir = Path(__file__).parent / "routers"
    registered_routers = []
    failed_routers = []
    skipped_routers = []
    
    # 需要跳过的文件
    skip_files = {"__init__.py", "__pycache__"}
    
    # 定义路由注册顺序（某些路由可能依赖其他路由先注册）
    # 如果不需要特定顺序，可以为空列表
    preferred_order = [
        "ai_router",  # AI路由通常最简单，先注册
        "auth_router",  # 认证路由
        "product_router",  # 产品路由
        "server_router",  # 服务器路由
        "works_router",  # 作品路由
        "chapters_router",  # 章节路由
        "templates_router",  # 模板路由
    ]
    
    # 收集所有路由文件
    router_files = []
    if routers_dir.exists():
        for file_path in routers_dir.iterdir():
            # 跳过非Python文件、__init__.py和__pycache__
            if not file_path.is_file() or file_path.suffix != ".py":
                continue
            if file_path.name in skip_files:
                continue
            
            module_name = file_path.stem
            router_files.append((module_name, file_path))
    
    # 按优先顺序排序
    def sort_key(item):
        module_name, _ = item
        if module_name in preferred_order:
            return (0, preferred_order.index(module_name))
        return (1, module_name)
    
    router_files.sort(key=sort_key)
    
    logger.info(f"🔍 Found {len(router_files)} router files to register")
    
    # 遍历并注册路由
    for module_name, file_path in router_files:
        full_module_name = f"memos.api.routers.{module_name}"
        
        try:
            logger.debug(f"Attempting to import module: {full_module_name}")
            # 动态导入模块
            module = importlib.import_module(full_module_name)
            
            # 尝试获取router对象
            router = getattr(module, "router", None)
            
            if router is not None:
                # 获取路由前缀信息（用于日志）
                prefix = getattr(router, "prefix", "unknown")
                tags = getattr(router, "tags", [])
                
                # 注册路由
                app.include_router(router)
                registered_routers.append(module_name)
                logger.info(f"✅ Router '{module_name}' registered successfully (prefix: {prefix}, tags: {tags})")
            else:
                logger.warning(f"⚠️  Module '{module_name}' does not have a 'router' attribute")
                skipped_routers.append(module_name)
                
        except ImportError as e:
            error_msg = str(e)
            # 检查是否是缺少可选依赖（如 asyncpg）
            if "asyncpg" in error_msg or "No module named" in error_msg:
                logger.warning(f"⚠️  Router '{module_name}' requires optional dependency: {error_msg}")
                logger.warning(f"   Install missing dependencies to enable this router")
            else:
                logger.error(f"❌ Failed to import router '{module_name}': {error_msg}")
            failed_routers.append((module_name, f"ImportError: {error_msg}"))
        except Exception as e:
            error_msg = str(e)
            error_type = type(e).__name__
            # 对于配置错误，给出更友好的提示
            if "ValidationError" in error_type and "api_key" in error_msg:
                logger.warning(f"⚠️  Router '{module_name}' requires configuration: {error_msg}")
                logger.warning(f"   This router will be skipped until configuration is provided")
            else:
                logger.error(f"❌ Failed to register router '{module_name}': {error_type}: {error_msg}", exc_info=True)
            failed_routers.append((module_name, f"{error_type}: {error_msg}"))
    
    # 输出注册摘要
    logger.info("=" * 60)
    logger.info(f"📋 Router Registration Summary")
    logger.info(f"   ✅ Successfully registered: {len(registered_routers)}")
    if registered_routers:
        logger.info(f"      {', '.join(registered_routers)}")
    if skipped_routers:
        logger.warning(f"   ⚠️  Skipped (no router attribute): {len(skipped_routers)}")
        logger.warning(f"      {', '.join(skipped_routers)}")
    if failed_routers:
        logger.error(f"   ❌ Failed: {len(failed_routers)}")
        for module_name, error in failed_routers:
            logger.error(f"      {module_name}: {error}")
    logger.info("=" * 60)
    
    return registered_routers, failed_routers


# 自动注册所有路由
registered, failed = auto_register_routers()

# 如果自动注册失败，尝试手动注册关键路由
if len(registered) == 0 or (len(registered) == 1 and "ai_router" in registered):
    logger.warning("⚠️  Auto-registration may have missed some routers, attempting manual registration...")
    
    # 手动注册路由列表
    manual_routers = [
        ("memos.api.routers.ai_router", "ai_router"),
        ("memos.api.routers.auth_router", "auth_router"),
        ("memos.api.routers.product_router", "product_router"),
        ("memos.api.routers.server_router", "server_router"),
        ("memos.api.routers.works_router", "works_router"),
        ("memos.api.routers.chapters_router", "chapters_router"),
        ("memos.api.routers.templates_router", "templates_router"),
    ]
    
    for module_path, router_name in manual_routers:
        if router_name in registered:
            continue  # 已经注册过了，跳过
            
        try:
            module = importlib.import_module(module_path)
            router = getattr(module, "router", None)
            if router is not None:
                app.include_router(router)
                registered.append(router_name)
                prefix = getattr(router, "prefix", "unknown")
                logger.info(f"✅ Manually registered router '{router_name}' (prefix: {prefix})")
        except Exception as e:
            error_type = type(e).__name__
            logger.warning(f"⚠️  Could not manually register '{router_name}': {error_type}: {str(e)}")

# 异常处理
app.exception_handler(RequestValidationError)(APIExceptionHandler.validation_error_handler)
app.exception_handler(HTTPException)(APIExceptionHandler.http_error_handler)
app.exception_handler(ValueError)(APIExceptionHandler.value_error_handler)
app.exception_handler(Exception)(APIExceptionHandler.global_exception_handler)


@app.get("/")
async def root():
    """根路径 - 返回所有可用的API端点"""
    # 动态获取所有已注册的路由
    routes = []
    for route in app.routes:
        if hasattr(route, "path") and hasattr(route, "methods"):
            methods = [method for method in route.methods if method != "HEAD"]
            if methods:
                routes.append({
                    "path": route.path,
                    "methods": list(methods),
                    "name": getattr(route, "name", "unknown"),
                })
    
    return {
        "service": "WawaWriter API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "routes": routes,
        "total_routes": len(routes),
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

