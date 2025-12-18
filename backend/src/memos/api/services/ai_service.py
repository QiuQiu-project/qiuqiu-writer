"""
AI服务层
处理AI模型调用和章节分析逻辑
"""

import json
import os
from datetime import datetime, timezone
from typing import AsyncGenerator

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

    def __init__(self):
        """初始化AI服务"""
        self.api_key = os.getenv("OPENAI_API_KEY","sk-5b8dc562ef4647738b008c011bbf4acc")
        self.base_url = os.getenv("OPENAI_API_BASE", "https://api.deepseek.com/v1")
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

    async def analyze_chapter_stream(
        self,
        content: str,
        prompt: str | None = None,
        system_prompt: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 20000,
    ) -> AsyncGenerator[str, None]:
        """
        流式分析章节内容

        Args:
            content: 章节内容
            prompt: 自定义用户提示词（可选，用于替换 {content} 变量）
            system_prompt: 自定义系统提示词（可选，描述AI的身份和角色）
            model: AI模型名称
            temperature: 生成温度
            max_tokens: 最大token数

        Yields:
            SSE格式的消息字符串
        """
        try:
            # 检查API密钥
            if not self.api_key:
                error_msg = json.dumps(
                    {"type": "error", "message": "未配置OPENAI_API_KEY，无法使用AI服务"}
                )
                yield f"data: {error_msg}\n\n"
                return

            # 如果没有显式传入模型，使用服务的默认模型，避免向接口发送 null
            model_name = model or self.default_model

            # 发送开始消息（包含配置信息）
            start_time = datetime.now(timezone.utc)
            start_msg = json.dumps({
                "type": "start", 
                "message": "开始分析章节内容...",
                "metadata": {
                    "model": model_name,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "start_time": start_time.isoformat()
                }
            })
            yield f"data: {start_msg}\n\n"

            # 获取系统提示词（从外部获取或使用默认值）
            system_content = system_prompt or self.get_default_system_prompt()
            
            # 构建用户提示词（从外部获取或使用默认值）
            user_prompt = prompt or self.get_default_prompt()
            # 使用 replace 而不是 format，避免 JSON 模板中的大括号冲突
            user_content = user_prompt.replace("{content}", content)

            logger.info(
                f"Starting chapter analysis with model: {model_name}, "
                f"temperature: {temperature}, max_tokens: {max_tokens}"
            )
            logger.debug(f"System prompt length: {len(system_content)}, User prompt length: {len(user_content)}")

            # 调用OpenAI/DeepSeek 兼容 API 进行流式生成
            response = await self.client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": system_content,
                    },
                    {"role": "user", "content": user_content},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            print(response)
            # 用于统计
            total_tokens = 0
            completion_tokens = 0
            # 收集完整内容，方便调试 DeepSeek 返回格式问题
            full_text = ""
            
            # 流式返回生成的内容
            async for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        chunk_msg = json.dumps({"type": "chunk", "content": delta.content})
                        yield f"data: {chunk_msg}\n\n"
                        completion_tokens += 1  # 粗略估算
                        full_text += delta.content
                
                # 尝试获取usage信息（部分API会在最后一个chunk返回）
                if hasattr(chunk, 'usage') and chunk.usage:
                    total_tokens = chunk.usage.total_tokens or 0

            # 计算耗时
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()

            # 调试日志：打印完整的 AI 返回内容（截断避免过长）
            if full_text:
                preview = full_text[:2000]
                logger.info(
                    f"Full AI response text (truncated to 2000 chars): {preview}"
                )
                print(preview)

            # 发送完成消息（包含统计信息）
            done_msg = json.dumps({
                "type": "done", 
                "message": "分析完成",
                "metadata": {
                    "model": model_name,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "duration": round(duration, 2),
                    "estimated_tokens": completion_tokens if total_tokens == 0 else total_tokens,
                    "end_time": end_time.isoformat()
                }
            })
            yield f"data: {done_msg}\n\n"

            logger.info(f"Chapter analysis completed successfully in {duration:.2f}s")

        except OpenAIError as e:
            logger.error(f"OpenAI API error during chapter analysis: {str(e)}")
            error_msg = json.dumps({"type": "error", "message": f"AI服务调用失败: {str(e)}"})
            yield f"data: {error_msg}\n\n"

        except Exception as e:
            logger.error(f"Unexpected error during chapter analysis: {str(e)}")
            error_msg = json.dumps({"type": "error", "message": f"服务器内部错误: {str(e)}"})
            yield f"data: {error_msg}\n\n"


# 全局AI服务实例
_ai_service_instance: AIService | None = None


def get_ai_service() -> AIService:
    """获取AI服务实例（单例模式）"""
    global _ai_service_instance
    if _ai_service_instance is None:
        _ai_service_instance = AIService()
    return _ai_service_instance

