"""
Prompt 灰度实验服务
- 用户分配：基于 hash(user_id + experiment_id) 的一致性分配，无需额外存储
- 提供 get_prompt_for_user 作为主入口，供 AI 路由在查询 prompt 时调用
"""

import hashlib
from typing import Optional, Tuple, Dict, Any, List

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from memos.api.models.prompt_experiment import PromptExperiment, PromptExperimentVariant
from memos.api.models.prompt_rating import PromptRating
from memos.api.models.prompt_template import PromptTemplate
from memos.log import get_logger

logger = get_logger(__name__)


def _user_hash_percent(user_id: str, salt: str) -> int:
    """
    用 SHA256 对 user_id+salt 取模 100，返回 0-99 的整数。
    相同输入永远返回相同结果（一致性分配，无需数据库）。
    """
    raw = f"{user_id}:{salt}"
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return int(digest[:8], 16) % 100


async def get_active_experiment(
    db: AsyncSession,
    template_type: str,
) -> Optional[PromptExperiment]:
    """返回指定 template_type 下状态为 running 的实验（最新创建的那个）。"""
    result = await db.execute(
        select(PromptExperiment)
        .options(selectinload(PromptExperiment.variants))
        .where(
            and_(
                PromptExperiment.template_type == template_type,
                PromptExperiment.status == "running",
            )
        )
        .order_by(PromptExperiment.created_at.desc())
        .limit(1)
    )
    return result.scalars().first()


async def get_prompt_for_user(
    db: AsyncSession,
    template_type: str,
    user_id: Optional[str],
) -> Tuple[Optional[PromptTemplate], Optional[int], Optional[int]]:
    """
    主入口：根据 template_type 和 user_id，返回应该使用的 PromptTemplate。

    返回: (template, experiment_id, variant_id)
    - 如果命中实验：返回分配的变体对应的模板 + experiment_id + variant_id
    - 否则：返回 is_default=True 的模板 + None + None
    """
    # 1. 查是否有运行中的实验
    experiment = await get_active_experiment(db, template_type)

    if experiment and experiment.variants and user_id:
        # 2. 判断用户是否参与实验（traffic_percent 控制总参与比例）
        participation_hash = _user_hash_percent(user_id, f"participate:{experiment.id}")
        if participation_hash < experiment.traffic_percent:
            # 3. 按 traffic_ratio 分配变体
            variant = _assign_variant(user_id, experiment)
            if variant:
                tmpl = await db.get(PromptTemplate, variant.prompt_template_id)
                if tmpl:
                    logger.debug(
                        f"[experiment] user={user_id} → experiment={experiment.id} "
                        f"variant={variant.id}({variant.label}) template={tmpl.id}"
                    )
                    return tmpl, experiment.id, variant.id

    # 4. 无实验或未命中，走默认模板
    result = await db.execute(
        select(PromptTemplate)
        .where(
            and_(
                PromptTemplate.template_type == template_type,
                PromptTemplate.is_default == True,
                PromptTemplate.is_active == True,
            )
        )
        .limit(1)
    )
    tmpl = result.scalars().first()
    return tmpl, None, None


def _assign_variant(
    user_id: str,
    experiment: PromptExperiment,
) -> Optional[PromptExperimentVariant]:
    """
    在实验的所有变体中，按累积 traffic_ratio 为用户一致性地分配一个变体。
    hash 值 0-99 映射到 [0, 1) 区间，按各变体比例累加确定落点。
    """
    variants = sorted(experiment.variants, key=lambda v: v.id)  # 稳定排序
    if not variants:
        return None

    assignment_hash = _user_hash_percent(user_id, f"variant:{experiment.id}")
    threshold = assignment_hash / 100.0

    cumulative = 0.0
    for v in variants:
        cumulative += v.traffic_ratio
        if threshold < cumulative:
            return v
    return variants[-1]


async def record_rating(
    db: AsyncSession,
    *,
    user_id: Optional[str],
    session_id: Optional[str],
    prompt_template_id: Optional[int],
    experiment_id: Optional[int],
    variant_id: Optional[int],
    rating: int,
    comment: Optional[str],
    context: Optional[Dict[str, Any]],
) -> PromptRating:
    """写入用户评分记录。"""
    record = PromptRating(
        user_id=user_id,
        session_id=session_id,
        prompt_template_id=prompt_template_id,
        experiment_id=experiment_id,
        variant_id=variant_id,
        rating=max(1, min(5, rating)),
        comment=comment,
        context=context or {},
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


async def get_experiment_stats(
    db: AsyncSession,
    experiment_id: int,
) -> List[Dict[str, Any]]:
    """
    按变体聚合评分统计：平均分、评分数量、分布。
    返回列表，每项对应一个变体。
    """
    # 查实验及变体
    exp = await db.get(PromptExperiment, experiment_id)
    if not exp:
        return []

    result = await db.execute(
        select(PromptExperiment)
        .options(selectinload(PromptExperiment.variants))
        .where(PromptExperiment.id == experiment_id)
    )
    exp = result.scalars().first()
    if not exp:
        return []

    stats = []
    for variant in exp.variants:
        # 聚合该变体的评分
        agg = await db.execute(
            select(
                func.count(PromptRating.id).label("count"),
                func.avg(PromptRating.rating).label("avg"),
            ).where(PromptRating.variant_id == variant.id)
        )
        row = agg.first()
        count = row.count if row else 0
        avg = float(row.avg) if (row and row.avg is not None) else None

        # 各分值分布
        dist_result = await db.execute(
            select(PromptRating.rating, func.count(PromptRating.id))
            .where(PromptRating.variant_id == variant.id)
            .group_by(PromptRating.rating)
            .order_by(PromptRating.rating)
        )
        distribution = {str(r): c for r, c in dist_result.all()}

        stats.append({
            **variant.to_dict(),
            "rating_count": count,
            "rating_avg": round(avg, 2) if avg is not None else None,
            "rating_distribution": distribution,
        })

    return stats
