"""
用户反馈路由
"""

from typing import Optional
from fastapi import APIRouter, Depends, Request, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from memos.api.core.database import get_async_db
from memos.api.core.security import verify_token
from memos.api.models.feedback import Feedback
from memos.api.schemas.feedback import (
    FeedbackCreate, FeedbackResponse, FeedbackStatusUpdate, FeedbackListResponse
)
from fastapi import HTTPException, status

router = APIRouter(tags=["Feedback"])
security = HTTPBearer(auto_error=False)


async def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    """可选认证：有 token 则解析用户ID，无 token 则返回 None（允许匿名提交）"""
    if credentials is None:
        return None
    payload = verify_token(credentials.credentials, "access")
    if payload is None:
        return None
    return payload.get("sub")


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
):
    """管理员鉴权"""
    token = credentials.credentials
    payload = verify_token(token, "access")
    if not payload or payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload.get("sub")


# ─── 用户端 ───────────────────────────────────────────────────────────────────

@router.post("/api/v1/feedback", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(
    payload: FeedbackCreate,
    request: Request,
    db: AsyncSession = Depends(get_async_db),
    user_id: Optional[str] = Depends(get_optional_user_id),
):
    """提交反馈（登录/匿名均可）"""
    # 获取客户端 IP
    ip_address = request.client.host if request.client else None
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        ip_address = forwarded_for.split(",")[0].strip()

    user_agent = request.headers.get("User-Agent")

    feedback = Feedback(
        user_id=user_id,
        type=payload.type,
        title=payload.title,
        description=payload.description,
        status="pending",
        context=payload.context or {},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(feedback)
    await db.flush()
    await db.refresh(feedback)
    return FeedbackResponse(**feedback.to_dict())


# ─── 管理员端 ──────────────────────────────────────────────────────────────────

@router.get("/api/v1/admin/feedback", response_model=FeedbackListResponse)
async def list_feedback(
    type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin),
):
    """管理员查看反馈列表"""
    query = select(Feedback)
    count_query = select(func.count()).select_from(Feedback)

    if type:
        query = query.where(Feedback.type == type)
        count_query = count_query.where(Feedback.type == type)
    if status:
        query = query.where(Feedback.status == status)
        count_query = count_query.where(Feedback.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Feedback.created_at.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    items = result.scalars().all()

    return FeedbackListResponse(
        items=[FeedbackResponse(**f.to_dict()) for f in items],
        total=total,
        page=page,
        size=size,
    )


@router.get("/api/v1/admin/feedback/{feedback_id}", response_model=FeedbackResponse)
async def get_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin),
):
    """管理员查看反馈详情"""
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return FeedbackResponse(**feedback.to_dict())


@router.put("/api/v1/admin/feedback/{feedback_id}", response_model=FeedbackResponse)
async def update_feedback(
    feedback_id: int,
    payload: FeedbackStatusUpdate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(get_current_admin),
):
    """管理员更新反馈状态和备注"""
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    feedback = result.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    feedback.status = payload.status
    if payload.admin_note is not None:
        feedback.admin_note = payload.admin_note

    await db.flush()
    await db.refresh(feedback)
    return FeedbackResponse(**feedback.to_dict())
