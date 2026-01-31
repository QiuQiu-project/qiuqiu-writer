# API routers module

# Import AI router separately to avoid circular dependencies
from memos.api.routers.ai_router import router as ai_router

# Product and Server routers are imported on demand to avoid initialization issues
__all__ = ["ai_router"]

# WriterAI application routers are imported on demand to avoid initialization issues
def get_auth_router():
    from memos.api.routers.auth_router import router
    return router

def get_chapters_router():
    from memos.api.routers.chapters_router import router
    return router

def get_templates_router():
    from memos.api.routers.templates_router import router
    return router

def get_works_router():
    from memos.api.routers.works_router import router
    return router

# Lazy import for product_router and server_router
def get_product_router():
    from memos.api.routers.product_router import router
    return router

def get_server_router():
    from memos.api.routers.server_router import router
    return router

def get_volumes_router():
    from memos.api.routers.volumes_router import router
    return router
