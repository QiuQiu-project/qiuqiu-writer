"""
媒体 Credits 计费服务

图像和视频共享同一 media_credits 余额。
"""

from sqlalchemy import select, update

from memos.api.core.database import AsyncSessionLocal
from memos.api.models.user import User
from memos.log import get_logger

logger = get_logger(__name__)

# 单次最大充值量，防止整数溢出 / 异常大额充值
_MAX_CREDITS_PER_OPERATION = 100_000


class CreditInsufficientError(Exception):
    """Credits 不足"""
    def __init__(self, required: int, remaining: int):
        self.required = required
        self.remaining = remaining
        super().__init__(f"media credits 不足：需要 {required}，剩余 {remaining}")


class MediaCreditService:

    async def get_balance(self, user_id: str) -> dict:
        """返回用户媒体 credits 余额"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                return {"media_credits": 0}
            return {"media_credits": user.media_credits or 0}

    async def check_and_deduct(
        self,
        user_id: str,
        model_id: str,
        credits_required: int,
    ) -> None:
        """
        原子扣减：单条 UPDATE ... WHERE media_credits >= credits_required。
        若 rowcount=0，再 SELECT 一次以区分"用户不存在"vs"余额不足"。
        余额不足时抛出 CreditInsufficientError。
        """
        if credits_required <= 0:
            raise ValueError(f"credits_required 必须为正整数，got {credits_required}")

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                update(User)
                .where(User.id == user_id, User.media_credits >= credits_required)
                .values(media_credits=User.media_credits - credits_required)
            )
            await session.commit()

            if result.rowcount == 0:
                # 扣减失败：查明原因
                row = await session.execute(select(User.media_credits).where(User.id == user_id))
                balance = row.scalar_one_or_none()
                remaining = int(balance or 0)
                raise CreditInsufficientError(credits_required, remaining)

        logger.info(
            f"media_credit_deduct: user={user_id}, model={model_id}, deducted={credits_required}"
        )

    async def add_credits(self, user_id: str, amount: int) -> None:
        """充值：向用户账户添加 media credits（支付成功后调用）"""
        if amount <= 0 or amount > _MAX_CREDITS_PER_OPERATION:
            raise ValueError(
                f"充值数量不合法: {amount}（允许范围 1–{_MAX_CREDITS_PER_OPERATION}）"
            )

        async with AsyncSessionLocal() as session:
            await session.execute(
                update(User)
                .where(User.id == user_id)
                .values(media_credits=User.media_credits + amount)
            )
            await session.commit()

        logger.info(f"media_credit_add: user={user_id}, added={amount}")
