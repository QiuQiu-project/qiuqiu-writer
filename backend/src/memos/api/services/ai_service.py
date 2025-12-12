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
 章节内容
{content}

# 任务
基于上述章节内容，你必须仔细阅读并深入理解这些章节，然后以严格的JSON格式分析和提取章节信息。

# 关键要求
1. **必须只输出有效的JSON格式**，不要使用Markdown代码块，不要添加任何解释性文字，JSON前后不要有任何其他文字
2. **所有字符串字段必须填写** - 如果信息不可用，使用空字符串 ""，字符串字段永远不要使用 null
3. **所有数组字段必须是数组** - 如果没有项目，使用空数组 []，永远不要使用 null
4. 章节号必须是整数（数字），不能是字符串
5. 为内容中的每一章提取 chapter_number、title、outline 和 detailed_outline

# 字段详细要求

## "chapters" 数组 - 必需
每个章节对象必须包含所有四个必需字段：
[
  {{
    "chapter_number": "整数（必需）- 章节号必须是整数，不能是字符串。从内容中提取（例如：'第1章' -> 1, 'Chapter 2' -> 2），如果找不到则使用 0",
    "title": "字符串（必需）- 从内容中提取的章节标题，如果找不到则使用空字符串 ''",
    "outline": "字符串（必需）- 章节大纲，必须是文本描述格式（纯文本字符串）大纲是章节的概要信息，用自然语言描述章节的核心功能、关键情节点、画面感、氛围和结尾钩子等概括性内容。应该是一段连贯的文本描述，清晰简洁地概括章节的整体结构和主要信息。如果找不到则使用空字符串 ''",
    "detailed_outline": "字符串（必需）- 章节细纲，必须是文本描述格式（纯文本字符串）。细纲是章节的具体情节信息，用自然语言详细描述每个小节的具体内容、情节发展、人物行动、对话要点等细节。应该是一段或多段详细的文本描述，深入描述章节的具体情节展开。如果找不到则使用空字符串 ''"
  }}
]

# 重要说明
- **大纲（outline）**：是章节的概要信息，用自然语言文本描述章节的核心功能、关键情节点、画面感、氛围和结尾钩子等概括性内容，用于快速了解章节的整体结构和主要信息。必须是纯文本格式。
- **细纲（detailed_outline）**：是章节的具体情节信息，用自然语言文本详细描述每个小节的具体内容、情节发展、人物行动、对话要点等细节，用于深入了解章节的具体情节展开。必须是纯文本格式。

# 输出格式 - 严格JSON格式
你必须只输出以下JSON结构，不要添加任何其他文字，不要使用Markdown代码块，不要添加解释：

{{
  "chapters": [
    {{
      "chapter_number": 0,
      "title": "",
      "outline": "",
      "detailed_outline": ""
    }}
  ]
}}

# 最终提醒
- 只输出上述JSON对象，只包含 "chapters" 数组
- 每个章节必须包含 chapter_number（整数）、title（字符串）、outline（文本）、detailed_outline（文本）
- 用适当的值或空字符串填充所有字段
- JSON前后不要有任何文字
- 不要使用Markdown代码块标记（```json 或 ```）
- 不要添加解释或注释
- 直接以 {{ 开始，以 }} 结束
"""


class AIService:
    """AI服务类，处理与AI模型的交互"""

    def __init__(self):
        """初始化AI服务"""
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
        self.default_model = os.getenv("DEFAULT_AI_MODEL", "gpt-3.5-turbo")

        if not self.api_key:
            logger.warning("OPENAI_API_KEY not set, AI service may not work properly")

        # 初始化OpenAI客户端
        self.client = AsyncOpenAI(
            api_key=self.api_key or "dummy-key",  # 提供一个默认值以避免初始化失败
            base_url=self.base_url,
        )

        # 可用的模型列表
        self.available_models = [
            "gpt-3.5-turbo",
            "gpt-4",
            "gpt-4-turbo-preview",
            "gpt-4o",
            "claude-3-sonnet",
            "claude-3-opus",
        ]

        logger.info(f"AI Service initialized with base_url: {self.base_url}")

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
        model: str = "gpt-3.5-turbo",
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

            # 发送开始消息（包含配置信息）
            start_time = datetime.now(timezone.utc)
            start_msg = json.dumps({
                "type": "start", 
                "message": "开始分析章节内容...",
                "metadata": {
                    "model": model,
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
                f"Starting chapter analysis with model: {model}, "
                f"temperature: {temperature}, max_tokens: {max_tokens}"
            )
            logger.debug(f"System prompt length: {len(system_content)}, User prompt length: {len(user_content)}")

            # 调用OpenAI API进行流式生成
            response = await self.client.chat.completions.create(
                model=model,
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

            # 用于统计
            total_tokens = 0
            completion_tokens = 0
            
            # 流式返回生成的内容
            async for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        chunk_msg = json.dumps({"type": "chunk", "content": delta.content})
                        yield f"data: {chunk_msg}\n\n"
                        completion_tokens += 1  # 粗略估算
                
                # 尝试获取usage信息（部分API会在最后一个chunk返回）
                if hasattr(chunk, 'usage') and chunk.usage:
                    total_tokens = chunk.usage.total_tokens or 0

            # 计算耗时
            end_time = datetime.now(timezone.utc)
            duration = (end_time - start_time).total_seconds()

            # 发送完成消息（包含统计信息）
            done_msg = json.dumps({
                "type": "done", 
                "message": "分析完成",
                "metadata": {
                    "model": model,
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

