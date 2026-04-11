"""
支付路由
- POST /api/v1/payment/create-order   创建订单（返回二维码 URL）
- GET  /api/v1/payment/order-status/{order_id}  轮询订单状态
- POST /api/v1/payment/notify/wechat  微信支付异步回调
- POST /api/v1/payment/notify/alipay  支付宝异步回调
- GET  /api/v1/payment/mock-pay/{order_id}  模拟支付（MOCK 模式专用）
"""

import logging
from datetime import datetime, timezone

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

async def _activate_plan(order_id: str) -> None:
    """将订单标记为已支付，并升级用户套餐"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PaymentOrder).where(PaymentOrder.id == order_id)
        )
        order = result.scalar_one_or_none()
        if not order or order.status == "paid":
            return

        order.status = "paid"
        order.paid_at = datetime.now(timezone.utc)
        await session.commit()

    # 升级套餐（复用现有 token_service）
    try:
        await token_service.set_user_plan(order.user_id, order.plan_key)
        logger.info(f"套餐已激活: user={order.user_id}, plan={order.plan_key}, order={order_id}")
    except Exception as e:
        logger.error(f"激活套餐失败 order={order_id}: {e}")


# ── 创建订单 ─────────────────────────────────────────────────────────────────

@router.post("/create-order", response_model=CreateOrderResponse)
async def create_order(
    body: CreateOrderRequest,
    current_user_id: str = Depends(get_current_user_id),
):
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

def _dispatch_activate(order_id: str, background: BackgroundTasks) -> None:
    """根据订单 ID 前缀决定激活套餐还是充值 credits"""
    if order_id.startswith("MC"):
        background.add_task(_activate_media_credits, order_id)
    else:
        background.add_task(_activate_plan, order_id)


# ── 微信支付回调 ─────────────────────────────────────────────────────────────

@router.post("/notify/wechat")
async def wechat_notify(request: Request, background: BackgroundTasks):
    body = await request.body()
    result = verify_wechat_callback(dict(request.headers), body)
    if result and result.get("trade_state") == "SUCCESS":
        order_id = result.get("out_trade_no", "")
        _dispatch_activate(order_id, background)
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
        _dispatch_activate(order_id, background)
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


async def _activate_media_credits(order_id: str) -> None:
    """将媒体充值订单标记为已支付，并原子地向用户账户充入 credits"""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(MediaCreditOrder).where(MediaCreditOrder.id == order_id)
        )
        order = result.scalar_one_or_none()
        if not order or order.status == "paid":
            return

        try:
            # 在同一事务内完成状态更新 + credits 充值，避免状态已 paid 但 credits 未到账
            order.status = "paid"
            order.paid_at = datetime.now(timezone.utc)
            await session.execute(
                update(User)
                .where(User.id == order.user_id)
                .values(media_credits=User.media_credits + order.credits)
            )
            await session.commit()
            logger.info(
                f"媒体 Credits 已充值: user={order.user_id}, "
                f"credits={order.credits}, order={order_id}"
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
