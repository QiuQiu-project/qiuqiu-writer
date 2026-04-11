"""
支付路由
- POST /api/v1/payment/create-order   创建订单（返回二维码 URL）
- GET  /api/v1/payment/order-status/{order_id}  轮询订单状态
- POST /api/v1/payment/notify/wechat  微信支付异步回调
- POST /api/v1/payment/notify/alipay  支付宝异步回调
- GET  /api/v1/payment/mock-pay/{order_id}  模拟支付（MOCK 模式专用）
"""

import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.core.config import get_settings
from memos.api.core.database import AsyncSessionLocal
from memos.api.core.security import get_current_user_id
from memos.api.core.token_plans import get_plan_configs
from memos.api.core.media_credit_plans import get_pack_by_key  # noqa: F401
from memos.api.models.payment_order import PaymentOrder
from memos.api.models.media_credit_order import MediaCreditOrder
from memos.api.models.user import User
from memos.api.services.payment_service import (
    create_alipay_order,
    create_wechat_order,
    query_alipay_order,
    query_wechat_order,
    verify_alipay_callback,
    verify_wechat_callback,
)
from memos.api.services.token_service import TokenService
from memos.api.services.media_credit_service import MediaCreditService

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/v1/payment", tags=["Payment"])
token_service = TokenService()
media_credit_service = MediaCreditService()

# 订单有效期：超过此时长的 pending 订单拒绝激活
_ORDER_EXPIRY_HOURS = 24


async def _check_payment_rate_limit(user_id: str, action: str, limit: int = 5, window: int = 60) -> None:
    """Redis 计数器限流：同一用户在 window 秒内最多 limit 次。"""
    from memos.api.core.redis import get_redis
    redis = await get_redis()
    key = f"ratelimit:{action}:{user_id}:{int(time.time()) // window}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window * 2)
    if count > limit:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    plan_key: str
    cycle: str    # monthly / quarterly / yearly
    method: str   # wechat / alipay


class CreateOrderResponse(BaseModel):
    order_id: str
    qr_url: str     # 用于前端渲染二维码的字符串
    is_mock: bool = False  # True = 模拟模式，前端展示"模拟支付"按钮


class OrderStatusResponse(BaseModel):
    status: str   # pending / paid / failed / expired


# ── 激活套餐（支付成功后调用）────────────────────────────────────────────────

async def _activate_plan(order_id: str, notify_data: dict | None = None) -> None:
    """
    原子化激活套餐：
    1. UPDATE WHERE status='pending' AND 未过期 → 仅一个并发请求成功（RETURNING user_id, plan_key）
    2. 在同一事务提交后调用 token_service.set_user_plan
    3. 若 set_user_plan 失败，订单保持 paid（钱已收），记录 CRITICAL 日志等待人工处理
    """
    expiry_cutoff = datetime.now(timezone.utc) - timedelta(hours=_ORDER_EXPIRY_HOURS)
    now = datetime.now(timezone.utc)
    vals: dict = {"status": "paid", "paid_at": now}
    if notify_data:
        vals["notify_data"] = notify_data

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            update(PaymentOrder)
            .where(
                PaymentOrder.id == order_id,
                PaymentOrder.status == "pending",
                PaymentOrder.created_at >= expiry_cutoff,
            )
            .values(**vals)
            .returning(PaymentOrder.user_id, PaymentOrder.plan_key)
        )
        row = result.first()
        if not row:
            # 已支付、不存在或已过期，幂等返回
            return
        await session.commit()
        user_id, plan_key = row

    try:
        await token_service.set_user_plan(user_id, plan_key)
        logger.info(f"套餐已激活: user={user_id}, plan={plan_key}, order={order_id}")
    except Exception as e:
        logger.critical(
            f"套餐激活失败（订单已标记 paid，需人工处理）: order={order_id}, "
            f"user={user_id}, plan={plan_key}, error={e}"
        )


# ── 创建订单 ─────────────────────────────────────────────────────────────────

@router.post("/create-order", response_model=CreateOrderResponse)
async def create_order(
    body: CreateOrderRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    await _check_payment_rate_limit(current_user_id, "create_order", limit=5, window=60)
    # 校验套餐
    plans = await get_plan_configs()
    plan = next((p for p in plans if p["key"] == body.plan_key), None)
    if not plan:
        raise HTTPException(404, f"套餐不存在: {body.plan_key}")

    pricing = plan.get("pricing", {}).get(body.cycle, {})
    amount = float(pricing.get("current", 0))
    if amount <= 0:
        raise HTTPException(400, "免费套餐无需支付")
    if body.method not in ("wechat", "alipay"):
        raise HTTPException(400, "无效的支付方式")

    # 持久化订单
    order = PaymentOrder(
        user_id=current_user_id,
        plan_key=body.plan_key,
        plan_label=plan["label"],
        cycle=body.cycle,
        method=body.method,
        amount=amount,
    )
    async with AsyncSessionLocal() as session:
        session.add(order)
        await session.commit()
        await session.refresh(order)

    order_id = order.id

    # ── 模拟模式（无真实商户凭证时使用）────────────────────────────────────
    if settings.PAYMENT_MOCK_MODE:
        qr_url = f"mock://payment/{order_id}"  # 仅作为 QR 码内容；前端通过 is_mock 判断
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(PaymentOrder)
                .where(PaymentOrder.id == order_id)
                .values(qr_url=qr_url)
            )
            await session.commit()
        return CreateOrderResponse(order_id=order_id, qr_url=qr_url, is_mock=True)

    # ── 真实支付 ─────────────────────────────────────────────────────────────
    try:
        if body.method == "wechat":
            qr_url = await create_wechat_order(order_id, plan["label"], amount)
        else:
            qr_url = await create_alipay_order(order_id, plan["label"], amount)
    except Exception as e:
        logger.error(f"创建支付订单失败: {repr(e)}", exc_info=True)
        raise HTTPException(502, f"支付下单失败，请稍后重试: {repr(e)}")

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(PaymentOrder)
            .where(PaymentOrder.id == order_id)
            .values(qr_url=qr_url)
        )
        await session.commit()

    return CreateOrderResponse(order_id=order_id, qr_url=qr_url)


# ── 查询订单状态（前端轮询）──────────────────────────────────────────────────

@router.get("/order-status/{order_id}", response_model=OrderStatusResponse)
async def get_order_status(
    order_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PaymentOrder).where(
                PaymentOrder.id == order_id,
                PaymentOrder.user_id == current_user_id,
            )
        )
        order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "订单不存在")

    # 本地已是终态，直接返回
    if order.status != "pending":
        return OrderStatusResponse(status=order.status)

    # 模拟模式无需查支付平台
    if settings.PAYMENT_MOCK_MODE:
        return OrderStatusResponse(status=order.status)

    # ── 主动向支付平台查单（回调未到达时兜底）────────────────────────────────
    if order.method == "wechat":
        remote_status = await query_wechat_order(order_id)
    else:
        remote_status = await query_alipay_order(order_id)

    if remote_status == "paid":
        # 同步激活套餐
        await _activate_plan(order_id)
        return OrderStatusResponse(status="paid")

    return OrderStatusResponse(status=order.status)


# ── 回调路由：按订单 ID 前缀分发到对应激活函数 ──────────────────────────────

def _dispatch_activate(order_id: str, background: BackgroundTasks, notify_data: dict | None = None) -> None:
    """根据订单 ID 前缀决定激活套餐还是充值 credits"""
    if order_id.startswith("MC"):
        background.add_task(_activate_media_credits, order_id, notify_data)
    else:
        background.add_task(_activate_plan, order_id, notify_data)


# ── 微信支付回调 ─────────────────────────────────────────────────────────────

@router.post("/notify/wechat")
async def wechat_notify(request: Request, background: BackgroundTasks):
    body = await request.body()
    result = verify_wechat_callback(dict(request.headers), body)
    if result and result.get("trade_state") == "SUCCESS":
        order_id = result.get("out_trade_no", "")
        _dispatch_activate(order_id, background, notify_data=result)
    return {"code": "SUCCESS", "message": "成功"}


# ── 支付宝回调 ───────────────────────────────────────────────────────────────

@router.post("/notify/alipay")
async def alipay_notify(request: Request, background: BackgroundTasks):
    form = await request.form()
    data = dict(form)
    signature = data.pop("sign", "")
    if (
        verify_alipay_callback(data, signature)
        and data.get("trade_status") == "TRADE_SUCCESS"
    ):
        order_id = data.get("out_trade_no", "")
        _dispatch_activate(order_id, background, notify_data=data)
    return "success"  # 支付宝要求返回纯文本


# ── 模拟支付（MOCK_MODE 专用）────────────────────────────────────────────────

@router.get("/mock-pay/{order_id}")
async def mock_pay(
    order_id: str,
    background: BackgroundTasks,
    current_user_id: str = Depends(get_current_user_id),
):
    """
    开发/测试专用：访问此 URL 即视为支付成功。
    生产环境 PAYMENT_MOCK_MODE=false 时此接口自动返回 404。
    """
    if not settings.PAYMENT_MOCK_MODE:
        raise HTTPException(404, "Not found")
    # 校验订单归属，防止横向越权
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PaymentOrder).where(
                PaymentOrder.id == order_id,
                PaymentOrder.user_id == current_user_id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(404, "订单不存在")
    background.add_task(_activate_plan, order_id)
    return {"message": "模拟支付成功，套餐将在几秒内激活"}


# ════════════════════════════════════════════════════════════════════════════
# 媒体 Credits 充值
# ════════════════════════════════════════════════════════════════════════════

class CreateMediaOrderRequest(BaseModel):
    pack_key: str   # media_pack_small / media_pack_medium 等
    method: str     # wechat / alipay


async def _activate_media_credits(order_id: str, notify_data: dict | None = None) -> None:
    """
    原子化充值媒体 Credits：
    UPDATE WHERE status='pending' AND 未过期 → RETURNING user_id, credits
    → 在同一事务内更新用户 media_credits，两步同一 session 提交，任意失败整体回滚。
    """
    expiry_cutoff = datetime.now(timezone.utc) - timedelta(hours=_ORDER_EXPIRY_HOURS)
    now = datetime.now(timezone.utc)
    vals: dict = {"status": "paid", "paid_at": now}
    if notify_data:
        vals["notify_data"] = notify_data

    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                update(MediaCreditOrder)
                .where(
                    MediaCreditOrder.id == order_id,
                    MediaCreditOrder.status == "pending",
                    MediaCreditOrder.created_at >= expiry_cutoff,
                )
                .values(**vals)
                .returning(MediaCreditOrder.user_id, MediaCreditOrder.credits)
            )
            row = result.first()
            if not row:
                # 已支付、不存在或已过期，幂等返回
                return
            user_id, credits = row

            await session.execute(
                update(User)
                .where(User.id == user_id)
                .values(media_credits=User.media_credits + credits)
            )
            await session.commit()
            logger.info(
                f"媒体 Credits 已充值: user={user_id}, credits={credits}, order={order_id}"
            )
        except Exception as e:
            await session.rollback()
            logger.error(f"充值 Credits 失败 order={order_id}: {e}")


@router.post("/create-media-order", response_model=CreateOrderResponse)
async def create_media_order(
    body: CreateMediaOrderRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    """创建媒体 Credits 充值订单"""
    await _check_payment_rate_limit(current_user_id, "create_media_order", limit=5, window=60)
    pack = await get_pack_by_key(body.pack_key)
    if not pack:
        raise HTTPException(404, f"充值包不存在: {body.pack_key}")
    if body.method not in ("wechat", "alipay"):
        raise HTTPException(400, "无效的支付方式")

    amount = float(pack["price"])
    order = MediaCreditOrder(
        user_id=current_user_id,
        order_type="media",
        pack_key=body.pack_key,
        pack_label=pack["label"],
        credits=int(pack["credits"]),
        method=body.method,
        amount=amount,
    )
    async with AsyncSessionLocal() as session:
        session.add(order)
        await session.commit()
        await session.refresh(order)

    order_id = order.id

    if settings.PAYMENT_MOCK_MODE:
        qr_url = f"mock://media-payment/{order_id}"
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(MediaCreditOrder)
                .where(MediaCreditOrder.id == order_id)
                .values(qr_url=qr_url)
            )
            await session.commit()
        return CreateOrderResponse(order_id=order_id, qr_url=qr_url, is_mock=True)

    try:
        if body.method == "wechat":
            qr_url = await create_wechat_order(order_id, pack["label"], amount)
        else:
            qr_url = await create_alipay_order(order_id, pack["label"], amount)
    except Exception as e:
        logger.error(f"创建媒体充值订单失败: {repr(e)}", exc_info=True)
        raise HTTPException(502, f"支付下单失败，请稍后重试: {repr(e)}")

    async with AsyncSessionLocal() as session:
        await session.execute(
            update(MediaCreditOrder)
            .where(MediaCreditOrder.id == order_id)
            .values(qr_url=qr_url)
        )
        await session.commit()

    return CreateOrderResponse(order_id=order_id, qr_url=qr_url)


@router.get("/media-order-status/{order_id}", response_model=OrderStatusResponse)
async def get_media_order_status(
    order_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    """查询媒体充值订单状态（前端轮询）"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(MediaCreditOrder).where(
                MediaCreditOrder.id == order_id,
                MediaCreditOrder.user_id == current_user_id,
            )
        )
        order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "订单不存在")

    if order.status != "pending":
        return OrderStatusResponse(status=order.status)

    if settings.PAYMENT_MOCK_MODE:
        return OrderStatusResponse(status=order.status)

    if order.method == "wechat":
        remote_status = await query_wechat_order(order_id)
    else:
        remote_status = await query_alipay_order(order_id)

    if remote_status == "paid":
        await _activate_media_credits(order_id)
        return OrderStatusResponse(status="paid")

    return OrderStatusResponse(status=order.status)


@router.get("/mock-media-pay/{order_id}")
async def mock_media_pay(
    order_id: str,
    background: BackgroundTasks,
    current_user_id: str = Depends(get_current_user_id),
):
    """开发/测试专用：模拟媒体 Credits 充值支付"""
    if not settings.PAYMENT_MOCK_MODE:
        raise HTTPException(404, "Not found")
    # 校验订单归属，防止横向越权
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(MediaCreditOrder).where(
                MediaCreditOrder.id == order_id,
                MediaCreditOrder.user_id == current_user_id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(404, "订单不存在")
    background.add_task(_activate_media_credits, order_id)
    return {"message": "模拟充值成功，Credits 将在几秒内到账"}
