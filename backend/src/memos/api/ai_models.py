"""
AI接口的数据模型定义
包含章节分析相关的请求和响应模型
"""

from typing import Any, Dict, Generic, Literal, Optional, TypeVar, List

from pydantic import BaseModel, Field


T = TypeVar("T")


class BaseResponse(BaseModel, Generic[T]):
    """基础响应模型"""

    code: int = Field(200, description="响应状态码")
    message: str = Field(..., description="响应消息")
    data: T | None = Field(None, description="响应数据")


# ─── 章节分析接口模型 ──────────────────────────────────────────────────────────


class AnalysisSettings(BaseModel):
    """AI分析设置"""

    model: Optional[str] = Field(
        default=None,  # 默认None，使用AI服务的默认模型（从环境变量读取）
        description="AI模型名称，如果不指定则使用DEFAULT_AI_MODEL环境变量",
        json_schema_extra={"example": "codedrive-chat"},
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="生成温度（0-2）",
        json_schema_extra={"example": 0.7},
    )
    max_tokens: int = Field(
        default=7000,
        ge=1,
        description="最大token数",
        json_schema_extra={"example": 4000},
    )


class AnalyzeChapterRequest(BaseModel):
    """章节分析请求模型"""

    content: str = Field(
        ...,
        min_length=1,
        description="要分析的章节内容",
        json_schema_extra={"example": "第一章 开始\\n\\n这是一个故事的开始..."},
    )
    prompt: str | None = Field(
        None,
        description="自定义分析提示词（可选，如果不提供则使用默认提示词）",
        json_schema_extra={"example": "请详细分析这个章节的情节发展"},
    )
    settings: AnalysisSettings | None = Field(
        default_factory=AnalysisSettings,
        description="AI分析设置",
    )
    work_id: Optional[int] = Field(
        None,
        description="作品ID（可选，如果提供则在分析完成后将角色信息保存到作品的metainfo中）",
        json_schema_extra={"example": 1},
    )


class ChapterData(BaseModel):
    """章节数据模型"""
    chapter_number: int = Field(..., description="章节号")
    title: str = Field(..., description="章节标题")
    content: str = Field(..., description="章节内容")
    volume_number: int = Field(1, description="卷号")


class CreateWorkFromFileRequest(BaseModel):
    """从文件创建作品请求模型"""
    file_name: str = Field(..., description="文件名")
    chapters: List[ChapterData] = Field(..., description="章节数据列表")


class AnalyzeChapterByFileRequest(BaseModel):
    """基于文件名的章节分析请求模型"""

    file_name: str = Field(
        ...,
        min_length=1,
        description="文件名（用于查找或创建作品）",
        json_schema_extra={"example": "我的小说.txt"},
    )
    content: str = Field(
        ...,
        min_length=1,
        description="要分析的章节内容",
        json_schema_extra={"example": "第一章 开始\\n\\n这是一个故事的开始..."},
    )
    chapter_number: int = Field(
        ...,
        ge=1,
        description="章节号",
        json_schema_extra={"example": 1},
    )
    volume_number: int = Field(
        ...,
        ge=1,
        description="卷号",
        json_schema_extra={"example": 1},
    )
    prompt: str | None = Field(
        None,
        description="自定义分析提示词（可选，如果不提供则使用默认提示词）",
        json_schema_extra={"example": "请详细分析这个章节的情节发展"},
    )
    settings: AnalysisSettings | None = Field(
        default_factory=AnalysisSettings,
        description="AI分析设置",
    )


class SSEMessage(BaseModel):
    """服务器发送事件消息模型"""

    type: Literal["start", "chunk", "done", "error"] = Field(
        ...,
        description="消息类型",
    )
    content: str | None = Field(
        None,
        description="内容片段（仅chunk类型）",
    )
    message: str | None = Field(
        None,
        description="状态消息",
    )


# ─── 健康检查接口模型 ──────────────────────────────────────────────────────────


class HealthCheckData(BaseModel):
    """健康检查数据模型"""

    status: Literal["healthy", "unhealthy"] = Field(
        ...,
        description="服务状态",
        json_schema_extra={"example": "healthy"},
    )
    models: list[str] = Field(
        ...,
        description="可用的AI模型列表",
        json_schema_extra={"example": ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"]},
    )
    timestamp: str = Field(
        ...,
        description="检查时间（ISO 8601格式）",
        json_schema_extra={"example": "2025-12-09T10:00:00Z"},
    )


class HealthCheckResponse(BaseResponse[HealthCheckData]):
    """健康检查响应模型"""


# ─── 默认提示词接口模型 ──────────────────────────────────────────────────────


class DefaultPromptData(BaseModel):
    """默认提示词数据模型"""

    prompt: str = Field(
        ...,
        description="默认的章节分析提示词模板",
    )
    version: str = Field(
        default="1.0",
        description="提示词版本",
        json_schema_extra={"example": "1.0"},
    )


class DefaultPromptResponse(BaseResponse[DefaultPromptData]):
    """默认提示词响应模型"""


# ─── 错误响应模型 ──────────────────────────────────────────────────────────────


class GenerateChapterContentRequest(BaseModel):
    """根据大纲和细纲生成章节内容请求模型"""

    outline: str = Field(
        ...,
        min_length=1,
        description="章节大纲",
        json_schema_extra={"example": "核心功能：介绍主角...\n关键情节点：1. 主角出现 2. 遇到困难..."},
    )
    detailed_outline: str = Field(
        ...,
        min_length=1,
        description="章节细纲",
        json_schema_extra={"example": "1. 开场\n描述主角的日常生活..."},
    )
    chapter_title: str | None = Field(
        None,
        description="章节标题（可选）",
        json_schema_extra={"example": "第一章 初遇"},
    )
    characters: List[str] = Field(
        default_factory=list,
        description="出场人物列表（可选）",
        json_schema_extra={"example": ["张三", "李四"]},
    )
    locations: List[str] = Field(
        default_factory=list,
        description="剧情地点列表（可选）",
        json_schema_extra={"example": ["学校", "图书馆"]},
    )
    settings: AnalysisSettings | None = Field(
        default_factory=AnalysisSettings,
        description="AI生成设置",
    )


class GenerateComponentDataRequest(BaseModel):
    """生成组件数据请求模型"""

    work_id: str = Field(
        ...,
        description="作品ID",
        json_schema_extra={"example": "abc123"},
    )
    component_id: str = Field(
        ...,
        description="组件ID",
        json_schema_extra={"example": "comp_1"},
    )
    data_key: str = Field(
        ...,
        description="组件数据键（用于在component_data中存储）",
        json_schema_extra={"example": "characters"},
    )
    generate_prompt_id: Optional[int] = Field(
        None,
        description="生成prompt模板ID（如果提供则使用模板，否则使用generate_prompt）",
        json_schema_extra={"example": 1},
    )
    generate_prompt: Optional[str] = Field(
        None,
        description="生成prompt内容（如果generate_prompt_id未提供则使用此字段）",
        json_schema_extra={"example": "请生成角色列表"},
    )
    work_template_id: Optional[int] = Field(
        None,
        description="作品模板ID（用于自动查找组件的 generate prompt，优先级高于从 metadata 解析）",
        json_schema_extra={"example": 8},
    )
    component_type: Optional[str] = Field(
        None,
        description="组件类型（如 textarea/text/character-card 等，用于决定AI输出格式）",
        json_schema_extra={"example": "textarea"},
    )
    chapter_id: Optional[int] = Field(
        None,
        description="章节ID（可选，用于获取章节上下文）",
        json_schema_extra={"example": 1},
    )
    component_data: Optional[Dict[str, Any]] = Field(
        None,
        description="前端当前所有组件的值（dataKey → value），用于覆盖数据库中保存的 component_data，让 prompt 使用最新数据",
    )
    settings: AnalysisSettings | None = Field(
        default_factory=AnalysisSettings,
        description="AI生成设置",
    )


class GenerateChapterOutlineRequest(BaseModel):
    """生成章节大纲或细纲请求模型"""

    work_id: str = Field(
        ...,
        description="作品ID",
        json_schema_extra={"example": "abc123"},
    )
    chapter_id: Optional[int] = Field(
        None,
        description="章节ID（可选，章节已存在时传入以获取前文上下文）",
        json_schema_extra={"example": 1},
    )
    chapter_title: str = Field(
        ...,
        description="章节标题",
        json_schema_extra={"example": "第一章 初遇"},
    )
    outline_type: Literal["outline", "detailed_outline"] = Field(
        ...,
        description="大纲类型：outline=大纲，detailed_outline=细纲",
        json_schema_extra={"example": "outline"},
    )
    current_outline: Optional[str] = Field(
        None,
        description="当前大纲内容（生成细纲时用于提供上下文）",
    )
    characters: List[str] = Field(
        default_factory=list,
        description="本章出场人物名称列表",
        json_schema_extra={"example": ["张三", "李四"]},
    )
    locations: List[str] = Field(
        default_factory=list,
        description="本章地点列表",
        json_schema_extra={"example": ["图书馆", "学校"]},
    )
    settings: AnalysisSettings | None = Field(
        default_factory=AnalysisSettings,
        description="AI生成设置",
    )


class ErrorResponse(BaseResponse[None]):
    """错误响应模型"""

    code: int = Field(
        ...,
        description="错误码",
        json_schema_extra={"example": 400},
    )
    message: str = Field(
        ...,
        description="错误信息",
        json_schema_extra={"example": "请求参数错误"},
    )
    data: None = Field(
        None,
        description="错误数据（始终为None）",
    )

