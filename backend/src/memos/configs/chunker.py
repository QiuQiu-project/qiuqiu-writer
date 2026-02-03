from typing import Any, ClassVar

from pydantic import Field, field_serializer, field_validator, model_validator

from memos.configs.base import BaseConfig


class BaseChunkerConfig(BaseConfig):
    """Base configuration class for chunkers."""

    tokenizer_or_token_counter: str = Field(
        default="gpt2", description="Tokenizer model name or a token counting function"
    )
    chunk_size: int = Field(default=512, description="Maximum tokens per chunk")
    chunk_overlap: int = Field(default=128, description="Overlap between chunks")
    min_sentences_per_chunk: int = Field(default=1, description="Minimum sentences in each chunk")


class SentenceChunkerConfig(BaseChunkerConfig):
    """Configuration for sentence-based text chunker."""


class ChunkerConfigFactory(BaseConfig):
    """Factory class for creating chunker configurations."""

    backend: str = Field(..., description="Backend for chunker")
    config: dict[str, Any] = Field(..., description="Configuration for the chunker backend")

    backend_to_class: ClassVar[dict[str, Any]] = {
        "sentence": SentenceChunkerConfig,
    }

    @field_validator("backend")
    @classmethod
    def validate_backend(cls, backend: str) -> str:
        """Validate the backend field."""
        if backend not in cls.backend_to_class:
            raise ValueError(f"Invalid backend: {backend}")
        return backend

    @field_serializer("config")
    def _serialize_config(self, value: Any) -> dict[str, Any]:
        """Serialize config to dict for JSON/compatibility (avoids Pydantic serializer warning)."""
        if hasattr(value, "model_dump"):
            return value.model_dump(mode="json")
        return value if isinstance(value, dict) else {}

    @model_validator(mode="after")
    def create_config(self) -> "ChunkerConfigFactory":
        config_class = self.backend_to_class[self.backend]
        self.config = config_class(**self.config)
        return self
