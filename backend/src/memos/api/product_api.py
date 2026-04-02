import logging

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from memos.api.exceptions import APIExceptionHandler
from memos.api.middleware.request_context import RequestContextMiddleware
from memos.api.routers.product_router import router as product_router


# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MemOS Product REST APIs",
    description="A REST API for managing multiple users with MemOS Product.",
    version="1.0.1",
    redirect_slashes=True,
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestContextMiddleware, source="product_api")

# Include routers
app.include_router(product_router)

# 注册作品接口和章节接口
try:
    from memos.api.routers import (
        get_chapters_router,
        get_works_router,
        get_volumes_router,
        get_yjs_router,
        get_drama_router,
        get_prompt_experiment_router,
    )

    app.include_router(get_chapters_router())
    logger.info("✅ Chapters router registered successfully")

    app.include_router(get_volumes_router())
    logger.info("✅ Volumes router registered successfully")

    app.include_router(get_works_router())
    logger.info("✅ Works router registered successfully")

    app.include_router(get_yjs_router())
    logger.info("✅ Yjs router registered successfully")

    app.include_router(get_drama_router())
    logger.info("✅ Drama router registered successfully")

    app.include_router(get_prompt_experiment_router())
    logger.info("✅ PromptExperiment router registered successfully")
except Exception as e:
    logger.warning(f"⚠️  Failed to register chapters/works routers: {e}", exc_info=True)

# Exception handlers
app.exception_handler(RequestValidationError)(APIExceptionHandler.validation_error_handler)
app.exception_handler(HTTPException)(APIExceptionHandler.http_error_handler)
app.exception_handler(ValueError)(APIExceptionHandler.value_error_handler)
app.exception_handler(Exception)(APIExceptionHandler.global_exception_handler)


if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    uvicorn.run("memos.api.product_api:app", host="0.0.0.0", port=args.port, workers=args.workers)
