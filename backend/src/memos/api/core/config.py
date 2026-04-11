"""
应用配置模块
"""

import os
from functools import lru_cache
from typing import List, Optional

try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from pydantic import validator


class Settings(BaseSettings):
    """应用配置类"""

    # 应用基础配置
    APP_NAME: str = "WriterAI Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # 跨域配置
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://[::1]:3000",
        "http://[::1]:3001",
    ]

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v

    # 安全配置
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30 * 24 * 60  # 30天
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 7 * 24 * 60  # 7天

    # PostgreSQL数据库配置
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", 5432))
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "password")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "writerai")

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # Redis配置
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", 6379))
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD")
    REDIS_DB: int = int(os.getenv("REDIS_DB", 0))

    @property
    def REDIS_URL(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # MongoDB配置（ShareDB）
    MONGODB_HOST: str = os.getenv("MONGODB_HOST", "localhost")
    MONGODB_PORT: int = int(os.getenv("MONGODB_PORT", 27017))
    MONGODB_USERNAME: Optional[str] = os.getenv("MONGODB_USERNAME")
    MONGODB_PASSWORD: Optional[str] = os.getenv("MONGODB_PASSWORD")
    MONGODB_DATABASE: str = os.getenv("MONGODB_DATABASE", "writerai_sharedb")

    @property
    def MONGODB_URL(self) -> str:
        if self.MONGODB_USERNAME and self.MONGODB_PASSWORD:
            # URL 编码用户名和密码，处理特殊字符
            from urllib.parse import quote_plus
            encoded_username = quote_plus(self.MONGODB_USERNAME)
            encoded_password = quote_plus(self.MONGODB_PASSWORD)
            # 添加 authSource=admin，MongoDB 默认使用 admin 数据库进行认证
            return (
                f"mongodb://{encoded_username}:{encoded_password}@"
                f"{self.MONGODB_HOST}:{self.MONGODB_PORT}/{self.MONGODB_DATABASE}"
                f"?authSource=admin"
            )
        return f"mongodb://{self.MONGODB_HOST}:{self.MONGODB_PORT}/{self.MONGODB_DATABASE}"

    # Qdrant向量数据库配置
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_API_KEY: Optional[str] = None

    # AI服务配置
    AI_API_BASE_URL: str = "http://localhost:8000"
    AI_API_TIMEOUT: int = 120
    AI_MAX_RETRIES: int = 3

    # 文件存储配置
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    ALLOWED_FILE_EXTENSIONS: List[str] = [".txt", ".docx", ".pdf", ".md"]

    # MinIO 对象存储配置
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"
    MINIO_BUCKET_DRAMA: str = os.getenv("MINIO_BUCKET_DRAMA", "drama-images")
    # 用于生成公开访问 URL 的基础地址（默认与 MINIO_ENDPOINT 相同）
    MINIO_PUBLIC_URL: str = os.getenv("MINIO_PUBLIC_URL", "")

    # 邮件配置
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: str = "noreply@writerai.com"

    # 分页配置
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # 缓存配置
    CACHE_TTL: int = 3600  # 1小时

    # ShareDB配置
    SHAREDB_DOCUMENT_TTL: int = 86400  # 24小时

    # 受信任主机配置
    ALLOWED_HOSTS: List[str] = ["*"]

    @validator("ALLOWED_HOSTS", pre=True)
    def assemble_allowed_hosts(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v

    # 日志配置
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    # ── 支付配置 ─────────────────────────────────────────────────────────────
    # 模拟支付模式（本地开发用，无需真实商户凭证）
    PAYMENT_MOCK_MODE: bool = False
    # 回调域名（需要公网可访问；本地开发可用 ngrok 暴露）
    PAYMENT_NOTIFY_BASE_URL: str = "https://your-domain.com"

    # 微信支付（Native 扫码支付，API v3）
    WECHAT_PAY_APPID: str = ""
    WECHAT_PAY_MCHID: str = ""
    WECHAT_PAY_APIV3_KEY: str = ""        # 32 位 API v3 密钥
    WECHAT_PAY_CERT_SERIAL: str = ""      # 商户证书序列号
    WECHAT_PAY_PRIVATE_KEY: str = ""      # 商户私钥 PEM 内容（多行用 \\n 转义）

    # 支付宝（当面付/预创建扫码）
    ALIPAY_APPID: str = ""
    ALIPAY_PRIVATE_KEY: str = ""          # 应用私钥（RSA2），PEM 内容
    ALIPAY_PUBLIC_KEY: str = ""           # 支付宝公钥，PEM 内容
    ALIPAY_SANDBOX: bool = True           # True = 沙箱环境

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"  # 允许额外的环境变量


@lru_cache()
def get_settings() -> Settings:
    """获取应用配置（单例模式）"""
    return Settings()