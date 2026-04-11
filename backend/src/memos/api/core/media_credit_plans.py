"""
媒体 Credits 配置

包含：
1. 模型定价配置（每次生成消耗的 credits 数，图像/视频分开管理）
2. 统一充值包配置（图像和视频共享同一 credits 余额）

存储在 system_settings 表。不存在时 fallback 到默认值。
"""
from typing import Any

# ── 默认图像模型配置（空列表，由管理员在后台配置）────────────────────────────
DEFAULT_IMAGE_MODEL_CONFIGS: list[dict[str, Any]] = []

# ── 默认视频模型配置（空列表，由管理员在后台配置）────────────────────────────
DEFAULT_VIDEO_MODEL_CONFIGS: list[dict[str, Any]] = []

# ── 统一媒体充值包（图像/视频共享 credits）────────────────────────────────────
DEFAULT_MEDIA_CREDIT_PACKS: list[dict[str, Any]] = [
    {
        "pack_key": "media_pack_small",
        "label": "入门包",
        "credits": 50,
        "price": 9,
        "badge": None,
        "highlight": False,
    },
    {
        "pack_key": "media_pack_medium",
        "label": "标准包",
        "credits": 150,
        "price": 19,
        "badge": "推荐",
        "highlight": True,
    },
    {
        "pack_key": "media_pack_large",
        "label": "豪华包",
        "credits": 400,
        "price": 39,
        "badge": None,
        "highlight": False,
    },
]

_SETTING_KEYS = {
    "image_models": "image_model_configs",
    "video_models": "video_model_configs",
    "media_packs":  "media_credit_packs",
}

_DEFAULTS: dict[str, list[dict[str, Any]]] = {
    "image_model_configs": DEFAULT_IMAGE_MODEL_CONFIGS,
    "video_model_configs": DEFAULT_VIDEO_MODEL_CONFIGS,
    "media_credit_packs":  DEFAULT_MEDIA_CREDIT_PACKS,
}


async def _get_setting(key: str) -> list[dict[str, Any]]:
    try:
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.system import SystemSetting
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SystemSetting).where(SystemSetting.key == key)
            )
            setting = result.scalar_one_or_none()
            if setting and isinstance(setting.value, list) and setting.value:
                return setting.value
    except Exception:
        pass
    return [dict(item) for item in _DEFAULTS.get(key, [])]


async def _save_setting(key: str, configs: list[dict[str, Any]]) -> None:
    from memos.api.core.database import AsyncSessionLocal
    from memos.api.models.system import SystemSetting
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SystemSetting).where(SystemSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = list(configs)
            flag_modified(setting, "value")
        else:
            setting = SystemSetting(
                key=key,
                value=configs,
                description=f"媒体 Credits 配置: {key}",
                category="media_credits",
                is_public=False,
            )
            session.add(setting)
        await session.commit()


async def _get_llm_models_by_type(model_type: str) -> list[dict[str, Any]]:
    """从 llm_models 读取指定 model_type 的启用模型"""
    try:
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.system import SystemSetting
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(SystemSetting).where(SystemSetting.key == "llm_models")
            )
            row = result.scalar_one_or_none()
            if row and isinstance(row.value, list):
                return [
                    m for m in row.value
                    if isinstance(m, dict)
                    and str(m.get("model_type", "")).strip().lower() == model_type
                    and m.get("enabled", True)
                ]
    except Exception:
        pass
    return []


def _to_model_config(m: dict[str, Any]) -> dict[str, Any]:
    return {
        "model_id": m.get("model_id", ""),
        "label": m.get("label") or m.get("name") or m.get("model_id", ""),
        "description": m.get("description", ""),
        "credits_per_generation": int(m.get("credits_per_generation") or 1),
        "enabled": True,
    }


async def get_image_model_configs() -> list[dict[str, Any]]:
    """从 llm_models（model_type=image）读取，credits_per_generation 直接取自模型配置。"""
    return [_to_model_config(m) for m in await _get_llm_models_by_type("image") if m.get("model_id")]


async def get_video_model_configs() -> list[dict[str, Any]]:
    """从 llm_models（model_type=video）读取，credits_per_generation 直接取自模型配置。"""
    return [_to_model_config(m) for m in await _get_llm_models_by_type("video") if m.get("model_id")]


async def get_media_credit_packs() -> list[dict[str, Any]]:
    return await _get_setting(_SETTING_KEYS["media_packs"])


async def save_image_model_configs(configs: list[dict[str, Any]]) -> None:
    await _save_setting(_SETTING_KEYS["image_models"], configs)


async def save_video_model_configs(configs: list[dict[str, Any]]) -> None:
    await _save_setting(_SETTING_KEYS["video_models"], configs)


async def save_media_credit_packs(configs: list[dict[str, Any]]) -> None:
    await _save_setting(_SETTING_KEYS["media_packs"], configs)


async def get_pack_by_key(pack_key: str) -> dict[str, Any] | None:
    """通过 pack_key 查找充值包"""
    for pack in await get_media_credit_packs():
        if pack.get("pack_key") == pack_key:
            return dict(pack)
    return None
