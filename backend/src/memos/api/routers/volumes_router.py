from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.models.volume import Volume
from memos.api.models.work import Work
from memos.api.schemas.volume import VolumeCreate, VolumeUpdate, Volume as VolumeSchema
from memos.api.services.work_service import WorkService

router = APIRouter(prefix="/api/v1/volumes", tags=["卷管理"])

async def get_db_session(db: AsyncSession = Depends(get_async_db)) -> AsyncSession:
    if hasattr(db, '__aiter__') and not hasattr(db, 'execute'):
        try:
            db = await db.__anext__()
        except StopAsyncIteration:
            raise ValueError("无法从生成器获取数据库会话")
    return db

@router.post("/", response_model=VolumeSchema)
async def create_volume(
    volume: VolumeCreate,
    work_id: str = Query(..., description="作品ID"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
):
    work_service = WorkService(db)
    
    # Check edit permissions (owner or editor)
    if not await work_service.can_edit_work(current_user_id, work_id):
        raise HTTPException(status_code=403, detail="没有创建卷的权限")

    # Check volume number uniqueness
    result = await db.execute(
        select(Volume).where(Volume.work_id == work_id, Volume.volume_number == volume.volume_number)
    )
    if result.scalars().first():
         raise HTTPException(status_code=400, detail="该卷号已存在")

    new_volume = Volume(
        work_id=work_id,
        title=volume.title,
        volume_number=volume.volume_number,
        outline=volume.outline,
        detail_outline=volume.detail_outline
    )
    db.add(new_volume)
    await db.commit()
    await db.refresh(new_volume)
    return new_volume

@router.get("/", response_model=List[VolumeSchema])
async def list_volumes(
    work_id: str = Query(..., description="作品ID"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
):
    work_service = WorkService(db)

    # Check access permissions (owner, collaborator, or public)
    if not await work_service.can_access_work(current_user_id, work_id):
        raise HTTPException(status_code=403, detail="没有访问该作品卷列表的权限")

    result = await db.execute(
        select(Volume).where(Volume.work_id == work_id).order_by(Volume.volume_number)
    )
    return result.scalars().all()

@router.put("/{volume_id}", response_model=VolumeSchema)
async def update_volume(
    volume_id: int,
    volume_update: VolumeUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
):
    work_service = WorkService(db)

    result = await db.execute(select(Volume).where(Volume.id == volume_id))
    volume = result.scalars().first()
    if not volume:
        raise HTTPException(status_code=404, detail="卷不存在")

    # Check edit permissions (owner or editor)
    if not await work_service.can_edit_work(current_user_id, volume.work_id):
        raise HTTPException(status_code=403, detail="没有编辑该卷的权限")

    if volume_update.title is not None:
        volume.title = volume_update.title
    if volume_update.outline is not None:
        volume.outline = volume_update.outline
    if volume_update.detail_outline is not None:
        volume.detail_outline = volume_update.detail_outline
    if volume_update.volume_number is not None:
         # Check uniqueness if changing number
        if volume_update.volume_number != volume.volume_number:
            result = await db.execute(
                select(Volume).where(Volume.work_id == volume.work_id, Volume.volume_number == volume_update.volume_number)
            )
            if result.scalars().first():
                raise HTTPException(status_code=400, detail="该卷号已存在")
            volume.volume_number = volume_update.volume_number

    await db.commit()
    await db.refresh(volume)
    return volume

@router.delete("/{volume_id}")
async def delete_volume(
    volume_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: str = Depends(get_current_user_id)
):
    work_service = WorkService(db)

    result = await db.execute(select(Volume).where(Volume.id == volume_id))
    volume = result.scalars().first()
    if not volume:
        raise HTTPException(status_code=404, detail="卷不存在")

    # Check permissions (owner or editor)
    if not await work_service.can_edit_work(current_user_id, volume.work_id):
        raise HTTPException(status_code=403, detail="没有删除该卷的权限")

    await db.delete(volume)
    await db.commit()
    return {"message": "删除成功"}
