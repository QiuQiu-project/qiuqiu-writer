import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from memos.api.services.chapter_service import ChapterService
from memos.api.models.chapter import Chapter

@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()  # add is not async in SQLAlchemy
    return db

@pytest.fixture
def chapter_service(mock_db):
    return ChapterService(mock_db)

@pytest.mark.asyncio
async def test_get_max_chapter_number(chapter_service, mock_db):
    # Mock result for select(func.max(...))
    mock_result = MagicMock()
    mock_result.scalar.return_value = 5
    mock_db.execute.return_value = mock_result
    
    max_num = await chapter_service.get_max_chapter_number("work-1")
    
    assert max_num == 5
    mock_db.execute.assert_called_once()

@pytest.mark.asyncio
async def test_create_chapter(chapter_service, mock_db):
    chapter_data = {
        "work_id": "work-1",
        "title": "Chapter 1",
        "chapter_number": 1,
        "content": "This should be filtered" # Unsupported field in Chapter model according to ChapterService.create_chapter
    }
    
    # Mock commit and refresh
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    
    chapter = await chapter_service.create_chapter(**chapter_data)
    
    assert chapter.work_id == "work-1"
    assert chapter.title == "Chapter 1"
    assert not hasattr(chapter, "content")
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()

@pytest.mark.asyncio
async def test_get_chapter_by_id(chapter_service, mock_db):
    mock_chapter = Chapter(id=1, title="Chapter 1")
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_chapter
    mock_db.execute.return_value = mock_result
    
    chapter = await chapter_service.get_chapter_by_id(1)
    
    assert chapter is not None
    assert chapter.id == 1
    assert chapter.title == "Chapter 1"

@pytest.mark.asyncio
async def test_get_chapters(chapter_service, mock_db):
    mock_chapters = [Chapter(id=1, title="C1"), Chapter(id=2, title="C2")]
    
    # Mock count result
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 2
    
    # Mock list result
    mock_list_result = MagicMock()
    mock_list_result.scalars.return_value.all.return_value = mock_chapters
    
    # Setup mock_db.execute to return different values on successive calls
    # First call for count, second call for list
    mock_db.execute.side_effect = [mock_count_result, mock_list_result]
    
    chapters, total = await chapter_service.get_chapters(filters={"work_id": "work-1"})
    
    assert total == 2
    assert len(chapters) == 2
    assert chapters[0].title == "C1"
    assert mock_db.execute.call_count == 2
