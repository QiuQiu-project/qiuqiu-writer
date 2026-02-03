from typing import Any, ClassVar

from memos.configs.embedder import EmbedderConfigFactory
from memos.embedders.ark import ArkEmbedder
from memos.embedders.base import BaseEmbedder
from memos.embedders.ollama import OllamaEmbedder
from memos.embedders.sentence_transformer import SenTranEmbedder
from memos.embedders.universal_api import UniversalAPIEmbedder
from memos.memos_tools.singleton import singleton_factory, _factory_singleton


class EmbedderFactory(BaseEmbedder):
    """Factory class for creating embedder instances."""

    backend_to_class: ClassVar[dict[str, Any]] = {
        "ollama": OllamaEmbedder,
        "sentence_transformer": SenTranEmbedder,
        "ark": ArkEmbedder,
        "universal_api": UniversalAPIEmbedder,
    }

    @classmethod
    @singleton_factory()
    def from_config(cls, config_factory: EmbedderConfigFactory) -> BaseEmbedder:
        from memos.log import get_logger
        import os
        logger = get_logger(__name__)
        
        backend = config_factory.backend
        expected_backend = os.getenv("MOS_EMBEDDER_BACKEND", "universal_api")
        
        logger.info(
            f"🔧 EmbedderFactory.from_config called: "
            f"config_backend={backend}, env_backend={expected_backend}"
        )
        
        # Known fallback: universal_api -> sentence_transformer when DeepSeek (no embeddings API)
        is_known_fallback = backend == "sentence_transformer" and expected_backend == "universal_api"
        if backend != expected_backend and not is_known_fallback:
            logger.warning(
                f"⚠️ Embedder backend mismatch! Config says '{backend}' but env expects '{expected_backend}'. "
                f"This may indicate a cached instance. Cache will be cleared."
            )
            try:
                _factory_singleton.clear_cache(cls)
                logger.info("✅ Cleared embedder factory cache")
            except Exception as e:
                logger.warning(f"Failed to clear cache: {e}")
        
        if backend not in cls.backend_to_class:
            raise ValueError(f"Invalid backend: {backend}")
        embedder_class = cls.backend_to_class[backend]
        logger.info(f"✅ Creating embedder instance: {embedder_class.__name__}")
        instance = embedder_class(config_factory.config)
        logger.info(f"✅ Embedder instance created: {type(instance).__name__}")
        return instance
