"""
AI接口路由
提供章节分析、健康检查和默认提示词接口
"""

# 标准库导入
import json
import traceback
from datetime import datetime, timezone
from typing import Optional

# 第三方库导入
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm.attributes import flag_modified

# 本地应用导入
from memos.api.ai_models import (
    AnalyzeChapterRequest,
    AnalyzeChapterByFileRequest,
    CreateWorkFromFileRequest,
    GenerateChapterContentRequest,
    GenerateComponentDataRequest,
    GenerateChapterOutlineRequest,
    DefaultPromptData,
    DefaultPromptResponse,
    ErrorResponse,
    HealthCheckData,
    HealthCheckResponse,
    AnalysisSettings,
)
from memos.api.core.database import get_async_db
from memos.api.models.chapter import Chapter
from memos.api.models.prompt_template import PromptTemplate
from memos.api.models.template import WorkTemplate
from memos.api.routers.auth_router import get_current_user_id
from memos.api.services.ai_service import get_ai_service
from memos.api.services.book_analysis_service import BookAnalysisService
from memos.api.services.chapter_service import ChapterService
from memos.api.services.sharedb_service import ShareDBService
from memos.api.services.work_service import WorkService
from memos.api.services.yjs_ws_handler import yjs_ws_manager
from memos.log import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Analysis"])


def convert_text_to_html(text: str) -> str:
    """
    将纯文本转换为HTML格式（与前端逻辑保持一致）
    换行符转换为段落，多个连续换行符转换为段落分隔
    
    Args:
        text: 纯文本内容
        
    Returns:
        HTML格式的字符串
    """
    import re
    
    if not text or not text.strip():
        return '<p></p>'
    
    # 检测是否已经是HTML格式（包含HTML标签）
    html_tag_pattern = re.compile(r'</?[a-z][\s\S]*>', re.IGNORECASE)
    has_html_tags = html_tag_pattern.search(text)
    
    if has_html_tags:
        trimmed = text.strip()
        # 如果已经是完整的HTML格式，直接返回
        if trimmed.startswith('<') and trimmed.endswith('>'):
            return text
        # 如果包含HTML标签但格式不完整，直接返回（前端会处理）
        if '<p>' in trimmed or '<br>' in trimmed or '<div>' in trimmed:
            return text
    
    # 将纯文本转换为HTML：换行符转换为段落
    # 多个连续换行符转换为段落分隔
    paragraphs = re.split(r'\n\s*\n', text)
    html_parts = []
    
    for para in paragraphs:
        para = para.strip()
        if para:
            # 段落内的单换行符转换为 <br>
            para_html = para.replace('\n', '<br>')
            html_parts.append(f'<p>{para_html}</p>')
    
    return ''.join(html_parts) if html_parts else '<p></p>'


# 辅助函数：确保返回的是 AsyncSession 对象，而不是生成器
async def get_db_session(db: AsyncSession = Depends(get_async_db)) -> AsyncSession:
    """
    确保返回的是 AsyncSession 对象，而不是生成器
    FastAPI 的 Depends 应该已经处理了生成器，但为了安全起见，我们再次检查
    """
    # FastAPI 的 Depends 应该已经处理了生成器，直接返回
    # 但如果仍然是生成器，尝试获取会话对象
    if hasattr(db, '__aiter__') and not hasattr(db, 'execute'):
        # 如果是生成器，尝试获取会话对象
        try:
            db = await db.__anext__()
        except StopAsyncIteration:
            raise ValueError("无法从生成器获取数据库会话")
    
    return db



@router.post(
    "/analyze-work-chapters",
    summary="分析作品所有章节接口",
    description="直接分析作品的所有章节，后端自动获取章节内容并逐章处理（非流式响应）",
    responses={
        200: {"description": "分析成功，返回JSON响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_work_chapters(
    work_id: int = Query(..., description="作品ID"),
    settings: Optional[AnalysisSettings] = None,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    分析作品的所有章节，后端自动获取章节内容并逐章处理
    
    Args:
        work_id: 作品ID
        settings: 分析设置（可选）
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        JSONResponse: JSON格式的分析结果
    """
    try:
        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

        # 获取服务
        book_analysis_service = BookAnalysisService(db)
        chapter_service = ChapterService(db)
        sharedb_service = ShareDBService()
        await sharedb_service.initialize()
        
        # 检查作品权限
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        if not work:
            raise HTTPException(status_code=404, detail="作品不存在")
        if work.owner_id != current_user_id:
            raise HTTPException(status_code=403, detail="没有权限编辑该作品")

        # 获取所有章节（不分页，获取全部）
        chapters, total = await chapter_service.get_chapters(
            filters={"work_id": work_id},
            page=1,
            size=10000,  # 设置一个很大的值以获取所有章节
            sort_by="chapter_number",
            sort_order="asc"
        )
        
        if total == 0:
            raise HTTPException(status_code=400, detail="该作品没有章节")

        # 获取增强的prompt模板
        prompt_template_obj = await book_analysis_service.get_default_prompt_template("book_analysis")
        if prompt_template_obj:
            enhanced_prompt_template = prompt_template_obj.prompt_content
        else:
            enhanced_prompt_template = book_analysis_service.get_enhanced_book_analysis_prompt()

        # 获取分析设置
        if settings:
            analysis_settings = settings
        else:
            analysis_settings = AnalysisSettings()

        logger.info(
            f"Received work chapters analysis request: "
            f"work_id={work_id}, "
            f"chapters_count={total}, "
            f"model={analysis_settings.model}"
        )

        # 执行非流式分析
        try:
            import json
            
            logger.info(f"开始分析作品《{work.title}》的所有章节，共 {total} 章")
            
            results = []  # 存储每章的分析结果
            skipped = []  # 存储跳过的章节
            errors = []  # 存储错误信息
            
            # 获取作品信息中的分析prompt
            work_metadata = work.work_metadata or {}
            template_config = work_metadata.get("template_config")
            template_id = None
            analysis_prompt_template = None
            
            # 从 work_metadata.template_config.templateId 中获取 template_id
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
            
            # 查找单章分析prompt（template_type == "chapter_analysis"），优先从数据库获取
            chapter_analysis_prompt_template = None
            if template_id:
                logger.info(f"🔍 开始查找单章分析prompt（template_type=chapter_analysis），template_id: {template_id}")
                try:
                    # 优先查找该模板的章节分析prompt
                    prompt_stmt = select(PromptTemplate).where(
                        and_(
                            PromptTemplate.work_template_id == template_id,
                            PromptTemplate.template_type == "chapter_analysis",
                            PromptTemplate.is_active == True
                        )
                    ).order_by(PromptTemplate.is_default.desc(), PromptTemplate.id.asc())
                    prompt_result = await db.execute(prompt_stmt)
                    chapter_analysis_templates = prompt_result.scalars().all()
                    
                    if chapter_analysis_templates:
                        chapter_analysis_prompt_template = chapter_analysis_templates[0]
                        logger.info(f"✅ 找到数据库中的单章分析prompt: id={chapter_analysis_prompt_template.id}, name={chapter_analysis_prompt_template.name}, prompt_content长度={len(chapter_analysis_prompt_template.prompt_content)}")
                except Exception as e:
                    logger.error(f"❌ 从 prompt_template 表查询单章分析prompt失败: {e}")
                    logger.error(f"详细错误: {traceback.format_exc()}")
            
            # 如果没有找到，尝试查找全局的默认单章分析prompt
            if not chapter_analysis_prompt_template:
                logger.info("🔍 未找到模板相关的单章分析prompt，尝试查找全局默认的")
                try:
                    prompt_stmt = select(PromptTemplate).where(
                        and_(
                            PromptTemplate.template_type == "chapter_analysis",
                            PromptTemplate.is_default == True,
                            PromptTemplate.is_active == True
                        )
                    ).order_by(PromptTemplate.created_at.desc())
                    prompt_result = await db.execute(prompt_stmt)
                    global_chapter_analysis_template = prompt_result.scalar_one_or_none()
                    
                    if global_chapter_analysis_template:
                        chapter_analysis_prompt_template = global_chapter_analysis_template
                        logger.info(f"✅ 找到全局默认的单章分析prompt: id={chapter_analysis_prompt_template.id}, name={chapter_analysis_prompt_template.name}")
                except Exception as e:
                    logger.warning(f"查询全局默认单章分析prompt失败: {e}")
            
            # 如果仍然没有找到，使用内置的默认prompt
            if not chapter_analysis_prompt_template:
                logger.info("📝 未找到数据库中的单章分析prompt，使用内置的默认prompt")
                chapter_analysis_prompt_template = PromptTemplate()
                chapter_analysis_prompt_template.prompt_content = book_analysis_service._get_builtin_chapter_analysis_prompt()
                logger.info(f"内置默认单章分析prompt长度: {len(chapter_analysis_prompt_template.prompt_content)}")
   
            # 初始化 PromptContextService 用于变量替换
            from memos.api.services.prompt_context_service import PromptContextService
            prompt_service = PromptContextService(db)
            await prompt_service.initialize()
        
            # 工具函数：解析 AI 响应并只保留章节分析所需字段
            def parse_ai_chapters(full_response: str):
                import re
                import json
                
                json_match = re.search(r'```json\s*(\[.*?\]|\{.*?\})\s*```', full_response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(1)
                    logger.debug("AI响应中从 ```json 代码块提取JSON")
                else:
                    json_match = re.search(r'(\[.*?\]|\{.*\})', full_response, re.DOTALL)
                    if json_match:
                        json_str = json_match.group(0)
                        logger.debug("AI响应中从纯文本提取JSON")
                    else:
                        logger.error(f"无法在AI响应中找到JSON数据，响应内容: {full_response[:1000]}")
                        raise ValueError("无法在AI响应中找到JSON数据")
                
                try:
                    parsed_data = json.loads(json_str)
                except json.JSONDecodeError as e:
                    logger.error(f"JSON解析失败: {e}")
                    logger.error(f"JSON字符串: {json_str[:500]}")
                    raise ValueError(f"JSON解析失败: {str(e)}")
                
                chapters_data = []
                if isinstance(parsed_data, dict):
                    if "chapters" in parsed_data and isinstance(parsed_data["chapters"], list):
                        chapters_data = parsed_data["chapters"]
                    elif "chapter_number" in parsed_data:
                        chapters_data = [parsed_data]
                elif isinstance(parsed_data, list):
                    chapters_data = parsed_data
                
                if not chapters_data:
                    logger.warning("直接解析失败，尝试 parse_single_chapter_response")
                    single_chapter_data = book_analysis_service.parse_single_chapter_response(full_response)
                    if single_chapter_data and isinstance(single_chapter_data, dict):
                        if "chapter_number" in single_chapter_data:
                            chapters_data = [single_chapter_data]
                        elif "chapters" in single_chapter_data and isinstance(single_chapter_data["chapters"], list):
                            chapters_data = single_chapter_data["chapters"]
                
                if not chapters_data:
                    logger.error(f"无法从AI响应中提取章节数据，解析后的数据类型: {type(parsed_data).__name__}")
                    raise ValueError(f"无法从AI响应中提取章节数据，解析后的数据类型: {type(parsed_data).__name__}")
                
                allowed_fields = {"chapter_number", "title", "summary", "outline", "detailed_outline"}
                sanitized = []
                for item in chapters_data:
                    if isinstance(item, dict):
                        sanitized.append({k: v for k, v in item.items() if k in allowed_fields})
                    else:
                        sanitized.append(item)
                return sanitized
            
            # 每3章作为一个批次处理
            batch_size = 3
            chapter_batches = []
            for i in range(0, len(chapters), batch_size):
                batch = chapters[i:i + batch_size]
                chapter_batches.append(batch)
            
            logger.info(f"将 {total} 章分为 {len(chapter_batches)} 个批次，每批次 {batch_size} 章")
            
            for batch_idx, chapter_batch in enumerate(chapter_batches, 1):
                logger.info(f"开始处理第 {batch_idx} 批次，包含 {len(chapter_batch)} 章")
                
                # 收集当前批次的章节内容
                batch_chapters_data = []  # 存储每章的内容和元数据
                batch_content = ""  # 合并的章节内容

            for chapter in chapter_batch:
                chapter_content = ""
                try:
                    # 优先从 ShareDB 获取
                    document_id_new = f"work_{work_id}_chapter_{chapter.id}"
                    document_id_old = f"chapter_{chapter.id}"
                    
                    document = await sharedb_service.get_document(document_id_new)
                    if not document:
                        document = await sharedb_service.get_document(document_id_old)
                    
                    if document:
                        content = document.get("content", "")
                        if isinstance(content, dict):
                            content = content.get("content", "") or json.dumps(content, ensure_ascii=False)
                        elif not isinstance(content, str):
                            content = str(content)
                        chapter_content = content
                    else:
                        # 如果 ShareDB 没有，尝试从章节元数据获取
                        if chapter.chapter_metadata and isinstance(chapter.chapter_metadata, dict):
                            chapter_content = chapter.chapter_metadata.get("content", "")
                        
                        if not chapter_content:
                            logger.warning(f"章节 {chapter.id} 没有找到内容，跳过")
                            skipped.append({
                                "chapter_index": chapter.chapter_number,
                                "chapter_id": chapter.id,
                                "chapter_number": chapter.chapter_number,
                                "chapter_title": chapter.title,
                                "message": f"第 {chapter.chapter_number} 章《{chapter.title}》没有内容，跳过"
                            })
                            continue
                except Exception as e:
                    logger.error(f"获取章节 {chapter.id} 内容失败: {traceback.format_exc()}")
                    errors.append({
                        "chapter_index": chapter.chapter_number,
                        "chapter_id": chapter.id,
                        "message": f"第 {chapter.chapter_number} 章《{chapter.title}》获取内容失败: {str(e)}",
                        "error": str(e)
                    })
                    continue
                
                # 保存章节数据和内容
                batch_chapters_data.append({
                    "chapter": chapter,
                    "content": chapter_content
                })
                batch_content += f"第{chapter.chapter_number}章 {chapter.title}\n\n{chapter_content}\n\n"
            
                if not batch_chapters_data:
                    logger.warning(f"批次 {batch_idx} 没有有效章节，跳过")
                    continue
            
            try:
                # 第一步：使用默认的单章分析prompt分析章节（生成大纲、细纲）
                logger.info(f"🔄 批次 {batch_idx} 开始格式化章节分析prompt（用于生成大纲、细纲）")
                
                # 如果批次中有多个章节，准备章节信息说明
                batch_chapter_info = "\n".join([f"第{ch['chapter'].chapter_number}章 {ch['chapter'].title}" for ch in batch_chapters_data])
                logger.info(f"批次 {batch_idx} 包含的章节: {batch_chapter_info}")
                
                formatted_prompt = await prompt_service.format_prompt(
                    template=chapter_analysis_prompt_template,
                    work_id=work_id,
                    auto_build_context=True
                )
                
                logger.info(f"✅ 批次 {batch_idx} prompt格式化完成，长度: {len(formatted_prompt)}")
                logger.debug(f"批次 {batch_idx} 格式化后的prompt前500字符: {formatted_prompt[:500]}")
                
                # 如果批次中有多个章节，在prompt中添加说明，要求返回多个章节的数据
                if len(batch_chapters_data) > 1:
                    multi_chapter_note = f"""

                    **重要提示：**
                    本次分析包含 {len(batch_chapters_data)} 个章节，请为每个章节分别生成分析结果。
                    章节列表：
                    {batch_chapter_info}

                    请确保返回的JSON中包含所有 {len(batch_chapters_data)} 个章节的分析数据。如果返回格式是单个章节对象，请改为包含 chapters 数组的格式：
                    ```json
                    {{
                    "chapters": [
                        {{ "chapter_number": 1, "title": "...", "summary": "...", "outline": {{...}}, "detailed_outline": {{...}} }},
                        {{ "chapter_number": 2, "title": "...", "summary": "...", "outline": {{...}}, "detailed_outline": {{...}} }},
                        {{ "chapter_number": 3, "title": "...", "summary": "...", "outline": {{...}}, "detailed_outline": {{...}} }}
                    ]
                    }}
                    ```
                    每个章节必须包含 chapter_number、title、summary、outline 和 detailed_outline 字段。
                    """
                    formatted_prompt = formatted_prompt + multi_chapter_note
                    logger.info(f"批次 {batch_idx} 添加了多章节分析说明（{len(batch_chapters_data)} 章）")
                
                # 替换 {content} 变量
                full_prompt = formatted_prompt.replace("{content}", batch_content)
                
                logger.info(f"🚀 开始分析批次 {batch_idx}，包含 {len(batch_chapters_data)} 章，最终prompt长度: {len(full_prompt)}")
                
                # 调用AI分析（使用单章分析的逻辑）
                full_response = await ai_service.get_ai_response(
                    content=batch_content,
                    prompt=full_prompt,
                    system_prompt=None,  # 使用默认 system_prompt
                    model=analysis_settings.model,
                    temperature=analysis_settings.temperature,
                    max_tokens=analysis_settings.max_tokens * 2,
                    use_json_format=True,  # 使用JSON格式
                )
                
                chapters_data = parse_ai_chapters(full_response)
                
                # 将解析结果与批次中的章节匹配
                # 策略：优先按章节号匹配，如果匹配不上则按顺序分配
                used_chapters_indices = set()  # 记录已使用的章节数据索引
                
                for chapter_data in batch_chapters_data:
                    chapter = chapter_data["chapter"]
                    chapter_number = chapter.chapter_number
                    
                    # 查找匹配的章节数据（优先按章节号匹配）
                    matched_chapter_data = None
                    matched_index = None
                    
                    for idx, parsed_chapter in enumerate(chapters_data):
                        if idx in used_chapters_indices:
                            continue  # 跳过已使用的
                        
                        parsed_number = parsed_chapter.get("chapter_number")
                        # 尝试多种匹配方式
                        if parsed_number is not None:
                            # 转换为数字进行比较
                            try:
                                parsed_num = int(parsed_number) if isinstance(parsed_number, str) else parsed_number
                                chapter_num = int(chapter_number) if isinstance(chapter_number, str) else chapter_number
                                if parsed_num == chapter_num:
                                    matched_chapter_data = parsed_chapter
                                    matched_index = idx
                                    break
                            except (ValueError, TypeError):
                                # 如果转换失败，使用字符串比较
                                if str(parsed_number) == str(chapter_number):
                                    matched_chapter_data = parsed_chapter
                                    matched_index = idx
                                    break
                    
                    # 如果按章节号没匹配到，且批次中章节数和返回的章节数相同，按顺序分配
                    if not matched_chapter_data and len(chapters_data) == len(batch_chapters_data):
                        # 找到批次中当前章节的索引
                        batch_index = batch_chapters_data.index(chapter_data)
                        if batch_index < len(chapters_data) and batch_index not in used_chapters_indices:
                            matched_chapter_data = chapters_data[batch_index]
                            matched_index = batch_index
                            logger.info(f"批次 {batch_idx} 章节 {chapter_number} 按顺序匹配到第 {batch_index} 个章节数据")
                    
                    # 如果仍然没有匹配到，且只有一个返回的章节数据，使用它
                    if not matched_chapter_data and len(chapters_data) == 1 and len(batch_chapters_data) == 1:
                        matched_chapter_data = chapters_data[0]
                        matched_index = 0
                        logger.info(f"批次 {batch_idx} 章节 {chapter_number} 使用唯一的章节数据")
                    
                    if matched_chapter_data:
                        # 标记为已使用
                        if matched_index is not None:
                            used_chapters_indices.add(matched_index)
                        
                        # 确保章节号正确（使用数据库中的章节号）
                        matched_chapter_data = matched_chapter_data.copy() if isinstance(matched_chapter_data, dict) else dict(matched_chapter_data)
                        matched_chapter_data["chapter_number"] = chapter_number
                        
                        # 记录章节数据内容（用于调试）
                        logger.info(f"📝 批次 {batch_idx} 章节 {chapter_number} 匹配到的数据键: {list(matched_chapter_data.keys())}")
                        if "outline" in matched_chapter_data:
                            logger.debug(f"  大纲: {matched_chapter_data.get('outline', {})}")
                        if "detailed_outline" in matched_chapter_data:
                            logger.debug(f"  细纲: {matched_chapter_data.get('detailed_outline', {})}")
                        
                        # 构建分析数据（单章格式）
                        analysis_data = {
                            "chapters": [matched_chapter_data]
                        }
                        
                        logger.info(f"💾 开始保存章节 {chapter_number} 的分析数据到作品 {work_id}")
                        # 渐进式插入到作品
                        result = await book_analysis_service.incremental_insert_to_work(
                            work_id=work_id,
                            analysis_data=analysis_data,
                            user_id=current_user_id,
                            chapter_index=chapter_number
                        )
                        
                        logger.info(f"💾 章节 {chapter_number} 保存结果: {result}")
                        

                        results.append({
                            "chapter_index": chapter_number,
                            "chapter_id": chapter.id,
                            "chapter_number": chapter_number,
                            "chapter_title": chapter.title,
                            "message": f"第 {chapter_number} 章《{chapter.title}》分析完成并已插入作品",
                            "data": result
                        })
                        logger.info(f"✅ 第 {chapter_number} 章《{chapter.title}》分析完成并已插入作品")
                    else:
                        logger.warning(f"⚠️ 批次 {batch_idx} 中未找到章节 {chapter_number} 的匹配数据，返回的章节数据数量: {len(chapters_data)}, 批次章节数量: {len(batch_chapters_data)}")
                        # 输出返回的章节号用于调试
                        if chapters_data:
                            returned_numbers = [ch.get("chapter_number") for ch in chapters_data if isinstance(ch, dict)]
                            logger.warning(f"批次 {batch_idx} 返回的章节号: {returned_numbers}")
                        errors.append({
                            "chapter_index": chapter_number,
                            "chapter_id": chapter.id,
                            "message": f"第 {chapter_number} 章《{chapter.title}》在AI响应中未找到匹配数据",
                        })
            
            except Exception as e:
                logger.error(f"批次 {batch_idx} 分析失败: {traceback.format_exc()}")
                for chapter_data in batch_chapters_data:
                    chapter = chapter_data["chapter"]
                    errors.append({
                        "chapter_index": chapter.chapter_number,
                        "chapter_id": chapter.id,
                        "message": f"第 {chapter.chapter_number} 章《{chapter.title}》分析失败: {str(e)}",
                        "error": str(e)
                    })
            
            # 返回JSON响应
            return JSONResponse({
                "success": True,
                "message": f"所有章节分析完成，共 {total} 章",
                "total_chapters": total,
                "results": results,
                "skipped": skipped,
                "errors": errors,
                "success_count": len(results),
                "skipped_count": len(skipped),
                "error_count": len(errors)
            })
                        
        except Exception as e:
            logger.error(f"Error in work chapters analysis: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze work chapters: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.get(
    "/health",
    summary="健康检查接口",
    description="检查AI服务是否可用",
    response_model=HealthCheckResponse,
    responses={
        200: {"model": HealthCheckResponse, "description": "服务正常"},
        500: {"model": ErrorResponse, "description": "服务异常"},
    },
)
async def health_check():
    """
    健康检查

    Returns:
        HealthCheckResponse: 服务状态信息
    """
    try:
        ai_service = get_ai_service()

        # 获取当前时间（ISO 8601格式）
        current_time = datetime.now(timezone.utc).isoformat()

        # 检查服务状态
        is_healthy = ai_service.is_healthy()
        status = "healthy" if is_healthy else "unhealthy"

        # 获取可用模型列表
        available_models = ai_service.get_available_models()

        health_data = HealthCheckData(
            status=status, models=available_models, timestamp=current_time
        )

        logger.info(f"Health check: status={status}, models={len(available_models)}")

        return HealthCheckResponse(
            code=200,
            message="服务正常" if is_healthy else "服务不可用",
            data=health_data,
        )

    except Exception as e:
        logger.error(f"Health check failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"健康检查失败: {str(e)}")



@router.post(
    "/analyze-book",
    summary="增强拆书分析接口",
    description="对小说内容进行增强分析，识别角色、地图、章节大纲和细纲，并可直接创建作品（非流式响应）",
    responses={
        200: {"description": "分析成功，返回JSON响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def analyze_book(
    request: AnalyzeChapterRequest,
    auto_create_work: bool = False,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    对小说内容进行增强分析，可以识别角色、地图、章节大纲和细纲
    
    Args:
        request: 章节分析请求
        auto_create_work: 是否自动创建作品（从分析结果中提取）
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        JSONResponse: JSON格式的分析结果
    """
    try:
        # 验证请求参数
        if not request.content or len(request.content.strip()) == 0:
            raise HTTPException(status_code=400, detail="章节内容不能为空")

        # 获取AI服务
        ai_service = get_ai_service()

        # 检查服务状态
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")

        # 获取拆书分析服务
        book_analysis_service = BookAnalysisService(db)
        
        # 获取增强的prompt模板
        prompt_template_obj = await book_analysis_service.get_default_prompt_template("book_analysis")
        if prompt_template_obj:
            # 使用数据库中的模板
            enhanced_prompt = prompt_template_obj.format_prompt(content=request.content)
        else:
            # 使用默认的增强prompt
            enhanced_prompt = book_analysis_service.get_enhanced_book_analysis_prompt().replace(
                "{content}", request.content
            )

        # 获取分析设置
        settings = request.settings or AnalyzeChapterRequest.model_fields["settings"].default_factory()

        logger.info(
            f"Received enhanced book analysis request: "
            f"content_length={len(request.content)}, "
            f"auto_create_work={auto_create_work}, "
            f"model={settings.model}"
        )

        # 执行非流式分析
        try:
            # 直接获取完整响应
            full_response = await ai_service.get_ai_response(
                content=request.content,
                prompt=enhanced_prompt,
                system_prompt=None,  # 使用默认 system_prompt
                model=settings.model,
                temperature=settings.temperature,
                max_tokens=settings.max_tokens * 2,  # 增强分析需要更多tokens
            )
            
            # 解析AI响应
            analysis_data = book_analysis_service.parse_ai_response(full_response)
            
            if not analysis_data:
                raise ValueError("无法解析AI响应，可能返回的不是有效的JSON格式")
            
            # 如果启用了自动创建作品，解析响应并创建作品
            work_result = None
            work_creation_error = None
            if auto_create_work:
                try:
                    # 创建作品
                    work_result = await book_analysis_service.create_work_from_analysis(
                        analysis_data=analysis_data,
                        user_id=current_user_id
                    )
                    logger.info("✅ 作品创建成功")
                except Exception as e:
                    logger.error(f"自动创建作品失败: {traceback.format_exc()}")
                    work_creation_error = str(e)
            
            # 返回JSON响应
            return JSONResponse({
                "success": True,
                "message": "分析完成" + ("，作品已创建" if work_result else ""),
                "data": analysis_data,
                "work_created": work_result is not None,
                "work_result": work_result,
                "work_creation_error": work_creation_error
            })
                        
        except Exception as e:
            logger.error(f"Error in book analysis: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze book: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")



# 内部调用：逐章生成大纲和细纲（不再对外暴露 API 路由）
async def generate_chapter_outlines_internal(
    work_id: int = Query(..., description="作品ID"),
    chapter_ids: Optional[str] = Query(None, description="指定要处理的章节ID列表（逗号分隔），如果不提供则处理所有章节"),
    prompt: Optional[str] = Query(None, description="自定义prompt（可选）"),
    settings: Optional[AnalysisSettings] = Body(None, embed=True, description="AI分析设置（可选）"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    为作品的所有章节（或指定章节）逐章生成大纲和细纲
    
    Args:
        work_id: 作品ID
        chapter_ids: 指定要处理的章节ID列表（逗号分隔，可选）
        prompt: 自定义prompt（可选）
        settings: AI分析设置（可选）
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        JSONResponse: JSON格式的生成结果
    """
    try:
        # 验证作品是否存在

        work_service = WorkService(db)
        work = await work_service.get_work_by_id(work_id)
        if not work:
            raise HTTPException(status_code=404, detail=f"作品 {work_id} 不存在")
        
        # 检查权限
        chapter_service = ChapterService(db)
        if not await chapter_service.can_edit_work(user_id=current_user_id, work_id=work_id):
            raise HTTPException(status_code=403, detail="没有编辑该作品的权限")
        
        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")
        
        # 解析章节ID列表
        chapter_id_list = None
        if chapter_ids:
            try:
                chapter_id_list = [int(id.strip()) for id in chapter_ids.split(",") if id.strip()]
            except ValueError:
                raise HTTPException(status_code=400, detail="章节ID格式错误，应为逗号分隔的整数列表")
        
        # 获取分析设置
        analysis_settings = {}
        if settings:
            analysis_settings = {
                "model": settings.model,
                "temperature": settings.temperature,
                "max_tokens": settings.max_tokens,
            }
        
        # 获取拆书分析服务
        book_analysis_service = BookAnalysisService(db)
        
        logger.info(
            f"开始为作品 {work_id} 生成章节大纲和细纲，"
            f"章节数量: {len(chapter_id_list) if chapter_id_list else '全部'}"
        )
        
        # 收集所有章节的处理结果
        results = []
        total_chapters = 0
        success_count = 0
        error_count = 0
        
        # 收集所有章节的组件数据 {dataKey: [data_list]}
        all_component_data = {}
        component_extraction_errors = []
        
        try:
            # 逐章生成大纲和细纲
            async for result in book_analysis_service.generate_outlines_for_all_chapters(
                work_id=work_id,
                ai_service=ai_service,
                prompt=prompt,
                settings=analysis_settings,
                chapter_ids=chapter_id_list
            ):
                if "error" in result:
                    error_count += 1
                    results.append({
                        "chapter_id": result.get("chapter_id"),
                        "chapter_number": result.get("chapter_number"),
                        "index": result.get("index"),
                        "total": result.get("total"),
                        "error": result.get("error"),
                        "success": False
                    })
                else:
                    success_count += 1
                    chapter_id = result.get("chapter_id")
                    chapter_number = result.get("chapter_number")
                    
                    # 提取该章节的所有组件数据
                    chapter_component_data = {}  # {dataKey: [data_list]}
                    try:
                        # 获取章节内容
                        chapter_content = await book_analysis_service.get_chapter_content(chapter_id)
                        
                        if chapter_content:
                            logger.info(f"开始为章节 {chapter_id} 提取组件数据...")
                            
                            # 获取现有的 work 数据，特别是 component_data 结构
                            work_metadata = work.work_metadata or {}
                            component_data = work_metadata.get("component_data", {})
                            

                            template_config = None
                            template_id = None
                            
                            # 从 work_metadata.template_config.templateId 中获取 template_id
                            template_config_in_metadata = work_metadata.get("template_config")
                            if template_config_in_metadata and isinstance(template_config_in_metadata, dict):
                                template_id_str = template_config_in_metadata.get("templateId")
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
                                else:
                                    logger.debug(f"work_metadata.template_config 中没有 templateId 字段")
                                    
                                # 如果 template_config 中直接包含 modules，也可以直接使用（作为备用方案）
                                if not template_id and "modules" in template_config_in_metadata:
                                    template_config = template_config_in_metadata
                                    logger.info(f"从 work_metadata.template_config 中直接获取到模板配置（modules），但没有 templateId，无法从 work_template 表获取最新配置")
                            else:
                                logger.warning(f"作品 {work_id} 的 work_metadata 中没有 template_config 或格式不正确")
                            
                            # 如果有 template_id，从 work_template 表查询
                            if template_id:
                                template_stmt = select(WorkTemplate).where(WorkTemplate.id == template_id)
                                template_result = await db.execute(template_stmt)
                                work_template = template_result.scalar_one_or_none()
                                
                                if not work_template:
                                    logger.warning(f"作品 {work_id} 的模板不存在（template_id: {template_id}），跳过组件数据提取")
                                elif not work_template.template_config:
                                    logger.warning(f"作品 {work_id} 的模板配置为空，跳过组件数据提取")
                                else:
                                    template_config = work_template.template_config
                                    logger.info(f"✅ 成功从 work_template 表获取模板配置（template_id: {template_id}）")
                            
                            # 如果仍然没有 template_config，记录警告
                            if not template_config:
                                logger.warning(f"作品 {work_id} 没有关联的模板配置，跳过组件数据提取。可能的原因：1) work_metadata.template_config 中没有 templateId；2) work_metadata.template_config 中没有 modules；3) templateId 对应的模板不存在或配置为空")
                            
                            # 如果找到了 template_id，直接从 prompt_template 表查询 analysis 类型的 prompt
                            if template_id:
                                try:
                          
                                    # 查询所有 work_template_id 匹配且 prompt_category 为 analysis 的 prompt
                                    prompt_stmt = select(PromptTemplate).where(
                                        and_(
                                            PromptTemplate.work_template_id == template_id,
                                            PromptTemplate.prompt_category == "analysis",
                                            PromptTemplate.is_active == True
                                        )
                                    )
                                    prompt_result = await db.execute(prompt_stmt)
                                    prompt_templates = prompt_result.scalars().all()
                                    
                                    if not prompt_templates:
                                        logger.warning(f"作品 {work_id} 的模板（template_id: {template_id}）中未找到 prompt_category 为 analysis 的 prompt，跳过数据提取")
                                    else:
                                        logger.info(f"找到 {len(prompt_templates)} 个需要分析的 prompt（template_id: {template_id}）")
                                        
                                        # 对每个 prompt_template 调用 AI 生成数据
                                        for prompt_template in prompt_templates:
                                            data_key = prompt_template.data_key
                                            component_id = prompt_template.component_id
                                            analysis_prompt = prompt_template.prompt_content
                                            if not data_key:
                                                logger.warning(f"⚠️ prompt_template (id: {prompt_template.id}, component_id: {component_id}) 没有定义 data_key，跳过")
                                                continue
                                            
                                            if not analysis_prompt:
                                                logger.warning(f"⚠️ prompt_template (id: {prompt_template.id}, component_id: {component_id}, data_key: {data_key}) 的 prompt_content 为空，跳过")
                                                continue
                                            
                                            comp_path = f"{component_id or 'unknown'} > {data_key}"
                                            
                                            try:
                                                logger.info(f"✅ 开始处理组件: {comp_path}, dataKey: {data_key}, analysisPrompt长度: {len(analysis_prompt)}")
                                                logger.debug(f"analysisPrompt内容（前200字符）: {analysis_prompt[:200]}")
                                                
                                                # 获取该 dataKey 的现有数据，用于构建上下文
                                                existing_data = component_data.get(data_key, [])
                                            
                                                # 构建现有数据的描述，用于指导模型生成合适的数据结构
                                                existing_data_context = ""
                                                if existing_data and isinstance(existing_data, list) and len(existing_data) > 0:
                                                    import json
                                                    # 只展示前3个数据作为示例，避免 prompt 过长
                                                    example_data = existing_data[:3]
                                                    existing_data_context = f"""
                                                        # 现有作品数据结构参考
                                                        以下是该作品已有的 {data_key} 数据结构示例（请参考此结构生成新数据）：

                                                        ```json
                                                        {json.dumps(example_data, ensure_ascii=False, indent=2)}
                                                        ```
                                                        **重要提示：**
                                                        1. 新提取的数据应该与上述数据结构保持一致
                                                        2. 如果提取到已存在的数据（通过唯一标识字段匹配，如 name、id、title 等），请保持该数据的现有字段结构，只更新或补充新信息
                                                        3. 如果章节中出现了新数据，请按照上述数据结构格式生成完整的信息
                                                        """
                                                
                                                # 使用 format_prompt 方法处理变量替换（支持 @chapter.content 格式）

                                                # 获取章节对象（ChapterService已在文件顶部导入）
                                                chapter_service = ChapterService(db)
                                                chapter_obj = await chapter_service.get_chapter_by_id(chapter_id)
                                                
                                                temp_template = PromptTemplate()
                                                temp_template.prompt_content = analysis_prompt
                                                logger.debug(f"使用组件的 analysisPrompt 进行变量替换，原始prompt长度: {len(analysis_prompt)}")
                                                # 传递章节对象和内容，确保 @chapter.content 等变量能正确替换
                                                user_prompt = temp_template.format_prompt(
                                                    chapter=chapter_obj if chapter_obj else None,
                                                    content=chapter_content if chapter_content else "",
                                                    chapter_content=chapter_content if chapter_content else ""
                                                )
                                                logger.debug(f"变量替换后的 user_prompt 长度: {len(user_prompt)}")
                                                logger.debug(f"变量替换后的 user_prompt 前500字符: {user_prompt[:500] if user_prompt else '空'}")
                                                
                                                # 设置默认的 system_prompt
                                                system_prompt = f"""你是一位专业的小说分析专家，擅长从章节内容中提取和分析信息。请根据提示词要求，从章节内容中提取 {data_key} 相关的数据。"""
                                                
                                                # 在 user_prompt 中添加现有数据结构上下文
                                                if existing_data_context:
                                                    user_prompt = existing_data_context + "\n\n" + user_prompt
                                                    logger.debug(f"添加现有数据上下文后，user_prompt 长度: {len(user_prompt)}")
                                                
                                                # 调用AI服务提取数据
                                                logger.info(f"🚀 调用AI服务分析章节 {chapter_id} 的 {data_key} 数据，使用组件的 analysisPrompt")
                                                ai_response = await ai_service.get_ai_response(
                                                    content=chapter_content,
                                                    prompt=user_prompt,
                                                    system_prompt=system_prompt,
                                                    model=analysis_settings.get("model"),
                                                    temperature=analysis_settings.get("temperature", 0.7),
                                                    max_tokens=analysis_settings.get("max_tokens", 4000),
                                                )
                                                logger.info(f"✅ AI服务返回响应，长度: {len(ai_response)}")
                                                
                                                # 解析AI响应
                                                logger.debug(f"开始解析章节 {chapter_id} 的 {data_key} 数据，AI响应长度: {len(ai_response)}")
                                                parsed_data = book_analysis_service.parse_single_chapter_response(ai_response)
                                                
                                                if parsed_data:
                                                    logger.debug(f"解析成功，数据键: {list(parsed_data.keys())}")
                                                    # 查找与 dataKey 匹配的数据
                                                    if data_key in parsed_data:
                                                        data_list = parsed_data[data_key]
                                                        if isinstance(data_list, list):
                                                            if data_key not in chapter_component_data:
                                                                chapter_component_data[data_key] = []
                                                            chapter_component_data[data_key].extend(data_list)
                                                            logger.info(f"✅ 成功为章节 {chapter_id} 提取 {len(data_list)} 个 {data_key} 数据")
                                                            
                                                            # 立即将 AI 生成的该 data_key 数据保存到 work 的 component_data 中
                                                            try:
                                                                logger.info(f"开始将章节 {chapter_id} 的 {data_key} 数据（由 AI 生成）保存到作品 {work_id} 的 component_data 中...")
                                                                save_result = await book_analysis_service.incremental_insert_to_work(
                                                                    work_id=work_id,
                                                                    analysis_data={data_key: data_list},  # 只保存当前 AI 生成的该 data_key 数据
                                                                    user_id=current_user_id,
                                                                    chapter_index=chapter_number
                                                                )
                                                                
                                                                # 记录保存结果
                                                                processed = save_result.get(f"{data_key}_processed", 0)
                                                                updated = save_result.get(f"{data_key}_updated", 0)
                                                                total = save_result.get(f"{data_key}_total", 0)
                                                                logger.info(f"✅ 成功将章节 {chapter_id} 的 {data_key} 数据保存到作品 {work_id}，新增 {processed}，更新 {updated}，总计 {total}")
                                                            except Exception as e:
                                                                logger.error(f"保存章节 {chapter_id} 的 {data_key} 数据到作品 {work_id} 失败: {traceback.format_exc()}")
                                                                # 单个 data_key 保存失败不影响其他 data_key，继续处理
                                                        else:
                                                            logger.warning(f"⚠️ 章节 {chapter_id} 的 {data_key} 数据不是列表格式")
                                                    else:
                                                        logger.warning(f"⚠️ 章节 {chapter_id} 解析成功但未找到 {data_key} 字段，数据键: {list(parsed_data.keys())}")
                                                else:
                                                    logger.warning(f"⚠️ 章节 {chapter_id} 未提取到 {data_key} 数据，解析返回 None")
                                                    logger.debug(f"AI响应内容（前500字符）: {ai_response[:500]}")
                                            except Exception as e:
                                                logger.error(f"提取章节 {chapter_id} 的 {data_key} 数据失败: {traceback.format_exc()}")
                                                # 单个组件失败不影响其他组件，继续处理
                                except Exception as e:
                                    logger.error(f"从 prompt_template 表查询 analysis prompt 失败: {e}")
                                    logger.error(f"详细错误: {traceback.format_exc()}")
                            else:
                                logger.warning(f"作品 {work_id} 没有关联的 template_id，跳过组件数据提取")
                        else:
                            logger.warning(f"⚠️ 章节 {chapter_id} 内容为空，跳过组件数据提取")
                    except Exception as e:
                        logger.error(f"提取章节 {chapter_id} 的组件数据失败: {traceback.format_exc()}")
                        # 组件数据提取失败不影响主流程，继续执行
                    
                    # 收集该章节的所有组件数据到全局集合中
                    for data_key, data_list in chapter_component_data.items():
                        if data_key not in all_component_data:
                            all_component_data[data_key] = []
                        all_component_data[data_key].extend(data_list)
                    
                    # 保存该章节的组件数据到章节的 metadata.component_data 中，并立即整合保存到 work 的 component_data 中
                    if chapter_component_data:
                        try:

                            # select 已经在文件顶部导入，不需要重复导入
                            
                            # 获取章节对象
                            chapter_stmt = select(Chapter).where(Chapter.id == chapter_id)
                            chapter_result = await db.execute(chapter_stmt)
                            chapter = chapter_result.scalar_one_or_none()
                            
                            if chapter:
                                # 获取或初始化章节的 metadata
                                chapter_metadata = chapter.chapter_metadata or {}
                                if "component_data" not in chapter_metadata:
                                    chapter_metadata["component_data"] = {}
                                
                                # 将组件数据保存到章节的 component_data 中
                                for data_key, data_list in chapter_component_data.items():
                                    if data_key not in chapter_metadata["component_data"]:
                                        chapter_metadata["component_data"][data_key] = []
                                    
                                    # 合并数据（去重）
                                    existing_data = chapter_metadata["component_data"][data_key]
                                    if not isinstance(existing_data, list):
                                        existing_data = []
                                    
                                    # 使用集合去重（基于JSON字符串）
                                    existing_set = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in existing_data if isinstance(item, dict)}
                                    for item in data_list:
                                        if isinstance(item, dict):
                                            item_str = json.dumps(item, sort_keys=True, ensure_ascii=False)
                                            if item_str not in existing_set:
                                                existing_set.add(item_str)
                                                existing_data.append(item)
                                    
                                    chapter_metadata["component_data"][data_key] = existing_data
                                
                                # 更新章节的 metadata
                                chapter.chapter_metadata = chapter_metadata
                                flag_modified(chapter, "chapter_metadata")
                                await db.commit()
                                logger.info(f"✅ 成功保存章节 {chapter_id} 的组件数据到 chapter_metadata.component_data")
                            else:
                                logger.warning(f"⚠️ 无法找到章节 {chapter_id}，跳过保存到章节 metadata")
                            
                            # 注意：组件数据已经在 AI 生成时立即保存到 work 的 component_data 中了
                            # 这里不再需要统一保存，因为每个 data_key 的数据在 AI 生成后就已经保存了
                        except Exception as e:
                            logger.error(f"保存章节 {chapter_id} 的组件数据到 metadata 失败: {traceback.format_exc()}")
                            # 不影响主流程，继续执行
                    
                    # 统计该章节提取的数据
                    chapter_data_stats = {key: len(data_list) for key, data_list in chapter_component_data.items()}
                    
                    results.append({
                        "chapter_id": chapter_id,
                        "chapter_number": chapter_number,
                        "title": result.get("title"),
                        "index": result.get("index"),
                        "total": result.get("total"),
                        "outline": result.get("outline", {}),
                        "detailed_outline": result.get("detailed_outline", {}),
                        "component_data_stats": chapter_data_stats,
                        "success": True
                    })
                    total_chapters = result.get("total", 0)
            
            # 注意：组件数据已经在每个章节处理完后立即保存到 work 的 component_data 中了
            # 这里保留统一保存逻辑主要用于：
            # 1. 最终统计和汇总所有章节的保存结果
            # 2. 作为备用方案，确保所有数据都已保存
            # 3. incremental_insert_to_work 方法会进行去重，所以重复保存不会有数据重复问题
            all_save_results = {}  # {dataKey: {saved: bool, count: int, error: str}}
            
            # 初始化 all_component_data（如果还没有初始化）
            if 'all_component_data' not in locals():
                all_component_data = {}
            
            # 记录 all_component_data 的状态，帮助调试
            logger.info(f"准备最终统计组件数据保存结果（已逐章保存），all_component_data 包含 {len(all_component_data)} 个 data_key: {list(all_component_data.keys())}")
            for data_key, data_list in all_component_data.items():
                if not data_list:
                    logger.warning(f"⚠️ data_key {data_key} 的数据列表为空，跳过保存")
                    continue
                
                try:
                    logger.info(f"开始保存 {len(data_list)} 个 {data_key} 数据到作品 {work_id}...")
                    
                    # 对数据进行去重和合并
                    data_map = {}
                    skipped_count = 0
                    
                    # 尝试找到唯一标识字段（name, id, title 等）
                    identifier_key = None
                    if data_list and isinstance(data_list[0], dict):
                        for key in ["name", "id", "title", "identifier", "key"]:
                            if key in data_list[0]:
                                identifier_key = key
                                break
                    
                    for item_data in data_list:
                        if not isinstance(item_data, dict):
                            logger.warning(f"跳过无效的 {data_key} 数据（不是字典）: {type(item_data)}")
                            skipped_count += 1
                            continue
                        
                        if identifier_key and identifier_key in item_data:
                            item_id = item_data[identifier_key]
                            if item_id in data_map:
                                logger.debug(f"合并已存在的 {data_key} 数据: {item_id}")
                                # 合并现有数据
                                existing_item = data_map[item_id]
                                # 深度合并
                                for key, value in item_data.items():
                                    if key in existing_item and isinstance(existing_item[key], dict) and isinstance(value, dict):
                                        existing_item[key].update(value)
                                    else:
                                        existing_item[key] = value
                            else:
                                logger.debug(f"添加新的 {data_key} 数据: {item_id}")
                                # 添加新数据
                                data_map[item_id] = item_data
                        else:
                            # 没有唯一标识，使用整个数据的字符串表示作为键
                            item_str = json.dumps(item_data, sort_keys=True, ensure_ascii=False)
                            if item_str not in data_map:
                                data_map[item_str] = item_data
                            else:
                                # 如果已存在，进行合并
                                existing_item = data_map[item_str]
                                for key, value in item_data.items():
                                    if key in existing_item and isinstance(existing_item[key], dict) and isinstance(value, dict):
                                        existing_item[key].update(value)
                                    else:
                                        existing_item[key] = value
                    
                    if skipped_count > 0:
                        logger.warning(f"跳过了 {skipped_count} 个无效的 {data_key} 数据")
                    
                    data_count = len(data_map)
                    logger.info(f"合并后共有 {data_count} 个唯一的 {data_key} 数据（跳过 {skipped_count} 个无效数据）")
                    
                    if data_count > 0:
                        # 保存数据到作品的 component_data 中
                        logger.info(f"准备保存 {data_count} 个 {data_key} 数据到作品 {work_id} 的 component_data 中")
                        save_result = await book_analysis_service.incremental_insert_to_work(
                            work_id=work_id,
                            analysis_data={data_key: list(data_map.values())},
                            user_id=current_user_id,
                        )
                        
                        # 获取处理结果
                        processed_count = save_result.get(f"{data_key}_processed", 0)
                        updated_count = save_result.get(f"{data_key}_updated", 0)
                        total_count = save_result.get(f"{data_key}_total", 0)
                        
                        if processed_count > 0 or updated_count > 0:
                            all_save_results[data_key] = {
                                "saved": True,
                                "processed": processed_count,
                                "updated": updated_count,
                                "total": total_count or data_count
                            }
                            logger.info(f"✅ 成功保存 {data_key} 数据: 新增 {processed_count}，更新 {updated_count}，总计 {total_count or data_count}")
                        elif data_count > 0:
                            # 所有数据都已存在，虽然没有新处理，但数据已保存
                            all_save_results[data_key] = {
                                "saved": True,
                                "processed": 0,
                                "updated": 0,
                                "total": data_count
                            }
                            logger.info(f"所有 {data_count} 个 {data_key} 数据都已存在于数据库中，无需新增或更新")
                        else:
                            all_save_results[data_key] = {
                                "saved": False,
                                "processed": 0,
                                "updated": 0,
                                "total": 0,
                                "error": "没有有效数据"
                            }
                    else:
                        all_save_results[data_key] = {
                            "saved": False,
                            "processed": 0,
                            "updated": 0,
                            "total": 0,
                            "error": "没有有效数据"
                        }
                except Exception as e:
                    logger.error(f"❌ 保存 {data_key} 数据到作品 {work_id} 失败: {str(e)}")
                    logger.error(f"详细错误信息: {traceback.format_exc()}")
                    all_save_results[data_key] = {
                        "saved": False,
                        "processed": 0,
                        "updated": 0,
                        "total": 0,
                        "error": str(e)
                    }
            
            # 提交所有更改
            await db.commit()
            
            # 构建消息
            message_parts = [f"所有章节的大纲和细纲生成完成，成功: {success_count}，失败: {error_count}"]
            
            # 添加每个组件数据的保存结果
            for data_key, result_info in all_save_results.items():
                if result_info["saved"]:
                    if result_info["processed"] > 0 or result_info["updated"] > 0:
                        message_parts.append(f"已保存 {data_key}: 新增 {result_info['processed']}，更新 {result_info['updated']}，总计 {result_info['total']}")
                    else:
                        message_parts.append(f"{data_key} 数据已存在（{result_info['total']} 条）")
                else:
                    error_msg = result_info.get("error", "未知错误")
                    message_parts.append(f"{data_key} 保存失败: {error_msg}")
            
            # 计算总提取的数据量
            total_extracted = sum(len(data_list) for data_list in all_component_data.values())
            
            # 重新获取 work 对象以确保数据是最新的（避免访问过期对象）
            try:

                work_service = WorkService(db)
                final_work = await work_service.get_work_by_id(work_id)
                work_title = final_work.title if final_work else work.title if hasattr(work, 'title') else "未知"
            except Exception as e:
                logger.warning(f"无法重新获取作品信息: {e}，使用缓存的标题")
                work_title = getattr(work, 'title', '未知') if hasattr(work, 'title') else '未知'
            
            return JSONResponse({
                "success": True,
                "message": "；".join(message_parts),
                "work_id": work_id,
                "work_title": work_title,
                "total_chapters": total_chapters,
                "success_count": success_count,
                "error_count": error_count,
                "component_data_extracted": all_component_data,  # 返回具体数据，而不是长度
                "component_data_extracted_count": {key: len(data_list) for key, data_list in all_component_data.items()},  # 同时返回数量统计
                "component_data_saved": all_save_results,
                "total_extracted": total_extracted,
                "component_extraction_errors": component_extraction_errors,
                "results": results
            })
            
        except Exception as e:
            logger.error(f"生成大纲和细纲过程出错: {traceback.format_exc()}")
            # 回滚事务
            try:
                await db.rollback()
            except Exception as rollback_error:
                logger.error(f"回滚事务失败: {rollback_error}")
            
            raise HTTPException(status_code=500, detail=f"生成过程出错: {str(e)}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate chapter outlines: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/generate-chapter-content",
    summary="根据大纲和细纲生成章节内容",
    description="根据章节大纲和细纲，使用AI生成完整的章节内容（流式响应）",
    responses={
        200: {"description": "生成成功，返回流式响应"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def generate_chapter_content(
    request: GenerateChapterContentRequest,
):
    """
    根据大纲和细纲生成章节内容
    
    Args:
        request: 生成请求，包含大纲、细纲等信息
    
    Returns:
        StreamingResponse: 服务器发送事件流
    """
    try:
        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用，请检查配置")
        
        # 获取分析设置
        analysis_settings = {}
        if request.settings:
            analysis_settings = {
                "model": request.settings.model,
                "temperature": request.settings.temperature,
                "max_tokens": request.settings.max_tokens,
            }
        
        # 构建生成提示词
        system_prompt = """# 角色
            你是一位经验丰富的小说创作专家，擅长根据大纲和细纲创作引人入胜的章节内容。你能够将抽象的情节框架转化为生动、具体、富有画面感的文字。

            # 任务
            根据提供的大纲和细纲，创作完整的章节内容。内容应该：
            1. 忠实于大纲和细纲的要求
            2. 语言流畅自然，富有文学性
            3. 情节发展合理，节奏适中
            4. 人物形象鲜明，对话生动
            5. 场景描写细致，画面感强
            6. 字数控制在3000-5000字左右（除非大纲有特殊要求）

            # 要求
            - 直接输出章节正文内容，不要添加标题、说明等额外文字
            - 使用段落分隔，每个段落之间用空行分隔
            - 对话使用引号标注
            - 保持一致的叙事风格和视角
            """
        
        # 构建用户提示词
        user_prompt_parts = []
        if request.chapter_title:
            user_prompt_parts.append(f"## 章节标题\n{request.chapter_title}\n")
        
        user_prompt_parts.append(f"## 章节大纲\n{request.outline}\n")
        user_prompt_parts.append(f"## 章节细纲\n{request.detailed_outline}\n")
        
        if request.characters:
            user_prompt_parts.append(f"## 出场人物\n{', '.join(request.characters)}\n")
        
        if request.locations:
            user_prompt_parts.append(f"## 剧情地点\n{', '.join(request.locations)}\n")
        
        user_prompt_parts.append("\n请根据以上大纲和细纲，创作完整的章节内容。")
        user_prompt = "\n".join(user_prompt_parts)
        
        logger.info(
            f"开始生成章节内容: "
            f"outline_length={len(request.outline)}, "
            f"detailed_outline_length={len(request.detailed_outline)}, "
            f"model={analysis_settings.get('model')}"
        )
        
        # 执行流式生成
        async def generate_content():
            """生成章节内容响应"""
            try:
                import json
                
                # 发送开始消息
                start_msg = json.dumps({
                    "type": "start",
                    "message": "开始生成章节内容..."
                })
                yield f"data: {start_msg}\n\n"
                
                # 流式生成内容（真正的流式响应）
                full_content = ""
                async for content_chunk in ai_service.generate_content_stream(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    model=analysis_settings.get("model"),
                    temperature=analysis_settings.get("temperature", 0.7),
                    max_tokens=analysis_settings.get("max_tokens", 8000),
                ):
                    # 累积内容
                    full_content += content_chunk
                    
                    # 实时发送内容块
                    chunk_msg = json.dumps({"type": "chunk", "content": content_chunk})
                    yield f"data: {chunk_msg}\n\n"
                
                # 发送完成消息
                done_msg = json.dumps({
                    "type": "done",
                    "message": "章节内容生成完成",
                    "content_length": len(full_content)
                })
                yield f"data: {done_msg}\n\n"
                
            except Exception as e:
                logger.error(f"生成章节内容过程出错: {traceback.format_exc()}")
                error_msg = json.dumps({
                    "type": "error",
                    "message": f"服务器错误: {str(e)}"
                })
                yield f"data: {error_msg}\n\n"
        
        return StreamingResponse(
            generate_content(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*",
            },
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate chapter content: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/create-work-from-file",
    summary="从文件创建作品和章节",
    description="根据文件名和章节数据批量创建作品和章节（不进行AI分析）",
    responses={
        200: {"description": "创建成功"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
    },
)
async def create_work_from_file(
    request: CreateWorkFromFileRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    从文件创建作品和章节
    
    工作流程：
    1. 根据文件名查找作品（从work_metadata.source_file）
    2. 如果不存在，创建新作品（标题=文件名）
    3. 批量创建章节
    4. 将章节内容保存到 ShareDB
    
    Args:
        request: 从文件创建作品请求
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        Dict: 创建结果，包含作品ID、标题、创建的章节数等
    """
    try:
   
        work_service = WorkService(db)
        chapter_service = ChapterService(db)
        sharedb_service = ShareDBService()
        await sharedb_service.initialize()
        
        # 1. 根据文件名查找作品
        work = await work_service.find_work_by_filename(request.file_name, current_user_id)
        work_created = False
        
        if not work:
            # 2. 如果不存在，创建新作品
            # 从文件名提取标题（去掉扩展名）
            import os
            work_title = os.path.splitext(request.file_name)[0]
            
            work = await work_service.create_work(
                owner_id=current_user_id,
                title=work_title,
                work_type="novel",  # 默认类型
                work_metadata={
                    "source_file": request.file_name
                }
            )
            work_created = True
            logger.info(f"✅ 创建新作品: {work.id} - {work.title}")
        else:
            logger.info(f"📖 找到现有作品: {work.id} - {work.title}")
        
        # 3. 批量创建章节
        created_chapters = []
        skipped_chapters = []
        total_new_word_count = 0  # 累计新创建章节的总字数
        
        for chapter_data in request.chapters:
            try:
                # 检查章节是否已存在（根据章节号和卷号）

                existing_chapter_stmt = select(Chapter).where(
                    and_(
                        Chapter.work_id == work.id,
                        Chapter.chapter_number == chapter_data.chapter_number,
                        Chapter.volume_number == (chapter_data.volume_number or 1)
                    )
                )
                existing_result = await db.execute(existing_chapter_stmt)
                existing_chapter = existing_result.scalar_one_or_none()
                
                if existing_chapter:
                    logger.warning(f"⚠️ 章节已存在，跳过: 第{chapter_data.chapter_number}章 - {chapter_data.title}")
                    skipped_chapters.append({
                        "chapter_id": existing_chapter.id,
                        "chapter_number": chapter_data.chapter_number,
                        "volume_number": chapter_data.volume_number or 1,
                        "title": chapter_data.title
                    })
                    continue
                
                # 计算章节字数（去除HTML标签，统计纯文本字符数）
                # 注意：这里使用原始内容计算字数，因为转换后的HTML会增加标签
                chapter_word_count = 0
                if chapter_data.content:
                    # 如果内容是HTML，需要提取纯文本
                    import re
                    # 简单的HTML标签去除
                    text_content = re.sub(r'<[^>]+>', '', chapter_data.content)
                    # 统计字符数（包括所有字符，与前端保持一致）
                    chapter_word_count = len(text_content)
                
                # 创建章节
                chapter = await chapter_service.create_chapter(
                    work_id=work.id,
                    title=chapter_data.title,
                    chapter_number=chapter_data.chapter_number,
                    volume_number=chapter_data.volume_number or 1,
                    status="draft",
                    word_count=chapter_word_count,
                )
                
                # 4. 将章节内容保存到 MongoDB (供 Yjs fetchInitialContent 使用)
                content_html = convert_text_to_html(chapter_data.content)
                
                document_id = f"work_{work.id}_chapter_{chapter.id}"
                await sharedb_service.create_document(
                    document_id=document_id,
                    initial_content={
                        "id": document_id,
                        "content": content_html,  # 使用转换后的HTML格式
                        "title": chapter_data.title,
                        "metadata": {
                            "work_id": work.id,
                            "chapter_id": chapter.id,
                            "chapter_number": chapter_data.chapter_number,
                            "volume_number": chapter_data.volume_number or 1,
                        }
                    }
                )
                
                # 5. 初始化 Yjs 状态
                try:
                    # 确保 YjsRoom 已加载
                    room_name = f"work_{work.id}"
                    await yjs_ws_manager.get_room(room_name)
                    logger.info(f"✅ [Yjs] 章节 {chapter.id} 已在 YjsRoom {room_name} 中就绪")
                except Exception as yjs_err:
                    logger.warning(f"⚠️ [Yjs] 初始化房间失败 (非致命): {yjs_err}")

                created_chapters.append({
                    "chapter_id": chapter.id,
                    "chapter_number": chapter_data.chapter_number,
                    "volume_number": chapter_data.volume_number or 1,
                    "title": chapter_data.title
                })
                
                # 累加字数
                total_new_word_count += chapter_word_count
                
                logger.info(f"✅ 创建章节: {chapter.id} - 第{chapter_data.chapter_number}章 - {chapter_data.title}, 字数: {chapter_word_count}")
                
            except Exception as e:
                logger.error(f"❌ 创建章节失败: {e}", exc_info=True)
                # 继续处理下一个章节
                continue
        
        # 更新作品统计（累加新创建的章节数和总字数）
        current_chapter_count = work.chapter_count or 0
        current_word_count = work.word_count or 0
        
        # 更新作品统计
        await work_service.update_work(
            work_id=work.id,
            chapter_count=current_chapter_count + len(created_chapters),
            word_count=current_word_count + total_new_word_count
        )
        
        logger.info(f"✅ 作品统计已更新: 章节数={current_chapter_count + len(created_chapters)}, 总字数={current_word_count + total_new_word_count} (新增 {total_new_word_count} 字)")
        
        return {
            "work_id": work.id,
            "work_title": work.title,
            "work_created": work_created,
            "chapters_created": len(created_chapters),
            "chapters_skipped": len(skipped_chapters),
            "created_chapters": created_chapters,
            "skipped_chapters": skipped_chapters,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create work from file: {traceback.format_exc()}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


def _build_additional_vars(request: "GenerateComponentDataRequest", work: "Work") -> dict:
    """将前端传来的当前组件数据合并进 additional_vars，供 format_prompt 使用。
    前端数据优先级高于数据库中已保存的 component_data。
    """
    if not request.component_data:
        return {}
    saved = (work.work_metadata or {}).get("component_data", {})
    merged = {**saved, **request.component_data}
    return {
        "component_data": merged,
        "组件数据": merged,
    }


@router.post(
    "/generate-component-data",
    summary="生成组件数据接口",
    description="根据组件的生成prompt生成组件数据",
    responses={
        200: {"description": "生成成功，返回生成的数据"},
        400: {"model": ErrorResponse, "description": "请求参数错误"},
        500: {"model": ErrorResponse, "description": "服务器内部错误"},
        503: {"model": ErrorResponse, "description": "AI服务不可用"},
    },
)
async def generate_component_data(
    request: GenerateComponentDataRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    生成组件数据
    
    根据组件的生成prompt生成数据，支持：
    1. 使用prompt模板ID（generate_prompt_id）或直接使用prompt内容（generate_prompt）
    2. 自动收集作品、角色、章节等上下文信息
    3. 格式化prompt并调用AI生成内容
    
    Args:
        request: 生成组件数据请求
        db: 数据库会话
        current_user_id: 当前用户ID
    
    Returns:
        Dict: 生成的数据（根据组件类型可能是字符串、列表、对象等）
    """
    try:
        # 验证作品是否存在并检查权限
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(request.work_id)
        if not work:
            raise HTTPException(status_code=404, detail=f"作品 {request.work_id} 不存在")
        
        # 检查用户是否有权限访问该作品
        if not await work_service.can_access_work(current_user_id, request.work_id):
            raise HTTPException(status_code=403, detail="无权访问该作品")
        
        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用")

        # 初始化Prompt上下文服务
        from memos.api.services.prompt_context_service import PromptContextService
        prompt_service = PromptContextService(db)
        await prompt_service.initialize()

        # 获取或构建prompt
        # 优先级：generate_prompt_id > generate_prompt > 按 work_template_id+component_id 自动查找
        template = None
        if request.generate_prompt_id:
            template = await prompt_service.get_prompt_template(
                template_type="component_generate",
                template_id=request.generate_prompt_id
            )
            if not template:
                logger.warning(f"指定的 Prompt模板 {request.generate_prompt_id} 不存在，尝试自动查找")

        if template is None and not request.generate_prompt:
            # 通过作品关联的模板自动查找该组件的 generate prompt
            # 优先使用请求中直接提供的 work_template_id，否则从 work 的 metadata 解析
            wt_id: Optional[int] = request.work_template_id
            if wt_id is None and work.work_metadata:
                tc = work.work_metadata.get("template_config", {})
                raw_id = tc.get("templateId", "")
                try:
                    # templateId 可能是 "8" 或 "db-8" 格式，取最后一段数字
                    wt_id = int(str(raw_id).split("-")[-1])
                except (ValueError, TypeError):
                    pass

            if wt_id is not None:
                try:
                    stmt = select(PromptTemplate).where(
                        and_(
                            PromptTemplate.work_template_id == wt_id,
                            PromptTemplate.component_id == request.component_id,
                            PromptTemplate.prompt_category == "generate",
                            PromptTemplate.is_active == True,
                        )
                    )
                    result = await db.execute(stmt)
                    template = result.scalar_one_or_none()
                    if template:
                        logger.info(f"自动查找到 Prompt 模板: id={template.id}, component={request.component_id}, work_template_id={wt_id}")
                except Exception as e:
                    logger.warning(f"自动查找 Prompt 失败: {e}")

        if template is None and not request.generate_prompt:
            raise HTTPException(
                status_code=400,
                detail=f"未找到组件 {request.component_id} 的 generate prompt，请在模板中配置或直接提供 generate_prompt"
            )

        if template is None:
            # 使用直接提供的 prompt 内容
            template = PromptTemplate()
            template.prompt_content = request.generate_prompt

        formatted_prompt = await prompt_service.format_prompt(
            template=template,
            work_id=request.work_id,
            chapter_id=request.chapter_id,
            auto_build_context=True,
            additional_vars=_build_additional_vars(request, work),
        )

        if not formatted_prompt:
            raise HTTPException(status_code=400, detail="无法获取有效的prompt")
        
        logger.info(f"开始生成组件数据: work_id={request.work_id}, component_id={request.component_id}, component_type={request.component_type}, data_key={request.data_key}")
        logger.debug(f"Formatted prompt (前500字符): {formatted_prompt[:500]}")

        # 文本类组件（输出纯文本，不需要JSON格式提示）
        TEXT_COMPONENT_TYPES = {"text", "textarea", "select", "multiselect", "tags", "image"}
        is_text_component = request.component_type in TEXT_COMPONENT_TYPES

        # 仅对结构化组件（JSON输出）添加现有数据结构参考
        existing_data_context = ""
        if not is_text_component:
            component_data = work.work_metadata.get("component_data", {}) if work.work_metadata else {}
            existing_data = component_data.get(request.data_key, [])

            if existing_data and isinstance(existing_data, list) and len(existing_data) > 0:
                import json
                example_data = existing_data[:3]
                existing_data_context = f"""
# 现有作品数据结构参考
以下是该作品已有的 {request.data_key} 数据结构示例（请参考此结构生成新数据）：

```json
{json.dumps(example_data, ensure_ascii=False, indent=2)}
```
**重要提示：**
1. 新生成的数据应该与上述数据结构保持一致
2. 如果生成的数据与已存在的数据有重复（通过唯一标识字段匹配，如 name、id、title 等），请保持该数据的现有字段结构，只更新或补充新信息
3. 如果生成新数据，请按照上述数据结构格式生成完整的信息
"""
                logger.debug(f"找到现有数据，共 {len(existing_data)} 条，将使用前3条作为格式参考")
            elif existing_data:
                import json
                existing_data_context = f"""
# 现有作品数据结构参考
以下是该作品已有的 {request.data_key} 数据结构示例（请参考此结构生成新数据）：

```json
{json.dumps(existing_data, ensure_ascii=False, indent=2)}
```
**重要提示：**
新生成的数据应该与上述数据结构保持一致。
"""
                logger.debug(f"找到现有数据（非列表格式），将作为格式参考")

        if existing_data_context:
            formatted_prompt = existing_data_context + "\n\n" + formatted_prompt
            logger.debug(f"添加现有数据上下文后，formatted_prompt 长度: {len(formatted_prompt)}")

        # 获取AI设置
        analysis_settings = request.settings or AnalysisSettings()
        model = analysis_settings.model or ai_service.default_model
        # 对于生成任务，使用更高的温度（默认0.9）以增加创造性和多样性
        if request.settings is None or (request.settings and request.settings.temperature == 0.7):
            temperature = 0.9
        else:
            temperature = analysis_settings.temperature
        max_tokens = analysis_settings.max_tokens

        # 调用AI生成内容（非流式，一次性返回）
        # 文本类组件强制不使用JSON格式；结构化组件也暂不强制，由prompt控制
        ai_response = await ai_service.get_ai_response(
            content="",
            prompt=formatted_prompt,
            system_prompt=None,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            use_json_format=False,
        )
        
        logger.info(f"✅ 组件数据生成完成: component_id={request.component_id}, data_key={request.data_key}, 响应长度={len(ai_response)}")
        
        # 返回生成的数据
        return {
            "component_id": request.component_id,
            "data_key": request.data_key,
            "generated_data": ai_response,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate component data: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@router.post(
    "/generate-chapter-outline",
    summary="生成章节大纲或细纲",
    description="根据作品背景和章节信息，使用AI生成章节大纲（outline）或细纲（detailed_outline）",
)
async def generate_chapter_outline(
    request: GenerateChapterOutlineRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    try:
        # 验证作品是否存在并检查权限
        work_service = WorkService(db)
        work = await work_service.get_work_by_id(request.work_id)
        if not work:
            raise HTTPException(status_code=404, detail=f"作品 {request.work_id} 不存在")

        if not await work_service.can_access_work(current_user_id, request.work_id):
            raise HTTPException(status_code=403, detail="无权访问该作品")

        # 获取AI服务
        ai_service = get_ai_service()
        if not ai_service.is_healthy():
            raise HTTPException(status_code=503, detail="AI服务不可用")

        # 初始化Prompt上下文服务
        from memos.api.services.prompt_context_service import PromptContextService
        prompt_service = PromptContextService(db)
        await prompt_service.initialize()

        # 根据大纲类型确定 template_type
        template_type = "outline_generation" if request.outline_type == "outline" else "detailed_outline_generation"

        # 从全局 prompt 模板中查找默认模板（work_template_id IS NULL）
        stmt = select(PromptTemplate).where(
            and_(
                PromptTemplate.template_type == template_type,
                PromptTemplate.work_template_id == None,
                PromptTemplate.is_active == True,
                PromptTemplate.is_default == True,
            )
        )
        result = await db.execute(stmt)
        template = result.scalar_one_or_none()

        # 如果没有默认模板，取任意启用的全局模板
        if template is None:
            stmt = select(PromptTemplate).where(
                and_(
                    PromptTemplate.template_type == template_type,
                    PromptTemplate.work_template_id == None,
                    PromptTemplate.is_active == True,
                )
            ).limit(1)
            result = await db.execute(stmt)
            template = result.scalar_one_or_none()

        if template is None:
            raise HTTPException(
                status_code=400,
                detail=f"未找到 {template_type} 类型的全局 Prompt 模板，请在管理后台创建并设为默认"
            )

        # 构建 additional_vars：注入章节标题、人物、地点和当前大纲（用于细纲生成）
        additional_vars: dict = {
            "chapter_title": request.chapter_title,
            "章节标题": request.chapter_title,
        }
        if request.characters:
            chars_str = "\n".join(f"- {c}" for c in request.characters)
            additional_vars["chapter_characters"] = chars_str
            additional_vars["章节角色"] = chars_str
        if request.locations:
            locs_str = "\n".join(f"- {l}" for l in request.locations)
            additional_vars["locations"] = locs_str
            additional_vars["地点"] = locs_str
        if request.current_outline:
            additional_vars["current_outline"] = request.current_outline
            additional_vars["outline"] = request.current_outline
            additional_vars["大纲"] = request.current_outline
            additional_vars["current_chapter_outline"] = request.current_outline
            additional_vars["当前章节大纲"] = request.current_outline

        # 格式化 prompt（带作品上下文、前文摘要等）
        formatted_prompt = await prompt_service.format_prompt(
            template=template,
            work_id=request.work_id,
            chapter_id=request.chapter_id,
            auto_build_context=True,
            additional_vars=additional_vars,
        )

        if not formatted_prompt:
            raise HTTPException(status_code=400, detail="无法获取有效的prompt")

        logger.info(f"开始生成章节{'大纲' if request.outline_type == 'outline' else '细纲'}: work_id={request.work_id}, chapter_title={request.chapter_title}")

        # 调用AI生成（纯文本输出，不强制JSON）
        analysis_settings = request.settings or AnalysisSettings()
        model = analysis_settings.model or ai_service.default_model
        temperature = analysis_settings.temperature if analysis_settings.temperature != 0.7 else 0.85
        max_tokens = analysis_settings.max_tokens

        ai_response = await ai_service.get_ai_response(
            content="",
            prompt=formatted_prompt,
            system_prompt=None,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            use_json_format=False,
        )

        logger.info(f"✅ {'大纲' if request.outline_type == 'outline' else '细纲'}生成完成，响应长度={len(ai_response)}")

        return {
            "outline_type": request.outline_type,
            "generated_text": ai_response,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate chapter outline: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")
