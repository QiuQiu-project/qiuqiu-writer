import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from memos.api.services.ai_service import AIService
import os

@pytest.fixture
def ai_service():
    with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_API_BASE": "https://api.test.com"}):
        return AIService()

def test_ai_service_init(ai_service):
    assert ai_service.api_key == "test-key"
    assert ai_service.base_url == "https://api.test.com"
    assert ai_service.default_model == "deepseek-chat"
    assert "deepseek-chat" in ai_service.get_available_models()

def test_is_healthy(ai_service):
    assert ai_service.is_healthy() is True
    
    with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
        service = AIService()
        # AIService caches api_key in __init__
        service.api_key = None
        assert service.is_healthy() is False

@pytest.mark.asyncio
async def test_get_ai_response_success(ai_service):
    # Mock AsyncOpenAI client
    mock_completion = MagicMock()
    mock_completion.choices = [
        MagicMock(message=MagicMock(content='{"analysis": "test"}'))
    ]
    
    # Mock chat.completions.create
    ai_service.client.chat.completions.create = AsyncMock(return_value=mock_completion)
    
    response = await ai_service.get_ai_response(
        content="test content",
        model="deepseek-chat"
    )
    
    assert response == '{"analysis": "test"}'
    ai_service.client.chat.completions.create.assert_called_once()

@pytest.mark.asyncio
async def test_get_ai_response_error(ai_service):
    # Mock OpenAIError
    from openai import OpenAIError
    ai_service.client.chat.completions.create = AsyncMock(side_effect=OpenAIError("API Error"))
    
    with pytest.raises(ValueError, match="AI服务调用失败: API Error"):
        await ai_service.get_ai_response(content="test content")
