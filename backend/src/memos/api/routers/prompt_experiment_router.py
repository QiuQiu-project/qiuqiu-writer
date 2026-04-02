"""
Prompt 灰度实验路由
- 管理员：创建/查看/更新/删除实验，查看统计
- 用户：提交评分
"""

from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from memos.api.core.database import get_async_db
from memos.api.core.security import verify_token
from memos.api.models.prompt_experiment import PromptExperiment, PromptExperimentVariant
from memos.api.models.prompt_rating import PromptRating
from memos.api.models.prompt_template import PromptTemplate
from memos.api.services.prompt_experiment_service import (
    get_experiment_stats, record_rating, get_active_experiment
)

router = APIRouter(tags=["PromptExperiment"])
security = HTTPBearer(auto_error=False)


# ─── Auth helpers ─────────────────────────────────────────────────────────────

async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[str]:
    if not credentials:
        return None
    payload = verify_token(credentials.credentials, "access")
    return payload.get("sub") if payload else None


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
) -> str:
    payload = verify_token(credentials.credentials, "access")
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Admin only")
    return payload.get("sub")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class VariantIn(BaseModel):
    prompt_template_id: int
    label: str = "实验组"
    traffic_ratio: float = Field(gt=0, le=1)
    is_control: bool = False


class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    template_type: str
    traffic_percent: int = Field(default=100, ge=1, le=100)
    variants: List[VariantIn] = Field(min_length=2)

    @field_validator("variants")
    @classmethod
    def check_ratios(cls, v: List[VariantIn]) -> List[VariantIn]:
        total = sum(x.traffic_ratio for x in v)
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"所有变体的 traffic_ratio 之和必须为 1.0，当前为 {total:.2f}")
        controls = [x for x in v if x.is_control]
        if len(controls) > 1:
            raise ValueError("最多只能有一个对照组")
        return v


class ExperimentStatusUpdate(BaseModel):
    status: str = Field(pattern="^(draft|running|paused|completed)$")


class RatingCreate(BaseModel):
    prompt_template_id: Optional[int] = None
    experiment_id: Optional[int] = None
    variant_id: Optional[int] = None
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


# ─── 用户端 ───────────────────────────────────────────────────────────────────

@router.post("/api/v1/prompt-ratings", status_code=201)
async def submit_rating(
    payload: RatingCreate,
    db: AsyncSession = Depends(get_async_db),
    user_id: Optional[str] = Depends(get_optional_user),
):
    """提交对 AI 生成结果的评分（登录/匿名均可）"""
    record = await record_rating(
        db,
        user_id=user_id,
        session_id=payload.session_id,
        prompt_template_id=payload.prompt_template_id,
        experiment_id=payload.experiment_id,
        variant_id=payload.variant_id,
        rating=payload.rating,
        comment=payload.comment,
        context=payload.context,
    )
    return {"id": record.id, "rating": record.rating}


# ─── 管理员端 ──────────────────────────────────────────────────────────────────

@router.post("/api/v1/admin/prompt-experiments", status_code=201)
async def create_experiment(
    payload: ExperimentCreate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    """创建新实验"""
    # 校验所有 template_id 存在
    for v in payload.variants:
        tmpl = await db.get(PromptTemplate, v.prompt_template_id)
        if not tmpl:
            raise HTTPException(status_code=404, detail=f"PromptTemplate {v.prompt_template_id} 不存在")

    exp = PromptExperiment(
        name=payload.name,
        description=payload.description,
        template_type=payload.template_type,
        traffic_percent=payload.traffic_percent,
        status="draft",
        created_by=admin_id,
    )
    db.add(exp)
    await db.flush()

    for v in payload.variants:
        variant = PromptExperimentVariant(
            experiment_id=exp.id,
            prompt_template_id=v.prompt_template_id,
            label=v.label,
            traffic_ratio=v.traffic_ratio,
            is_control=v.is_control,
        )
        db.add(variant)

    await db.commit()
    result = await db.execute(
        select(PromptExperiment)
        .options(selectinload(PromptExperiment.variants))
        .where(PromptExperiment.id == exp.id)
    )
    created_exp = result.scalar_one()
    return _exp_to_dict(created_exp)


@router.get("/api/v1/admin/prompt-experiments")
async def list_experiments(
    template_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    """实验列表"""
    q = select(PromptExperiment).options(selectinload(PromptExperiment.variants))
    if template_type:
        q = q.where(PromptExperiment.template_type == template_type)
    if status:
        q = q.where(PromptExperiment.status == status)

    count_q = select(func.count()).select_from(PromptExperiment)
    if template_type:
        count_q = count_q.where(PromptExperiment.template_type == template_type)
    if status:
        count_q = count_q.where(PromptExperiment.status == status)

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        q.order_by(PromptExperiment.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    items = result.scalars().all()

    return {
        "items": [_exp_to_dict(e) for e in items],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/api/v1/admin/prompt-experiments/{exp_id}")
async def get_experiment(
    exp_id: int,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    """实验详情 + 统计数据"""
    result = await db.execute(
        select(PromptExperiment)
        .options(selectinload(PromptExperiment.variants))
        .where(PromptExperiment.id == exp_id)
    )
    exp = result.scalars().first()
    if not exp:
        raise HTTPException(status_code=404, detail="实验不存在")

    stats = await get_experiment_stats(db, exp_id)
    data = _exp_to_dict(exp)
    data["stats"] = stats
    return data


@router.patch("/api/v1/admin/prompt-experiments/{exp_id}/status")
async def update_experiment_status(
    exp_id: int,
    payload: ExperimentStatusUpdate,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    """启动 / 暂停 / 结束实验"""
    exp = await db.get(PromptExperiment, exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="实验不存在")

    # 同一 template_type 同时只能有一个 running 实验
    if payload.status == "running":
        running = await get_active_experiment(db, exp.template_type)
        if running and running.id != exp_id:
            raise HTTPException(
                status_code=409,
                detail=f"该 template_type 已有运行中的实验（id={running.id}），请先暂停或结束"
            )

    exp.status = payload.status
    await db.flush()
    return {"id": exp.id, "status": exp.status}


@router.delete("/api/v1/admin/prompt-experiments/{exp_id}", status_code=204)
async def delete_experiment(
    exp_id: int,
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    """删除实验（仅允许 draft 状态）"""
    exp = await db.get(PromptExperiment, exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="实验不存在")
    if exp.status != "draft":
        raise HTTPException(status_code=400, detail="只能删除草稿状态的实验")
    await db.delete(exp)


@router.get("/api/v1/admin/prompt-ratings")
async def list_ratings(
    prompt_template_id: Optional[int] = Query(None),
    experiment_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    """查看评分列表"""
    q = select(PromptRating)
    count_q = select(func.count()).select_from(PromptRating)

    filters = []
    if prompt_template_id:
        filters.append(PromptRating.prompt_template_id == prompt_template_id)
    if experiment_id:
        filters.append(PromptRating.experiment_id == experiment_id)
    if filters:
        q = q.where(and_(*filters))
        count_q = count_q.where(and_(*filters))

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        q.order_by(PromptRating.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    items = result.scalars().all()

    return {
        "items": [r.to_dict() for r in items],
        "total": total,
        "page": page,
        "size": size,
    }


# ─── Helper ───────────────────────────────────────────────────────────────────

def _exp_to_dict(exp: PromptExperiment) -> dict:
    data = exp.to_dict()
    data["variants"] = [v.to_dict() for v in (exp.variants or [])]
    return data
