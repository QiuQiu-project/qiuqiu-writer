"""
剧本 AI 路由
直接调用 AIService，不依赖 MemOS/向量数据库
"""
import json
import uuid
from typing import AsyncGenerator, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.models.prompt_template import PromptTemplate
from memos.api.models.system import SystemSetting
from memos.api.services.ai_service import AIService
from memos.log import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v1/drama", tags=["drama-ai"])

DRAMA_SYSTEM_PROMPT = """你是一位专业的剧本编剧，擅长将小说内容改编为影视剧本。
你的任务是根据用户提供的内容，生成高质量的剧本相关内容。
请直接输出内容，不要添加多余的说明或标题。"""

DRAMA_SCENE_EXTRACT_TEMPLATE_TYPE = "drama_scene_extraction"
DRAMA_CHARACTER_EXTRACT_TEMPLATE_TYPE = "drama_character_extraction"
SCENE_GENERATION_STYLE_HINTS = {
    "balanced": "平衡风格：在空间布局、道具陈设、光影与材质之间保持均衡，信息清晰但不过度堆砌。",
    "cinematic": "电影感风格：强调光影反差、色彩基调、景深层次、构图张力与氛围元素（不写镜头运动与人物动作）。",
    "concise": "简洁风格：用最少的词描述最关键的可视化要素（空间、光照、关键物件），句子短、信息密度高。",
    "detailed": "细节风格：强化场景材质、空间层次、前中后景关系、环境音画元素与可用于美术搭景的细节（不写人物动作）。",
}

DEFAULT_SCENE_EXTRACT_PROMPT = """你是专业的影视分镜与美术设定助手。
请阅读以下剧本内容，提取最具画面表现力的关键场景，只提取“场景本身”的可视化信息：空间布局、陈设道具、材质、光照、天气/季节、色彩基调与氛围。
不要描述人物动作、心理、行为过程，不要复述剧情对白；如确需提到人物存在，仅允许用“人数/人影/站位”一笔带过且不写行为。

剧本内容：
{content}

输出要求：
1) 仅返回 JSON 数组，不要 Markdown、不要解释文字。
2) 最多返回 {max_items} 个场景，按叙事推进顺序排序。
3) 每个场景必须包含：
- id: scene-1、scene-2...（严格递增）
- location: 具体场景地点（如“旧仓库二层走廊”“雨夜天桥”）
- time: 时间与光照特征（如“深夜，霓虹逆光”“清晨，薄雾”）
- description: 60~140 字，聚焦场景视觉要点（空间布局/动线、前中后景层次、关键道具与可用物件、材质与脏污程度、光源方向与强弱、天气与环境元素、色彩基调；不写人物动作/行为）
4) 生成风格：{generation_style}

返回格式：
[
  {{
    "id": "scene-1",
    "location": "场景地点",
    "time": "时间与光照",
    "description": "场景视觉特征描述"
  }}
]"""

DEFAULT_CHARACTER_EXTRACT_PROMPT = """你是专业的角色设定师。
请根据以下剧本内容，提取主要角色，只提取“外貌可视化特征”和“可用于服化道/选角的设定信息”。
不要描述人物行为过程、性格心理、成长经历、价值观与动机；不要做超出原文的推断。

剧本内容：
{content}

输出要求：
1) 仅返回 JSON 数组，不要 Markdown、不要解释文字。
2) 最多返回 {max_items} 位主要角色，按重要性排序。
3) 每个角色必须包含：
- name: 角色名
- role: 角色定位（如“主角/反派/关键配角”或职业身份）
- description: 30~90 字，只写外观与身份层面的辨识点（职业/身份标签、常见随身物件、整体风格），不写剧情作用与行为
- appearance: 60~160 字，写外形可视化特征（年龄感范围、身高/体型、肤色/气质类型、发型发色、五官特征、服装风格与配饰、伤疤/纹身/标志物、携带物品）
- personality: 固定返回空字符串 ""

返回格式：
[
  {{
    "name": "角色名",
    "role": "角色身份",
    "description": "角色定位描述",
    "appearance": "外貌特征",
    "personality": "性格特点"
  }}
]"""


def get_ai_service() -> AIService:
    return AIService()


async def get_prompt_template_content(
    db: AsyncSession,
    template_type: str,
    fallback: str,
) -> str:
    template = await get_prompt_template_record(db, template_type)
    if template and template.prompt_content and template.prompt_content.strip():
        return template.prompt_content
    if not template:
        template = PromptTemplate(
            name=f"{template_type} 默认提示词",
            description=f"{template_type} 的默认提示词，可在管理端修改",
            template_type=template_type,
            prompt_content=fallback,
            version="1.0",
            is_default=True,
            is_active=True,
            variables={"content": "待分析文本", "max_items": "最大返回数量", "generation_style": "场景生成风格"},
            template_metadata={"source": "system", "module": "drama"},
        )
        db.add(template)
    return fallback


async def get_prompt_template_record(
    db: AsyncSession,
    template_type: str,
) -> PromptTemplate | None:
    stmt = (
        select(PromptTemplate)
        .where(
            and_(
                PromptTemplate.template_type == template_type,
                PromptTemplate.is_default == True,
                PromptTemplate.is_active == True,
            )
        )
        .order_by(desc(PromptTemplate.updated_at), desc(PromptTemplate.id))
    )
    result = await db.execute(stmt)
    template = result.scalar_one_or_none()
    if not template:
        stmt = (
            select(PromptTemplate)
            .where(
                and_(
                    PromptTemplate.template_type == template_type,
                    PromptTemplate.is_active == True,
                )
            )
            .order_by(desc(PromptTemplate.updated_at), desc(PromptTemplate.id))
        )
        result = await db.execute(stmt)
        template = result.scalar_one_or_none()
    return template


def format_prompt_with_vars(prompt_template: str, variables: dict[str, Any]) -> str:
    try:
        return prompt_template.format(**variables)
    except Exception:
        content = str(variables.get("content", ""))
        max_items = str(variables.get("max_items", ""))
        generation_style = str(variables.get("generation_style", ""))
        return (
            prompt_template.replace("{content}", content)
            .replace("{max_items}", max_items)
            .replace("{generation_style}", generation_style)
        )


def normalize_scene_generation_style(style: str | None) -> str:
    raw = (style or "").strip().lower()
    if raw in SCENE_GENERATION_STYLE_HINTS:
        return raw
    return "balanced"


async def get_enabled_text_models(db: AsyncSession) -> list[dict[str, Any]]:
    stmt = select(SystemSetting).where(SystemSetting.key == "llm_models")
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row or not isinstance(row.value, list):
        return []
    models: list[dict[str, Any]] = []
    for model in row.value:
        if not isinstance(model, dict) or not model.get("enabled", True):
            continue
        model_type = str(model.get("model_type") or "text").strip().lower()
        if model_type not in ("", "text"):
            continue
        model_id = str(model.get("model_id", "")).strip()
        if not model_id:
            continue
        models.append(
            {
                "id": str(model.get("id", "")).strip() or model_id,
                "name": str(model.get("name", "")).strip() or model_id,
                "model_id": model_id,
                "description": str(model.get("description", "")).strip(),
                "model_type": "text",
            }
        )
    return models


def resolve_extract_model_id(
    request_model_id: str | None,
    enabled_models: list[dict[str, Any]],
) -> str | None:
    candidate_req = (request_model_id or "").strip()
    valid_model_ids = {
        str(model.get("model_id", "")).strip()
        for model in enabled_models
        if isinstance(model, dict) and str(model.get("model_id", "")).strip()
    }
    if candidate_req and candidate_req in valid_model_ids:
        return candidate_req
    if candidate_req and valid_model_ids:
        logger.warning(f"Requested model_id not found in enabled text models: {candidate_req}")
    if enabled_models:
        fallback_model_id = str(enabled_models[0].get("model_id", "")).strip()
        if fallback_model_id:
            return fallback_model_id
    if candidate_req:
        return candidate_req
    return None


def parse_json_array(raw: str) -> list[dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("AI 返回为空，请重试")
    code_block = text.find("```")
    if code_block != -1:
        import re
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1).strip()
    first = text.find("[")
    last = text.rfind("]")
    if first != -1 and last != -1 and last > first:
        text = text[first:last + 1]
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        preview = text[:220].replace("\n", " ")
        raise ValueError(f"AI 返回格式错误：无法解析为 JSON 数组（位置 {e.pos}）。片段：{preview}") from e
    if not isinstance(parsed, list):
        actual_type = type(parsed).__name__
        raise ValueError(f"AI 返回格式错误：期望 JSON 数组，实际为 {actual_type}")
    return parsed


def map_extract_error_to_http(exc: Exception, extract_type: str) -> HTTPException:
    msg = str(exc).strip() or "未知错误"
    if "Token 配额不足" in msg:
        return HTTPException(status_code=402, detail=msg)
    if "未配置OPENAI_API_KEY" in msg:
        return HTTPException(status_code=500, detail="AI 服务未配置 API Key，请联系管理员检查系统配置")
    if "Connection error" in msg:
        return HTTPException(
            status_code=502,
            detail=f"{extract_type}上游连接失败：请检查文本模型的 API Base URL / API Key 配置",
        )
    if "AI服务调用失败" in msg:
        return HTTPException(status_code=502, detail=f"{extract_type}上游模型调用失败：{msg}")
    if "AI 返回格式错误" in msg or "AI 返回为空" in msg:
        return HTTPException(
            status_code=422,
            detail=f"{extract_type}失败：模型返回内容不符合 JSON 数组要求，请重试或在管理端优化提示词",
        )
    return HTTPException(status_code=400, detail=f"{extract_type}失败：{msg}")


class DramaChatRequest(BaseModel):
    prompt: str
    work_id: str | None = None
    system_prompt: str | None = None
    temperature: float = 0.7
    max_tokens: int = 4000
    stream: bool = False


class DramaImageRequest(BaseModel):
    prompt: str
    work_id: str | None = None
    model: str = "dall-e-3"
    size: str = "1024x1024"
    reference_image_urls: list[str] = []


class DramaExtractRequest(BaseModel):
    content: str
    work_id: str | None = None
    max_items: int = 12
    model_id: str | None = None
    generation_style: str | None = None


class DramaStoryboardRequest(BaseModel):
    script: str
    episode_title: str = ""
    episode_synopsis: str = ""
    characters: list[dict] = []
    work_id: str | None = None
    model_id: str | None = None
    max_panels: int = 12


@router.get("/prompt-config")
async def get_drama_prompt_config(
    db: AsyncSession = Depends(get_async_db),
):
    scene_prompt = await get_prompt_template_content(
        db,
        DRAMA_SCENE_EXTRACT_TEMPLATE_TYPE,
        DEFAULT_SCENE_EXTRACT_PROMPT,
    )
    character_prompt = await get_prompt_template_content(
        db,
        DRAMA_CHARACTER_EXTRACT_TEMPLATE_TYPE,
        DEFAULT_CHARACTER_EXTRACT_PROMPT,
    )
    return {
        "scene_template_type": DRAMA_SCENE_EXTRACT_TEMPLATE_TYPE,
        "character_template_type": DRAMA_CHARACTER_EXTRACT_TEMPLATE_TYPE,
        "scene_prompt": scene_prompt,
        "character_prompt": character_prompt,
    }


@router.post("/image")
async def drama_generate_image(
    req: DramaImageRequest,
    current_user_id: str = Depends(get_current_user_id),
    ai_service: AIService = Depends(get_ai_service),
):
    """生成剧本场景、角色等图片"""
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    try:
        image_url = await ai_service.generate_image(
            prompt=req.prompt,
            user_id=current_user_id,
            model=req.model,
            size=req.size,
            feature="drama_image",
            work_id=req.work_id,
            reference_image_urls=req.reference_image_urls or [],
        )
        return {"imageUrl": image_url}
    except ValueError as e:
        logger.warning(f"drama_generate_image warning: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"drama_generate_image error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _minio_upload(endpoint: str, access_key: str, secret_key: str, secure: bool,
                  bucket: str, filename: str, content: bytes, content_type: str) -> None:
    """同步 MinIO 上传（在线程池中调用）"""
    import io
    import json as _json
    from minio import Minio

    client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)

    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)

    client.put_object(bucket, filename, io.BytesIO(content), len(content), content_type=content_type)


def _minio_get(endpoint: str, access_key: str, secret_key: str, secure: bool,
               bucket: str, filename: str) -> tuple[bytes, str]:
    """同步从 MinIO 读取对象（在线程池中调用），返回 (content, content_type)"""
    from minio import Minio

    client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
    resp = client.get_object(bucket, filename)
    try:
        return resp.read(), resp.headers.get("Content-Type", "image/jpeg")
    finally:
        resp.close()
        resp.release_conn()


@router.post("/image/upload")
async def drama_upload_image(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user_id),
):
    """上传本地图片到剧本图片库（MinIO 存储，通过后端代理访问）"""
    import asyncio
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="仅支持 JPEG/PNG/WEBP/GIF 格式")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片大小不能超过 10MB")

    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
    ext = ext_map.get(file.content_type or "", ".jpg")
    filename = f"{uuid.uuid4().hex}{ext}"

    from memos.api.core.config import get_settings
    cfg = get_settings()

    try:
        await asyncio.to_thread(
            _minio_upload,
            cfg.MINIO_ENDPOINT, cfg.MINIO_ACCESS_KEY, cfg.MINIO_SECRET_KEY,
            cfg.MINIO_SECURE, cfg.MINIO_BUCKET_DRAMA,
            filename, content, file.content_type or "image/jpeg",
        )
    except Exception as e:
        logger.error(f"MinIO upload error: {e}")
        raise HTTPException(status_code=500, detail=f"图片上传失败：{e}")

    return {"imageUrl": f"/api/v1/drama/uploads/{filename}"}


@router.get("/uploads/{filename}")
async def drama_proxy_upload(filename: str):
    """代理从 MinIO 返回已上传的图片（无需暴露 MinIO 端口）"""
    import asyncio
    import re
    from fastapi.responses import Response

    # 只允许 hex + 扩展名，防止路径穿越
    if not re.fullmatch(r"[0-9a-f]{32}\.(jpg|jpeg|png|webp|gif)", filename, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="无效的文件名")

    from memos.api.core.config import get_settings
    cfg = get_settings()

    try:
        content, content_type = await asyncio.to_thread(
            _minio_get,
            cfg.MINIO_ENDPOINT, cfg.MINIO_ACCESS_KEY, cfg.MINIO_SECRET_KEY,
            cfg.MINIO_SECURE, cfg.MINIO_BUCKET_DRAMA, filename,
        )
    except Exception as e:
        logger.warning(f"MinIO get error [{filename}]: {e}")
        raise HTTPException(status_code=404, detail="图片不存在")

    return Response(content=content, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})


@router.get("/extract/options")
async def get_drama_extract_options(
    db: AsyncSession = Depends(get_async_db),
):
    models = await get_enabled_text_models(db)
    styles = [
        {"id": "balanced", "label": "平衡", "description": SCENE_GENERATION_STYLE_HINTS["balanced"]},
        {"id": "cinematic", "label": "电影感", "description": SCENE_GENERATION_STYLE_HINTS["cinematic"]},
        {"id": "concise", "label": "简洁", "description": SCENE_GENERATION_STYLE_HINTS["concise"]},
        {"id": "detailed", "label": "细节丰富", "description": SCENE_GENERATION_STYLE_HINTS["detailed"]},
    ]

    # 读取图片模型配置，返回可用尺寸列表和默认尺寸
    image_sizes: list[str] = []
    default_image_size: str = "1024x1024"
    stmt = select(SystemSetting).where(SystemSetting.key == "llm_models")
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row and isinstance(row.value, list):
        image_model = next(
            (m for m in row.value if isinstance(m, dict)
             and str(m.get("model_type", "")).strip().lower() == "image"
             and m.get("enabled", True)),
            None,
        )
        if image_model:
            image_sizes = [s for s in (image_model.get("image_sizes") or []) if s]
            configured_default = image_model.get("default_image_size", "")
            if configured_default:
                default_image_size = configured_default
            elif image_sizes:
                default_image_size = image_sizes[0]

    return {
        "models": models,
        "scene_generation_styles": styles,
        "image_sizes": image_sizes,
        "default_image_size": default_image_size,
    }


@router.post("/extract/scenes")
async def drama_extract_scenes(
    req: DramaExtractRequest,
    current_user_id: str = Depends(get_current_user_id),
    ai_service: AIService = Depends(get_ai_service),
    db: AsyncSession = Depends(get_async_db),
):
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="content 不能为空")
    max_items = max(1, min(req.max_items, 20))
    generation_style_key = normalize_scene_generation_style(req.generation_style)
    generation_style_hint = SCENE_GENERATION_STYLE_HINTS[generation_style_key]
    try:
        enabled_models = await get_enabled_text_models(db)
        model_id = resolve_extract_model_id(req.model_id, enabled_models)
        prompt_template = await get_prompt_template_content(
            db,
            DRAMA_SCENE_EXTRACT_TEMPLATE_TYPE,
            DEFAULT_SCENE_EXTRACT_PROMPT,
        )
        prompt = format_prompt_with_vars(
            prompt_template,
            {
                "content": req.content,
                "max_items": max_items,
                "generation_style": generation_style_hint,
            },
        )
        result = await ai_service.get_ai_response(
            content="",
            prompt=prompt,
            system_prompt="你是专业的影视场景提取助手，输出必须是严格 JSON 数组。",
            model=model_id,
            temperature=0.4,
            max_tokens=4000,
            use_json_format=False,
            user_id=current_user_id,
            feature="drama_scene_extract",
            work_id=req.work_id,
        )
        items = parse_json_array(result)
        scenes = []
        for idx, item in enumerate(items[:max_items], start=1):
            if not isinstance(item, dict):
                continue
            scenes.append(
                {
                    "id": f"scene-{idx}",
                    "location": str(item.get("location", "")).strip() or "未命名场景",
                    "time": str(item.get("time", "")).strip() or "未标注时间",
                    "description": str(item.get("description", "")).strip(),
                }
            )
        return {"items": scenes}
    except ValueError as e:
        logger.warning(f"drama_extract_scenes warning: {e}")
        raise map_extract_error_to_http(e, "场景抽取")
    except Exception as e:
        logger.error(f"drama_extract_scenes error: {e}")
        raise HTTPException(status_code=500, detail=f"场景抽取失败：服务器内部错误（{str(e)}）")


@router.post("/extract/characters")
async def drama_extract_characters(
    req: DramaExtractRequest,
    current_user_id: str = Depends(get_current_user_id),
    ai_service: AIService = Depends(get_ai_service),
    db: AsyncSession = Depends(get_async_db),
):
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="content 不能为空")
    max_items = max(1, min(req.max_items, 20))
    try:
        enabled_models = await get_enabled_text_models(db)
        model_id = resolve_extract_model_id(req.model_id, enabled_models)
        prompt_template = await get_prompt_template_content(
            db,
            DRAMA_CHARACTER_EXTRACT_TEMPLATE_TYPE,
            DEFAULT_CHARACTER_EXTRACT_PROMPT,
        )
        prompt = format_prompt_with_vars(
            prompt_template,
            {"content": req.content, "max_items": max_items},
        )
        result = await ai_service.get_ai_response(
            content="",
            prompt=prompt,
            system_prompt="你是专业的角色提取助手，输出必须是严格 JSON 数组。",
            model=model_id,
            temperature=0.4,
            max_tokens=4000,
            use_json_format=False,
            user_id=current_user_id,
            feature="drama_character_extract",
            work_id=req.work_id,
        )
        items = parse_json_array(result)
        characters = []
        for item in items[:max_items]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            characters.append(
                {
                    "name": name,
                    "role": str(item.get("role", "")).strip() or "配角",
                    "description": str(item.get("description", "")).strip(),
                    "appearance": str(item.get("appearance", "")).strip(),
                    "personality": str(item.get("personality", "")).strip(),
                }
            )
        return {"items": characters}
    except ValueError as e:
        logger.warning(f"drama_extract_characters warning: {e}")
        raise map_extract_error_to_http(e, "角色抽取")
    except Exception as e:
        logger.error(f"drama_extract_characters error: {e}")
        raise HTTPException(status_code=500, detail=f"角色抽取失败：服务器内部错误（{str(e)}）")


@router.post("/chat")
async def drama_chat(
    req: DramaChatRequest,
    current_user_id: str = Depends(get_current_user_id),
    ai_service: AIService = Depends(get_ai_service),
):
    """非流式剧本 AI 对话（用于章节→剧情简介转换等）"""
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    try:
        result = await ai_service.get_ai_response(
            content="",
            prompt=req.prompt,
            system_prompt=req.system_prompt or DRAMA_SYSTEM_PROMPT,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            use_json_format=False,
            user_id=current_user_id,
            feature="drama_chat",
            work_id=req.work_id,
        )
        return {"content": result}
    except ValueError as e:
        logger.warning(f"drama_chat warning: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"drama_chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def drama_chat_stream(
    req: DramaChatRequest,
    current_user_id: str = Depends(get_current_user_id),
    ai_service: AIService = Depends(get_ai_service),
):
    """SSE 流式剧本 AI 对话（用于剧本正文生成等）"""
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    async def event_stream() -> AsyncGenerator[str, None]:
        yield 'data: {"type": "ping", "data": "start"}\n\n'
        try:
            async for chunk in ai_service.generate_content_stream(
                prompt=req.prompt,
                system_prompt=req.system_prompt or DRAMA_SYSTEM_PROMPT,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                user_id=current_user_id,
                feature="drama_stream",
                work_id=req.work_id,
            ):
                payload = json.dumps({"type": "text", "data": chunk}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        except Exception as e:
            logger.error(f"drama_chat_stream error: {e}")
            err_payload = json.dumps({"type": "error", "content": str(e)}, ensure_ascii=False)
            yield f"data: {err_payload}\n\n"
        finally:
            yield 'data: {"type": "end"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


STORYBOARD_GENERATE_PROMPT = """你是专业的漫剧分镜导演，擅长将剧本拆解为可执行的分镜脚本。

剧集信息：
- 标题：{episode_title}
- 简介：{episode_synopsis}
- 角色列表：{characters_info}

剧本正文：
{script}

请将以上剧本拆解为分镜脚本，每格分镜代表一个独立画面。

重要规则：
- 剧本中的 H1 场次标题（如"INT. 办公室 - 白天"、"EXT. 街道 - 夜晚"）代表独立场次
- 每格分镜必须归属于其所在的场次
- 同一场次下的分镜格按顺序紧密排列

输出要求：
1) 仅返回 JSON 数组，不要 Markdown、不要解释文字
2) 最多返回 {max_panels} 格分镜，按叙事顺序排列
3) 每格必须包含：
- index: 全局格序号（1、2、3...，贯穿全集）
- actIndex: 场次序号（1、2、3...，每个场次递增）
- actTitle: 场次标题（直接使用剧本中的 H1 场次行内容，如"INT. 办公室 - 白天"）
- shotType: 镜头类型，必须是以下之一：wide（全景）、medium（中景）、close（近景）、extreme-close（特写）、bird-eye（俯瞰）、low-angle（仰拍）
- action: 画面动作与环境描述（40-80字，聚焦可视化内容）
- characters: 出现角色的名字数组（如 ["李明", "张华"]，无角色则为 []）
- dialogue: 本格的对白文字（无对白则为 null 或空字符串）
- emotion: 情绪基调（如"紧张""温馨""震撼"，1-4字）

返回格式示例（包含多个场次）：
[
  {{
    "index": 1,
    "actIndex": 1,
    "actTitle": "INT. 办公室 - 白天",
    "shotType": "wide",
    "action": "空旷的办公室，阳光从百叶窗倾斜射入，主角推门进入",
    "characters": ["李明"],
    "dialogue": null,
    "emotion": "平静"
  }},
  {{
    "index": 2,
    "actIndex": 1,
    "actTitle": "INT. 办公室 - 白天",
    "shotType": "close",
    "action": "李明走向桌面，看到一封信件",
    "characters": ["李明"],
    "dialogue": "这是什么？",
    "emotion": "疑惑"
  }},
  {{
    "index": 3,
    "actIndex": 2,
    "actTitle": "EXT. 街道 - 夜晚",
    "shotType": "wide",
    "action": "夜晚城市全景，霓虹灯倒映在湿润的街道上",
    "characters": [],
    "dialogue": null,
    "emotion": "孤独"
  }}
]"""


@router.post("/storyboard/generate")
async def drama_generate_storyboard(
    req: DramaStoryboardRequest,
    current_user_id: str = Depends(get_current_user_id),
    ai_service: AIService = Depends(get_ai_service),
    db: AsyncSession = Depends(get_async_db),
):
    """根据剧本正文生成分镜脚本（JSON 格式）"""
    if not req.script.strip():
        raise HTTPException(status_code=400, detail="script 不能为空")

    max_panels = max(1, min(req.max_panels, 24))
    characters_info = (
        "、".join(f"{c.get('name', '')}（{c.get('role', '')}）" for c in req.characters if c.get("name"))
        if req.characters
        else "暂无角色信息"
    )

    try:
        enabled_models = await get_enabled_text_models(db)
        model_id = resolve_extract_model_id(req.model_id, enabled_models)

        prompt = STORYBOARD_GENERATE_PROMPT.format(
            episode_title=req.episode_title or "本集",
            episode_synopsis=req.episode_synopsis or "（无简介）",
            characters_info=characters_info,
            script=req.script,
            max_panels=max_panels,
        )

        result = await ai_service.get_ai_response(
            content="",
            prompt=prompt,
            system_prompt="你是专业的漫剧分镜导演，输出必须是严格 JSON 数组。",
            model=model_id,
            temperature=0.5,
            max_tokens=6000,
            use_json_format=False,
            user_id=current_user_id,
            feature="drama_storyboard",
            work_id=req.work_id,
        )

        items = parse_json_array(result)
        panels = []
        valid_shot_types = {"wide", "medium", "close", "extreme-close", "bird-eye", "low-angle"}
        for idx, item in enumerate(items[:max_panels], start=1):
            if not isinstance(item, dict):
                continue
            shot_type = str(item.get("shotType", "medium")).strip()
            if shot_type not in valid_shot_types:
                shot_type = "medium"
            act_title = str(item.get("actTitle", "") or "").strip() or "场次1"
            act_index_raw = item.get("actIndex")
            try:
                act_index = int(act_index_raw) if act_index_raw is not None else 1
            except (ValueError, TypeError):
                act_index = 1
            panels.append(
                {
                    "id": f"panel-{idx}",
                    "index": idx,
                    "actTitle": act_title,
                    "actIndex": act_index,
                    "shotType": shot_type,
                    "action": str(item.get("action", "")).strip(),
                    "characters": [str(c) for c in item.get("characters", []) if c],
                    "dialogue": str(item.get("dialogue", "") or "").strip() or None,
                    "emotion": str(item.get("emotion", "") or "").strip(),
                    "imageUrl": None,
                    "imagePrompt": None,
                }
            )
        return {"panels": panels, "total": len(panels)}

    except ValueError as e:
        logger.warning(f"drama_generate_storyboard warning: {e}")
        raise map_extract_error_to_http(e, "分镜生成")
    except Exception as e:
        logger.error(f"drama_generate_storyboard error: {e}")
        raise HTTPException(status_code=500, detail=f"分镜生成失败：{str(e)}")
