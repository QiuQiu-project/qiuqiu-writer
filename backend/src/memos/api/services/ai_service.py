"""
AI服务层
处理AI模型调用和章节分析逻辑
"""

import asyncio
import base64
import json
import os
from datetime import datetime, timezone

from typing import AsyncGenerator, Optional
from urllib.parse import urlparse
from openai import AsyncOpenAI, OpenAIError

from memos.log import get_logger


logger = get_logger(__name__)
DEFAULT_SYSTEM_PROMPT = """
# 角色
你是一位经验丰富的小说编辑和文学分析专家，擅长深度解读故事内容，帮助读者更好地理解和思考小说情节。

# 任务
请对以下章节内容进行全面、深入的分析。

"""

# 默认章节分析提示词
DEFAULT_ANALYSIS_PROMPT = """

"""


class AIService:
    """AI服务类，处理与AI模型的交互"""

    @staticmethod
    def _normalize_openai_compatible_base_url(raw: str) -> str:
        text = (raw or "").strip()
        for ch in ("\ufeff", "\u200b", "\u200c", "\u200d", "\u2060"):
            text = text.replace(ch, "")
        text = text.replace("`", "")
        text = text.strip()
        while text.endswith((",", "，", ";", "；", "。")):
            text = text[:-1].rstrip()
        text = text.rstrip("/")
        if text.endswith("/chat/completions"):
            text = text[: -len("/chat/completions")].rstrip("/")
        if text.endswith("/images/generations"):
            text = text[: -len("/images/generations")].rstrip("/")
        if text.startswith("http://") and "localhost" not in text and "127.0.0.1" not in text:
            logger.warning(f"检测到 base_url 使用 HTTP 协议，自动转换为 HTTPS: {text}")
            text = text.replace("http://", "https://", 1)
        if not text.startswith(("http://", "https://")):
            text = f"https://{text}"
        parsed = urlparse(text)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"OPENAI_API_BASE 无效: {raw!r}")
        return text

    @staticmethod
    def _can_toggle_v1_suffix(base_url: str) -> bool:
        try:
            parsed = urlparse((base_url or "").strip())
            path = (parsed.path or "").rstrip("/")
            return path in ("", "/v1")
        except Exception:
            return False

    @staticmethod
    def _toggle_v1_suffix(base_url: str) -> str:
        text = (base_url or "").rstrip("/")
        if text.endswith("/v1"):
            return text[:-3].rstrip("/")
        return f"{text}/v1"

    def __init__(self):
        """初始化AI服务"""
        self.api_key = os.getenv("OPENAI_API_KEY",)
        base_url_env_raw = os.getenv("OPENAI_API_BASE", "https://api.deepseek.com")
        self.base_url = self._normalize_openai_compatible_base_url(base_url_env_raw)
        self.default_model = os.getenv("DEFAULT_AI_MODEL", "deepseek-chat")

        if not self.api_key:
            logger.warning("OPENAI_API_KEY not set, AI service may not work properly")

        # 初始化OpenAI客户端
        self.client = AsyncOpenAI(
            api_key=self.api_key or "dummy-key",  # 提供一个默认值以避免初始化失败
            base_url=self.base_url,
        )

        # 可用的模型列表（包含默认模型）
        self.available_models = [
            "deepseek-chat",  # DeepSeek 通用对话模型
        ]

        # 确保默认模型在可用列表中
        if self.default_model not in self.available_models:
            self.available_models.append(self.default_model)

        logger.info(f"AI Service initialized with base_url: {self.base_url}, default_model: {self.default_model}")

    # ── 内部 token 记账（懒加载，避免循环导入）────────────────────────────────
    async def generate_image(
        self,
        prompt: str,
        user_id: str,
        model: str = "dall-e-3",
        size: str = "1024x1024",
        quality: str = "standard",
        n: int = 1,
        feature: str = "image_generation",
        work_id: Optional[str] = None,
        reference_image_urls: Optional[list[str]] = None,
    ) -> str:
        """调用AI生成图片，返回图片URL"""
        from memos.api.core.database import AsyncSessionLocal
        from memos.api.models.system import SystemSetting
        from sqlalchemy import select
        from openai import AsyncOpenAI
        
        try:
            # 1. 检查配额
            await self._check_and_raise(user_id)

            # 2. 查找模型配置（如果是在管理端配置的模型）
            client = self.client
            actual_model = model
            
            try:
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(SystemSetting).where(SystemSetting.key == "llm_models")
                    )
                    row = result.scalar_one_or_none()
                    if row and isinstance(row.value, list):
                        # 1. 优先寻找 model_id 完全匹配的
                        matched_model = next((m for m in row.value if isinstance(m, dict) and m.get("model_id") == model and m.get("enabled", True)), None)
                        
                        # 2. 如果没找到，且模型类型有分类，寻找第一个 image 类型的模型
                        if not matched_model:
                            matched_model = next((m for m in row.value if isinstance(m, dict) and m.get("model_type") == "image" and m.get("enabled", True)), None)

                        if matched_model:
                            actual_model = matched_model.get("model_id", actual_model)
                            custom_base = matched_model.get("api_base_url")
                            custom_key = matched_model.get("api_key")
                            if custom_base or custom_key:
                                client = AsyncOpenAI(
                                    api_key=custom_key or self.api_key,
                                    base_url=custom_base or self.base_url,
                                )
                            # 如果模型配置了默认图片尺寸，使用配置值覆盖请求默认值
                            configured_size = matched_model.get("default_image_size")
                            if configured_size:
                                size = configured_size
            except Exception as db_e:
                logger.warning(f"Failed to lookup custom image model config: {db_e}")

            # 3. 调用图片生成API
            logger.info(f"Generating image with prompt: {prompt}, model: {actual_model}")

            # ── 特殊处理：DashScope Qwen 图像模型（非 OpenAI 兼容格式）──────────
            _base_str = str(client.base_url).lower()
            _is_dashscope = "dashscope.aliyuncs.com" in _base_str
            _is_qwen_image = actual_model.lower().startswith("qwen-image") or actual_model.lower().startswith("wanx")
            if _is_dashscope and _is_qwen_image:
                import httpx
                # DashScope 图像生成端点（无论 base_url 如何配置，均使用固定端点）
                DASHSCOPE_IMAGE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
                # qwen-image-2.0 使用 multimodal 端点
                if "qwen-image" in actual_model.lower():
                    DASHSCOPE_IMAGE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"

                # size 格式转换：1024x1024 → 1024*1024
                dashscope_size = size.replace("x", "*")

                async with httpx.AsyncClient() as httpx_client:
                    headers = {
                        "Authorization": f"Bearer {client.api_key}",
                        "Content-Type": "application/json",
                    }
                    ref_urls = [u for u in (reference_image_urls or []) if u]

                    # ── qwen-image：将参考图转为 base64 内嵌传入 ────────────────
                    # 直接传 URL 会 400（DashScope 服务器可能无法访问外部/过期 URL）
                    # 下载后 base64 编码，绕过 URL 可访问性限制
                    content: list[dict] = []
                    if "qwen-image" in actual_model.lower() and ref_urls:
                        for ref_url in ref_urls[:2]:  # 最多 2 张，避免 payload 过大
                            try:
                                img_resp = await httpx_client.get(ref_url, timeout=15.0)
                                if img_resp.status_code == 200:
                                    ctype = img_resp.headers.get(
                                        "content-type", "image/jpeg"
                                    ).split(";")[0]
                                    b64data = base64.b64encode(img_resp.content).decode("utf-8")
                                    content.append({"image": f"data:{ctype};base64,{b64data}"})
                            except Exception as img_err:
                                logger.warning(f"Skipping ref image (download failed): {img_err}")
                    content.append({"text": prompt})

                    payload = {
                        "model": actual_model,
                        "input": {
                            "messages": [
                                {"role": "user", "content": content}
                            ]
                        },
                        "parameters": {
                            "size": dashscope_size,
                            "prompt_extend": True,
                            "watermark": False,
                        },
                    }

                    # wanx 单张参考图（ref_img + ref_mode）
                    if "wanx" in actual_model.lower() and ref_urls:
                        payload["input"]["ref_img"] = ref_urls[0]
                        payload["parameters"]["ref_mode"] = "refonly"

                    resp = await httpx_client.post(
                        DASHSCOPE_IMAGE_URL, headers=headers, json=payload, timeout=120.0
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    output = data.get("output", {})

                    def _extract_dashscope_url(out: dict) -> str | None:
                        # 格式一：qwen-image-2.0 multimodal chat 格式
                        # output.choices[0].message.content[0].image
                        for choice in out.get("choices", []):
                            for item in choice.get("message", {}).get("content", []):
                                if isinstance(item, dict) and item.get("image"):
                                    return item["image"]
                        # 格式二：wanx text2image 任务格式
                        # output.results[0].url
                        results = out.get("results", [])
                        if results:
                            return results[0].get("url")
                        return None

                    task_status = output.get("task_status", "")
                    task_id = output.get("task_id")

                    if task_status == "SUCCEEDED":
                        image_url = _extract_dashscope_url(output)
                    elif task_id:
                        # 异步任务：轮询结果
                        poll_url = f"https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"
                        poll_headers = {"Authorization": f"Bearer {client.api_key}"}
                        for _ in range(40):  # 最多 120 秒
                            await asyncio.sleep(3)
                            poll_resp = await httpx_client.get(poll_url, headers=poll_headers, timeout=30.0)
                            poll_resp.raise_for_status()
                            poll_data = poll_resp.json()
                            poll_output = poll_data.get("output", {})
                            if poll_output.get("task_status") == "SUCCEEDED":
                                image_url = _extract_dashscope_url(poll_output)
                                break
                            elif poll_output.get("task_status") == "FAILED":
                                raise ValueError(f"DashScope 图片生成失败: {poll_output.get('message', '未知错误')}")
                        else:
                            raise ValueError("DashScope 图片生成超时，请稍后重试")
                    else:
                        # 同步直接返回（无 task_status 字段）
                        image_url = _extract_dashscope_url(output)
                        if not image_url:
                            raise ValueError(f"DashScope 返回格式异常: {data}")

                    if not image_url:
                        raise ValueError("DashScope 返回的图片 URL 为空")

            # ── 特殊处理：MiniMax 非标准 OpenAI 图片生成接口 ─────────────────
            elif client.base_url and "minimaxi.com" in str(client.base_url):
                import httpx
                import re

                # 简单的敏感词过滤（这里可以根据需要扩充敏感词库）
                sensitive_keywords = r"(血腥|暴力|色情|暴露|裸体|恐怖|自杀|毒品|杀|死|胸|腿|臀|性|女优|男优)"
                sanitized_prompt = re.sub(sensitive_keywords, " ", prompt, flags=re.IGNORECASE)

                async with httpx.AsyncClient() as httpx_client:
                    headers = {
                        "Authorization": f"Bearer {client.api_key}",
                        "Content-Type": "application/json"
                    }
                    base = str(client.base_url).rstrip('/')
                    url = f"{base}/image_generation"
                    # OpenAI 的 base_url 通常包含 /v1，如果没包含则补充
                    if not base.endswith("/v1") and not base.endswith("/v1/"):
                        url = f"{base}/v1/image_generation"
                    # 如果 base 已经是 https://api.minimaxi.com/v1 ，上面的 url 结果会是 https://api.minimaxi.com/v1/image_generation
                    
                    # 简单转换 size 到 aspect_ratio
                    aspect_ratio = "1:1"
                    if "x" in size:
                        w, h = size.split("x")
                        if int(w) > int(h): aspect_ratio = "16:9"
                        elif int(w) < int(h): aspect_ratio = "9:16"

                    payload = {
                        "model": actual_model,
                        "prompt": sanitized_prompt,
                        "aspect_ratio": aspect_ratio,
                        "response_format": "url",
                        "n": n,
                        "prompt_optimizer": True
                    }
                    resp = await httpx_client.post(url, headers=headers, json=payload, timeout=60.0)
                    resp.raise_for_status()
                    data = resp.json()
                    
                    if data.get("base_resp", {}).get("status_code") != 0:
                        raise ValueError(f"MiniMax Error: {data.get('base_resp', {}).get('status_msg')}")
                        
                    image_url = data["data"]["image_urls"][0]
            else:
                response = await client.images.generate(
                    model=actual_model,
                    prompt=prompt,
                    size=size,
                    quality=quality,
                    n=n,
                )
                image_url = response.data[0].url

            # 4. 记录使用量（图片生成一般按张计费，这里简化处理，扣除固定数量的token，或者如果系统支持图片计费则单独处理）
            # OpenAI的DALL-E 3 计费大约相当于几万token的成本，这里作为示例记录
            # TODO: 更好的计费逻辑
            await self._record(
                user_id=user_id,
                input_tokens=10000,  # 估算token成本
                output_tokens=0,
                total_tokens=10000,
                feature=feature,
                work_id=work_id,
            )

            return image_url
        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            error_msg = str(e)
            if "input new_sensitive" in error_msg:
                raise ValueError("图片生成失败：内容包含平台限制的敏感词汇被拦截，请尝试修改角色描述/场景描述后再试。")
            if "404" in error_msg:
                # 给出一个更有建设性的错误提示
                raise ValueError(f"图片生成失败(404)：请检查管理端配置的图片模型「{actual_model}」。\n1. API Base URL 是否正确（许多兼容接口需要以 /v1 结尾，如 https://api.siliconflow.cn/v1）。\n2. 模型 ID 是否拼写正确。\n原始错误: {error_msg}")
            raise ValueError(f"图片生成失败: {error_msg}")

    @staticmethod
    async def _check_and_raise(user_id: str) -> None:
        """检查配额，不足时抛出 QuotaExceededError"""
        from memos.api.services.token_service import TokenService, QuotaExceededError
        ok = await TokenService().check_token_quota(user_id)
        if not ok:
            raise QuotaExceededError(f"用户 {user_id} Token 配额不足，请升级套餐")

    @staticmethod
    async def _record(
        user_id: str,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        feature: str,
        work_id: Optional[str],
    ) -> None:
        """记录 token 用量（静默失败）"""
        try:
            from memos.api.services.token_service import TokenService
            await TokenService().record_token_usage(
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                feature=feature,
                work_id=work_id,
            )
        except Exception as e:
            logger.error(f"_record token usage failed: {e}")

    def get_default_prompt(self) -> str:
        """获取默认的章节分析提示词"""
        return DEFAULT_ANALYSIS_PROMPT

    def get_default_system_prompt(self) -> str:
        """获取默认的系统提示词"""
        return DEFAULT_SYSTEM_PROMPT

    def get_available_models(self) -> list[str]:
        """获取可用的AI模型列表"""
        return self.available_models

    def is_healthy(self) -> bool:
        """检查AI服务是否健康"""
        return bool(self.api_key)

    async def _resolve_text_client_and_model(self, model: str | None) -> tuple[AsyncOpenAI, str, str, str, str]:
        client = self.client
        model_name = model or self.default_model
        source = "env_default"
        api_key = self.api_key or "dummy-key"
        base_url = self.base_url
        try:
            from sqlalchemy import select
            from memos.api.core.database import AsyncSessionLocal
            from memos.api.models.system import SystemSetting

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(SystemSetting).where(SystemSetting.key == "llm_models")
                )
                row = result.scalar_one_or_none()
                if row and isinstance(row.value, list):
                    enabled_models = [
                        m for m in row.value if isinstance(m, dict) and m.get("enabled", True)
                    ]
                    matched = None
                    if model:
                        matched = next(
                            (m for m in enabled_models if str(m.get("model_id", "")).strip() == model),
                            None,
                        )
                    if not matched and not model:
                        matched = next(
                            (
                                m
                                for m in enabled_models
                                if m.get("model_type") in (None, "", "text")
                            ),
                            None,
                        )
                    if matched and str(matched.get("model_id", "")).strip():
                        model_name = str(matched.get("model_id")).strip()
                        custom_base = matched.get("api_base_url")
                        custom_key = matched.get("api_key")
                        if custom_base or custom_key:
                            resolved_base_url = (
                                self._normalize_openai_compatible_base_url(custom_base)
                                if custom_base
                                else self.base_url
                            )
                            api_key = custom_key or self.api_key or "dummy-key"
                            base_url = resolved_base_url
                            client = AsyncOpenAI(
                                api_key=api_key,
                                base_url=base_url,
                            )
                        source = f"llm_models:{model_name}"
        except Exception as e:
            logger.warning(f"resolve text model from llm_models failed: {e}")
        return client, model_name, source, api_key, base_url

    async def get_ai_response(
        self,
        content: str,
        prompt: str | None = None,
        system_prompt: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 40000,
        use_json_format: bool = True,
        usage_ref: dict | None = None,
        # ── Token 计量参数（可选；传入则自动检查配额并记录用量）───────────────
        user_id: str | None = None,
        feature: str = "ai_generate",
        work_id: str | None = None,
    ) -> str:
        """
        分析章节内容（非流式）

        Args:
            content: 章节内容
            prompt: 自定义用户提示词（可选，用于替换 {content} 变量）
            system_prompt: 自定义系统提示词（可选，描述AI的身份和角色）
            model: AI模型名称
            temperature: 生成温度
            max_tokens: 最大token数
            use_json_format: 是否使用JSON格式响应（默认True，用于分析接口；False用于生成文本内容）
            usage_ref: 回传 token 用量的字典（由调用方提供；service 内部会写入）
            user_id: 若提供，自动检查配额并记录用量
            feature: 用量日志的功能标签
            work_id: 用量日志关联作品 ID

        Returns:
            完整的AI响应文本内容
        """
        # ── 配额检查 ─────────────────────────────────────────────────────────
        if user_id:
            await self._check_and_raise(user_id)

        try:
            # 检查API密钥
            if not self.api_key:
                raise ValueError("未配置OPENAI_API_KEY，无法使用AI服务")

            client, model_name, model_source, resolved_api_key, resolved_base_url = (
                await self._resolve_text_client_and_model(model)
            )

            # 记录开始时间
            start_time = datetime.now(timezone.utc)

            # 获取系统提示词（从外部获取或使用默认值）
            system_content = system_prompt or self.get_default_system_prompt()

            # 构建用户提示词（从外部获取或使用默认值）
            user_prompt = prompt or self.get_default_prompt()
            # 使用 replace 而不是 format，避免 JSON 模板中的大括号冲突
            user_content = user_prompt.replace("{content}", content)

            logger.info(
                f"Starting chapter analysis with model: {model_name}, "
                f"temperature: {temperature}, max_tokens: {max_tokens}, "
                f"base_url: {resolved_base_url}, use_json_format: {use_json_format}, "
                f"model_source: {model_source}"
            )
            logger.debug(f"System prompt length: {len(system_content)}, User prompt length: {len(user_content)}")

            # 调用OpenAI/DeepSeek 兼容 API 进行非流式生成
            create_params = {
                "model": model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": system_content,
                    },
                    {"role": "user", "content": user_content},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
            }

            # 只有在需要JSON格式时才添加response_format参数
            if use_json_format:
                create_params["response_format"] = {
                    'type': 'json_object'
                }

            try:
                response = await client.chat.completions.create(**create_params)
            except OpenAIError as first_error:
                first_msg = str(first_error)
                if (
                    ("404" in first_msg or "Not Found" in first_msg)
                    and self._can_toggle_v1_suffix(resolved_base_url)
                ):
                    alt_base_url = self._toggle_v1_suffix(resolved_base_url)
                    logger.warning(
                        "Primary model call returned 404, retry with toggled /v1 suffix. "
                        f"base_url={resolved_base_url} -> {alt_base_url}, model={model_name}, source={model_source}"
                    )
                    alt_client = AsyncOpenAI(api_key=resolved_api_key, base_url=alt_base_url)
                    response = await alt_client.chat.completions.create(**create_params)
                    client = alt_client
                    resolved_base_url = alt_base_url
                else:
                    should_fallback = (
                        "Connection error" in first_msg
                        and model_source.startswith("llm_models:")
                        and (client is not self.client or model_name != self.default_model)
                    )
                    if not should_fallback:
                        raise
                    logger.warning(
                        f"Primary model call failed, fallback to env default model. "
                        f"failed_model={model_name}, source={model_source}, error={first_msg}"
                    )
                    fallback_params = dict(create_params)
                    fallback_params["model"] = self.default_model
                    response = await self.client.chat.completions.create(**fallback_params)
                    client = self.client
                    model_name = self.default_model
                    model_source = "env_default_fallback"
                    resolved_base_url = self.base_url

            # 从非流式响应中获取完整内容
            if not response.choices or len(response.choices) == 0:
                raise ValueError("AI服务返回空响应")

            # 获取完整文本内容
            full_text = response.choices[0].message.content or ""

            # ── 读取真实 token 用量 ───────────────────────────────────────────
            input_tok = 0
            output_tok = 0
            total_tok = 0
            if hasattr(response, 'usage') and response.usage:
                input_tok  = response.usage.prompt_tokens or 0
                output_tok = response.usage.completion_tokens or 0
                total_tok  = response.usage.total_tokens or 0

            # 若调用方传了 usage_ref，回填
            if usage_ref is not None:
                usage_ref['input_tokens']  = input_tok
                usage_ref['output_tokens'] = output_tok
                usage_ref['total_tokens']  = total_tok

            # 若没有拿到真实用量，用字符数估算（1 字符 ≈ 1.5 tokens）
            if total_tok == 0:
                total_tok  = max(1, int((len(user_content) + len(full_text)) * 1.5))
                input_tok  = max(1, int(len(user_content) * 1.5))
                output_tok = max(0, int(len(full_text) * 1.5))

            # ── 记录用量 ──────────────────────────────────────────────────────
            if user_id:
                await self._record(user_id, input_tok, output_tok, total_tok, feature, work_id)

            # 计算耗时
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()

            if full_text:
                preview = full_text[:2000]
                logger.info(f"Full AI response text (truncated to 2000 chars): {preview}")
                logger.debug(f"Total tokens: {total_tok}, input: {input_tok}, output: {output_tok}")

            logger.info(f"Chapter analysis completed successfully in {duration:.2f}s")

            return full_text

        except OpenAIError as e:
            error_msg = str(e)
            effective_base_url = resolved_base_url if "resolved_base_url" in locals() else self.base_url
            logger.error(
                f"OpenAI API error during chapter analysis: {error_msg}, "
                f"base_url: {effective_base_url}, model: {model_name}, model_source: {model_source}"
            )
            if "405" in error_msg:
                logger.error(
                    f"405 错误诊断: base_url={effective_base_url}, "
                    f"实际请求URL应该是: {effective_base_url}/v1/chat/completions, "
                    f"请检查 base_url 配置是否正确（不应该包含 /v1）"
                )
            raise ValueError(
                f"AI服务调用失败: {error_msg} (base_url={effective_base_url}, model={model_name})"
            )

        except Exception as e:
            # QuotaExceededError 直接向上传播，不包装
            from memos.api.services.token_service import QuotaExceededError
            if isinstance(e, QuotaExceededError):
                raise
            logger.error(f"Unexpected error during chapter analysis: {str(e)}")
            raise ValueError(f"服务器内部错误: {str(e)}")

    async def generate_content_stream(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 8000,
        usage_ref: dict | None = None,
        # ── Token 计量参数（可选）────────────────────────────────────────────
        user_id: str | None = None,
        feature: str = "ai_generate",
        work_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        流式生成内容（真正的流式响应）

        Args:
            prompt: 用户提示词
            system_prompt: 系统提示词（可选）
            model: AI模型名称
            temperature: 生成温度
            max_tokens: 最大token数
            usage_ref: 回传 token 用量的字典
            user_id: 若提供，自动检查配额并记录用量
            feature: 用量日志的功能标签
            work_id: 用量日志关联作品 ID

        Yields:
            内容块字符串
        """
        # ── 配额检查 ─────────────────────────────────────────────────────────
        if user_id:
            await self._check_and_raise(user_id)

        char_count = 0
        input_tok = max(1, int(len(prompt) * 1.5))  # 先估算输入

        try:
            # 检查API密钥
            if not self.api_key:
                raise ValueError("未配置OPENAI_API_KEY，无法使用AI服务")

            client, model_name, model_source, resolved_api_key, resolved_base_url = (
                await self._resolve_text_client_and_model(model)
            )

            # 记录开始时间
            start_time = datetime.now(timezone.utc)

            # 获取系统提示词
            system_content = system_prompt or self.get_default_system_prompt()

            logger.info(
                f"Starting content generation with model: {model_name}, "
                f"temperature: {temperature}, max_tokens: {max_tokens}, "
                f"base_url: {resolved_base_url}, model_source: {model_source}"
            )

            # 调用OpenAI/DeepSeek 兼容 API 进行流式生成
            try:
                stream = await client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": system_content,
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,  # 启用真正的流式响应
                )
            except OpenAIError as first_error:
                first_msg = str(first_error)
                if (
                    ("404" in first_msg or "Not Found" in first_msg)
                    and self._can_toggle_v1_suffix(resolved_base_url)
                ):
                    alt_base_url = self._toggle_v1_suffix(resolved_base_url)
                    logger.warning(
                        "Stream call returned 404, retry with toggled /v1 suffix. "
                        f"base_url={resolved_base_url} -> {alt_base_url}, model={model_name}, source={model_source}"
                    )
                    alt_client = AsyncOpenAI(api_key=resolved_api_key, base_url=alt_base_url)
                    stream = await alt_client.chat.completions.create(
                        model=model_name,
                        messages=[
                            {"role": "system", "content": system_content},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=temperature,
                        max_tokens=max_tokens,
                        stream=True,
                    )
                    client = alt_client
                    resolved_base_url = alt_base_url
                else:
                    raise

            # 流式返回内容，同时累计输出字符数
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        char_count += len(delta.content)
                        yield delta.content

            # 计算耗时
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()
            logger.info(f"Content generation completed successfully in {duration:.2f}s, chars={char_count}")

        except OpenAIError as e:
            error_msg = str(e)
            effective_base_url = resolved_base_url if "resolved_base_url" in locals() else self.base_url
            logger.error(
                f"OpenAI API error during content generation: {error_msg}, "
                f"base_url: {effective_base_url}, model: {model_name}, model_source: {model_source}"
            )
            raise ValueError(
                f"AI服务调用失败: {error_msg} (base_url={effective_base_url}, model={model_name})"
            )

        except Exception as e:
            from memos.api.services.token_service import QuotaExceededError
            if isinstance(e, QuotaExceededError):
                raise
            logger.error(f"Unexpected error during content generation: {str(e)}")
            raise ValueError(f"服务器内部错误: {str(e)}")

        finally:
            # ── 流结束后统一记录用量 ─────────────────────────────────────────
            output_tok = max(0, int(char_count * 1.5))
            total_tok  = input_tok + output_tok

            # 回填 usage_ref（供调用方读取）
            if usage_ref is not None:
                usage_ref['input_tokens']  = input_tok
                usage_ref['output_tokens'] = output_tok
                usage_ref['total_tokens']  = total_tok

            # 记录到数据库
            if user_id and total_tok > 0:
                await self._record(user_id, input_tok, output_tok, total_tok, feature, work_id)


# 全局AI服务实例
_ai_service_instance: AIService | None = None


def get_ai_service() -> AIService:
    """获取AI服务实例（单例模式）"""
    global _ai_service_instance
    if _ai_service_instance is None:
        _ai_service_instance = AIService()
    return _ai_service_instance
