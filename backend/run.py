#!/usr/bin/env python3
"""
WriterAI后端服务启动脚本
"""

import asyncio
import uvicorn
import os
import sys
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "src"))  # 显式添加 src 目录


from memos.api.core.config import get_settings

settings = get_settings()


def main():
    """主启动函数"""
    print(
        f"""
🚀 WriterAI Backend Server
📍 版本: {settings.APP_VERSION}
🔧 环境: {'开发' if settings.DEBUG else '生产'}
🌐 主机: {settings.HOST}
📌 端口: {settings.PORT}
📚 API文档: http://{settings.HOST}:{settings.PORT}/docs
"""
    )

    # 配置uvicorn
    uvicorn_config = {
        "app": "app.main:app",
        "host": settings.HOST,
        "port": settings.PORT,
        "reload": settings.DEBUG,
        "log_level": settings.LOG_LEVEL.lower(),
        "access_log": True,
        "use_colors": True,
    }

    # 生产环境配置
    if not settings.DEBUG:
        uvicorn_config.update({
            "workers": 4,
            "worker_class": "uvicorn.workers.UvicornWorker",
            "loop": "uvloop",
        })

    try:
        # 启动服务器
        uvicorn.run(**uvicorn_config)
    except KeyboardInterrupt:
        print("\n👋 服务器已停止")
    except Exception as e:
        print(f"❌ 服务器启动失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()