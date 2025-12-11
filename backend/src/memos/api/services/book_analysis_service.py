"""
拆书分析服务
处理从AI分析结果中提取结构化数据并创建作品
"""

import json
import re
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from memos.api.models.work import Work
from memos.api.models.chapter import Chapter
from memos.api.models.characters import Character
from memos.api.models.location import Location
from memos.api.models.prompt_template import PromptTemplate
from memos.api.services.work_service import WorkService
from memos.api.services.chapter_service import ChapterService
from memos.api.services.sharedb_service import ShareDBService
from memos.log import get_logger

logger = get_logger(__name__)


class BookAnalysisService:
    """拆书分析服务"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.work_service = WorkService(db)
        self.chapter_service = ChapterService(db)
        self.sharedb_service = ShareDBService()

    async def get_default_prompt_template(self, template_type: str = "book_analysis") -> Optional[PromptTemplate]:
        """获取默认的prompt模板"""
        stmt = select(PromptTemplate).where(
            PromptTemplate.template_type == template_type,
            PromptTemplate.is_default == True,
            PromptTemplate.is_active == True
        ).order_by(PromptTemplate.created_at.desc())
        
        result = await self.db.execute(stmt)
        template = result.scalar_one_or_none()
        
        if not template:
            # 如果没有找到默认模板，返回第一个活跃的模板
            stmt = select(PromptTemplate).where(
                PromptTemplate.template_type == template_type,
                PromptTemplate.is_active == True
            ).order_by(PromptTemplate.created_at.desc())
            result = await self.db.execute(stmt)
            template = result.scalar_one_or_none()
        
        return template

    def get_enhanced_book_analysis_prompt(self) -> str:
        """获取增强的拆书分析prompt，要求返回结构化JSON数据"""
        return """# 角色
你是一位经验丰富的小说编辑和金牌剧情分析师。你擅长解构故事，洞察每一章节的功能、节奏和情感，并能将其转化为高度结构化的分析报告。

# 任务
我将提供一部小说的部分章节正文。你的任务是通读并深刻理解这些章节，然后分析并提取以下信息：
1. 作品基本信息（标题、描述、类型等）
2. 角色信息（主要角色和次要角色）
3. 地点/地图信息（故事中出现的所有地点）
4. 章节信息（每一章的大纲、细纲和内容）

# 输出格式要求
**必须严格按照以下JSON格式输出，不要添加任何其他文字：**

```json
{
  "work": {
    "title": "作品标题",
    "subtitle": "副标题（可选）",
    "description": "作品简介",
    "work_type": "novel",
    "genre": "作品类型",
    "category": "作品分类",
    "tags": ["标签1", "标签2"]
  },
  "characters": [
    {
      "name": "角色名称",
      "display_name": "显示名称（可选）",
      "description": "角色描述",
      "gender": "性别",
      "age": 年龄（数字或null）,
      "personality": {
        "traits": ["性格特质1", "性格特质2"],
        "motivations": "角色动机"
      },
      "appearance": {
        "description": "外貌描述"
      },
      "background": {
        "origin": "出身背景",
        "history": "历史背景"
      },
      "is_main_character": true/false,
      "tags": ["标签1", "标签2"]
    }
  ],
  "locations": [
    {
      "name": "地点名称",
      "display_name": "显示名称（可选）",
      "description": "地点描述",
      "location_type": "city/forest/mountain/castle/village等",
      "is_important": true/false,
      "tags": ["标签1", "标签2"],
      "metadata": {
        "climate": "气候",
        "population": "人口",
        "history": "历史"
      }
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
      },
      "content": "章节完整正文内容"
    }
  ]
}
```

# 重要提示
1. **必须输出有效的JSON格式**，不要添加任何Markdown代码块标记外的文字
2. 如果某些信息无法确定，使用null或空数组/对象
3. 章节号必须准确提取，统一转换为阿拉伯数字
4. 角色和地点信息应该从所有章节中汇总提取
5. 每一章的content字段必须包含该章节的完整正文内容
6. **每一章必须包含outline（大纲）和detailed_outline（细纲）字段**，这是必需字段，不能省略
7. outline字段必须包含：core_function（核心功能）、key_points（关键情节点）、visual_scenes（画面感）、atmosphere（氛围）、hook（结尾钩子）
8. detailed_outline字段必须包含sections数组，每个section包含section_number、title、content

# 章节内容
{content}

# 开始分析
请严格按照上述JSON格式输出分析结果："""

    def split_chapters_content(self, content: str) -> List[str]:
        """分割章节内容，返回章节列表"""
        import re
        # 匹配章节标题模式：第X章、第X回、Chapter X等
        chapter_pattern = r'(?:^|\n)(?:第[一二三四五六七八九十百千万\d]+[章节回]|Chapter\s+\d+|第\d+[章节回]|第[零一二三四五六七八九十]+[章节回])[^\n]*\n'
        
        chapters = []
        matches = list(re.finditer(chapter_pattern, content, re.MULTILINE | re.IGNORECASE))
        
        if not matches:
            # 如果没有找到章节标题，将整个内容作为一章
            return [content]
        
        # 分割章节
        for i, match in enumerate(matches):
            start_pos = match.start()
            if i == 0 and start_pos > 0:
                # 第一段内容（章节标题之前的内容）
                chapters.append(content[:start_pos].strip())
            
            # 当前章节的结束位置
            end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(content)
            chapter_content = content[start_pos:end_pos].strip()
            if chapter_content:
                chapters.append(chapter_content)
        
        return chapters if chapters else [content]

    def parse_ai_response(self, ai_response: str) -> Dict[str, Any]:
        """解析AI返回的响应，提取JSON数据（适用于book_analysis类型，包含work和chapters）"""
        try:
            # 尝试提取JSON代码块
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # 如果没有代码块，尝试直接查找JSON对象
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    raise ValueError("无法在AI响应中找到JSON数据")
            
            # 解析JSON
            data = json.loads(json_str)
            
            # 验证必需字段
            if "work" not in data:
                raise ValueError("缺少必需字段: work")
            if "chapters" not in data:
                raise ValueError("缺少必需字段: chapters")
            
            # 验证章节数据中是否包含大纲和细纲
            chapters = data.get("chapters", [])
            for idx, chapter in enumerate(chapters):
                if "outline" not in chapter:
                    logger.warning(f"章节 {idx + 1} 缺少 outline 字段")
                if "detailed_outline" not in chapter:
                    logger.warning(f"章节 {idx + 1} 缺少 detailed_outline 字段")
                if chapter.get("outline") and chapter.get("detailed_outline"):
                    logger.info(f"章节 {idx + 1} 包含完整的大纲和细纲数据")
            
            return data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}")
            raise ValueError(f"JSON解析失败: {str(e)}")
        except Exception as e:
            logger.error(f"解析AI响应失败: {e}")
            raise ValueError(f"解析AI响应失败: {str(e)}")

    def parse_single_chapter_response(self, ai_response: str) -> Dict[str, Any]:
        """解析单个章节的AI响应，提取JSON数据（适用于chapter_analysis类型）"""
        try:
            # 尝试提取JSON代码块
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # 如果没有代码块，尝试直接查找JSON对象
                json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    # 如果不是JSON格式，返回None（可能是Markdown表格格式）
                    logger.warning("AI响应不是JSON格式，可能是Markdown表格格式")
                    return None
            
            # 解析JSON
            data = json.loads(json_str)
            
            # 验证必需字段
            if "chapter_number" not in data and "title" not in data:
                logger.warning("JSON数据缺少章节基本信息")
                return None
            
            # 验证是否包含大纲和细纲
            if "outline" not in data:
                logger.warning("章节数据缺少 outline 字段")
            if "detailed_outline" not in data:
                logger.warning("章节数据缺少 detailed_outline 字段")
            
            if data.get("outline") and data.get("detailed_outline"):
                logger.info("章节包含完整的大纲和细纲数据")
            
            return data
            
        except json.JSONDecodeError as e:
            logger.warning(f"JSON解析失败，可能是Markdown格式: {e}")
            return None
        except Exception as e:
            logger.error(f"解析章节响应失败: {e}")
            return None
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}")
            raise ValueError(f"JSON解析失败: {str(e)}")
        except Exception as e:
            logger.error(f"解析AI响应失败: {e}")
            raise ValueError(f"解析AI响应失败: {str(e)}")

    async def create_work_from_analysis(
        self,
        analysis_data: Dict[str, Any],
        user_id: int
    ) -> Dict[str, Any]:
        """从分析结果创建作品、角色、地点和章节"""
        try:
            # 初始化ShareDB服务
            await self.sharedb_service.initialize()
            
            # 1. 创建作品
            work_data = analysis_data.get("work", {})
            work = await self.work_service.create_work(
                owner_id=user_id,
                title=work_data.get("title", "未命名作品"),
                subtitle=work_data.get("subtitle"),
                description=work_data.get("description"),
                work_type=work_data.get("work_type", "novel"),
                genre=work_data.get("genre"),
                category=work_data.get("category"),
                tags=work_data.get("tags", []),
            )
            
            logger.info(f"✅ 创建作品成功: {work.id} - {work.title}")
            
            # 2. 创建角色
            characters_data = analysis_data.get("characters", [])
            created_characters = []
            for char_data in characters_data:
                try:
                    character = Character(
                        work_id=work.id,
                        name=char_data.get("name", ""),
                        display_name=char_data.get("display_name"),
                        description=char_data.get("description"),
                        gender=char_data.get("gender"),
                        age=char_data.get("age"),
                        personality=char_data.get("personality", {}),
                        appearance=char_data.get("appearance", {}),
                        background=char_data.get("background", {}),
                        is_main_character=char_data.get("is_main_character", False),
                        tags=char_data.get("tags", []),
                    )
                    self.db.add(character)
                    created_characters.append(character)
                except Exception as e:
                    logger.warning(f"创建角色失败: {e}")
            
            await self.db.commit()
            logger.info(f"✅ 创建角色成功: {len(created_characters)} 个")
            
            # 3. 创建地点
            locations_data = analysis_data.get("locations", [])
            created_locations = []
            for loc_data in locations_data:
                try:
                    location = Location(
                        work_id=work.id,
                        name=loc_data.get("name", ""),
                        display_name=loc_data.get("display_name"),
                        description=loc_data.get("description"),
                        location_type=loc_data.get("location_type"),
                        is_important=loc_data.get("is_important", False),
                        tags=loc_data.get("tags", []),
                        location_metadata=loc_data.get("metadata", {}),
                    )
                    self.db.add(location)
                    created_locations.append(location)
                except Exception as e:
                    logger.warning(f"创建地点失败: {e}")
            
            await self.db.commit()
            logger.info(f"✅ 创建地点成功: {len(created_locations)} 个")
            
            # 4. 创建章节
            chapters_data = analysis_data.get("chapters", [])
            created_chapters = []
            for chapter_data in chapters_data:
                try:
                    chapter_number = chapter_data.get("chapter_number")
                    if chapter_number is None:
                        logger.warning("章节号缺失，跳过该章节")
                        continue
                    
                    # 提取大纲和细纲
                    outline = chapter_data.get("outline")
                    detailed_outline = chapter_data.get("detailed_outline")
                    
                    # 记录调试信息
                    if not outline:
                        logger.warning(f"章节 {chapter_number} ({chapter_data.get('title', 'unknown')}) 没有大纲数据")
                    if not detailed_outline:
                        logger.warning(f"章节 {chapter_number} ({chapter_data.get('title', 'unknown')}) 没有细纲数据")
                    
                    # 创建章节记录
                    chapter = await self.chapter_service.create_chapter(
                        work_id=work.id,
                        title=chapter_data.get("title", f"第{chapter_number}章"),
                        chapter_number=chapter_number,
                        summary=chapter_data.get("summary"),
                        chapter_metadata={
                            "outline": outline if outline else {},
                            "detailed_outline": detailed_outline if detailed_outline else {},
                        },
                    )
                    
                    logger.info(f"✅ 章节 {chapter_number} 已保存，大纲: {bool(outline)}, 细纲: {bool(detailed_outline)}")
                    
                    # 在ShareDB中创建文档并保存内容
                    chapter_content = chapter_data.get("content", "")
                    if chapter_content:
                        await self.sharedb_service.create_document(
                            document_id=f"chapter_{chapter.id}",
                            initial_content={
                                "title": chapter.title,
                                "content": chapter_content,
                                "metadata": {
                                    "work_id": work.id,
                                    "chapter_number": chapter_number,
                                    "created_by": user_id,
                                }
                            }
                        )
                    
                    created_chapters.append(chapter)
                except Exception as e:
                    logger.warning(f"创建章节失败: {e}")
            
            await self.db.commit()
            logger.info(f"✅ 创建章节成功: {len(created_chapters)} 个")
            
            # 更新作品统计信息
            await self.work_service.update_work(
                work_id=work.id,
                chapter_count=len(created_chapters),
            )
            
            return {
                "work_id": work.id,
                "work_title": work.title,
                "characters_count": len(created_characters),
                "locations_count": len(created_locations),
                "chapters_count": len(created_chapters),
            }
            
        except Exception as e:
            logger.error(f"从分析结果创建作品失败: {e}")
            await self.db.rollback()
            raise

    async def incremental_insert_to_work(
        self,
        work_id: int,
        analysis_data: Dict[str, Any],
        user_id: int,
        chapter_index: int = 0
    ) -> Dict[str, Any]:
        """渐进式插入分析结果到现有作品（增量更新角色、地点、章节）"""
        try:
            # 初始化ShareDB服务
            await self.sharedb_service.initialize()
            
            # 获取作品
            work = await self.work_service.get_work_by_id(work_id)
            if not work:
                raise ValueError(f"作品不存在: {work_id}")
            
            # 1. 更新作品基本信息（仅在第一次时）
            if chapter_index == 1:
                work_data = analysis_data.get("work", {})
                if work_data:
                    update_data = {}
                    if work_data.get("description") and not work.description:
                        update_data["description"] = work_data.get("description")
                    if work_data.get("genre") and not work.genre:
                        update_data["genre"] = work_data.get("genre")
                    if work_data.get("category") and not work.category:
                        update_data["category"] = work_data.get("category")
                    if work_data.get("tags"):
                        existing_tags = set(work.tags or [])
                        new_tags = set(work_data.get("tags", []))
                        update_data["tags"] = list(existing_tags | new_tags)
                    
                    if update_data:
                        await self.work_service.update_work(work_id=work_id, **update_data)
            
            # 2. 增量插入角色（去重合并）
            characters_data = analysis_data.get("characters", [])
            created_or_updated_characters = []
            for char_data in characters_data:
                try:
                    char_name = char_data.get("name", "").strip()
                    if not char_name:
                        continue
                    
                    # 检查角色是否已存在
                    from sqlalchemy import and_
                    stmt = select(Character).where(
                        and_(
                            Character.work_id == work_id,
                            Character.name == char_name
                        )
                    )
                    result = await self.db.execute(stmt)
                    existing_char = result.scalar_one_or_none()
                    
                    if existing_char:
                        # 更新现有角色（合并信息）
                        if char_data.get("description") and not existing_char.description:
                            existing_char.description = char_data.get("description")
                        if char_data.get("gender") and not existing_char.gender:
                            existing_char.gender = char_data.get("gender")
                        if char_data.get("age") and not existing_char.age:
                            existing_char.age = char_data.get("age")
                        
                        # 合并personality、appearance、background
                        if char_data.get("personality"):
                            existing_personality = existing_char.personality or {}
                            existing_personality.update(char_data.get("personality", {}))
                            existing_char.personality = existing_personality
                        
                        if char_data.get("appearance"):
                            existing_appearance = existing_char.appearance or {}
                            existing_appearance.update(char_data.get("appearance", {}))
                            existing_char.appearance = existing_appearance
                        
                        if char_data.get("background"):
                            existing_background = existing_char.background or {}
                            existing_background.update(char_data.get("background", {}))
                            existing_char.background = existing_background
                        
                        # 合并tags
                        existing_tags = set(existing_char.tags or [])
                        new_tags = set(char_data.get("tags", []))
                        existing_char.tags = list(existing_tags | new_tags)
                        
                        # 更新is_main_character（如果新数据标记为主角）
                        if char_data.get("is_main_character"):
                            existing_char.is_main_character = True
                        
                        created_or_updated_characters.append(existing_char)
                    else:
                        # 创建新角色
                        character = Character(
                            work_id=work_id,
                            name=char_name,
                            display_name=char_data.get("display_name"),
                            description=char_data.get("description"),
                            gender=char_data.get("gender"),
                            age=char_data.get("age"),
                            personality=char_data.get("personality", {}),
                            appearance=char_data.get("appearance", {}),
                            background=char_data.get("background", {}),
                            is_main_character=char_data.get("is_main_character", False),
                            tags=char_data.get("tags", []),
                        )
                        self.db.add(character)
                        created_or_updated_characters.append(character)
                except Exception as e:
                    logger.warning(f"处理角色失败 ({char_data.get('name', 'unknown')}): {e}")
            
            await self.db.commit()
            logger.info(f"✅ 处理角色成功: {len(created_or_updated_characters)} 个")
            
            # 3. 增量插入地点（去重合并）
            locations_data = analysis_data.get("locations", [])
            created_or_updated_locations = []
            for loc_data in locations_data:
                try:
                    loc_name = loc_data.get("name", "").strip()
                    if not loc_name:
                        continue
                    
                    # 检查地点是否已存在
                    from sqlalchemy import and_
                    stmt = select(Location).where(
                        and_(
                            Location.work_id == work_id,
                            Location.name == loc_name
                        )
                    )
                    result = await self.db.execute(stmt)
                    existing_loc = result.scalar_one_or_none()
                    
                    if existing_loc:
                        # 更新现有地点（合并信息）
                        if loc_data.get("description") and not existing_loc.description:
                            existing_loc.description = loc_data.get("description")
                        if loc_data.get("location_type") and not existing_loc.location_type:
                            existing_loc.location_type = loc_data.get("location_type")
                        
                        # 合并metadata
                        if loc_data.get("metadata"):
                            existing_metadata = existing_loc.location_metadata or {}
                            existing_metadata.update(loc_data.get("metadata", {}))
                            existing_loc.location_metadata = existing_metadata
                        
                        # 合并tags
                        existing_tags = set(existing_loc.tags or [])
                        new_tags = set(loc_data.get("tags", []))
                        existing_loc.tags = list(existing_tags | new_tags)
                        
                        # 更新is_important
                        if loc_data.get("is_important"):
                            existing_loc.is_important = True
                        
                        created_or_updated_locations.append(existing_loc)
                    else:
                        # 创建新地点
                        location = Location(
                            work_id=work_id,
                            name=loc_name,
                            display_name=loc_data.get("display_name"),
                            description=loc_data.get("description"),
                            location_type=loc_data.get("location_type"),
                            is_important=loc_data.get("is_important", False),
                            tags=loc_data.get("tags", []),
                            location_metadata=loc_data.get("metadata", {}),
                        )
                        self.db.add(location)
                        created_or_updated_locations.append(location)
                except Exception as e:
                    logger.warning(f"处理地点失败 ({loc_data.get('name', 'unknown')}): {e}")
            
            await self.db.commit()
            logger.info(f"✅ 处理地点成功: {len(created_or_updated_locations)} 个")
            
            # 4. 插入新章节（只插入当前分析的新章节）
            chapters_data = analysis_data.get("chapters", [])
            created_chapters = []
            for chapter_data in chapters_data:
                try:
                    chapter_number = chapter_data.get("chapter_number")
                    if chapter_number is None:
                        continue
                    
                    # 检查章节是否已存在
                    from sqlalchemy import and_
                    stmt = select(Chapter).where(
                        and_(
                            Chapter.work_id == work_id,
                            Chapter.chapter_number == chapter_number
                        )
                    )
                    result = await self.db.execute(stmt)
                    existing_chapter = result.scalar_one_or_none()
                    
                    if existing_chapter:
                        # 章节已存在，跳过或更新
                        logger.info(f"章节 {chapter_number} 已存在，跳过")
                        continue
                    
                    # 提取大纲和细纲
                    outline = chapter_data.get("outline")
                    detailed_outline = chapter_data.get("detailed_outline")
                    
                    # 记录调试信息
                    if not outline:
                        logger.warning(f"渐进式插入 - 章节 {chapter_number} ({chapter_data.get('title', 'unknown')}) 没有大纲数据")
                    if not detailed_outline:
                        logger.warning(f"渐进式插入 - 章节 {chapter_number} ({chapter_data.get('title', 'unknown')}) 没有细纲数据")
                    
                    # 创建新章节
                    chapter = await self.chapter_service.create_chapter(
                        work_id=work_id,
                        title=chapter_data.get("title", f"第{chapter_number}章"),
                        chapter_number=chapter_number,
                        summary=chapter_data.get("summary"),
                        chapter_metadata={
                            "outline": outline if outline else {},
                            "detailed_outline": detailed_outline if detailed_outline else {},
                        },
                    )
                    
                    logger.info(f"✅ 渐进式插入 - 章节 {chapter_number} 已保存，大纲: {bool(outline)}, 细纲: {bool(detailed_outline)}")
                    
                    # 在ShareDB中创建文档并保存内容
                    chapter_content = chapter_data.get("content", "")
                    if chapter_content:
                        await self.sharedb_service.create_document(
                            document_id=f"chapter_{chapter.id}",
                            initial_content={
                                "title": chapter.title,
                                "content": chapter_content,
                                "metadata": {
                                    "work_id": work_id,
                                    "chapter_number": chapter_number,
                                    "created_by": user_id,
                                }
                            }
                        )
                    
                    created_chapters.append(chapter)
                except Exception as e:
                    logger.warning(f"创建章节失败 (章节号: {chapter_data.get('chapter_number', 'unknown')}): {e}")
            
            await self.db.commit()
            logger.info(f"✅ 创建章节成功: {len(created_chapters)} 个")
            
            # 更新作品统计信息
            await self.work_service.update_work(
                work_id=work_id,
                chapter_count=work.chapter_count + len(created_chapters),
            )
            
            return {
                "characters_processed": len(created_or_updated_characters),
                "locations_processed": len(created_or_updated_locations),
                "chapters_created": len(created_chapters),
                "chapter_index": chapter_index,
            }
            
        except Exception as e:
            logger.error(f"渐进式插入失败: {e}")
            await self.db.rollback()
            raise

    async def analyze_and_insert_chapter_by_file(
        self,
        file_name: str,
        content: str,
        chapter_number: int,
        volume_number: int,
        user_id: int,
        ai_service,  # AI服务实例
        prompt: Optional[str] = None,
        settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        根据文件名分析单章并插入到作品
        
        Args:
            file_name: 文件名，用于查找或创建作品
            content: 章节内容
            chapter_number: 章节号
            volume_number: 卷号
            user_id: 用户ID
            ai_service: AI服务实例
            prompt: 自定义prompt（可选）
            settings: AI设置（可选）
        
        Returns:
            包含作品和章节信息的字典
        """
        try:
            # 初始化ShareDB服务
            await self.sharedb_service.initialize()
            
            # 1. 根据文件名查找或创建作品
            work = await self.work_service.find_work_by_filename(file_name, user_id)
            work_created = False
            
            if not work:
                # 创建新作品（使用文件名作为标题，去掉扩展名）
                import os
                work_title = os.path.splitext(file_name)[0] or file_name
                
                work = await self.work_service.create_work(
                    owner_id=user_id,
                    title=work_title,
                    work_type="novel",
                    status="draft",
                    work_metadata={
                        "source_file": file_name,
                        "analysis_mode": "file_based"
                    }
                )
                work_created = True
                logger.info(f"✅ 创建新作品: {work.id} - {work.title} (来源文件: {file_name})")
            else:
                logger.info(f"✅ 找到已存在作品: {work.id} - {work.title}")
            
            # 2. 检查章节是否已存在
            from sqlalchemy import and_
            stmt = select(Chapter).where(
                and_(
                    Chapter.work_id == work.id,
                    Chapter.chapter_number == chapter_number,
                    Chapter.volume_number == volume_number
                )
            )
            result = await self.db.execute(stmt)
            existing_chapter = result.scalar_one_or_none()
            
            if existing_chapter:
                logger.warning(f"章节 {chapter_number} (卷 {volume_number}) 已存在，跳过创建")
                return {
                    "work_id": work.id,
                    "work_title": work.title,
                    "chapter_id": existing_chapter.id,
                    "chapter_number": chapter_number,
                    "volume_number": volume_number,
                    "title": existing_chapter.title,
                    "outline": existing_chapter.chapter_metadata.get("outline", {}) if existing_chapter.chapter_metadata else {},
                    "detailed_outline": existing_chapter.chapter_metadata.get("detailed_outline", {}) if existing_chapter.chapter_metadata else {},
                    "skipped": True,
                    "work_created": work_created
                }
            
            # 3. 获取prompt模板
            if not prompt:
                prompt_template = await self.get_default_prompt_template("chapter_analysis")
                if prompt_template:
                    prompt = prompt_template.format_prompt(content=content)
                else:
                    # 使用默认prompt
                    prompt = f"请分析以下章节内容，并输出JSON格式的分析结果，包含大纲和细纲：\n\n{content}"
            
            # 4. 调用AI分析
            full_response = ""
            model = settings.get("model", "gpt-3.5-turbo") if settings else "gpt-3.5-turbo"
            temperature = settings.get("temperature", 0.7) if settings else 0.7
            max_tokens = settings.get("max_tokens", 4000) if settings else 4000
            
            async for message in ai_service.analyze_chapter_stream(
                content=content,
                prompt=prompt,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens
            ):
                # 解析SSE格式的消息
                if message.startswith("data: "):
                    import json
                    try:
                        data = json.loads(message[6:])
                        if data.get("type") == "chunk" and data.get("content"):
                            full_response += data.get("content", "")
                    except:
                        pass
            
            # 5. 解析AI响应
            chapter_data = self.parse_single_chapter_response(full_response)
            
            if not chapter_data:
                raise ValueError("AI返回的数据格式不正确，无法解析")
            
            # 确保章节号匹配
            if chapter_data.get("chapter_number") != chapter_number:
                logger.warning(f"AI返回的章节号 {chapter_data.get('chapter_number')} 与请求的章节号 {chapter_number} 不一致，使用请求的章节号")
                chapter_data["chapter_number"] = chapter_number
            
            # 提取大纲和细纲
            outline = chapter_data.get("outline", {})
            detailed_outline = chapter_data.get("detailed_outline", {})
            
            # 6. 创建章节
            chapter = await self.chapter_service.create_chapter(
                work_id=work.id,
                title=chapter_data.get("title", f"第{chapter_number}章"),
                chapter_number=chapter_number,
                volume_number=volume_number,
                summary=chapter_data.get("summary"),
                chapter_metadata={
                    "outline": outline,
                    "detailed_outline": detailed_outline,
                },
            )
            
            logger.info(f"✅ 创建章节成功: {chapter.id} - {chapter.title} (大纲: {bool(outline)}, 细纲: {bool(detailed_outline)})")
            
            # 7. 在ShareDB中创建文档
            chapter_content = chapter_data.get("content", content)
            if chapter_content:
                await self.sharedb_service.create_document(
                    document_id=f"chapter_{chapter.id}",
                    initial_content={
                        "title": chapter.title,
                        "content": chapter_content,
                        "metadata": {
                            "work_id": work.id,
                            "chapter_number": chapter_number,
                            "volume_number": volume_number,
                            "created_by": user_id,
                        }
                    }
                )
            
            # 8. 更新作品统计信息
            await self.work_service.update_work(
                work_id=work.id,
                chapter_count=work.chapter_count + 1,
            )
            
            return {
                "work_id": work.id,
                "work_title": work.title,
                "chapter_id": chapter.id,
                "chapter_number": chapter_number,
                "volume_number": volume_number,
                "title": chapter.title,
                "outline": outline,
                "detailed_outline": detailed_outline,
                "work_created": work_created
            }
            
        except Exception as e:
            logger.error(f"基于文件名的章节分析失败: {e}")
            await self.db.rollback()
            raise

