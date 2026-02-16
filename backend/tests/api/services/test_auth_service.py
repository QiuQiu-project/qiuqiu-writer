import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from memos.api.services.auth_service import AuthService
from datetime import timedelta

@pytest.fixture
def auth_service():
    return AuthService()

@pytest.mark.asyncio
async def test_login_success(auth_service):
    mock_user = {
        "id": "test-id",
        "username": "testuser",
        "email": "test@example.com",
        "status": "active"
    }
    
    # Mock UserService.authenticate_user
    auth_service.user_service.authenticate_user = AsyncMock(return_value=mock_user)
    
    with patch("memos.api.services.auth_service.create_access_token", return_value="access_token"), \
         patch("memos.api.services.auth_service.create_refresh_token", return_value="refresh_token"), \
         patch.object(AuthService, "_create_user_session", new_callable=AsyncMock):
        
        result = await auth_service.login("testuser", "password123")
        
        assert result is not None
        assert result["access_token"] == "access_token"
        assert result["refresh_token"] == "refresh_token"
        assert result["user"]["username"] == "testuser"

@pytest.mark.asyncio
async def test_login_fail_invalid_credentials(auth_service):
    # Mock UserService.authenticate_user to return None
    auth_service.user_service.authenticate_user = AsyncMock(return_value=None)
    
    result = await auth_service.login("testuser", "wrongpassword")
    
    assert result is None

@pytest.mark.asyncio
async def test_login_fail_inactive_user(auth_service):
    mock_user = {
        "id": "test-id",
        "username": "testuser",
        "email": "test@example.com",
        "status": "inactive"
    }
    
    auth_service.user_service.authenticate_user = AsyncMock(return_value=mock_user)
    
    result = await auth_service.login("testuser", "password123")
    
    assert result is None

@pytest.mark.asyncio
async def test_register_success(auth_service):
    mock_user = {
        "id": "new-user-id",
        "username": "newuser",
        "email": "new@example.com",
        "status": "active"
    }
    
    # Mock UserService methods
    auth_service.user_service.check_username_availability = AsyncMock(return_value=True)
    auth_service.user_service.check_email_availability = AsyncMock(return_value=True)
    auth_service.user_service.create_user = AsyncMock(return_value=mock_user)
    auth_service.user_service.authenticate_user = AsyncMock(return_value=mock_user)
    
    with patch("memos.api.services.auth_service.create_access_token", return_value="access_token"), \
         patch("memos.api.services.auth_service.create_refresh_token", return_value="refresh_token"), \
         patch.object(AuthService, "_create_user_session", new_callable=AsyncMock):
        
        result = await auth_service.register(
            username="newuser",
            email="new@example.com",
            password="Password123!",
            confirm_password="Password123!"
        )
        
        assert result is not None
        assert "user" in result
        assert result["user"]["username"] == "newuser"
        assert result["access_token"] == "access_token"

@pytest.mark.asyncio
async def test_register_fail_password_mismatch(auth_service):
    result = await auth_service.register(
        username="newuser",
        email="new@example.com",
        password="password123",
        confirm_password="different_password"
    )
    
    assert result is None
