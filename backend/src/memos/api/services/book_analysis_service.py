"""
书籍分析服务
用于逐章生成大纲和细纲
"""

import json
import re
from typing import Dict, Any, List, Optional, AsyncGenerator
from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from memos.api.models.work import Work
from memos.api.models.chapter import Chapter
from memos.api.models.prompt_template import PromptTemplate, render_prompt
from memos.api.models.template import WorkInfoExtended
from memos.api.services.chapter_service import ChapterService
from memos.api.services.sharedb_service import ShareDBService
from memos.api.services.prompt_context_service import PromptContextService, PromptContext
from memos.api.core.database import engine
from memos.log import get_logger

logger = get_logger(__name__)


class BookAnalysisService:
    """书籍分析服务类"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.chapter_service = ChapterService(db)
        self.sharedb_service = ShareDBService()
        self.prompt_context_service = PromptContextService(db)
    
    async def get_default_prompt_template(self, template_type: str = "chapter_analysis") -> Optional[PromptTemplate]:
        """
        获取默认的prompt模板对象
        
        Args:
            template_type: 模板类型，默认为 "chapter_analysis"
        
        Returns:
            PromptTemplate对象，如果不存在则返回None
        """
        try:
            # 先检查表是否存在（使用原始SQL查询，避免SQLAlchemy自动查询所有字段）
            from sqlalchemy import text
            try:
                # 检查表是否存在
                check_table_stmt = text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'prompt_templates'
                    )
                """)
                result = await self.db.execute(check_table_stmt)
                table_exists = result.scalar()
                
                if not table_exists:
                    logger.warning("prompt_templates 表不存在，跳过数据库查询")
                    return None
            except Exception as e:
                logger.warning(f"检查表是否存在时出错: {e}，跳过数据库查询")
                return None
            
            # 尝试从数据库获取模板（使用原始SQL查询，只查询确定存在的字段）
            query_stmt = text("""
                SELECT id, name, description, template_type, prompt_content, version, 
                       is_default, is_active, variables, metadata, usage_count, creator_id,
                       created_at, updated_at
                FROM prompt_templates
                WHERE template_type = :template_type AND is_default = true
                ORDER BY created_at DESC
                LIMIT 1
            """)
            
            result = await self.db.execute(query_stmt, {"template_type": template_type})
            row = result.first()
            
            if row:
                # 手动构建PromptTemplate对象
                template = PromptTemplate()
                template.id = row.id
                template.name = row.name
                template.description = row.description
                template.template_type = row.template_type
                template.prompt_content = row.prompt_content
                template.version = row.version
                template.is_default = row.is_default
                template.is_active = row.is_active
                template.variables = row.variables
                template.template_metadata = row.metadata
                template.usage_count = row.usage_count
                template.creator_id = row.creator_id
                template.created_at = row.created_at
                template.updated_at = row.updated_at
                return template
            
            # 如果数据库中没有，返回None
            logger.warning(f"未找到 {template_type} 类型的默认模板")
            return None
            
        except Exception as e:
            error_str = str(e)
            # 如果是字段不存在的错误或表不存在的错误，记录详细信息但不抛出异常
            if "does not exist" in error_str or "UndefinedColumnError" in error_str or "NoSuchTableError" in error_str:
                logger.warning(f"数据库表不存在或结构不匹配，跳过数据库查询: {error_str}")
                logger.info("建议运行数据库初始化脚本创建表结构")
                return None
            else:
                logger.error(f"获取prompt模板失败: {e}")
                return None
    
    def _get_builtin_chapter_analysis_prompt(self) -> str:
        """获取内置的章节分析prompt模板"""
        return """# 角色
你是一位经验丰富的小说编辑和金牌剧情分析师。你擅长解构故事，洞察每一章节的功能、节奏和情感，并能将其转化为高度结构化的分析报告。

# 任务
我将提供一部小说的章节正文。你的任务是通读并深刻理解这个章节，然后分析并提取以下信息：
1. 章节基本信息（标题、章节号、概要）
2. 章节大纲（核心功能、关键情节点、画面感、氛围、结尾钩子）
3. 章节细纲（详细的小节划分）

# 输出格式要求
**必须严格按照以下JSON格式输出，不要添加任何其他文字：**

```json
{
  "chapter_number": 章节号（数字）,
  "title": "章节标题",
  "summary": "章节概要（2-3句话）",
  "outline": {
    "core_function": "本章核心功能/目的",
    "key_points": ["关键情节点1", "关键情节点2"],
    "visual_scenes": ["画面1", "画面2"],
    "atmosphere": ["氛围1", "氛围2"],
    "hook": "结尾钩子"
  },
  "detailed_outline": {
    "sections": [
      {
        "section_number": 1,
        "title": "小节标题",
        "content": "小节内容概要"
      }
    ]
  }
}
```

# 重要提示
1. **必须输出有效的JSON格式**，不要添加任何Markdown代码块标记外的文字
2. 章节号必须准确提取，统一转换为阿拉伯数字
3. **每一章必须包含outline（大纲）和detailed_outline（细纲）字段**，这是必需字段，不能省略
4. outline字段必须包含：core_function（核心功能）、key_points（关键情节点）、visual_scenes（画面感）、atmosphere（氛围）、hook（结尾钩子）
5. detailed_outline字段必须包含sections数组，每个section包含section_number、title、content

# 章节内容
@chapter.content

# 开始分析
请严格按照上述JSON格式输出分析结果："""
    
    def parse_ai_response(self, ai_response: str) -> Optional[Dict[str, Any]]:
        """
        解析完整的书籍分析AI响应，提取角色、地点和章节数据
        
        Args:
            ai_response: AI返回的响应文本
        
        Returns:
            解析后的分析数据字典，包含characters、locations和chapters，如果解析失败返回None
        """
        try:
            # 尝试提取JSON代码块
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # 尝试提取纯JSON对象
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    logger.warning("无法在AI响应中找到JSON数据")
                    return None
            
            # 解析JSON
            data = json.loads(json_str)
            
            # 确保返回的数据结构包含必需的字段
            result = {
                "characters": data.get("characters", []),
                "locations": data.get("locations", []),
                "chapters": data.get("chapters", [])
            }
            
            # 如果没有chapters字段，但可能有单个章节数据，尝试转换
            if not result["chapters"] and "chapter_number" in data:
                # 单个章节格式，转换为chapters数组
                result["chapters"] = [data]
            
            logger.info(f"解析AI响应成功: {len(result['characters'])} 个角色, {len(result['locations'])} 个地点, {len(result['chapters'])} 个章节")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}")
            return None
        except Exception as e:
            logger.error(f"解析AI响应失败: {e}")
            return None
    
    def parse_single_chapter_response(self, ai_response: str) -> Optional[Dict[str, Any]]:
        """
        解析单个章节的AI响应，提取JSON数据
        支持多种格式：
        1. 章节数据：{ "chapter_number": ..., "title": ..., "outline": ..., "detailed_outline": ... }
        2. 角色数据：{ "characters": [...] }
        3. 直接数组：[...] (如直接返回 characters 数组)
        4. 其他组件数据：{ "dataKey": [...] }
        
        Args:
            ai_response: AI返回的响应文本
        
        Returns:
            解析后的数据字典，如果解析失败返回None
        """
        try:
            # 尝试提取JSON代码块（支持对象和数组）
            json_match = re.search(r'```json\s*(\[.*?\]|\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # 尝试提取纯JSON（支持对象和数组）
                json_match = re.search(r'(\[.*?\]|\{.*\})', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    logger.warning("无法在AI响应中找到JSON数据")
                    return None
            
            # 解析JSON
            data = json.loads(json_str)
            
            # 如果直接是数组（如直接返回 characters 数组），包装成字典
            if isinstance(data, list):
                logger.debug("检测到数组格式，尝试识别数据类型")
                # 检查数组中的元素是否有 name 字段（可能是 characters）
                if data and isinstance(data[0], dict) and "name" in data[0]:
                    logger.debug("数组包含 name 字段，识别为 characters 数据")
                    return {"characters": data}
                else:
                    # 无法识别类型的数组，返回 None 或尝试其他方式
                    logger.warning(f"无法识别数组类型，数组长度: {len(data)}")
                    return None

            # 如果包含 characters 字段，说明是角色数据，直接返回
            if "characters" in data:
                logger.debug("检测到角色数据格式，返回包含 characters 的数据")
                return data

            # 兼容两种章节结构：
            # 1）单章节对象：{ "chapter_number": ..., "title": ..., "outline": ..., "detailed_outline": ... }
            # 2）包装对象：{ "chapters": [ { ...单章节对象... } ] }
            if "chapters" in data and isinstance(data["chapters"], list) and data["chapters"]:
                chapter_data = data["chapters"][0] or {}
                if not isinstance(chapter_data, dict):
                    logger.warning("AI响应中 chapters[0] 不是对象，无法解析为单章节数据")
                    return None
            else:
                chapter_data = data
            
            # 验证必需字段：如果缺少 chapter_number，记录告警但使用默认值 0，而不是直接失败
            if "chapter_number" not in chapter_data:
                logger.warning("AI响应中缺少 chapter_number 字段，将使用 0 作为默认章节号")
                chapter_data["chapter_number"] = 0
            
            return chapter_data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}, 响应内容: {ai_response[:500]}")
            # 尝试修复常见的JSON错误（如末尾多余的逗号）
            try:
                # 重新提取 JSON 字符串
                json_match = re.search(r'(\[.*?\]|\{.*\})', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                    # 尝试移除末尾的逗号
                    fixed_json = re.sub(r',\s*}', '}', json_str)
                    fixed_json = re.sub(r',\s*]', ']', fixed_json)
                    data = json.loads(fixed_json)
                    if isinstance(data, list) and data and isinstance(data[0], dict) and "name" in data[0]:
                        return {"characters": data}
                    return data if isinstance(data, dict) else None
            except Exception as fix_error:
                logger.debug(f"尝试修复JSON失败: {fix_error}")
            return None
        except Exception as e:
            logger.error(f"解析AI响应失败: {e}, 响应内容: {ai_response[:500]}")
            return None
    
    async def get_work_characters_and_locations(self, work_id: int) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        从work的metadata.component_data中获取characters和locations
        
        Args:
            work_id: 作品ID
        
        Returns:
            (characters列表, locations列表)
        """
        try:
            stmt = select(Work).where(Work.id == work_id)
            result = await self.db.execute(stmt)
            work = result.scalar_one_or_none()
            
            if not work:
                logger.warning(f"作品 {work_id} 不存在")
                return [], []
            
            work_metadata = work.work_metadata or {}
            component_data = work_metadata.get("component_data", {})
            characters = component_data.get("characters", [])
            locations = work_metadata.get("locations", [])
            
            # 确保返回的是列表
            if not isinstance(characters, list):
                characters = []
            if not isinstance(locations, list):
                locations = []
            
            logger.info(f"从作品 {work_id} 的metadata中获取到 {len(characters)} 个角色和 {len(locations)} 个地点")
            return characters, locations
            
        except Exception as e:
            logger.error(f"获取作品角色和地点失败: {e}")
            return [], []
    
    async def get_chapter_content(self, chapter_id: int) -> str:
        """
        从ShareDB获取章节内容
        
        Args:
            chapter_id: 章节ID
        
        Returns:
            章节内容文本
        """
        try:
            chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
            if not chapter:
                return ""
            
            # 使用新格式的文档ID
            document_id = f"work_{chapter.work_id}_chapter_{chapter_id}"
            document = await self.sharedb_service.get_document(document_id)
            
            if document:
                content = document.get("content", "")
                if isinstance(content, dict):
                    # 如果是字典，尝试提取文本内容
                    content = content.get("text", "") or json.dumps(content, ensure_ascii=False)
                return content if isinstance(content, str) else str(content)
            
            return ""
            
        except Exception as e:
            logger.error(f"获取章节内容失败: {e}")
            return ""
    
    async def generate_chapter_outline_and_detailed_outline(
        self,
        work_id: int,
        chapter_id: int,
        ai_service,
        prompt: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        为指定章节生成大纲和细纲
        
        Args:
            work_id: 作品ID
            chapter_id: 章节ID
            ai_service: AI服务实例
            prompt: 自定义prompt（可选）
            settings: AI设置（可选）
        
        Returns:
            包含大纲和细纲的字典
        """
        try:
            # 获取章节信息
            chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
            if not chapter:
                raise ValueError(f"章节 {chapter_id} 不存在")
            
            if chapter.work_id != work_id:
                raise ValueError(f"章节 {chapter_id} 不属于作品 {work_id}")
            
            # 获取章节内容
            chapter_content = await self.get_chapter_content(chapter_id)
            if not chapter_content:
                raise ValueError(f"章节 {chapter_id} 内容为空")
            
            # 获取作品的角色和地点信息
            characters, locations = await self.get_work_characters_and_locations(work_id)
            
            # 获取或构建prompt
            if prompt:
                prompt_template = prompt
            else:
                # 尝试从数据库获取模板对象
                template_obj = await self.get_default_prompt_template("chapter_analysis")
                if template_obj:
                    prompt_template = template_obj.prompt_content
                else:
                    # 使用内置模板
                    prompt_template = self._get_builtin_chapter_analysis_prompt()
            
            # 如果有角色和地点信息，可以增强prompt
            if characters or locations:
                context_info = []
                if characters:
                    # 只取前几个角色的关键信息，避免prompt过长
                    chars_summary = []
                    for char in characters[:5]:  # 最多5个角色
                        if isinstance(char, dict):
                            name = char.get("name", char.get("display_name", ""))
                            if name:
                                chars_summary.append(name)
                    if chars_summary:
                        context_info.append(f"主要角色：{', '.join(chars_summary)}")
                
                if locations:
                    # 只取前几个地点的关键信息
                    locs_summary = []
                    for loc in locations[:5]:  # 最多5个地点
                        if isinstance(loc, dict):
                            name = loc.get("name", loc.get("display_name", ""))
                            if name:
                                locs_summary.append(name)
                    if locs_summary:
                        context_info.append(f"主要地点：{', '.join(locs_summary)}")
                
                if context_info:
                    # 统一由 render_prompt 按占位符加载上下文并生成 prompt
                    base_prompt = await render_prompt(
                        prompt_template,
                        self.db,
                        self.sharedb_service,
                        work_id=str(work_id),
                        chapter_id=chapter_id,
                    )
                    enhanced_prompt = f"""{base_prompt}

# 上下文信息
{chr(10).join(context_info)}

# 开始分析
请严格按照上述JSON格式输出分析结果："""
                else:
                    enhanced_prompt = await render_prompt(
                        prompt_template,
                        self.db,
                        self.sharedb_service,
                        work_id=str(work_id),
                        chapter_id=chapter_id,
                    )
            else:
                enhanced_prompt = await render_prompt(
                    prompt_template,
                    self.db,
                    self.sharedb_service,
                    work_id=str(work_id),
                    chapter_id=chapter_id,
                )
            
            # 调用AI服务进行分析
            settings = settings or {}
            # 如果没有指定模型，使用AI服务的默认模型（从环境变量读取）
            model = settings.get("model")  # 如果为None，AI服务会使用默认模型
            temperature = settings.get("temperature", 0.7)
            max_tokens = settings.get("max_tokens", 4000)
            
            # 直接获取完整AI响应
            full_response = await ai_service.analyze_chapter_stream(
                content=chapter_content,
                prompt=enhanced_prompt,
                system_prompt=None,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens
            )
            
            # 解析AI响应
            parsed_data = self.parse_single_chapter_response(full_response)
            if not parsed_data:
                raise ValueError("无法解析AI响应，可能返回的不是有效的JSON格式")
            
            # 更新章节的metadata
            chapter_metadata = chapter.chapter_metadata or {}
            chapter_metadata["outline"] = parsed_data.get("outline", {})
            chapter_metadata["detailed_outline"] = parsed_data.get("detailed_outline", {})
            
            # 如果AI返回了summary，也更新章节的summary字段
            if parsed_data.get("summary"):
                await self.chapter_service.update_chapter(
                    chapter_id,
                    chapter_metadata=chapter_metadata,
                    summary=parsed_data.get("summary")
                )
            else:
                await self.chapter_service.update_chapter(
                    chapter_id,
                    chapter_metadata=chapter_metadata
                )
            
            logger.info(f"成功为章节 {chapter_id} 生成大纲和细纲")
            
            return {
                "chapter_id": chapter_id,
                "chapter_number": chapter.chapter_number,
                "title": parsed_data.get("title", chapter.title),
                "summary": parsed_data.get("summary", chapter.summary),
                "outline": parsed_data.get("outline", {}),
                "detailed_outline": parsed_data.get("detailed_outline", {}),
            }
            
        except Exception as e:
            logger.error(f"生成章节大纲和细纲失败: {e}")
            raise
    
    async def generate_outlines_for_all_chapters(
        self,
        work_id: int,
        ai_service,
        prompt: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None,
        chapter_ids: Optional[List[int]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        为作品的所有章节（或指定章节）逐章生成大纲和细纲
        
        Args:
            work_id: 作品ID
            ai_service: AI服务实例
            prompt: 自定义prompt（可选）
            settings: AI设置（可选）
            chapter_ids: 指定要处理的章节ID列表（可选，如果不提供则处理所有章节）
        
        Yields:
            每个章节的处理结果
        """
        try:
            # 获取要处理的章节列表
            if chapter_ids:
                chapters = []
                for chapter_id in chapter_ids:
                    chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
                    if chapter and chapter.work_id == work_id:
                        chapters.append(chapter)
            else:
                # 获取所有章节
                chapters, _ = await self.chapter_service.get_chapters(
                    filters={"work_id": work_id},
                    page=1,
                    size=1000,  # 假设最多1000章
                    sort_by="chapter_number",
                    sort_order="asc"
                )

            total_chapters = len(chapters)
            logger.info(f"开始为作品 {work_id} 的 {total_chapters} 个章节生成大纲和细纲")
            
            for index, chapter in enumerate(chapters, 1):
                try:
                    logger.info(f"处理第 {index}/{total_chapters} 章: {chapter.title} (ID: {chapter.id})")
                    
                    result = await self.generate_chapter_outline_and_detailed_outline(
                        work_id=work_id,
                        chapter_id=chapter.id,
                        ai_service=ai_service,
                        prompt=prompt,
                        settings=settings
                    )
                    
                    result["index"] = index
                    result["total"] = total_chapters
                    yield result
                    
                except Exception as e:
                    logger.error(f"处理章节 {chapter.id} 失败: {e}")
                    yield {
                        "chapter_id": chapter.id,
                        "chapter_number": chapter.chapter_number,
                        "error": str(e),
                        "index": index,
                        "total": total_chapters,
                    }
            
        except Exception as e:
            logger.error(f"批量生成章节大纲和细纲失败: {e}")
            raise

    def _format_outlines_for_prompt(self, outlines: List[Any]) -> str:
        """将大纲列表格式化为 prompt 可读文本。outline 可能是 dict（结构化）或 str（一段话）。"""
        if not outlines:
            return "无"
        lines = []
        for idx, outline in enumerate(outlines, 1):
            if outline is None or outline == "":
                continue
            lines.append(f"## 第{idx}章大纲")
            if isinstance(outline, str):
                lines.append(outline.strip())
            elif isinstance(outline, dict):
                if outline.get("core_function"):
                    lines.append(f"核心功能: {outline.get('core_function')}")
                if outline.get("key_points"):
                    lines.append(f"关键情节点: {', '.join(outline.get('key_points', []))}")
                if outline.get("visual_scenes"):
                    lines.append(f"画面感: {', '.join(outline.get('visual_scenes', []))}")
                if outline.get("atmosphere"):
                    lines.append(f"氛围: {', '.join(outline.get('atmosphere', []))}")
                if outline.get("hook"):
                    lines.append(f"结尾钩子: {outline.get('hook')}")
            lines.append("")
        return "\n".join(lines)

    def _format_detailed_outlines_for_prompt(self, detailed_outlines: List[Any]) -> str:
        """将细纲列表格式化为 prompt 可读文本。detailed_outline 可能是 dict（含 sections）或 str（一段话）。"""
        if not detailed_outlines:
            return "无"
        lines = []
        for idx, detailed_outline in enumerate(detailed_outlines, 1):
            if detailed_outline is None or detailed_outline == "":
                continue
            lines.append(f"## 第{idx}章细纲")
            if isinstance(detailed_outline, str):
                lines.append(detailed_outline.strip())
            elif isinstance(detailed_outline, dict):
                sections = detailed_outline.get("sections", [])
                for section in sections:
                    if isinstance(section, dict):
                        sn = section.get("section_number", "")
                        title = section.get("title", "")
                        content = section.get("content", "")
                        lines.append(f"  {sn}. {title}: {content}")
                    else:
                        lines.append(f"  {section}")
            lines.append("")
        return "\n".join(lines)

    def _get_builtin_continue_chapter_prompt(self) -> str:
        """续写章节：内置 prompt 模板，使用 @ 变量由 format_prompt 格式化。"""
        return """# 角色
你是一位经验丰富的小说编辑和剧情策划，擅长在已有情节基础上延续并设计新章节。

# 任务
根据以下材料，为**下一章**设计 3 个不同风格的推荐方案，每个方案包含：章节标题、大纲（outline）、细纲（detailed_outline）。要求与**下一章的前三章**的风格和设定一致，并与**下一章的前一章**结尾自然衔接。（例如下一章为第10章时，前三章指第7、8、9章，前一章指第9章。）

# 输入材料

## 下一章的前三章大纲
@pre_chapter[3].metadata.outline

## 下一章的前三章细纲（@pre_chapter[3]）
@pre_chapter[3].metadata.detailed_outline

## 下一章的前一章正文（即 @pre_chapter[1]）
@previous_chapter_content

# 输出格式
**必须严格按照以下 JSON 格式输出，不要添加任何其他文字：**

```json
{
  "recommendations": [
    {
      "title": "推荐方案一标题",
      "outline": {
        "core_function": "本章核心功能/目的",
        "key_points": ["关键情节点1", "关键情节点2"],
        "visual_scenes": ["画面1", "画面2"],
        "atmosphere": ["氛围1", "氛围2"],
        "hook": "结尾钩子"
      },
      "detailed_outline": {
        "sections": [
          { "section_number": 1, "title": "小节标题", "content": "小节内容概要" }
        ]
      }
    },
    {
      "title": "推荐方案二标题",
      "outline": { ... },
      "detailed_outline": { ... }
    },
    {
      "title": "推荐方案三标题",
      "outline": { ... },
      "detailed_outline": { ... }
    }
  ]
}
```

# 重要提示
1. 必须输出有效的 JSON，且仅包含上述结构。
2. recommendations 数组长度必须为 3。
3. 每个 outline 需包含 core_function、key_points、visual_scenes、atmosphere、hook。
4. 每个 detailed_outline 需包含 sections 数组，每项含 section_number、title、content。

请直接输出 JSON："""

    async def generate_continue_chapter_outlines(
        self,
        work_id: str,
        ai_service,
        previous_chapter_id: Optional[int] = None,
        user_description: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        续写章节：根据「当前（下一章）的前 3 章」的大纲和细纲、以及前一章的章节内容，生成下一章的 3 个推荐大纲和细纲。
        例如续写第 10 章时，前 3 章指第 7、8、9 章。可选传入用户对下一章的语言描述，会加入 prompt 供模型参考。

        Args:
            work_id: 作品ID
            ai_service: AI 服务实例
            previous_chapter_id: 前一章章节 ID（即要续写的「下一章」的上一章）。不传则使用作品最后一章。
            user_description: 用户对下一章的大致描述（如「主角发现了一个秘密」），会追加到 prompt 中。
            settings: AI 设置（可选）

        Returns:
            包含 recommendations 列表的字典，每项为 {"title", "outline", "detailed_outline"}
        """
        settings = settings or {}
        model = settings.get("model")
        temperature = settings.get("temperature", 0.7)
        max_tokens = settings.get("max_tokens", 8000)

        # 统一由 render_prompt 按占位符需求加载上下文并生成完整 prompt
        template_obj = await self.get_default_prompt_template("continue_chapter")
        prompt_content = template_obj.prompt_content if template_obj else self._get_builtin_continue_chapter_prompt()

        user_prompt, ctx = await render_prompt(
            prompt_content,
            self.db,
            self.sharedb_service,
            work_id=str(work_id),
            previous_chapter_id=previous_chapter_id,
            content_max_len=12000,
            return_ctx=True,
        )

        # 若有用户对下一章的语言描述，追加到 prompt 中
        if user_description and user_description.strip():
            user_prompt = user_prompt.rstrip() + "\n\n## 用户对下一章的描述（请在设计方案时参考以下方向）\n" + user_description.strip() + "\n"

        full_response = await ai_service.analyze_chapter_stream(
            content=ctx.get("previous_chapter_content") or "",
            prompt=user_prompt,
            system_prompt=None,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # 5) 解析 AI 返回的 3 个推荐（支持 ```json ... ``` 或裸 JSON）
        json_str = ""
        code_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", full_response)
        if code_block:
            json_str = code_block.group(1).strip()
        if not json_str:
            # 尝试匹配最外层 { ... }
            brace = full_response.find("{")
            if brace >= 0:
                depth = 0
                end = -1
                for i in range(brace, len(full_response)):
                    if full_response[i] == "{":
                        depth += 1
                    elif full_response[i] == "}":
                        depth -= 1
                        if depth == 0:
                            end = i
                            break
                if end >= 0:
                    json_str = full_response[brace : end + 1]

        if not json_str:
            raise ValueError("无法从 AI 响应中解析出 JSON")

        data = json.loads(json_str)
        recommendations = data.get("recommendations", [])
        if not isinstance(recommendations, list):
            recommendations = []
        # 只取前 3 个，并保证结构
        result_list = []
        for i, rec in enumerate(recommendations[:3]):
            if not isinstance(rec, dict):
                continue
            result_list.append({
                "title": rec.get("title", f"推荐方案{i + 1}"),
                "outline": rec.get("outline", {}),
                "detailed_outline": rec.get("detailed_outline", {}),
            })
        while len(result_list) < 3:
            result_list.append({
                "title": f"推荐方案{len(result_list) + 1}",
                "outline": {},
                "detailed_outline": {},
            })

        return {
            "next_chapter_number": ctx.get("next_chapter_number"),
            "recommendations": result_list,
            "raw_response": full_response,
        }

    async def incremental_insert_to_work(
        self,
        work_id: int,
        analysis_data: Dict[str, List[Any]],
        user_id: int,
        chapter_index: Optional[int] = None,
        build_text_summary: bool = False,
    ) -> Dict[str, Any]:
        """
        将分析数据增量插入到作品的 metadata.component_data 中，支持去重和合并。
        
        Args:
            work_id: 作品ID
            analysis_data: 分析数据字典，格式为 {data_key: [list of items]}
            user_id: 用户ID
            chapter_index: 章节索引（可选）
            build_text_summary: 是否生成文本摘要
        
        Returns:
            包含统计信息的字典，如果 build_text_summary=True 则包含 summary_text
        """
        from memos.api.services.work_service import WorkService
        from sqlalchemy.orm.attributes import flag_modified
        
        work_service = WorkService(self.db)
        work = await work_service.get_work_by_id(work_id)
        if not work:
            raise ValueError(f"作品 {work_id} 不存在")
        
        # 获取模板ID，用于确定允许的 data_key
        template_id = None
        work_metadata = work.work_metadata or {}
        template_config = work_metadata.get("template_config")
        if template_config and isinstance(template_config, dict):
            template_id_str = template_config.get("templateId")
            if template_id_str:
                if isinstance(template_id_str, str) and template_id_str.startswith("db-"):
                    try:
                        template_id = int(template_id_str.replace("db-", ""))
                    except ValueError:
                        pass
                elif isinstance(template_id_str, (int, str)):
                    try:
                        template_id = int(template_id_str)
                    except (ValueError, TypeError):
                        pass
        
        # 查询允许的 data_key（从 PromptTemplate 中获取）
        allowed_data_keys = set()
        if template_id:
            try:
                prompt_stmt = select(PromptTemplate).where(
                    and_(
                        PromptTemplate.work_template_id == template_id,
                        PromptTemplate.prompt_category == "analysis",
                        PromptTemplate.is_active.is_(True),
                    )
                )
                prompt_result = await self.db.execute(prompt_stmt)
                prompt_templates = prompt_result.scalars().all()
                for pt in prompt_templates:
                    if pt.data_key:
                        allowed_data_keys.add(pt.data_key)
            except Exception as e:
                logger.warning(f"查询 PromptTemplate 失败: {e}")
        
        # 如果没有找到模板，允许所有 data_key（向后兼容）
        if not allowed_data_keys:
            allowed_data_keys = set(analysis_data.keys())
            logger.warning(f"未找到模板限制，允许所有 data_key: {allowed_data_keys}")
        
        # 获取或初始化 component_data
        if "component_data" not in work_metadata:
            work_metadata["component_data"] = {}
        component_data = work_metadata["component_data"]
        if not isinstance(component_data, dict):
            component_data = {}
            work_metadata["component_data"] = component_data
        
        # 处理统计信息
        processed_stats: Dict[str, Dict[str, int]] = {}
        
        # 处理每个 data_key
        for data_key, data_list in analysis_data.items():
            if data_key not in allowed_data_keys:
                logger.warning(f"跳过不允许的 data_key: {data_key}（允许的: {allowed_data_keys}）")
                continue
            
            if not isinstance(data_list, list):
                logger.warning(f"跳过无效的 data_key {data_key}（不是列表）")
                continue
            
            # 初始化统计
            processed_count = 0
            updated_count = 0
            
            # 获取现有的数据
            existing_list = component_data.get(data_key, [])
            if not isinstance(existing_list, list):
                existing_list = []
            
            # 构建现有数据的映射（基于标识符）
            existing_map = {}
            identifier_key = None
            if existing_list and isinstance(existing_list[0], dict):
                for key in ["name", "id", "title", "identifier", "key"]:
                    if key in existing_list[0]:
                        identifier_key = key
                        break
            
            if identifier_key:
                for item in existing_list:
                    if isinstance(item, dict) and identifier_key in item:
                        existing_map[item[identifier_key]] = item
            
            # 处理新数据
            for item in data_list:
                if not isinstance(item, dict):
                    continue
                
                # 尝试找到标识符
                item_id = None
                if identifier_key and identifier_key in item:
                    item_id = item[identifier_key]
                
                if item_id and item_id in existing_map:
                    # 更新现有数据
                    existing_item = existing_map[item_id]
                    # 深度合并
                    for key, value in item.items():
                        if key in existing_item and isinstance(existing_item[key], dict) and isinstance(value, dict):
                            existing_item[key].update(value)
                        else:
                            existing_item[key] = value
                    updated_count += 1
                else:
                    # 添加新数据
                    if item_id:
                        existing_map[item_id] = item
                    existing_list.append(item)
                    processed_count += 1
            
            # 更新 component_data
            component_data[data_key] = existing_list
            processed_stats[data_key] = {
                "processed": processed_count,
                "updated": updated_count,
                "total": len(existing_list),
            }
        
        # 更新 work_metadata
        work.work_metadata = work_metadata
        flag_modified(work, "work_metadata")
        await self.db.commit()
        
        # 构建返回结果
        result: Dict[str, Any] = {}
        for data_key, stats in processed_stats.items():
            result[f"{data_key}_processed"] = stats["processed"]
            result[f"{data_key}_updated"] = stats["updated"]
            result[f"{data_key}_total"] = stats["total"]
        
        # 生成文本摘要
        if build_text_summary:
            summary_parts = []
            for data_key, stats in processed_stats.items():
                if stats["processed"] > 0 or stats["updated"] > 0:
                    summary_parts.append(
                        f"{data_key}：新增 {stats['processed']}，更新 {stats['updated']}，总计 {stats['total']}"
                    )
            if summary_parts:
                result["summary_text"] = "\n".join(summary_parts)
            else:
                result["summary_text"] = "未写入组件数据。"
        
        return result
    
    async def component_data_insert_to_work(
        self,
        work_id: int,
        chapter_id: int,
        ai_service,
        current_user_id: int,
        analysis_settings: Optional[Dict[str, Any]] = None,
        build_text_summary: bool = False,
    ) -> Dict[str, Any]:
        """
        基于 PromptTemplate（category='analysis'）对单章进行组件信息分析，写入章节与作品 metadata，并返回统计与 summary_text。
        """
        analysis_settings = analysis_settings or {}
        chapter_component_data: Dict[str, List[Any]] = {}
        all_stats: Dict[str, Dict[str, int]] = {}

        # 获取章节与内容
        chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
        if not chapter or chapter.work_id != work_id:
            raise ValueError(f"章节 {chapter_id} 不存在或不属于作品 {work_id}")

        chapter_content = await self.get_chapter_content(chapter_id)
        if not chapter_content:
            logger.warning(f"章节 {chapter_id} 内容为空，跳过组件数据提取")
            return {"summary_text": "章节内容为空，未写入任何组件数据。"}

        # 获取模板ID（从 work_metadata.template_config.templateId 中获取）
        template_id = None
        try:
            from memos.api.services.work_service import WorkService
            work_service = WorkService(self.db)
            work = await work_service.get_work_by_id(work_id)
            if work:
                work_metadata = work.work_metadata or {}
                template_config = work_metadata.get("template_config")
                if template_config and isinstance(template_config, dict):
                    template_id_str = template_config.get("templateId")
                    if template_id_str:
                        # templateId 可能是 "db-1" 格式，需要提取数字
                        if isinstance(template_id_str, str) and template_id_str.startswith("db-"):
                            try:
                                template_id = int(template_id_str.replace("db-", ""))
                                logger.info(f"✅ 从 work_metadata.template_config.templateId 中获取到 template_id: {template_id_str} -> {template_id}")
                            except ValueError:
                                logger.warning(f"无法解析 templateId: {template_id_str}")
                        elif isinstance(template_id_str, (int, str)):
                            try:
                                template_id = int(template_id_str)
                                logger.info(f"✅ 从 work_metadata.template_config.templateId 中获取到 template_id: {template_id}")
                            except (ValueError, TypeError):
                                logger.warning(f"无法解析 templateId: {template_id_str}")
        except Exception as e:
            logger.error(f"获取 template_id 失败: {e}")

        if not template_id:
            logger.warning(f"作品 {work_id} 没有关联的 template_id，跳过组件数据提取")
            return {"summary_text": "未关联模板，未写入组件数据。"}

        # 查询 PromptTemplate
        try:
            prompt_stmt = select(PromptTemplate).where(
                and_(
                    PromptTemplate.work_template_id == template_id,
                    PromptTemplate.prompt_category == "analysis",
                    PromptTemplate.is_active.is_(True),
                )
            )
            prompt_result = await self.db.execute(prompt_stmt)
            prompt_templates = prompt_result.scalars().all()
        except Exception as e:
            logger.error(f"查询 PromptTemplate 失败: {e}")
            prompt_templates = []

        if not prompt_templates:
            logger.warning(f"作品 {work_id} 的模板（template_id: {template_id}）未找到 analysis prompt，跳过组件数据提取")
            return {"summary_text": "未找到分析模板，未写入组件数据。"}

        # 准备 work metadata / component_data
        work = await self.chapter_service.get_chapter_by_id(chapter_id)
        work_obj_stmt = select(Work).where(Work.id == work_id)
        work_obj_res = await self.db.execute(work_obj_stmt)
        work_obj = work_obj_res.scalar_one_or_none()
        if not work_obj:
            raise ValueError(f"作品 {work_id} 不存在")
        work_metadata = work_obj.work_metadata or {}
        component_data = work_metadata.get("component_data", {})

        # 遍历 prompt_templates
        for prompt_template in prompt_templates:
            data_key = prompt_template.data_key
            analysis_prompt = prompt_template.prompt_content
            if not data_key or not analysis_prompt:
                continue

            existing_data = component_data.get(data_key, [])
            existing_data_context = ""
            if existing_data and isinstance(existing_data, list):
                example_data = existing_data[:3]
                existing_data_context = (
                    "# 现有作品数据结构参考\n"
                    f"以下是该作品已有的 {data_key} 数据结构示例（请参考此结构生成新数据）：\n\n"
                    f"```json\n{json.dumps(example_data, ensure_ascii=False, indent=2)}\n```\n"
                    "**重要提示：**\n"
                    "1. 新提取的数据应与上述结构一致\n"
                    "2. 若匹配到已存在数据（如 name/id/title），保持结构，仅补充/更新\n"
                    "3. 若有新数据，按照示例结构生成完整信息\n"
                )

            # 统一由 render_prompt 按占位符加载上下文并生成 prompt
            user_prompt = await render_prompt(
                analysis_prompt,
                self.db,
                self.sharedb_service,
                work_id=str(work_id),
                chapter_id=chapter_id,
            )
            if existing_data_context:
                user_prompt = existing_data_context + "\n\n" + user_prompt

            system_prompt = f"你是一位专业的小说分析专家，请从章节内容中提取 {data_key} 相关的数据，返回 JSON。"

            # 调用 AI
            ai_response = await ai_service.analyze_chapter_stream(
                content=chapter_content,
                prompt=user_prompt,
                system_prompt=system_prompt,
                model=analysis_settings.get("model"),
                temperature=analysis_settings.get("temperature", 0.7),
                max_tokens=analysis_settings.get("max_tokens", 4000),
            )

            parsed_data = self.parse_single_chapter_response(ai_response)
            if not parsed_data or data_key not in parsed_data or not isinstance(parsed_data[data_key], list):
                logger.warning(f"章节 {chapter_id} 未提取到 {data_key} 数据")
                continue

            data_list = parsed_data[data_key]
            chapter_component_data.setdefault(data_key, []).extend(data_list)

            # 写入作品 metadata（合并去重）
            save_result = await self.incremental_insert_to_work(
                work_id=work_id,
                analysis_data={data_key: data_list},
                user_id=current_user_id,
                chapter_index=None,
                build_text_summary=False,
            )
            all_stats[data_key] = {
                "processed": save_result.get(f"{data_key}_processed", 0),
                "updated": save_result.get(f"{data_key}_updated", 0),
                "total": save_result.get(f"{data_key}_total", 0),
            }

        # 写回章节 metadata.component_data
        if chapter_component_data:
            chapter_metadata = chapter.chapter_metadata or {}
            if "component_data" not in chapter_metadata:
                chapter_metadata["component_data"] = {}
            for data_key, data_list in chapter_component_data.items():
                existing = chapter_metadata["component_data"].get(data_key, [])
                if not isinstance(existing, list):
                    existing = []
                existing_set = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in existing if isinstance(item, dict)}
                for item in data_list:
                    if isinstance(item, dict):
                        item_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
                        if item_str not in existing_set:
                            existing_set.add(item_str)
                            existing.append(item)
                chapter_metadata["component_data"][data_key] = existing
            chapter.chapter_metadata = chapter_metadata
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(chapter, "chapter_metadata")
            await self.db.commit()

        # 构建返回
        summary_lines = []
        for key, stats in all_stats.items():
            summary_lines.append(f"{key}：新增 {stats['processed']}，更新 {stats['updated']}，总 {stats['total']}")
        summary_text = "\n".join(summary_lines) if summary_lines else "未写入组件数据。"

        return {
            "chapter_id": chapter_id,
            "stats": all_stats,
            "summary_text": summary_text,
        }

    async def verify_chapter_info(
        self,
        work_id: int,
        chapter_id: int,
        ai_service,
        current_user_id: int,
        analysis_settings: Optional[Dict[str, Any]] = None,
        build_text_summary: bool = False,
    ) -> Dict[str, Any]:
        """
        基于 PromptTemplate（category='verification'）对单章进行信息校验，返回问题和建议。
        
        Args:
            work_id: 作品ID
            chapter_id: 章节ID
            ai_service: AI服务实例
            current_user_id: 当前用户ID
            analysis_settings: AI分析设置（可选）
            build_text_summary: 是否生成文本摘要
        
        Returns:
            包含校验结果、问题和建议的字典，如果 build_text_summary=True 则包含 summary_text
        """
        analysis_settings = analysis_settings or {}
        all_verification_results: List[Dict[str, Any]] = []

        # 获取章节与内容
        chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
        if not chapter or chapter.work_id != work_id:
            raise ValueError(f"章节 {chapter_id} 不存在或不属于作品 {work_id}")

        chapter_content = await self.get_chapter_content(chapter_id)
        if not chapter_content:
            logger.warning(f"章节 {chapter_id} 内容为空，跳过信息校验")
            return {"summary_text": "章节内容为空，无法进行信息校验。"}

        # 获取模板ID（从 work_metadata.template_config.templateId 中获取）
        template_id = None
        try:
            from memos.api.services.work_service import WorkService
            work_service = WorkService(self.db)
            work = await work_service.get_work_by_id(work_id)
            if work:
                work_metadata = work.work_metadata or {}
                template_config = work_metadata.get("template_config")
                if template_config and isinstance(template_config, dict):
                    template_id_str = template_config.get("templateId")
                    if template_id_str:
                        # templateId 可能是 "db-1" 格式，需要提取数字
                        if isinstance(template_id_str, str) and template_id_str.startswith("db-"):
                            try:
                                template_id = int(template_id_str.replace("db-", ""))
                                logger.info(f"✅ 从 work_metadata.template_config.templateId 中获取到 template_id: {template_id_str} -> {template_id}")
                            except ValueError:
                                logger.warning(f"无法解析 templateId: {template_id_str}")
                        elif isinstance(template_id_str, (int, str)):
                            try:
                                template_id = int(template_id_str)
                                logger.info(f"✅ 从 work_metadata.template_config.templateId 中获取到 template_id: {template_id}")
                            except (ValueError, TypeError):
                                logger.warning(f"无法解析 templateId: {template_id_str}")
        except Exception as e:
            logger.error(f"获取 template_id 失败: {e}")

        if not template_id:
            logger.warning(f"作品 {work_id} 没有关联的 template_id，跳过信息校验")
            return {"summary_text": "未关联模板，无法进行信息校验。"}

        # 查询 PromptTemplate（使用 verification 类别）
        try:
            prompt_stmt = select(PromptTemplate).where(
                and_(
                    PromptTemplate.work_template_id == template_id,
                    PromptTemplate.prompt_category == "validate",
                    PromptTemplate.is_active.is_(True),
                )
            )
            prompt_result = await self.db.execute(prompt_stmt)
            prompt_templates = prompt_result.scalars().all()
        except Exception as e:
            logger.error(f"查询 validate PromptTemplate 失败: {e}")
            prompt_templates = []

        if not prompt_templates:
            logger.warning(f"作品 {work_id} 的模板（template_id: {template_id}）未找到 validate prompt，跳过信息校验")
            return {"summary_text": "未找到校验模板，无法进行信息校验。"}

        # 获取作品 metadata / component_data（用于上下文）
        work_obj_stmt = select(Work).where(Work.id == work_id)
        work_obj_res = await self.db.execute(work_obj_stmt)
        work_obj = work_obj_res.scalar_one_or_none()
        if not work_obj:
            raise ValueError(f"作品 {work_id} 不存在")
        work_metadata = work_obj.work_metadata or {}
        component_data = work_metadata.get("component_data", {})

        # 构建所有组件数据的上下文（用于所有验证 prompt）
        all_component_data_context = ""
        if component_data:
            component_data_summary = {}
            for key, value_list in component_data.items():
                if isinstance(value_list, list) and len(value_list) > 0:
                    # 只取前10个作为参考，避免 prompt 过长
                    component_data_summary[key] = value_list[:10]
            
            if component_data_summary:
                all_component_data_context = (
                    "# 作品中的所有组件数据参考\n"
                    "以下是该作品已有的所有组件数据（用于校验参考）：\n\n"
                    f"```json\n{json.dumps(component_data_summary, ensure_ascii=False, indent=2)}\n```\n\n"
                    "**重要提示：**\n"
                    "1. 请参考上述所有组件数据来校验章节内容\n"
                    "2. 检查章节内容是否与已有组件数据一致\n"
                    "3. 识别可能的不一致、矛盾或遗漏\n\n"
                )

        # 遍历 prompt_templates，逐个进行验证
        for prompt_template in prompt_templates:
            data_key = prompt_template.data_key
            verification_prompt = prompt_template.prompt_content
            if not verification_prompt:
                continue

            # 获取当前 data_key 的详细数据（如果有）
            current_data_key_context = ""
            if data_key and data_key in component_data:
                existing_data = component_data.get(data_key, [])
                if existing_data and isinstance(existing_data, list):
                    # 当前组件的所有数据（不限制数量，因为这是针对该组件的验证）
                    current_data_key_context = (
                        f"# 当前验证组件：{data_key}\n"
                        f"以下是该作品已有的 {data_key} 完整数据（用于详细校验）：\n\n"
                        f"```json\n{json.dumps(existing_data, ensure_ascii=False, indent=2)}\n```\n\n"
                    )

            # 统一由 render_prompt 按占位符加载上下文并生成 prompt
            user_prompt = await render_prompt(
                verification_prompt,
                self.db,
                self.sharedb_service,
                work_id=str(work_id),
                chapter_id=chapter_id,
            )

            # 拼装完整的 prompt：所有组件数据 + 当前组件详细数据 + 验证 prompt
            full_prompt_parts = []
            if all_component_data_context:
                full_prompt_parts.append(all_component_data_context)
            if current_data_key_context:
                full_prompt_parts.append(current_data_key_context)
            full_prompt_parts.append(user_prompt)
            user_prompt = "\n".join(full_prompt_parts)

            system_prompt = "你是一位专业的小说内容校验专家，请仔细检查章节内容，识别问题并提供改进建议。"

            # 调用 AI
            try:
                ai_response = await ai_service.analyze_chapter_stream(
                    content=chapter_content,
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    model=analysis_settings.get("model"),
                    temperature=analysis_settings.get("temperature", 0.7),
                    max_tokens=analysis_settings.get("max_tokens", 4000),
                    use_json_format=False,  # 验证功能不需要 JSON 格式，使用文本输出
                )

                # 直接使用 AI 的原始文本响应
                verification_result = {
                    "data_key": data_key or "general",
                    "prompt_name": prompt_template.name or "未命名",
                    "result": ai_response,
                }
                all_verification_results.append(verification_result)
            except Exception as e:
                logger.error(f"校验章节 {chapter_id} 时出错（prompt: {prompt_template.name}）: {e}", exc_info=True)
                verification_result = {
                    "data_key": data_key or "general",
                    "prompt_name": prompt_template.name or "未命名",
                    "error": str(e),
                }
                all_verification_results.append(verification_result)

        # 如果有多个验证结果，让 AI 进行总结
        ai_summary = None
        if len(all_verification_results) > 0:
            try:
                # 构建所有验证结果的汇总文本
                verification_summary_text = "以下是各个组件的验证结果：\n\n"
                for idx, vr in enumerate(all_verification_results, 1):
                    prompt_name = vr.get("prompt_name", "未命名")
                    data_key = vr.get("data_key", "general")
                    
                    if "error" in vr:
                        verification_summary_text += f"## {idx}. 【{prompt_name}】({data_key})\n"
                        verification_summary_text += f"校验失败: {vr['error']}\n\n"
                    else:
                        result_data = vr.get("result", "")
                        verification_summary_text += f"## {idx}. 【{prompt_name}】({data_key})\n"
                        verification_summary_text += f"{result_data}\n\n"
                
                # 构建总结 prompt
                summary_prompt = f"""你是一位专业的小说内容校验总结专家。请对以下各个组件的验证结果进行综合分析，生成一份清晰的总结报告。

                        # 章节信息
                        - 章节ID: {chapter_id}
                        - 章节标题: {chapter.title or '未命名'}
                        - 章节号: {chapter.chapter_number or '未知'}

                        # 各组件验证结果

                        {verification_summary_text}

                        # 任务要求
                        请对以上所有组件的验证结果进行综合分析，生成一份总结报告，包括：
                        1. **总体评估**：章节内容的整体质量评估
                        2. **主要问题**：汇总所有组件发现的关键问题，按优先级排序
                        3. **改进建议**：提供综合性的改进建议，优先处理最重要的问题
                        4. **一致性检查**：检查各组件验证结果之间是否存在矛盾或不一致
                        5. **优先级排序**：将问题和建议按重要性和紧急程度排序

                        请以清晰、结构化的格式输出总结报告。"""

                # 调用 AI 进行总结
                ai_summary_response = await ai_service.analyze_chapter_stream(
                    content=chapter_content,
                    prompt=summary_prompt,
                    system_prompt="你是一位专业的小说内容校验总结专家，擅长综合分析多个验证结果并生成清晰的总结报告。",
                    model=analysis_settings.get("model"),
                    temperature=analysis_settings.get("temperature", 0.7),
                    max_tokens=analysis_settings.get("max_tokens", 4000),
                    use_json_format=False,  # 总结功能不需要 JSON 格式，使用文本输出
                )
                
                # 直接使用 AI 的原始文本响应
                ai_summary = ai_summary_response
                    
                logger.info(f"✅ 章节 {chapter_id} 验证结果 AI 总结完成")
            except Exception as e:
                logger.error(f"生成验证结果 AI 总结失败: {e}", exc_info=True)
                ai_summary = f"生成总结失败: {str(e)}"

        # 构建返回结果
        result: Dict[str, Any] = {
            "chapter_id": chapter_id,
            "verification_results": all_verification_results,
            "ai_summary": ai_summary,
        }

        # 生成文本摘要
        if build_text_summary:
            summary_parts = []
            for vr in all_verification_results:
                prompt_name = vr.get("prompt_name", "未命名")
                if "error" in vr:
                    summary_parts.append(f"【{prompt_name}】校验失败: {vr['error']}")
                else:
                    result_data = vr.get("result", "")
                    summary_parts.append(f"【{prompt_name}】")
                    if result_data:
                        # 如果结果太长，截取前1000个字符
                        if len(result_data) > 1000:
                            summary_parts.append(result_data[:1000] + "...")
                        else:
                            summary_parts.append(result_data)
                    else:
                        summary_parts.append("校验完成")
            
            # 添加 AI 总结到摘要
            if ai_summary:
                summary_parts.append("\n" + "=" * 50)
                summary_parts.append("【AI 综合分析总结】")
                summary_parts.append(str(ai_summary))
            
            if summary_parts:
                result["summary_text"] = "\n".join(summary_parts)
            else:
                result["summary_text"] = "未完成任何校验。"

        return result

    async def create_work_from_analysis(
        self,
        analysis_data: Dict[str, Any],
        user_id: int
    ) -> Dict[str, Any]:
        """
        从分析结果创建作品（此方法已废弃，不再创建work）
        
        Args:
            analysis_data: 分析数据
            user_id: 用户ID
        
        Returns:
            创建结果（返回错误，因为不再支持创建work）
        """
        raise NotImplementedError("不再支持从分析结果创建作品，请使用现有的work并调用 incremental_insert_to_work 方法")

