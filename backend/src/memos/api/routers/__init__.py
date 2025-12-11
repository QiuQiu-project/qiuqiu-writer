# API routers module

# Import AI router separately to avoid circular dependencies
try:
    from memos.api.routers.ai_router import router as ai_router
    __all__ = ["ai_router"]
except ImportError:
    ai_router = None
    __all__ = []

# WriterAI application routers are imported on demand to avoid initialization issues
# 使用直接导入，避免触发 memos.__init__.py 的导入
def get_auth_router():
    # 直接导入路由文件，使用绝对导入路径
    import importlib
    module = importlib.import_module('memos.api.routers.auth_router')
    return module.router

def get_chapters_router():
    import importlib
    module = importlib.import_module('memos.api.routers.chapters_router')
    return module.router

def get_templates_router():
    import importlib
    module = importlib.import_module('memos.api.routers.templates_router')
    return module.router

def get_works_router():
    # 直接导入路由文件，避免触发 memos 包的初始化
    # 使用 importlib 可以更好地控制导入过程
    import importlib
    module = importlib.import_module('memos.api.routers.works_router')
    return module.router

# Lazy import for product_router and server_router
def get_product_router():
    from memos.api.routers.product_router import router
    return router

def get_server_router():
    from memos.api.routers.server_router import router
    return router
