import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from memos.api.services.work_service import WorkService
from memos.api.models.work import Work

@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()  # add is not async in SQLAlchemy
    return db

@pytest.fixture
def work_service(mock_db):
    return WorkService(mock_db)

@pytest.mark.asyncio
async def test_create_work(work_service, mock_db):
    work_data = {
        "title": "Test Work",
        "description": "A test work",
        "owner_id": "user-1"
    }
    
    # Mock commit and refresh
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    
    with patch("memos.api.services.work_service.generate_id", return_value="mock-work-id"):
        work = await work_service.create_work(**work_data)
        
        assert work.id == "mock-work-id"
        assert work.title == "Test Work"
        assert work.owner_id == "user-1"
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()

@pytest.mark.asyncio
async def test_get_work_by_id(work_service, mock_db):
    mock_work = Work(id="work-1", title="Test Work")
    
    # Mock session.execute result
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_work
    mock_db.execute.return_value = mock_result
    
    work = await work_service.get_work_by_id("work-1")
    
    assert work is not None
    assert work.id == "work-1"
    assert work.title == "Test Work"

@pytest.mark.asyncio
async def test_get_work_by_id_not_found(work_service, mock_db):
    # Mock session.execute result to return None
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result
    
    work = await work_service.get_work_by_id("nonexistent")
    
    assert work is None
