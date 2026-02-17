"""
提及替换服务
处理聊天消息中的 @chapter:123 和 @character:456 格式的提及，替换为实际内容
"""

import re
import json
import asyncio
import html
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from memos.api.services.chapter_service import ChapterService
from memos.api.services.sharedb_service import ShareDBService
from memos.api.services.work_service import WorkService
from memos.log import get_logger

logger = get_logger(__name__)


def _content_to_plain_text(content: str) -> str:
    """
    将章节内容转为与前端一致的纯文本，用于按「第n-m字」切片。
    前端用 ProseMirror doc.textBetween(0, n, '') 得到纯文本（无块间分隔），
    后端从 ShareDB 拿到的是 HTML，需先剥标签、再按字符位置切才能对齐。
    """
    if not content:
        return ""
    # 已是纯文本（无标签）则直接返回
    if "<" not in content or ">" not in content:
        return content
    # 去掉 script/style 及其内容
    text = re.sub(r"<script[^>]*>.*?</script>", "", content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # 块级换行：与 ProseMirror 用 '' 作 block 分隔一致，这里不插入换行，只剥标签
    text = re.sub(r"<br\s*/?>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>|</div>|</h[1-6]>", "", text, flags=re.IGNORECASE)
    # 去掉所有剩余标签
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return text


class MentionService:
    """提及替换服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.chapter_service = ChapterService(db)
        self.work_service = WorkService(db)
        self.sharedb_service = ShareDBService()
        self._sharedb_initialized = False
    
    def _extract_work_id_from_user_id(self, user_id: str) -> Optional[str]:
        """从 user_id 格式 user_{userId}_work_{workId} 中提取 work_id（40位字符串）"""
        try:
            # 格式：user_{userId}_work_{workId}
            if '_work_' in user_id:
                parts = user_id.split('_work_')
                if len(parts) == 2:
                    work_id_str = parts[1]
                    return work_id_str
        except (ValueError, IndexError) as e:
            logger.warning(f"无法从 user_id {user_id} 中提取 work_id: {e}")
        return None
    
    async def replace_mentions_in_text(self, text: str, user_id: Optional[str] = None) -> str:
        """
        替换文本中的提及标识为实际内容
        
        Args:
            text: 包含提及标识的文本，格式如 @chapter:123 或 @character:角色名称
            user_id: 用户ID，用于提取work_id（格式：user_{userId}_work_{workId}）
        
        Returns:
            替换后的文本
        """
        if not text:
            return text
        
        # 替换章节提及 @chapter:123
        text = await self._replace_chapter_mentions(text)
        
        # 替换角色提及 @character:角色名称（从作品metadata中获取）
        text = await self._replace_character_mentions(text, user_id)
        
        return text
    
    async def _get_chapter_content(self, chapter) -> str:
        """获取章节正文（纯文本），失败返回空字符串。"""
        try:
            if not self._sharedb_initialized:
                try:
                    await self.sharedb_service.initialize()
                    self._sharedb_initialized = True
                except Exception as init_err:
                    logger.warning(f"ShareDB服务初始化失败: {init_err}")
                    return ""
            document_id = f"work_{chapter.work_id}_chapter_{chapter.id}"
            document = await self.sharedb_service.get_document(document_id)
            if not document:
                document = await self.sharedb_service.get_document(f"chapter_{chapter.id}")
            if not document:
                return ""
            doc_content = document.get("content", "")
            if isinstance(doc_content, str):
                return doc_content or ""
            if isinstance(doc_content, dict):
                return (
                    doc_content.get("text", "")
                    or doc_content.get("content", "")
                    or doc_content.get("delta", "")
                    or ""
                )
            return str(doc_content) if doc_content else ""
        except Exception as e:
            logger.error(f"获取章节 {chapter.id} 内容时出错: {e}", exc_info=True)
            return ""

    async def _replace_chapter_mentions(self, text: str) -> str:
        """替换章节提及。支持 @chapter:id 与 @chapter:id 第start-end字（按字数范围替换为正文片段）。"""
        # 先匹配带字数的，再匹配仅 id，避免重复匹配
        pattern = r'@chapter:(\d+)(?:\s*第(\d+)-(\d+)字)?'

        async def replace_match(match):
            chapter_id = int(match.group(1))
            start_s = match.group(2)
            end_s = match.group(3)
            char_range = None
            if start_s is not None and end_s is not None:
                try:
                    start_i = int(start_s)
                    end_i = int(end_s)
                    if start_i >= 1 and end_i >= start_i:
                        char_range = (start_i, end_i)  # 第n字 = 1-based，切片用 (start_i-1, end_i)
                except ValueError:
                    pass

            try:
                chapter = await self.chapter_service.get_chapter_by_id(chapter_id)
                if not chapter:
                    logger.warning(f"章节 {chapter_id} 不存在")
                    return f"\n\n【章节引用：章节#{chapter_id}（不存在）】\n该章节在数据库中不存在，请检查章节ID是否正确。\n"

                chapter_title = chapter.title or f"章节#{chapter_id}"
                chapter_number = getattr(chapter, 'chapter_number', None)
                chapter_info = f"【章节引用：{chapter_title}"
                if chapter_number:
                    chapter_info += f"（第{chapter_number}章）"
                if char_range:
                    chapter_info += f"，第{char_range[0]}-{char_range[1]}字"
                chapter_info += "】\n"

                content = await self._get_chapter_content(chapter)
                if not content or not content.strip():
                    content_preview = "（内容为空）"
                elif char_range:
                    # 前端按纯文本（doc.textBetween）计字数，后端存的是 HTML，需先转纯文再按位置切
                    plain = _content_to_plain_text(content)
                    start_0 = max(0, char_range[0] - 1)
                    end_0 = min(len(plain), char_range[1])
                    content_preview = plain[start_0:end_0] if end_0 > start_0 else "（指定范围无内容）"
                else:
                    content_preview = content[:1000] if len(content) > 1000 else content
                    if len(content) > 1000:
                        content_preview += "..."

                metadata_parts = []
                if hasattr(chapter, 'word_count') and chapter.word_count:
                    metadata_parts.append(f"字数：{chapter.word_count}")
                if hasattr(chapter, 'status') and chapter.status:
                    metadata_parts.append(f"状态：{chapter.status}")
                metadata_text = f"\n元数据：{', '.join(metadata_parts)}\n" if metadata_parts else ""
                return f"\n\n{chapter_info}{metadata_text}内容预览：\n{content_preview}\n"
            except Exception as e:
                logger.error(f"替换章节提及失败 {chapter_id}: {e}", exc_info=True)
                return f"\n\n【章节引用：章节#{chapter_id}（获取失败）】\n错误信息：{str(e)[:200]}\n"

        matches = list(re.finditer(pattern, text))
        if not matches:
            return text
        replacements = await asyncio.gather(*[replace_match(m) for m in matches])
        result = text
        for match, replacement in zip(reversed(matches), reversed(replacements)):
            start, end = match.span()
            result = result[:start] + replacement + result[end:]
        return result
    
    async def _replace_character_mentions(self, text: str, user_id: Optional[str] = None) -> str:
        """替换角色提及（从作品metadata中获取）"""
        # 匹配 @character:角色名称 格式
        pattern = r'@character:([^@\s]+)'
        
        # 获取作品ID
        work_id = None
        work_metadata = {}
        if user_id:
            work_id = self._extract_work_id_from_user_id(user_id)
            if work_id:
                try:
                    work = await self.work_service.get_work_by_id(work_id)
                    if work:
                        work_metadata = work.work_metadata or {}
                except Exception as e:
                    logger.warning(f"获取作品 {work_id} 失败: {e}")
        
        async def replace_match(match):
            character_name = match.group(1).strip()
            try:
                # 从作品metadata的component_data中查找角色
                component_data = work_metadata.get("component_data", {})
                characters = component_data.get("characters", [])
                character = None
                
                # 尝试匹配角色名称
                for char in characters:
                    if not isinstance(char, dict):
                        continue
                    char_name = char.get("name", "")
                    char_display_name = char.get("display_name", "")
                    if char_name == character_name or char_display_name == character_name:
                        character = char
                        break
                
                if not character:
                    logger.warning(f"角色 '{character_name}' 在作品 {work_id} 的metadata中不存在")
                    return f"\n\n【角色引用：{character_name}（不存在）】\n该角色在作品信息中不存在，请检查角色名称是否正确。\n"
                
                # 构建角色信息
                name = character.get("display_name") or character.get("name") or character_name
                description = character.get("description") or ""
                personality = character.get("personality") or {}
                appearance = character.get("appearance") or {}
                background = character.get("background") or {}
                
                # 构建替换文本
                info_parts = []
                if description:
                    info_parts.append(f"简介：{description}")
                if personality:
                    if isinstance(personality, dict):
                        personality_str = ", ".join([f"{k}: {v}" for k, v in personality.items()])
                        if personality_str:
                            info_parts.append(f"性格：{personality_str}")
                    else:
                        info_parts.append(f"性格：{personality}")
                if appearance:
                    if isinstance(appearance, dict):
                        appearance_str = ", ".join([f"{k}: {v}" for k, v in appearance.items()])
                        if appearance_str:
                            info_parts.append(f"外貌：{appearance_str}")
                    else:
                        info_parts.append(f"外貌：{appearance}")
                if background:
                    if isinstance(background, dict):
                        background_str = ", ".join([f"{k}: {v}" for k, v in background.items()])
                        if background_str:
                            info_parts.append(f"背景：{background_str}")
                    else:
                        info_parts.append(f"背景：{background}")
                
                # 如果角色信息中有其他字段，也一并显示
                for key, value in character.items():
                    if key not in ["name", "display_name", "description", "personality", "appearance", "background"]:
                        if value:
                            if isinstance(value, dict):
                                value_str = json.dumps(value, ensure_ascii=False)
                            else:
                                value_str = str(value)
                            if value_str and value_str.strip():
                                info_parts.append(f"{key}：{value_str[:100]}")
                
                info_text = "\n".join(info_parts) if info_parts else "（暂无详细信息）"
                replacement = f"\n\n【角色引用：{name}】\n{info_text}\n"
                return replacement
                
            except Exception as e:
                logger.error(f"替换角色提及失败 '{character_name}': {e}", exc_info=True)
                return f"\n\n【角色引用：{character_name}（获取失败）】\n错误信息：{str(e)[:200]}\n"
        
        # 使用异步替换
        matches = list(re.finditer(pattern, text))
        if not matches:
            return text
        
        replacements = await asyncio.gather(*[replace_match(m) for m in matches])
        
        # 从后往前替换，避免索引变化
        result = text
        for match, replacement in zip(reversed(matches), reversed(replacements)):
            start, end = match.span()
            result = result[:start] + replacement + result[end:]
        
        return result
    
    async def replace_mentions_in_history(self, history: list, user_id: Optional[str] = None) -> list:
        """
        替换对话历史中的提及
        
        Args:
            history: 对话历史列表，每个元素包含 role 和 content
            user_id: 用户ID，用于提取work_id
        
        Returns:
            替换后的对话历史
        """
        if not history:
            return history
        
        replaced_history = []
        for msg in history:
            if isinstance(msg, dict) and 'content' in msg:
                new_msg = msg.copy()
                new_msg['content'] = await self.replace_mentions_in_text(msg['content'], user_id)
                replaced_history.append(new_msg)
            else:
                replaced_history.append(msg)
        
        return replaced_history

