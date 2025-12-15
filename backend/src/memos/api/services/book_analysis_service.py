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
        return """
# 章节内容
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
            # 预处理：移除常见的AI思考过程标记
            cleaned_response = ai_response
            
            # 移除各种思考过程标记（按顺序处理，避免嵌套问题）
            cleaned_response = re.sub(r'<think>.*?</think>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<think>.*?</think>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<reasoning>.*?</reasoning>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<thought>.*?</thought>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<!--.*?-->', '', cleaned_response, flags=re.DOTALL)
            
            # 移除标记前的所有内容（如果存在）
            # 查找第一个 ```json 或 ``` 或 { 的位置
            json_start_patterns = [
                r'```json',
                r'```',
                r'\{',
            ]
            
            first_json_pos = len(cleaned_response)
            for pattern in json_start_patterns:
                match = re.search(pattern, cleaned_response)
                if match and match.start() < first_json_pos:
                    first_json_pos = match.start()
            
            # 如果找到了JSON开始位置，移除之前的内容
            if first_json_pos < len(cleaned_response):
                cleaned_response = cleaned_response[first_json_pos:]
                logger.info(f"移除了 {first_json_pos} 个字符的前置内容")
            
            json_str = None
            
            # 1. 尝试提取JSON代码块
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', cleaned_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
                logger.info("从代码块中提取JSON")
            else:
                # 2. 如果没有代码块，尝试直接查找JSON对象（从第一个 { 到最后一个 }）
                start_idx = cleaned_response.find('{')
                if start_idx != -1:
                    # 从第一个 { 开始，找到匹配的最后一个 }
                    brace_count = 0
                    end_idx = start_idx
                    for i in range(start_idx, len(cleaned_response)):
                        if cleaned_response[i] == '{':
                            brace_count += 1
                        elif cleaned_response[i] == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                end_idx = i + 1
                                break
                    
                    if end_idx > start_idx:
                        json_str = cleaned_response[start_idx:end_idx]
                        logger.info("从文本中直接提取JSON")
            
            if not json_str:
                    raise ValueError("无法在AI响应中找到JSON数据")
            
            # 解析JSON
            data = json.loads(json_str)
            
            # 验证必需字段
            if "chapters" not in data:
                raise ValueError("缺少必需字段: chapters")
            
            # 验证章节数据中是否包含必需字段：chapter_number, title, outline, detailed_outline
            chapters = data.get("chapters", [])
            for idx, chapter in enumerate(chapters):
                chapter_number = chapter.get("chapter_number")
                title = chapter.get("title")
                outline = chapter.get("outline")
                detailed_outline = chapter.get("detailed_outline")
                
                if chapter_number is None:
                    logger.warning(f"章节 {idx + 1} 缺少 chapter_number 字段")
                if not title:
                    logger.warning(f"章节 {idx + 1} 缺少 title 字段")
                if not outline:
                    logger.warning(f"章节 {idx + 1} 缺少 outline 字段")
                if not detailed_outline:
                    logger.warning(f"章节 {idx + 1} 缺少 detailed_outline 字段")
                if chapter_number is not None and title and outline and detailed_outline:
                    logger.info(f"章节 {idx + 1} (第{chapter_number}章: {title}) 包含完整数据")
            
            return data
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}")
            raise ValueError(f"JSON解析失败: {str(e)}")
        except Exception as e:
            logger.error(f"解析AI响应失败: {e}")
            raise ValueError(f"解析AI响应失败: {str(e)}")

    def parse_single_chapter_response(
        self, 
        ai_response: str, 
        chapter_number: Optional[int] = None,
        title: Optional[str] = None
    ) -> Dict[str, Any]:
        """解析单个章节的AI响应，提取JSON数据（适用于chapter_analysis类型）
        
        Args:
            ai_response: AI返回的响应文本
            chapter_number: 可选的章节号，如果AI响应中缺少此字段，将使用此值
            title: 可选的章节标题，如果AI响应中缺少此字段，将使用此值
        """
        import os
        from datetime import datetime
        
        # 创建调试目录
        debug_dir = "/tmp/writerai_debug"
        os.makedirs(debug_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        
        try:
            logger.debug(f"[JSON解析] 开始解析AI响应，原始响应长度: {len(ai_response)} 字符")
            logger.debug(f"[JSON解析] 原始响应前200字符: {ai_response[:200]}")
            
            # 保存原始AI响应到文件
            original_file = os.path.join(debug_dir, f"original_response_{timestamp}.txt")
            with open(original_file, 'w', encoding='utf-8') as f:
                f.write(ai_response)
            logger.info(f"[JSON解析] 💾 原始AI响应已保存到: {original_file}")
            
            # 预处理：移除常见的AI思考过程标记
            cleaned_response = ai_response
            original_length = len(cleaned_response)
            
            # 移除各种思考过程标记（按顺序处理，避免嵌套问题）
            cleaned_response = re.sub(r'<think>.*?</think>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<think>.*?</think>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<reasoning>.*?</reasoning>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<thought>.*?</thought>', '', cleaned_response, flags=re.DOTALL | re.IGNORECASE)
            cleaned_response = re.sub(r'<!--.*?-->', '', cleaned_response, flags=re.DOTALL)
            
            removed_length = original_length - len(cleaned_response)
            if removed_length > 0:
                logger.debug(f"[JSON解析] 移除了 {removed_length} 个字符的思考过程标记")
            
            # 移除标记前的所有内容（如果存在）
            # 查找第一个 ```json 或 ``` 或 { 的位置
            json_start_patterns = [
                r'```json',
                r'```',
                r'\{',
            ]
            
            first_json_pos = len(cleaned_response)
            for pattern in json_start_patterns:
                match = re.search(pattern, cleaned_response)
                if match and match.start() < first_json_pos:
                    first_json_pos = match.start()
            
            # 如果找到了JSON开始位置，移除之前的内容
            if first_json_pos < len(cleaned_response):
                removed_prefix = cleaned_response[:first_json_pos]
                cleaned_response = cleaned_response[first_json_pos:]
                logger.debug(f"[JSON解析] 移除了 {first_json_pos} 个字符的前置内容")
                logger.debug(f"[JSON解析] 移除的前置内容: {removed_prefix[:200]}")
            
            logger.debug(f"[JSON解析] 清理后的响应长度: {len(cleaned_response)} 字符")
            logger.debug(f"[JSON解析] 清理后的响应前500字符: {cleaned_response[:500]}")
            
            # 保存清理后的响应到文件
            cleaned_file = os.path.join(debug_dir, f"cleaned_response_{timestamp}.txt")
            with open(cleaned_file, 'w', encoding='utf-8') as f:
                f.write(cleaned_response)
            logger.info(f"[JSON解析] 💾 清理后的响应已保存到: {cleaned_file}")
            
            json_str = None
            
            # 1. 尝试提取JSON代码块（支持多种格式）
            patterns = [
                (r'```json\s*(\{.*?\})\s*```', '```json代码块'),
                (r'```\s*(\{.*?\})\s*```', '```代码块'),
                (r'`\s*(\{.*?\})\s*`', '`代码块'),
            ]
            
            for pattern, pattern_name in patterns:
                json_match = re.search(pattern, cleaned_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(1)
                    logger.info(f"[JSON解析] 从{pattern_name}中提取JSON成功，长度: {len(json_str)} 字符")
                    break
                else:
                    logger.debug(f"[JSON解析] 尝试{pattern_name}模式，未找到匹配")
            
            # 2. 如果没有代码块，尝试直接查找JSON对象（从第一个 { 到最后一个 }）
            if not json_str:
                logger.debug("[JSON解析] 代码块提取失败，尝试直接查找JSON对象")
                # 找到第一个 { 的位置
                start_idx = cleaned_response.find('{')
                if start_idx != -1:
                    logger.debug(f"[JSON解析] 找到第一个{{位置: {start_idx}")
                    # 从第一个 { 开始，找到匹配的最后一个 }
                    brace_count = 0
                    end_idx = start_idx
                    for i in range(start_idx, len(cleaned_response)):
                        if cleaned_response[i] == '{':
                            brace_count += 1
                        elif cleaned_response[i] == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                end_idx = i + 1
                                logger.debug(f"[JSON解析] 找到匹配的}}位置: {end_idx}, JSON长度: {end_idx - start_idx} 字符")
                                break
                    
                    if end_idx > start_idx:
                        json_str = cleaned_response[start_idx:end_idx]
                        logger.info(f"[JSON解析] 从文本中直接提取JSON成功，长度: {len(json_str)} 字符")
                    else:
                        logger.warning(f"[JSON解析] 找到{{但未找到匹配的}}，brace_count: {brace_count}")
                else:
                    logger.warning("[JSON解析] 未找到任何{字符")
            
            # 3. 如果仍然没有找到，记录详细信息并返回None
            if not json_str:
                logger.error("=" * 80)
                logger.error("[JSON解析] ❌ 无法提取JSON，AI响应不是JSON格式")
                logger.error(f"[JSON解析] 清理后的响应总长度: {len(cleaned_response)} 字符")
                logger.error(f"[JSON解析] 清理后的响应前2000字符:")
                logger.error(cleaned_response[:2000])
                logger.error(f"[JSON解析] 清理后的响应后500字符:")
                logger.error(cleaned_response[-500:] if len(cleaned_response) > 500 else cleaned_response)
                
                # 尝试查找可能的JSON开始位置
                json_start = cleaned_response.find('{')
                if json_start != -1:
                    logger.error(f"[JSON解析] 找到可能的JSON开始位置: {json_start}")
                    logger.error(f"[JSON解析] 从该位置开始的内容片段: {cleaned_response[json_start:json_start+500]}")
                else:
                    logger.error("[JSON解析] 未找到任何{字符，响应可能完全是文本格式")
                
                # 检查是否包含常见的非JSON格式标记
                if '|' in cleaned_response[:100]:
                    logger.error("[JSON解析] 响应可能包含Markdown表格格式（检测到|字符）")
                if cleaned_response.strip().startswith('#'):
                    logger.error("[JSON解析] 响应可能包含Markdown标题格式（以#开头）")
                if '<table>' in cleaned_response.lower() or '<tr>' in cleaned_response.lower():
                    logger.error("[JSON解析] 响应可能包含HTML表格格式")
                
                logger.error("=" * 80)
                return None
            
            # 4. 解析JSON
            try:
                logger.debug(f"[JSON解析] 开始解析JSON字符串，长度: {len(json_str)} 字符")
                logger.debug(f"[JSON解析] JSON字符串前500字符: {json_str[:500]}")
                
                # 保存提取的JSON字符串到文件
                json_str_file = os.path.join(debug_dir, f"extracted_json_{timestamp}.json")
                with open(json_str_file, 'w', encoding='utf-8') as f:
                    f.write(json_str)
                logger.info(f"[JSON解析] 💾 提取的JSON字符串已保存到: {json_str_file}")
                
                data = json.loads(json_str)
                logger.info(f"[JSON解析] ✅ JSON解析成功，数据类型: {type(data)}, 键: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
                
                # 保存解析后的JSON数据到文件
                parsed_data_file = os.path.join(debug_dir, f"parsed_data_{timestamp}.json")
                with open(parsed_data_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"[JSON解析] 💾 解析后的JSON数据已保存到: {parsed_data_file}")
            except json.JSONDecodeError as e:
                logger.error("=" * 80)
                logger.error(f"[JSON解析] ❌ JSON解析失败: {e}")
                logger.error(f"[JSON解析] 错误位置: 行 {e.lineno}, 列 {e.colno}")
                logger.error(f"[JSON解析] 尝试解析的JSON字符串总长度: {len(json_str)} 字符")
                logger.error(f"[JSON解析] JSON字符串前1000字符:")
                logger.error(json_str[:1000])
                if e.lineno and e.colno:
                    # 尝试显示错误位置附近的内容
                    lines = json_str.split('\n')
                    if e.lineno <= len(lines):
                        error_line = lines[e.lineno - 1]
                        logger.error(f"[JSON解析] 错误行内容: {error_line}")
                        if e.colno <= len(error_line):
                            logger.error(f"[JSON解析] 错误位置标记: {' ' * (e.colno - 1)}^")
                logger.error(f"[JSON解析] JSON字符串后500字符:")
                logger.error(json_str[-500:] if len(json_str) > 500 else json_str)
                logger.error("=" * 80)
                return None
            
            # 5. 支持中文键名映射（将"大纲"映射到"outline"，"细纲"映射到"detailed_outline"）
            if isinstance(data, dict):
                # 检查是否有中文键名
                if "大纲" in data and "outline" not in data:
                    data["outline"] = data["大纲"]
                    logger.info(f"[JSON解析] 检测到中文键名'大纲'，已映射到'outline'")
                if "细纲" in data and "detailed_outline" not in data:
                    data["detailed_outline"] = data["细纲"]
                    logger.info(f"[JSON解析] 检测到中文键名'细纲'，已映射到'detailed_outline'")
                
                # 如果"大纲"和"细纲"在顶层，也尝试将其作为章节分析结果
                if "大纲" in data and "细纲" in data:
                    # 如果这是章节分析结果格式（只有大纲和细纲），需要转换为标准格式
                    if "chapter_number" not in data and "title" not in data:
                        logger.info(f"[JSON解析] 检测到章节分析结果格式（仅包含大纲和细纲），保持原格式")
            
            # 6. 补充缺失的章节基本信息
            if isinstance(data, dict):
                # 如果缺少 chapter_number，使用传入的参数或默认值
                if "chapter_number" not in data:
                    if chapter_number is not None:
                        data["chapter_number"] = chapter_number
                        logger.info(f"[JSON解析] 补充 chapter_number: {chapter_number}")
                    else:
                        logger.warning(f"[JSON解析] ⚠️ JSON数据缺少 chapter_number 且未提供参数")
                
                # 如果缺少 title，使用传入的参数或生成默认值
                if "title" not in data or not data.get("title"):
                    if title:
                        data["title"] = title
                        logger.info(f"[JSON解析] 补充 title: {title}")
                    elif chapter_number is not None:
                        data["title"] = f"第{chapter_number}章"
                        logger.info(f"[JSON解析] 生成默认 title: {data['title']}")
                    else:
                        logger.warning(f"[JSON解析] ⚠️ JSON数据缺少 title 且未提供参数")
            
            # 7. 验证必需字段
            logger.debug(f"[JSON解析] 验证JSON数据结构，所有键: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
            
            if "chapter_number" not in data and "title" not in data:
                logger.warning(f"[JSON解析] ⚠️ JSON数据缺少章节基本信息（chapter_number 或 title）")
                logger.warning(f"[JSON解析] 当前数据键: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
                # 不返回None，因为可能只有analysis字段
            
            # 8. 验证是否包含大纲和细纲（支持新格式：metadata.outline 和 metadata.detailed_outline）
            detailed_outline = data.get("detailed_outline")
            outline = data.get("outline")

        
            if outline and detailed_outline:
                logger.info(f"[JSON解析] ✅ 章节包含完整的大纲和细纲数据")
                logger.debug(f"[JSON解析] outline类型: {type(outline)}, detailed_outline类型: {type(detailed_outline)}")
            
            logger.info(f"[JSON解析] ✅ 解析完成，返回数据")
            return data
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[JSON解析] ❌ 解析章节响应时发生异常: {e}")
            logger.error(f"[JSON解析] 异常类型: {type(e).__name__}")
            logger.error(f"[JSON解析] 原始响应长度: {len(ai_response) if ai_response else 0} 字符")
            if ai_response:
                logger.error(f"[JSON解析] 原始响应前1000字符: {ai_response[:1000]}")
            logger.error("=" * 80)
            logger.error("详细异常堆栈:", exc_info=True)
            return None

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
            
            # 2. 将角色和地点信息保存到 work_metadata
            characters_data = analysis_data.get("characters", [])
            locations_data = analysis_data.get("locations", [])
            
            if characters_data or locations_data:
                # 更新 work_metadata
                work_metadata = work.work_metadata or {}
                if characters_data:
                    work_metadata["characters"] = characters_data
                    logger.info(f"✅ 保存角色信息到 work_metadata: {len(characters_data)} 个")
                if locations_data:
                    work_metadata["locations"] = locations_data
                    logger.info(f"✅ 保存地点信息到 work_metadata: {len(locations_data)} 个")
                
                work.work_metadata = work_metadata
                await self.db.commit()
            
            # 4. 创建章节
            chapters_data = analysis_data.get("chapters", [])
            created_chapters = []
            for chapter_data in chapters_data:
                try:
                    chapter_number = chapter_data.get("chapter_number")
                    if chapter_number is None:
                        logger.warning("章节号缺失，跳过该章节")
                        continue
                    
                    # 提取大纲和细纲（现在直接是 outline 和 detailed_outline 两个字段）
                    outline = chapter_data.get("outline")
                    detailed_outline = chapter_data.get("detailed_outline")
                    
                    # 兼容旧格式：如果直接字段没有，尝试从 metadata 中获取
                    if not outline or not detailed_outline:
                        metadata = chapter_data.get("metadata", {})
                        if metadata:
                            outline = outline or metadata.get("outline")
                            detailed_outline = detailed_outline or metadata.get("detailed_outline")
                    
                    # 大纲和细纲现在是文本描述格式（纯文本字符串），直接使用
                    # 如果为空，使用空字符串
                    if not outline:
                        outline = ""
                    if not detailed_outline:
                        detailed_outline = ""
                    
                    # 确保是字符串类型
                    if not isinstance(outline, str):
                        outline = str(outline) if outline else ""
                    if not isinstance(detailed_outline, str):
                        detailed_outline = str(detailed_outline) if detailed_outline else ""
                    
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
                        summary=None,  # 新格式中没有summary字段
                        chapter_metadata={
                            "outline": outline,
                            "detailed_outline": detailed_outline,
                        },
                    )
                    
                    logger.info(f"✅ 章节 {chapter_number} 已保存，大纲: {bool(outline)}, 细纲: {bool(detailed_outline)}")
                    
                    # 在ShareDB中创建文档并保存章节内容
                    chapter_content = chapter_data.get("content", "")
                    
                    # 确保content是字符串格式
                    if isinstance(chapter_content, dict):
                        import json
                        chapter_content = json.dumps(chapter_content, ensure_ascii=False)
                    elif not isinstance(chapter_content, str):
                        chapter_content = str(chapter_content)
                    
                    # 保存章节内容到ShareDB（即使为空也创建文档，后续可以更新）
                        await self.sharedb_service.create_document(
                            document_id=f"chapter_{chapter.id}",
                            initial_content={
                                "title": chapter.title,
                            "content": chapter_content,  # 章节完整内容
                                "metadata": {
                                    "work_id": work.id,
                                    "chapter_number": chapter_number,
                                    "created_by": user_id,
                                }
                            }
                        )
                    logger.info(f"✅ 章节内容已保存到ShareDB: chapter_{chapter.id}, 内容长度: {len(chapter_content)}")
                    
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
            
            # 1. 插入新章节（新格式只包含 chapters 数据）
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
                    
                    # 提取大纲和细纲（现在直接是 outline 和 detailed_outline 两个字段）
                    outline = chapter_data.get("outline", "")
                    detailed_outline = chapter_data.get("detailed_outline", "")
                    
                    # 如果直接字段没有，尝试从 metadata 中获取（向后兼容）
                    if not outline or not detailed_outline:
                        metadata = chapter_data.get("metadata", {})
                        if metadata:
                            outline = outline or metadata.get("outline", "")
                            detailed_outline = detailed_outline or metadata.get("detailed_outline", "")
                    
                    # 大纲和细纲现在是文本描述格式（纯文本字符串），直接使用
                    # 如果为空，使用空字符串
                    if not outline:
                        outline = ""
                    if not detailed_outline:
                        detailed_outline = ""
                    
                    # 确保是字符串类型
                    if not isinstance(outline, str):
                        outline = str(outline) if outline else ""
                    if not isinstance(detailed_outline, str):
                        detailed_outline = str(detailed_outline) if detailed_outline else ""
                    
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
                        summary=None,  # 新格式中没有summary字段
                        chapter_metadata={
                            "outline": outline,
                            "detailed_outline": detailed_outline,
                        },
                    )
                    
                    logger.info(f"✅ 渐进式插入 - 章节 {chapter_number} 已保存，大纲: {bool(outline)}, 细纲: {bool(detailed_outline)}")
                    
                    # 在ShareDB中创建文档（新格式中没有content字段，使用空字符串）
                    chapter_content = ""
                    
                    # 确保content是字符串格式
                    if isinstance(chapter_content, dict):
                        import json
                        chapter_content = json.dumps(chapter_content, ensure_ascii=False)
                    elif not isinstance(chapter_content, str):
                        chapter_content = str(chapter_content)
                    
                    # 保存章节内容到ShareDB（即使为空也创建文档，后续可以更新）
                        await self.sharedb_service.create_document(
                            document_id=f"chapter_{chapter.id}",
                            initial_content={
                                "title": chapter.title,
                            "content": chapter_content,  # 章节完整内容
                                "metadata": {
                                    "work_id": work_id,
                                    "chapter_number": chapter_number,
                                    "created_by": user_id,
                                }
                            }
                        )
                    logger.info(f"✅ 章节内容已保存到ShareDB: chapter_{chapter.id}, 内容长度: {len(chapter_content)}")
                    
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
                    "outline": existing_chapter.chapter_metadata.get("outline", "") if existing_chapter.chapter_metadata else "",
                    "detailed_outline": existing_chapter.chapter_metadata.get("detailed_outline", "") if existing_chapter.chapter_metadata else "",
                    "skipped": True,
                    "work_created": work_created
                }
            
            # 3. 获取prompt模板（system_prompt 和 user_prompt）
            system_prompt = None
            user_prompt = None
            
            if not prompt:
                prompt_template = await self.get_default_prompt_template("chapter_analysis")
                if prompt_template:
                    # 从模板的 metadata 中提取 system_prompt 和 user_prompt
                    template_metadata = prompt_template.template_metadata or {}
                    system_prompt = template_metadata.get("system_prompt")
                    user_prompt = template_metadata.get("user_prompt")
                    
                    # 如果 metadata 中没有，则使用 prompt_content 作为 user_prompt
                    if not user_prompt:
                        user_prompt = prompt_template.format_prompt(content=content)
                    else:
                        # 如果 user_prompt 中有 {content} 变量，需要替换
                        user_prompt = user_prompt.replace("{content}", content)
                else:
                    # 使用默认prompt
                    user_prompt = f"请分析以下章节内容，并输出JSON格式的分析结果，包含大纲和细纲：\n\n{content}"
            else:
                # 如果提供了 prompt，将其作为 user_prompt
                user_prompt = prompt.replace("{content}", content) if "{content}" in prompt else prompt
            
            # 4. 调用AI分析
            full_response = ""
            model = settings.get("model", "gpt-3.5-turbo") if settings else "gpt-3.5-turbo"
            temperature = settings.get("temperature", 0.7) if settings else 0.7
            max_tokens = settings.get("max_tokens", 20000) if settings else 20000
            
            async for message in ai_service.analyze_chapter_stream(
                content=content,
                prompt=user_prompt,
                system_prompt=system_prompt,
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
            import os
            from datetime import datetime
            
            logger.info(f"[章节分析] 开始解析AI响应，响应长度: {len(full_response)} 字符")
            logger.debug(f"[章节分析] AI响应前500字符: {full_response[:500]}")
            
            # 保存完整AI响应到文件
            debug_dir = "/tmp/writerai_debug"
            os.makedirs(debug_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            full_response_file = os.path.join(debug_dir, f"full_ai_response_{timestamp}.txt")
            with open(full_response_file, 'w', encoding='utf-8') as f:
                f.write(full_response)
            logger.info(f"[章节分析] 💾 完整AI响应已保存到: {full_response_file}")
            
            chapter_data = self.parse_single_chapter_response(
                full_response,
                chapter_number=chapter_number,
                title=None  # 让AI从内容中提取标题，如果没有则使用默认值
            )
            
            # 保存解析后的章节数据到文件
            if chapter_data:
                import os
                from datetime import datetime
                import json
                
                debug_dir = "/tmp/writerai_debug"
                os.makedirs(debug_dir, exist_ok=True)
                parsed_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                chapter_data_file = os.path.join(debug_dir, f"parsed_chapter_data_{parsed_timestamp}.json")
                with open(chapter_data_file, 'w', encoding='utf-8') as f:
                    json.dump(chapter_data, f, ensure_ascii=False, indent=2)
                logger.info(f"[章节分析] 💾 解析后的章节数据已保存到: {chapter_data_file}")
            
            if not chapter_data:
                logger.error("=" * 80)
                logger.error("[章节分析] ❌ AI返回的数据格式不正确，无法解析")
                logger.error(f"[章节分析] 完整AI响应长度: {len(full_response)} 字符")
                logger.error(f"[章节分析] 完整AI响应前2000字符:")
                logger.error(full_response[:2000])
                logger.error(f"[章节分析] 完整AI响应后500字符:")
                logger.error(full_response[-500:] if len(full_response) > 500 else full_response)
                logger.error("=" * 80)
                raise ValueError("AI返回的数据格式不正确，无法解析。请查看日志获取详细信息。")
            
            # 提取大纲和细纲（现在直接是 outline 和 detailed_outline 两个字段）
            # 兼容旧格式：metadata.outline 和 metadata.detailed_outline
            outline = chapter_data.get("outline")
            detailed_outline = chapter_data.get("detailed_outline")
            
            
            # 大纲和细纲现在是文本描述格式（纯文本字符串），直接使用
            # 如果为空，使用空字符串
            if not outline:
                outline = ""
            if not detailed_outline:
                detailed_outline = ""
            
            # 确保是字符串类型
            if not isinstance(outline, str):
                outline = str(outline) if outline else ""
            if not isinstance(detailed_outline, str):
                detailed_outline = str(detailed_outline) if detailed_outline else ""
            
            # 6. 创建章节
            chapter = await self.chapter_service.create_chapter(
                work_id=work.id,
                title=chapter_data.get("title", f"第{chapter_number}章"),
                chapter_number=chapter_number,
                volume_number=volume_number,
                summary="",
                chapter_metadata={
                    "outline": outline,
                    "detailed_outline": detailed_outline,
                },
            )
            
            # 确保章节对象已刷新，避免异步访问错误
            await self.db.refresh(chapter)
            
            # 在刷新后立即获取ID和title，避免后续访问时出错
            chapter_id = chapter.id
            chapter_title = chapter.title
            
            logger.info(f"✅ 创建章节成功: {chapter_id} - {chapter_title} (大纲: {bool(outline)}, 细纲: {bool(detailed_outline)})")
            
            # 7. 在ShareDB中创建文档并保存章节内容
            # 优先使用AI分析返回的content，如果没有则使用原始content
            chapter_content = chapter_data.get("content", "")
            if not chapter_content or not chapter_content.strip():
                # 如果AI返回的content为空，使用原始content
                chapter_content = content
            
            # 确保content是字符串格式
            if isinstance(chapter_content, dict):
                import json
                chapter_content = json.dumps(chapter_content, ensure_ascii=False)
            elif not isinstance(chapter_content, str):
                chapter_content = str(chapter_content)
            
            # 保存章节内容到ShareDB
                await self.sharedb_service.create_document(
                document_id=f"chapter_{chapter_id}",
                    initial_content={
                    "title": chapter_title,
                    "content": chapter_content,  # 章节完整内容
                        "metadata": {
                            "work_id": work.id,
                            "chapter_number": chapter_number,
                            "volume_number": volume_number,
                            "created_by": user_id,
                        }
                    }
                )
            logger.info(f"✅ 章节内容已保存到ShareDB: chapter_{chapter_id}, 内容长度: {len(chapter_content)}")
            
            # 8. 更新作品统计信息
            await self.work_service.update_work(
                work_id=work.id,
                chapter_count=work.chapter_count + 1,
            )
            
            # 保存最终处理结果到文件
            import os
            from datetime import datetime
            import json
            
            debug_dir = "/tmp/writerai_debug"
            os.makedirs(debug_dir, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            result_file = os.path.join(debug_dir, f"chapter_insert_result_{timestamp}.json")
            result_data = {
                "work_id": work.id,
                "work_title": work.title,
                "chapter_id": chapter_id,
                "chapter_number": chapter_number,
                "volume_number": volume_number,
                "title": chapter_title,
                "outline": outline,
                "detailed_outline": detailed_outline,
                "work_created": work_created,
                "chapter_content_length": len(chapter_content),
            }
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(result_data, f, ensure_ascii=False, indent=2)
            logger.info(f"[章节分析] 💾 章节插入结果已保存到: {result_file}")
            
            return result_data
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[章节分析] ❌ 基于文件名的章节分析失败")
            logger.error(f"[章节分析] 异常类型: {type(e).__name__}")
            logger.error(f"[章节分析] 异常消息: {str(e)}")
            logger.error(f"[章节分析] 文件名: {file_name}")
            logger.error(f"[章节分析] 章节号: {chapter_number}, 卷号: {volume_number}")
            logger.error(f"[章节分析] 内容长度: {len(content) if content else 0} 字符")
            logger.error("=" * 80)
            logger.error("详细异常堆栈:", exc_info=True)
            await self.db.rollback()
            raise

    async def create_work_and_chapters_from_file(
        self,
        file_name: str,
        chapters_data: List[Dict[str, Any]],
        user_id: int
    ) -> Dict[str, Any]:
        """
        直接从文件创建作品和章节（不进行AI分析）
        
        Args:
            file_name: 文件名，用于查找或创建作品
            chapters_data: 章节数据列表，每个元素包含 {chapter_number, title, content, volume_number}
            user_id: 用户ID
        
        Returns:
            包含作品和章节信息的字典
        """
        import traceback
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
                        "split_mode": "file_based"
                    }
                )
                work_created = True
                logger.info(f"✅ 创建新作品: {work.id} - {work.title} (来源文件: {file_name})")
            else:
                logger.info(f"✅ 找到已存在作品: {work.id} - {work.title}")
            
            # 2. 创建章节
            created_chapters = []
            skipped_chapters = []
            
            for chapter_info in chapters_data:
                chapter_number = chapter_info.get("chapter_number", 0)
                volume_number = chapter_info.get("volume_number", 1)
                title = chapter_info.get("title", f"第{chapter_number}章")
                content = chapter_info.get("content", "")
                
                # 检查章节是否已存在
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
                    skipped_chapters.append({
                        "chapter_id": existing_chapter.id,
                        "chapter_number": chapter_number,
                        "volume_number": volume_number,
                        "title": existing_chapter.title
                    })
                    continue
                
                # 创建章节（不包含大纲和细纲，这些后续通过AI分析添加）
                chapter = await self.chapter_service.create_chapter(
                    work_id=work.id,
                    title=title,
                    chapter_number=chapter_number,
                    volume_number=volume_number,
                    summary="",
                    chapter_metadata={},  # 初始为空，后续通过AI分析填充
                )
                
                # 确保章节对象已刷新
                await self.db.refresh(chapter)
                
                logger.info(f"✅ 创建章节成功: {chapter.id} - {chapter.title}")
                
                # 3. 在ShareDB中创建文档并保存章节内容
                # 使用 work_{work_id}_chapter_{chapter_id} 格式，与前端保持一致
                document_id = f"work_{work.id}_chapter_{chapter.id}"
                await self.sharedb_service.create_document(
                    document_id=document_id,
                    initial_content={
                        "title": title,
                        "content": content,  # 章节完整内容
                        "metadata": {
                            "work_id": work.id,
                            "chapter_number": chapter_number,
                            "volume_number": volume_number,
                        }
                    }
                )
                
                logger.info(f"✅ ShareDB文档创建成功: {document_id}")
                
                created_chapters.append({
                    "chapter_id": chapter.id,
                    "chapter_number": chapter_number,
                    "volume_number": volume_number,
                    "title": title
                })
            
            # 4. 更新作品统计信息（使用实际创建的章节数量）
            if created_chapters:
                # 获取当前章节数量
                from sqlalchemy import func
                stmt = select(func.count(Chapter.id)).where(Chapter.work_id == work.id)
                result = await self.db.execute(stmt)
                current_count = result.scalar() or 0
                
                await self.work_service.update_work(
                    work_id=work.id,
                    chapter_count=current_count,
                )
            
            return {
                "work_id": work.id,
                "work_title": work.title,
                "work_created": work_created,
                "chapters_created": len(created_chapters),
                "chapters_skipped": len(skipped_chapters),
                "created_chapters": created_chapters,
                "skipped_chapters": skipped_chapters
            }
            
        except Exception as e:
            logger.error(f"创建作品和章节失败: {traceback.format_exc()}")
            await self.db.rollback()
            raise

