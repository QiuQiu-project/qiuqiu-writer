import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from memos.api.services.user_service import UserService
from memos.api.models.user import User

@pytest.fixture
def user_service():
    return UserService()

@pytest.mark.asyncio
async def test_get_user_by_id(user_service):
    # Mock database session
    mock_session = AsyncMock()
    mock_user = User(
        id="test-id",
        username="testuser",
        email="test@example.com",
        display_name="Test User",
        status="active"
    )
    mock_user.profile = None
    
    # Mock session.execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user
    mock_session.execute.return_value = mock_result
    
    # Mock redis
    mock_redis = AsyncMock()
    mock_redis.get.return_value = None
    
    # Create a mock for the context manager
    mock_cm = MagicMock()
    mock_cm.__aenter__.return_value = mock_session
    mock_cm.__aexit__.return_value = None
    
    with patch("memos.api.services.user_service.AsyncSessionLocal", return_value=mock_cm), \
         patch.object(UserService, "get_redis", return_value=mock_redis):
        user = await user_service.get_user_by_id("test-id")
        
        assert user is not None
        assert user["id"] == "test-id"
        assert user["username"] == "testuser"
        assert user["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_authenticate_user_success(user_service):
    # Mock database session
    mock_session = AsyncMock()
    mock_user = User(
        id="test-id",
        username="testuser",
        email="test@example.com",
        password_hash="hashed_password",
        status="active"
    )
    mock_user.profile = None
    
    # Mock session.execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user
    mock_session.execute.return_value = mock_result
    
    # Create a mock for the context manager
    mock_cm = MagicMock()
    mock_cm.__aenter__.return_value = mock_session
    mock_cm.__aexit__.return_value = None
    
    with patch("memos.api.services.user_service.AsyncSessionLocal", return_value=mock_cm), \
         patch("memos.api.services.user_service.verify_password", return_value=True), \
         patch.object(UserService, "_create_audit_log", new_callable=AsyncMock):
        
        user = await user_service.authenticate_user("testuser", "password123")
        
        assert user is not None
        assert user["id"] == "test-id"
        assert user["username"] == "testuser"

@pytest.mark.asyncio
async def test_authenticate_user_fail_wrong_password(user_service):
    # Mock database session
    mock_session = AsyncMock()
    mock_user = User(
        id="test-id",
        username="testuser",
        email="test@example.com",
        password_hash="hashed_password",
        status="active"
    )
    mock_user.profile = None
    
    # Mock session.execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user
    mock_session.execute.return_value = mock_result
    
    # Create a mock for the context manager
    mock_cm = MagicMock()
    mock_cm.__aenter__.return_value = mock_session
    mock_cm.__aexit__.return_value = None
    
    with patch("memos.api.services.user_service.AsyncSessionLocal", return_value=mock_cm), \
         patch("memos.api.services.user_service.verify_password", return_value=False):
        
        user = await user_service.authenticate_user("testuser", "wrongpassword")
        
        assert user is None

@pytest.mark.asyncio
async def test_authenticate_user_fail_not_found(user_service):
    # Mock database session
    mock_session = AsyncMock()
    
    # Mock session.execute result to return None
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result
    
    # Create a mock for the context manager
    mock_cm = MagicMock()
    mock_cm.__aenter__.return_value = mock_session
    mock_cm.__aexit__.return_value = None
    
    with patch("memos.api.services.user_service.AsyncSessionLocal", return_value=mock_cm):
        user = await user_service.authenticate_user("nonexistent", "password123")
        assert user is None
