#!/usr/bin/env python3
"""
WawaWriter API服务
包含AI分析、产品API和服务器API等所有接口
"""

import logging

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
    chapters_router_module = importlib.import_module('memos.api.routers.chapters_router')
    templates_router_module = importlib.import_module('memos.api.routers.templates_router')
    works_router_module = importlib.import_module('memos.api.routers.works_router')
    
    # 获取路由对象
    auth_router = auth_router_module.router
    chapters_router = chapters_router_module.router
    templates_router = templates_router_module.router
    works_router = works_router_module.router
    
    logger.info(f"📋 Works router prefix: {works_router.prefix}")
    logger.info(f"📋 Works router routes count: {len(works_router.routes)}")
    for route in works_router.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            methods = list(route.methods) if hasattr(route, 'methods') else []
            logger.info(f"  {methods} {route.path}")
    
    app.include_router(auth_router)
    app.include_router(chapters_router)
    app.include_router(templates_router)
    app.include_router(works_router)
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

# 异常处理
app.exception_handler(ValueError)(APIExceptionHandler.value_error_handler)
app.exception_handler(Exception)(APIExceptionHandler.global_exception_handler)


@app.websocket("/ws/yjs/{document_id}")
async def yjs_websocket_endpoint(websocket: WebSocket, document_id: str):
    """
    Yjs WebSocket 端点
    用于Yjs CRDT实时协作编辑
    """
    await websocket.accept()
    logger.info(f"Yjs WebSocket 连接已建立: {websocket.client}, 文档: {document_id}")
    
    try:
        from memos.api.services.yjs_service import yjs_service
        if not yjs_service:
            await websocket.close(code=1003, reason="Yjs服务不可用，请安装y-py")
            return
        
        await yjs_service.initialize()
        
        # 从查询参数或消息中获取用户ID
        user_id = 0  # 默认值，可以从认证中获取
        
        # 加入协作会话
        await yjs_service.join_collaboration(
            websocket=websocket,
            document_id=document_id,
            user_id=user_id
        )
    except Exception as e:
        logger.error(f"Yjs WebSocket错误: {e}")
        await websocket.close(code=1011, reason=str(e))


@app.websocket("/ws/automerge/{document_id}")
async def automerge_websocket_endpoint(websocket: WebSocket, document_id: str):
    """
    Automerge WebSocket 端点
    用于Automerge CRDT实时协作编辑
    """
    await websocket.accept()
    logger.info(f"Automerge WebSocket 连接已建立: {websocket.client}, 文档: {document_id}")
    
    try:
        from memos.api.services.automerge_service import automerge_service
        if not automerge_service:
            await websocket.close(code=1003, reason="Automerge服务不可用，请安装automerge")
            return
        
        await automerge_service.initialize()
        
        # 从查询参数或消息中获取用户ID
        user_id = 0  # 默认值，可以从认证中获取
        
        # 加入协作会话
        await automerge_service.join_collaboration(
            websocket=websocket,
            document_id=document_id,
            user_id=user_id
        )
    except Exception as e:
        logger.error(f"Automerge WebSocket错误: {e}")
        await websocket.close(code=1011, reason=str(e))


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    通用 WebSocket 端点
    用于前端 ShareDB 客户端连接，支持文档订阅和实时同步
    """
    await websocket.accept()
    logger.info(f"WebSocket 连接已建立: {websocket.client}")
    
    try:
        from memos.api.services.sharedb_service import sharedb_service
        await sharedb_service.initialize()
        
        # 发送欢迎消息
        import json
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket 连接成功",
            "status": "ok"
        })
        
        # 当前订阅的文档ID和用户ID
        subscribed_doc_id = None
        user_id = None
        
        # 保持连接并处理消息
        while True:
            try:
                # 接收消息
                data = await websocket.receive_text()
                
                # 尝试解析 JSON
                try:
                    message = json.loads(data)
                    message_type = message.get("type", "unknown")
                    
                    # 处理不同类型的消息
                    if message_type == "ping":
                        # 心跳检测
                        await websocket.send_json({"type": "pong"})
                    elif message_type == "subscribe":
                        # 订阅文档
                        document_id = message.get("document_id")
                        user_id = message.get("user_id")  # 从消息中获取用户ID
                        if document_id:
                            subscribed_doc_id = document_id
                            logger.info(f"客户端订阅文档: {document_id}, 用户ID: {user_id}")
                            
                            # 加入协作会话
                            await sharedb_service.join_collaboration(
                                websocket=websocket,
                                document_id=document_id,
                                user_id=user_id or 0
                            )
                            
                            await websocket.send_json({
                                "type": "subscribed",
                                "document_id": document_id
                            })
                    elif message_type == "unsubscribe":
                        # 取消订阅
                        if subscribed_doc_id:
                            logger.info(f"客户端取消订阅文档: {subscribed_doc_id}")
                            subscribed_doc_id = None
                            await websocket.send_json({
                                "type": "unsubscribed"
                            })
                    else:
                        # 其他消息类型，记录日志
                        logger.debug(f"收到 WebSocket 消息: {message_type}")
                        await websocket.send_json({
                            "type": "ack",
                            "original_type": message_type
                        })
                        
                except json.JSONDecodeError:
                    # 非 JSON 消息，直接回显
                    logger.warning(f"收到非 JSON 消息: {data[:100]}")
                    await websocket.send_text(f"Echo: {data}")
                    
            except WebSocketDisconnect:
                logger.info("WebSocket 客户端断开连接")
                break
            except Exception as e:
                logger.error(f"处理 WebSocket 消息时出错: {e}", exc_info=True)
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
                break
                
    except WebSocketDisconnect:
        logger.info("WebSocket 连接已断开")
    except Exception as e:
        logger.error(f"WebSocket 连接错误: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason=f"服务器错误: {str(e)}")
        except:
            pass


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

