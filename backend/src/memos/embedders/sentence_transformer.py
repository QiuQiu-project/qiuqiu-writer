import os
import time

from memos.configs.embedder import SenTranEmbedderConfig
from memos.dependency import require_python_package
from memos.embedders.base import BaseEmbedder
from memos.log import get_logger


logger = get_logger(__name__)


class SenTranEmbedder(BaseEmbedder):
    """Sentence Transformer Embedder class."""

    @require_python_package(
        import_name="sentence_transformers",
        install_command="pip install sentence-transformers",
        install_link="https://www.sbert.net/docs/installation.html",
    )
    def __init__(self, config: SenTranEmbedderConfig):
        from sentence_transformers import SentenceTransformer

        self.config = config
        
        # 尝试加载模型，带重试逻辑
        max_retries = 3
        retry_delay = 2  # 秒
        
        # 获取缓存目录配置
        # SentenceTransformer 使用 Hugging Face 的缓存机制
        # 通过环境变量 HF_HOME 或 TRANSFORMERS_CACHE 来设置缓存目录
        cache_dir = os.getenv("HF_HOME") or os.getenv("TRANSFORMERS_CACHE")
        if cache_dir:
            cache_dir = os.path.expanduser(cache_dir)
            # 设置环境变量，确保 SentenceTransformer 使用指定的缓存目录
            os.environ.setdefault("HF_HOME", cache_dir)
            logger.info(f"Using model cache directory: {cache_dir}")
        else:
            # 使用默认的 Hugging Face 缓存目录
            default_cache = os.path.expanduser("~/.cache/huggingface")
            cache_dir = default_cache
            logger.debug(f"Using default cache directory: {cache_dir}")
        
        # 检查是否使用本地文件（通过环境变量 HF_LOCAL_FILES_ONLY=true）
        # 优先检查环境变量，如果没有设置，默认使用 true（避免网络检查）
        local_files_only_env = os.getenv("HF_LOCAL_FILES_ONLY", "true")
        local_files_only = local_files_only_env.lower() in ("true", "1", "yes")
        
        # 在导入 SentenceTransformer 之前设置环境变量，确保生效
        if local_files_only:
            logger.info("HF_LOCAL_FILES_ONLY=true, attempting to use cached model files only")
            # 设置环境变量，确保只使用本地缓存（多个库都支持这个变量）
            os.environ["HF_LOCAL_FILES_ONLY"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"  # transformers 库也支持这个变量
            os.environ["HF_HUB_OFFLINE"] = "1"  # huggingface_hub 库也支持这个变量
        else:
            # 如果明确设置为 false，允许网络访问
            logger.info("HF_LOCAL_FILES_ONLY=false, allowing network access for model download")
            if "HF_LOCAL_FILES_ONLY" in os.environ:
                del os.environ["HF_LOCAL_FILES_ONLY"]
            if "TRANSFORMERS_OFFLINE" in os.environ:
                del os.environ["TRANSFORMERS_OFFLINE"]
            if "HF_HUB_OFFLINE" in os.environ:
                del os.environ["HF_HUB_OFFLINE"]
        
        # 检查模型是否已缓存
        model_cache_path = os.path.join(cache_dir, "hub", "models--" + self.config.model_name_or_path.replace("/", "--"))
        if os.path.exists(model_cache_path):
            logger.info(f"✅ Model found in cache: {model_cache_path}")
            # 如果模型已缓存，建议使用本地文件模式
            if not local_files_only:
                logger.info("💡 Tip: Set HF_LOCAL_FILES_ONLY=true to skip network checks for cached models")
        else:
            logger.info(f"Model not found in cache, will download to: {model_cache_path}")
        
        for attempt in range(max_retries):
            try:
                logger.info(
                    f"Loading SentenceTransformer model: {self.config.model_name_or_path} "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                
                # SentenceTransformer 会自动使用 HF_HOME 环境变量指定的缓存目录
                self.model = SentenceTransformer(
                    self.config.model_name_or_path,
                    trust_remote_code=self.config.trust_remote_code,
                )
                
                logger.info(f"✅ Successfully loaded SentenceTransformer model: {self.config.model_name_or_path}")
                break
                
            except Exception as e:
                error_msg = str(e)
                is_ssl_error = "SSL" in error_msg or "SSLError" in error_msg or "SSL: UNEXPECTED_EOF" in error_msg
                is_network_error = "Connection" in error_msg or "timeout" in error_msg.lower()
                
                if attempt < max_retries - 1:
                    if is_ssl_error or is_network_error:
                        logger.warning(
                            f"⚠️ Network/SSL error loading model (attempt {attempt + 1}/{max_retries}): {error_msg}. "
                            f"Retrying in {retry_delay} seconds..."
                        )
                        time.sleep(retry_delay)
                        retry_delay *= 2  # 指数退避
                    else:
                        # 非网络错误，不重试
                        logger.error(f"❌ Failed to load model: {error_msg}")
                        raise
                else:
                    # 最后一次尝试失败
                    if is_ssl_error or is_network_error:
                        logger.error(
                            f"❌ Failed to load model after {max_retries} attempts due to network/SSL error: {error_msg}\n"
                            f"💡 Suggestions:\n"
                            f"   1. Check your internet connection\n"
                            f"   2. Try setting HF_LOCAL_FILES_ONLY=true if model is already cached\n"
                            f"   3. Manually download the model: huggingface-cli download {self.config.model_name_or_path}\n"
                            f"   4. Use a different embedding model or API"
                        )
                    raise

        if self.config.embedding_dims is not None:
            logger.warning(
                "SentenceTransformer does not support specifying embedding dimensions directly. "
                "The embedding dimension is determined by the model."
                "`embedding_dims` will be ignored."
            )
            # Get embedding dimensions from the model
            self.config.embedding_dims = self.model.get_sentence_embedding_dimension()

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for the given texts.

        Args:
            texts: List of texts to embed.

        Returns:
            List of embeddings, each represented as a list of floats.
        """
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()
