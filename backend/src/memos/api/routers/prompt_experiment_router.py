"""
Prompt 灰度实验路由
- 管理员：创建/查看/更新/删除实验，查看统计
- 用户：提交评分
"""

from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, and_, case
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
    template_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    """查看评分列表"""
    q = (
        select(
            PromptRating,
            PromptTemplate.name.label("prompt_template_name"),
            PromptTemplate.version.label("prompt_template_version"),
            PromptTemplate.template_type.label("prompt_template_type"),
            PromptExperiment.name.label("experiment_name"),
            PromptExperimentVariant.label.label("variant_label"),
        )
        .select_from(PromptRating)
        .outerjoin(PromptTemplate, PromptTemplate.id == PromptRating.prompt_template_id)
        .outerjoin(PromptExperiment, PromptExperiment.id == PromptRating.experiment_id)
        .outerjoin(PromptExperimentVariant, PromptExperimentVariant.id == PromptRating.variant_id)
    )
    count_q = select(func.count()).select_from(PromptRating)

    filters = []
    if prompt_template_id:
        filters.append(PromptRating.prompt_template_id == prompt_template_id)
    if experiment_id:
        filters.append(PromptRating.experiment_id == experiment_id)
    if template_type:
        filters.append(PromptTemplate.template_type == template_type)
    if filters:
        q = q.where(and_(*filters))
        count_q = count_q.where(and_(*filters))

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        q.order_by(PromptRating.created_at.desc()).offset((page - 1) * size).limit(size)
    )
    rows = result.all()

    return {
        "items": [
            {
                **rating.to_dict(),
                "prompt_template_name": prompt_template_name,
                "prompt_template_version": prompt_template_version,
                "prompt_template_type": prompt_template_type,
                "experiment_name": experiment_name,
                "variant_label": variant_label,
            }
            for rating, prompt_template_name, prompt_template_version, prompt_template_type, experiment_name, variant_label in rows
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/api/v1/admin/prompt-ratings/summary")
async def get_rating_summary(
    template_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_async_db),
    admin_id: str = Depends(require_admin),
):
    filters = []
    if template_type:
        filters.append(PromptTemplate.template_type == template_type)

    base_query = (
        select(PromptRating, PromptTemplate, PromptExperiment, PromptExperimentVariant)
        .select_from(PromptRating)
        .outerjoin(PromptTemplate, PromptTemplate.id == PromptRating.prompt_template_id)
        .outerjoin(PromptExperiment, PromptExperiment.id == PromptRating.experiment_id)
        .outerjoin(PromptExperimentVariant, PromptExperimentVariant.id == PromptRating.variant_id)
    )
    if filters:
        base_query = base_query.where(and_(*filters))

    overview_query = select(
        func.count(PromptRating.id).label("total_ratings"),
        func.avg(PromptRating.rating).label("average_rating"),
        func.sum(case((PromptRating.experiment_id.is_not(None), 1), else_=0)).label("experiment_ratings"),
        func.sum(case((PromptRating.experiment_id.is_(None), 1), else_=0)).label("non_experiment_ratings"),
        func.sum(case((PromptRating.comment.is_not(None), 1), else_=0)).label("commented_ratings"),
    ).select_from(PromptRating).outerjoin(PromptTemplate, PromptTemplate.id == PromptRating.prompt_template_id)
    if filters:
        overview_query = overview_query.where(and_(*filters))
    overview_row = (await db.execute(overview_query)).first()

    distribution_query = (
        select(PromptRating.rating, func.count(PromptRating.id))
        .select_from(PromptRating)
        .outerjoin(PromptTemplate, PromptTemplate.id == PromptRating.prompt_template_id)
        .group_by(PromptRating.rating)
        .order_by(PromptRating.rating)
    )
    if filters:
        distribution_query = distribution_query.where(and_(*filters))
    distribution_rows = (await db.execute(distribution_query)).all()
    distribution = {str(score): 0 for score in range(1, 6)}
    for score, count in distribution_rows:
        distribution[str(score)] = count

    template_stats_query = (
        select(
            PromptTemplate.id.label("prompt_template_id"),
            PromptTemplate.name.label("prompt_template_name"),
            PromptTemplate.version.label("prompt_template_version"),
            PromptTemplate.template_type.label("prompt_template_type"),
            func.count(PromptRating.id).label("rating_count"),
            func.avg(PromptRating.rating).label("rating_avg"),
            func.sum(case((PromptRating.experiment_id.is_not(None), 1), else_=0)).label("experiment_rating_count"),
            func.sum(case((PromptRating.experiment_id.is_(None), 1), else_=0)).label("non_experiment_rating_count"),
            func.max(PromptRating.created_at).label("last_rated_at"),
        )
        .select_from(PromptRating)
        .join(PromptTemplate, PromptTemplate.id == PromptRating.prompt_template_id)
        .group_by(PromptTemplate.id, PromptTemplate.name, PromptTemplate.version, PromptTemplate.template_type)
        .order_by(func.count(PromptRating.id).desc(), PromptTemplate.id.desc())
    )
    if filters:
        template_stats_query = template_stats_query.where(and_(*filters))
    template_stats_rows = (await db.execute(template_stats_query)).all()

    experiment_stats_query = (
        select(
            PromptExperiment.id.label("experiment_id"),
            PromptExperiment.name.label("experiment_name"),
            PromptExperiment.status.label("experiment_status"),
            PromptExperiment.template_type.label("template_type"),
            func.count(PromptRating.id).label("rating_count"),
            func.avg(PromptRating.rating).label("rating_avg"),
        )
        .select_from(PromptRating)
        .join(PromptExperiment, PromptExperiment.id == PromptRating.experiment_id)
        .outerjoin(PromptTemplate, PromptTemplate.id == PromptRating.prompt_template_id)
        .group_by(PromptExperiment.id, PromptExperiment.name, PromptExperiment.status, PromptExperiment.template_type)
        .order_by(func.count(PromptRating.id).desc(), PromptExperiment.id.desc())
    )
    if filters:
        experiment_stats_query = experiment_stats_query.where(and_(*filters))
    experiment_stats_rows = (await db.execute(experiment_stats_query)).all()

    recent_comments_query = (
        select(
            PromptRating,
            PromptTemplate.name.label("prompt_template_name"),
            PromptExperiment.name.label("experiment_name"),
            PromptExperimentVariant.label.label("variant_label"),
        )
        .select_from(PromptRating)
        .outerjoin(PromptTemplate, PromptTemplate.id == PromptRating.prompt_template_id)
        .outerjoin(PromptExperiment, PromptExperiment.id == PromptRating.experiment_id)
        .outerjoin(PromptExperimentVariant, PromptExperimentVariant.id == PromptRating.variant_id)
        .where(and_(PromptRating.comment.is_not(None), PromptRating.comment != ""))
        .order_by(PromptRating.created_at.desc())
        .limit(20)
    )
    if filters:
        recent_comments_query = recent_comments_query.where(and_(*filters))
    recent_comment_rows = (await db.execute(recent_comments_query)).all()

    return {
        "overview": {
            "total_ratings": int(overview_row.total_ratings or 0) if overview_row else 0,
            "average_rating": round(float(overview_row.average_rating), 2) if overview_row and overview_row.average_rating is not None else None,
            "experiment_ratings": int(overview_row.experiment_ratings or 0) if overview_row else 0,
            "non_experiment_ratings": int(overview_row.non_experiment_ratings or 0) if overview_row else 0,
            "commented_ratings": int(overview_row.commented_ratings or 0) if overview_row else 0,
        },
        "distribution": distribution,
        "template_stats": [
            {
                "prompt_template_id": row.prompt_template_id,
                "prompt_template_name": row.prompt_template_name,
                "prompt_template_version": row.prompt_template_version,
                "prompt_template_type": row.prompt_template_type,
                "rating_count": int(row.rating_count or 0),
                "rating_avg": round(float(row.rating_avg), 2) if row.rating_avg is not None else None,
                "experiment_rating_count": int(row.experiment_rating_count or 0),
                "non_experiment_rating_count": int(row.non_experiment_rating_count or 0),
                "last_rated_at": row.last_rated_at.isoformat() if row.last_rated_at else None,
            }
            for row in template_stats_rows
        ],
        "experiment_stats": [
            {
                "experiment_id": row.experiment_id,
                "experiment_name": row.experiment_name,
                "experiment_status": row.experiment_status,
                "template_type": row.template_type,
                "rating_count": int(row.rating_count or 0),
                "rating_avg": round(float(row.rating_avg), 2) if row.rating_avg is not None else None,
            }
            for row in experiment_stats_rows
        ],
        "recent_comments": [
            {
                **rating.to_dict(),
                "prompt_template_name": prompt_template_name,
                "experiment_name": experiment_name,
                "variant_label": variant_label,
            }
            for rating, prompt_template_name, experiment_name, variant_label in recent_comment_rows
        ],
    }


# ─── Helper ───────────────────────────────────────────────────────────────────

def _exp_to_dict(exp: PromptExperiment) -> dict:
    data = exp.to_dict()
    data["variants"] = [v.to_dict() for v in (exp.variants or [])]
    return data
