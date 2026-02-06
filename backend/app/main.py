"""
WriterAI FastAPI主应用
"""

from fastapi import FastAPI, Request, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging
import time
import uuid
from contextlib import asynccontextmanager

from memos.api.core.config import get_settings
from memos.api.core.database import init_db, close_db
from memos.api.routers import auth_router, chapters_router, templates_router, works_router, volumes_router, admin_router
from memos.api.routers import yjs_router
from memos.api.core.redis import get_redis
from memos.api.services.sharedb_service import ShareDBService
from memos.api.services.yjs_ws_handler import yjs_ws_manager

sharedb_service = ShareDBService()

settings = get_settings()

# 配置日志
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化
    logger.info("WriterAI应用启动中...")

    try:
        # 初始化数据库
        await init_db()
        logger.info("数据库初始化完成")

        # 初始化Redis连接
        redis = await get_redis()
        await redis.ping()
        logger.info("Redis连接成功")

        # 初始化ShareDB服务
        await sharedb_service.initialize()
        logger.info("ShareDB服务初始化完成")

        # 预热系统数据
        await warmup_system_data()

        logger.info("WriterAI应用启动完成")

    except Exception as e:
        logger.error(f"应用启动失败: {e}")
        raise

    yield

    # 关闭时清理
    logger.info("WriterAI应用关闭中...")

    try:
        # 持久化所有 Yjs 文档
        await yjs_ws_manager.shutdown()
        logger.info("Yjs文档已保存")

        await close_db()
        logger.info("数据库连接已关闭")

        # 这里可以添加其他清理逻辑
        logger.info("WriterAI应用关闭完成")

    except Exception as e:
        logger.error(f"应用关闭时发生错误: {e}")


# 创建FastAPI应用实例
app = FastAPI(
    title="WriterAI API",
    description="智能写作平台后端API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_HOSTS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加受信任主机中间件
if not settings.DEBUG:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.ALLOWED_HOSTS
    )


# 请求ID中间件
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """为每个请求添加唯一ID"""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# 请求日志中间件
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """记录请求日志"""
    start_time = time.time()

    # 记录请求开始
    logger.info(
        f"请求开始 - ID: {getattr(request.state, 'request_id', 'unknown')}, "
        f"方法: {request.method}, 路径: {request.url.path}, "
        f"客户端: {request.client.host if request.client else 'unknown'}"
    )

    response = await call_next(request)

    # 计算处理时间
    process_time = time.time() - start_time

    # 记录请求完成
    logger.info(
        f"请求完成 - ID: {getattr(request.state, 'request_id', 'unknown')}, "
        f"状态码: {response.status_code}, "
        f"处理时间: {process_time:.3f}s"
    )

    response.headers["X-Process-Time"] = str(process_time)
    return response


# 数据库会话中间件
@app.middleware("http")
async def db_session_middleware(request: Request, call_next):
    """为请求提供数据库会话"""
    from memos.api.core.database import get_async_session

    async for db in get_async_session():
        request.state.db = db
        try:
            response = await call_next(request)
            return response
        except Exception:
            await db.rollback()
            raise
        finally:
            await db.close()


# 全局异常处理器
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """HTTP异常处理"""
    request_id = getattr(request.state, 'request_id', 'unknown')

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "type": "http_error"
            },
            "request_id": request_id
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """请求验证异常处理"""
    request_id = getattr(request.state, 'request_id', 'unknown')

    # 格式化验证错误
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(x) for x in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })

    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": 422,
                "message": "请求参数验证失败",
                "type": "validation_error",
                "details": errors
            },
            "request_id": request_id
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理"""
    request_id = getattr(request.state, 'request_id', 'unknown')

    # 记录错误日志
    logger.error(
        f"未处理的异常 - ID: {request_id}, "
        f"路径: {request.url.path}, 错误: {str(exc)}",
        exc_info=True
    )

    # 开发环境返回详细错误，生产环境返回通用错误
    if settings.DEBUG:
        error_message = str(exc)
    else:
        error_message = "服务器内部错误"

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": 500,
                "message": error_message,
                "type": "internal_error"
            },
            "request_id": request_id
        }
    )


# 健康检查端点
@app.get("/health")
async def health_check():
    """健康检查"""
    try:
        # 检查数据库连接
        from memos.api.core.database import get_async_session
        async for db in get_async_session():
            await db.execute("SELECT 1")
            break

        # 检查Redis连接
        redis = await get_redis()
        await redis.ping()

        return {
            "status": "healthy",
            "timestamp": time.time(),
            "version": "1.0.0",
            "services": {
                "database": "connected",
                "redis": "connected",
                "sharedb": "connected" if sharedb_service._initialized else "disconnected"
            }
        }

    except Exception as e:
        logger.error(f"健康检查失败: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "timestamp": time.time(),
                "error": str(e)
            }
        )


# 根路径
@app.get("/")
async def root():
    """API根路径"""
    return {
        "message": "WriterAI API",
        "version": "1.0.0",
        "docs_url": "/docs" if settings.DEBUG else None
    }


# 包含API路由
api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router.router)
api_router.include_router(admin_router.router)
api_router.include_router(chapters_router.router)
api_router.include_router(templates_router.router)
api_router.include_router(volumes_router.router)
api_router.include_router(works_router.router)
app.include_router(api_router)
# Yjs router already has /api/v1/yjs prefix, add directly to app
app.include_router(yjs_router.router)


async def warmup_system_data():
    """预热系统数据"""
    try:
        # 预加载系统模板
        from memos.api.models.template import WorkTemplate
        from memos.api.core.database import get_async_session

        async for db in get_async_session():
            # 检查并创建默认系统模板
            from sqlalchemy import select, and_
            stmt = select(WorkTemplate).where(
                and_(
                    WorkTemplate.is_system == True,
                    WorkTemplate.work_type == "novel"
                )
            )
            result = await db.execute(stmt)
            system_templates = result.scalars().all()

            if not system_templates:
                # 创建默认小说模板
                await create_default_novel_template(db)

            break

        logger.info("系统数据预热完成")

    except Exception as e:
        logger.error(f"系统数据预热失败: {e}")


async def create_default_novel_template(db):
    """创建默认小说模板"""
    from memos.api.models.template import WorkTemplate, TemplateField

    # 创建小说基本信息模板
    template = WorkTemplate(
        name="小说基本信息模板",
        description="包含小说创作的基本信息字段",
        work_type="novel",
        is_system=True,
        is_public=True,
        category="基础模板",
        tags=["小说", "基础"],
        template_config={
            "description": "适用于小说作品的基础信息模板",
            "version": "1.0"
        }
    )

    db.add(template)
    await db.flush()  # 获取template.id

    # 添加模板字段
    fields = [
        {
            "field_name": "genre",
            "field_type": "select",
            "field_label": "小说流派",
            "field_description": "选择小说的主要流派",
            "field_options": {
                "options": ["都市", "玄幻", "科幻", "武侠", "仙侠", "历史", "军事", "悬疑", "言情", "其他"]
            },
            "is_required": True,
            "sort_order": 1
        },
        {
            "field_name": "target_audience",
            "field_type": "select",
            "field_label": "目标读者",
            "field_description": "作品的主要读者群体",
            "field_options": {
                "options": ["青少年", "成年男性", "成年女性", "全年龄", "其他"]
            },
            "is_required": False,
            "sort_order": 2
        },
        {
            "field_name": "story_background",
            "field_type": "textarea",
            "field_label": "故事背景",
            "field_description": "描述故事发生的时代背景、地点等",
            "field_options": {
                "max_length": 1000
            },
            "is_required": False,
            "sort_order": 3
        },
        {
            "field_name": "main_characters",
            "field_type": "textarea",
            "field_label": "主要角色",
            "field_description": "描述故事中的主要角色",
            "field_options": {
                "max_length": 1500
            },
            "is_required": False,
            "sort_order": 4
        },
        {
            "field_name": "estimated_words",
            "field_type": "number",
            "field_label": "预计字数",
            "field_description": "作品预计的总字数",
            "field_options": {
                "min": 0,
                "max": 10000000
            },
            "is_required": False,
            "sort_order": 5
        }
    ]

    for field_data in fields:
        field = TemplateField(
            template_id=template.id,
            **field_data
        )
        db.add(field)

    await db.commit()
    logger.info(f"创建默认小说模板: {template.name}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )