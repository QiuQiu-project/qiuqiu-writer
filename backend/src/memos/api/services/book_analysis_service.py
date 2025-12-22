"""
书籍分析服务
用于逐章生成大纲和细纲
"""

import json
import re
from typing import Dict, Any, List, Optional, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from memos.api.models.work import Work
from memos.api.models.chapter import Chapter
from memos.api.models.prompt_template import PromptTemplate
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
    
    def get_enhanced_book_analysis_prompt(self) -> str:
        """
        获取增强的拆书分析prompt模板
        
        Returns:
            prompt模板内容字符串
        """
        return """# 角色
你是一位经验丰富的小说编辑和金牌剧情分析师。你擅长解构故事，洞察每一章节的功能、节奏和情感，并能识别角色、地点等关键信息。

# 任务
我将提供一部小说的章节正文。你的任务是通读并深刻理解这些章节，然后分析并提取以下信息：
1. 角色信息（姓名、特征、关系等）
2. 地点/地图信息（名称、描述、特征等）
3. 章节基本信息（标题、章节号、概要）
4. 章节大纲（核心功能、关键情节点、画面感、氛围、结尾钩子）
5. 章节细纲（详细的小节划分）

# 输出格式要求
**必须严格按照以下JSON格式输出，不要添加任何其他文字：**

```json
{
  "characters": [
    {
      "name": "角色名称",
      "display_name": "显示名称",
      "description": "角色描述",
      "personality": {},
      "appearance": {},
      "background": {},
      "relationships": {}
    }
  ],
  "locations": [
    {
      "name": "地点名称",
      "display_name": "显示名称",
      "description": "地点描述",
      "type": "地点类型",
      "features": {}
    }
  ],
  "chapters": [
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
  ]
}
```

# 重要提示
1. **必须输出有效的JSON格式**，不要添加任何Markdown代码块标记外的文字
2. 章节号必须准确提取，统一转换为阿拉伯数字
3. **每一章必须包含outline（大纲）和detailed_outline（细纲）字段**，这是必需字段，不能省略
4. outline字段必须包含：core_function（核心功能）、key_points（关键情节点）、visual_scenes（画面感）、atmosphere（氛围）、hook（结尾钩子）
5. detailed_outline字段必须包含sections数组，每个section包含section_number、title、content
6. characters和locations数组可以为空，如果没有识别到相关信息

# 章节内容
{content}

# 开始分析
请严格按照上述JSON格式输出分析结果："""
    
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
{content}

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
        支持两种格式：
        1. 章节数据：{ "chapter_number": ..., "title": ..., "outline": ..., "detailed_outline": ... }
        2. 角色数据：{ "characters": [...] }
        
        Args:
            ai_response: AI返回的响应文本
        
        Returns:
            解析后的数据字典，如果解析失败返回None
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
                    # 如果prompt模板包含{content}占位符，先替换
                    if "{content}" in prompt_template:
                        base_prompt = prompt_template.replace("{content}", chapter_content)
                    else:
                        base_prompt = prompt_template
                    
                    enhanced_prompt = f"""{base_prompt}

# 上下文信息
{chr(10).join(context_info)}

# 开始分析
请严格按照上述JSON格式输出分析结果："""
                else:
                    # 替换{content}占位符
                    enhanced_prompt = prompt_template.replace("{content}", chapter_content) if "{content}" in prompt_template else prompt_template
            else:
                # 替换{content}占位符
                enhanced_prompt = prompt_template.replace("{content}", chapter_content) if "{content}" in prompt_template else prompt_template
            
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
            print(chapters)
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
    
    async def incremental_insert_to_work(
        self,
        work_id: int,
        analysis_data: Dict[str, Any],
        user_id: int,
        chapter_index: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        渐进式插入分析结果到作品（角色、地点、章节）
        
        Args:
            work_id: 作品ID
            analysis_data: 分析数据，包含characters、locations、chapters
            user_id: 用户ID
            chapter_index: 章节索引（可选）
        
        Returns:
            插入结果统计
        """
        try:
            # 检查analysis_data是否为None
            if analysis_data is None:
                raise ValueError("analysis_data不能为None，AI响应解析失败")
            
            # 获取作品（刷新会话以确保数据是最新的）
            try:
                # 先尝试直接查询
                stmt = select(Work).where(Work.id == work_id)
                result = await self.db.execute(stmt)
                work = result.scalar_one_or_none()
                
                if not work:
                    logger.warning(f"第一次查询未找到作品 {work_id}，尝试刷新会话")
                    # 刷新会话，清除可能的过期对象
                    await self.db.expire_all()
                    result = await self.db.execute(stmt)
                    work = result.scalar_one_or_none()
                
                if not work:
                    logger.warning(f"刷新会话后仍未找到作品 {work_id}，尝试使用 WorkService")
                    # 最后尝试：使用 WorkService 获取
                    from memos.api.services.work_service import WorkService
                    work_service = WorkService(self.db)
                    work = await work_service.get_work_by_id(work_id)
                
                if not work:
                    # 记录详细的错误信息
                    logger.error(
                        f"作品 {work_id} 不存在。"
                        f"数据库会话状态: is_active={self.db.is_active if hasattr(self.db, 'is_active') else 'unknown'}, "
                        f"bind={self.db.bind.url if hasattr(self.db, 'bind') and self.db.bind else 'unknown'}"
                    )
                    raise ValueError(f"作品 {work_id} 不存在")
                
                logger.debug(f"成功获取作品 {work_id}: {work.title}")
            except ValueError:
                # 重新抛出 ValueError
                raise
            except Exception as e:
                logger.error(f"获取作品 {work_id} 失败: {e}", exc_info=True)
                raise ValueError(f"获取作品 {work_id} 失败: {str(e)}")
            
            work_metadata = work.work_metadata or {}
            
            # 确保 component_data 存在
            if "component_data" not in work_metadata:
                work_metadata["component_data"] = {}
            component_data = work_metadata["component_data"]
            
            # 处理角色（合并到 component_data.characters）
            characters_processed = 0
            characters_updated = 0
            if analysis_data.get("characters"):
                existing_characters = component_data.get("characters", [])
                character_map = {char.get("name", ""): char for char in existing_characters}
                
                for char_data in analysis_data["characters"]:
                    if not isinstance(char_data, dict):
                        continue
                    
                    char_name = char_data.get("name", "")
                    if char_name:
                        if char_name in character_map:
                            # 合并现有角色
                            existing_char = character_map[char_name]
                            # 检查是否有实际更新（深度合并）
                            has_update = False
                            for key, value in char_data.items():
                                if key in existing_char and isinstance(existing_char[key], dict) and isinstance(value, dict):
                                    # 深度合并字典
                                    existing_char[key].update(value)
                                    has_update = True
                                elif key not in existing_char or existing_char[key] != value:
                                    # 字段不存在或值不同，需要更新
                                    existing_char[key] = value
                                    has_update = True
                            if has_update:
                                characters_updated += 1
                        else:
                            # 添加新角色
                            character_map[char_name] = char_data
                            characters_processed += 1
                
                component_data["characters"] = list(character_map.values())
                work_metadata["component_data"] = component_data
                
                # 返回处理的角色总数（新增 + 更新）
                characters_processed = characters_processed + characters_updated
            
            # 处理地点（合并到work_metadata）
            locations_processed = 0
            if analysis_data.get("locations"):
                existing_locations = work_metadata.get("locations", [])
                location_map = {loc.get("name", ""): loc for loc in existing_locations}
                
                for loc_data in analysis_data["locations"]:
                    if not isinstance(loc_data, dict):
                        continue
                    
                    loc_name = loc_data.get("name", "")
                    if loc_name:
                        if loc_name in location_map:
                            # 合并现有地点
                            existing_loc = location_map[loc_name]
                            for key, value in loc_data.items():
                                existing_loc[key] = value
                        else:
                            # 添加新地点
                            location_map[loc_name] = loc_data
                            locations_processed += 1
                
                work_metadata["locations"] = list(location_map.values())
            
            # 更新work的metadata
            work.work_metadata = work_metadata
            # 使用 flag_modified 明确标记 JSON 字段已被修改
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(work, "work_metadata")
            await self.db.commit()
            await self.db.refresh(work)
            
            # 处理章节（更新章节的大纲和细纲）
            chapters_created = 0
            if analysis_data.get("chapters"):
                for chapter_data in analysis_data["chapters"]:
                    if not isinstance(chapter_data, dict):
                        continue
                    
                    chapter_number = chapter_data.get("chapter_number")
                    if chapter_number is None:
                        continue
                    
                    # 查找对应的章节
                    stmt = select(Chapter).where(
                        Chapter.work_id == work_id,
                        Chapter.chapter_number == chapter_number
                    )
                    result = await self.db.execute(stmt)
                    chapter = result.scalar_one_or_none()
                    
                    if chapter:
                        # 更新章节的metadata
                        chapter_metadata = chapter.chapter_metadata or {}
                        if chapter_data.get("outline"):
                            chapter_metadata["outline"] = chapter_data["outline"]
                        if chapter_data.get("detailed_outline"):
                            chapter_metadata["detailed_outline"] = chapter_data["detailed_outline"]
                        if chapter_data.get("summary"):
                            chapter.summary = chapter_data["summary"]
                        if chapter_data.get("title"):
                            chapter.title = chapter_data["title"]
                        
                        chapter.chapter_metadata = chapter_metadata
                        chapters_created += 1
                
                await self.db.commit()
            
            return {
                "characters_processed": characters_processed,
                "locations_processed": locations_processed,
                "chapters_created": chapters_created,
            }
            
        except Exception as e:
            error_msg = str(e)
            logger.error(
                f"渐进式插入失败: {error_msg}",
                extra={
                    "work_id": work_id,
                    "user_id": user_id,
                    "chapter_index": chapter_index,
                    "error_type": type(e).__name__,
                },
                exc_info=True
            )
            await self.db.rollback()
            raise
    
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

