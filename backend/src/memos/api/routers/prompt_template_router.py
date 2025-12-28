"""
Prompt模板管理API路由
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from pydantic import BaseModel

from memos.api.core.database import get_async_db
from memos.api.routers.auth_router import get_current_user_id
from memos.api.models.prompt_template import PromptTemplate
from memos.api.services.book_analysis_service import BookAnalysisService
from memos.log import get_logger

logger = get_logger(__name__)

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

router = APIRouter(prefix="/api/v1/prompt-templates", tags=["Prompt模板管理"])


class PromptTemplateCreate(BaseModel):
    """创建Prompt模板请求"""
    name: str
    description: Optional[str] = None
    template_type: str  # book_analysis/chapter_analysis等
    prompt_content: str
    version: str = "1.0"
    is_default: bool = False
    variables: Optional[dict] = None
    metadata: Optional[dict] = None
    # 组件相关字段
    component_id: Optional[str] = None  # 组件ID
    component_type: Optional[str] = None  # 组件类型
    prompt_category: Optional[str] = None  # generate或validate或analysis
    data_key: Optional[str] = None  # 数据存储键
    work_id: Optional[int] = None  # 关联的作品ID（向后兼容）
    work_template_id: Optional[int] = None  # 关联的模板ID


class PromptTemplateUpdate(BaseModel):
    """更新Prompt模板请求"""
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_content: Optional[str] = None
    version: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    variables: Optional[dict] = None
    metadata: Optional[dict] = None
    # 组件相关字段
    data_key: Optional[str] = None  # 数据存储键
    component_id: Optional[str] = None
    component_type: Optional[str] = None
    prompt_category: Optional[str] = None
    work_id: Optional[int] = None


class PromptTemplateResponse(BaseModel):
    """Prompt模板响应"""
    id: int
    name: str
    description: Optional[str]
    template_type: str
    prompt_content: str
    version: str
    is_default: bool
    is_active: bool
    variables: dict
    metadata: dict
    usage_count: int
    creator_id: Optional[int]
    component_id: Optional[str] = None
    component_type: Optional[str] = None
    prompt_category: Optional[str] = None
    work_id: Optional[int] = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.post("/", response_model=PromptTemplateResponse)
async def create_prompt_template(
    template_data: PromptTemplateCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """创建Prompt模板"""
    try:
        # 如果设置为默认模板，先取消其他默认模板
        if template_data.is_default:
            stmt = select(PromptTemplate).where(
                PromptTemplate.template_type == template_data.template_type,
                PromptTemplate.is_default == True
            )
            result = await db.execute(stmt)
            existing_defaults = result.scalars().all()
            for default_template in existing_defaults:
                default_template.is_default = False
        
        # 创建新模板
        template = PromptTemplate(
            name=template_data.name,
            description=template_data.description,
            template_type=template_data.template_type,
            prompt_content=template_data.prompt_content,
            version=template_data.version,
            is_default=template_data.is_default,
            variables=template_data.variables or {},
            template_metadata=template_data.metadata or {},
            component_id=template_data.component_id,
            component_type=template_data.component_type,
            prompt_category=template_data.prompt_category,
            data_key=template_data.data_key,
            work_id=template_data.work_id,
            work_template_id=template_data.work_template_id,
            creator_id=current_user_id,
        )
        
        db.add(template)
        await db.commit()
        await db.refresh(template)
        
        logger.info(f"创建Prompt模板成功: {template.id} - {template.name}")
        
        return PromptTemplateResponse(**template.to_dict())
        
    except Exception as e:
        await db.rollback()
        logger.error(f"创建Prompt模板失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建模板失败: {str(e)}")


@router.get("/", response_model=List[PromptTemplateResponse])
async def list_prompt_templates(
    template_type: Optional[str] = Query(None, description="模板类型过滤"),
    is_active: Optional[bool] = Query(None, description="是否只获取活跃的模板"),
    component_id: Optional[str] = Query(None, description="组件ID过滤"),
    prompt_category: Optional[str] = Query(None, description="Prompt类别过滤（generate/validate/analysis）"),
    work_id: Optional[int] = Query(None, description="作品ID过滤（向后兼容）"),
    work_template_id: Optional[int] = Query(None, description="模板ID过滤"),
    db: AsyncSession = Depends(get_db_session),
):
    """获取Prompt模板列表"""
    try:
        stmt = select(PromptTemplate)
        
        conditions = []
        if template_type:
            conditions.append(PromptTemplate.template_type == template_type)
        if is_active is not None:
            conditions.append(PromptTemplate.is_active == is_active)
        if component_id:
            conditions.append(PromptTemplate.component_id == component_id)
        if prompt_category:
            conditions.append(PromptTemplate.prompt_category == prompt_category)
        if work_id is not None:
            conditions.append(PromptTemplate.work_id == work_id)
        if work_template_id is not None:
            conditions.append(PromptTemplate.work_template_id == work_template_id)
        
        if conditions:
            stmt = stmt.where(and_(*conditions))
        
        stmt = stmt.order_by(PromptTemplate.created_at.desc())
        
        result = await db.execute(stmt)
        templates = result.scalars().all()
        
        return [PromptTemplateResponse(**t.to_dict()) for t in templates]
        
    except Exception as e:
        logger.error(f"获取Prompt模板列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取模板列表失败: {str(e)}")


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_prompt_template(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    """获取Prompt模板详情"""
    try:
        stmt = select(PromptTemplate).where(PromptTemplate.id == template_id)
        result = await db.execute(stmt)
        template = result.scalar_one_or_none()
        
        if not template:
            raise HTTPException(status_code=404, detail="模板不存在")
        
        return PromptTemplateResponse(**template.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取Prompt模板失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取模板失败: {str(e)}")


@router.put("/{template_id}", response_model=PromptTemplateResponse)
async def update_prompt_template(
    template_id: int,
    template_update: PromptTemplateUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """更新Prompt模板"""
    try:
        stmt = select(PromptTemplate).where(PromptTemplate.id == template_id)
        result = await db.execute(stmt)
        template = result.scalar_one_or_none()
        
        if not template:
            raise HTTPException(status_code=404, detail="模板不存在")
        
        # 检查权限（只有创建者可以修改）
        if template.creator_id != current_user_id:
            raise HTTPException(status_code=403, detail="没有权限修改此模板")
        
        # 如果设置为默认模板，先取消其他默认模板
        if template_update.is_default:
            stmt = select(PromptTemplate).where(
                PromptTemplate.template_type == template.template_type,
                PromptTemplate.is_default == True,
                PromptTemplate.id != template_id
            )
            result = await db.execute(stmt)
            existing_defaults = result.scalars().all()
            for default_template in existing_defaults:
                default_template.is_default = False
        
        # 更新字段
        update_data = template_update.dict(exclude_unset=True)
        # 处理metadata字段映射
        if "metadata" in update_data:
            update_data["template_metadata"] = update_data.pop("metadata")
        
        for key, value in update_data.items():
            if hasattr(template, key):
                setattr(template, key, value)
        
        await db.commit()
        await db.refresh(template)
        
        logger.info(f"更新Prompt模板成功: {template.id}")
        
        return PromptTemplateResponse(**template.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"更新Prompt模板失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新模板失败: {str(e)}")


@router.delete("/{template_id}")
async def delete_prompt_template(
    template_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """删除Prompt模板"""
    try:
        stmt = select(PromptTemplate).where(PromptTemplate.id == template_id)
        result = await db.execute(stmt)
        template = result.scalar_one_or_none()
        
        if not template:
            raise HTTPException(status_code=404, detail="模板不存在")
        
        # 检查权限（只有创建者可以删除）
        if template.creator_id != current_user_id:
            raise HTTPException(status_code=403, detail="没有权限删除此模板")
        
        await db.delete(template)
        await db.commit()
        
        logger.info(f"删除Prompt模板成功: {template_id}")
        
        return {"message": "删除成功"}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"删除Prompt模板失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除模板失败: {str(e)}")


@router.get("/type/{template_type}/default", response_model=PromptTemplateResponse)
async def get_default_prompt_template(
    template_type: str,
    db: AsyncSession = Depends(get_db_session),
):
    """获取指定类型的默认Prompt模板"""
    try:
        book_analysis_service = BookAnalysisService(db)
        template = await book_analysis_service.get_default_prompt_template(template_type)
        
        if not template:
            raise HTTPException(status_code=404, detail=f"未找到类型为 {template_type} 的默认模板")
        
        return PromptTemplateResponse(**template.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取默认Prompt模板失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取默认模板失败: {str(e)}")


# ============ 组件Prompt相关API ============

@router.get("/component/{component_id}", response_model=Dict[str, Any])
async def get_component_prompts(
    component_id: str,
    work_id: Optional[int] = Query(None, description="作品ID（可选，用于获取作品级别的组件prompt）"),
    db: AsyncSession = Depends(get_db_session),
):
    """获取组件的生成和验证prompt"""
    try:
        conditions = [
            PromptTemplate.component_id == component_id,
            PromptTemplate.is_active == True
        ]
        
        if work_id:
            # 优先获取作品级别的prompt
            conditions.append(PromptTemplate.work_id == work_id)
        else:
            # 获取全局的组件prompt（work_id为NULL）
            conditions.append(PromptTemplate.work_id.is_(None))
        
        stmt = select(PromptTemplate).where(and_(*conditions))
        result = await db.execute(stmt)
        templates = result.scalars().all()
        
        # 组织返回数据
        prompts = {
            "component_id": component_id,
            "work_id": work_id,
            "generate": None,
            "validate": None,
        }
        
        for template in templates:
            if template.prompt_category == "generate":
                prompts["generate"] = PromptTemplateResponse(**template.to_dict())
            elif template.prompt_category == "validate":
                prompts["validate"] = PromptTemplateResponse(**template.to_dict())
        
        return prompts
        
    except Exception as e:
        logger.error(f"获取组件prompt失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取组件prompt失败: {str(e)}")


class ComponentPromptCreate(BaseModel):
    """创建组件prompt请求"""
    component_type: str
    work_id: Optional[int] = None
    generate_prompt: Optional[str] = None
    validate_prompt: Optional[str] = None


@router.post("/component/{component_id}", response_model=Dict[str, PromptTemplateResponse])
async def create_component_prompts(
    component_id: str,
    prompt_data: ComponentPromptCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id),
):
    """创建或更新组件的生成和验证prompt"""
    try:
        result = {}
        
        # 处理生成prompt
        if prompt_data.generate_prompt:
            # 检查是否已存在
            stmt = select(PromptTemplate).where(
                and_(
                    PromptTemplate.component_id == component_id,
                    PromptTemplate.prompt_category == "generate",
                    PromptTemplate.work_id == (prompt_data.work_id if prompt_data.work_id else None)
                )
            )
            existing = await db.execute(stmt)
            template = existing.scalar_one_or_none()
            
            if template:
                # 更新
                template.prompt_content = prompt_data.generate_prompt
                template.component_type = prompt_data.component_type
                await db.commit()
                await db.refresh(template)
                result["generate"] = PromptTemplateResponse(**template.to_dict())
            else:
                # 创建
                template = PromptTemplate(
                    name=f"{component_id} - 生成prompt",
                    description=f"组件 {component_id} 的生成prompt",
                    template_type="component_generate",
                    prompt_content=prompt_data.generate_prompt,
                    component_id=component_id,
                    component_type=prompt_data.component_type,
                    prompt_category="generate",
                    work_id=prompt_data.work_id,
                    creator_id=current_user_id,
                )
                db.add(template)
                await db.commit()
                await db.refresh(template)
                result["generate"] = PromptTemplateResponse(**template.to_dict())
        
        # 处理验证prompt
        if prompt_data.validate_prompt:
            # 检查是否已存在
            stmt = select(PromptTemplate).where(
                and_(
                    PromptTemplate.component_id == component_id,
                    PromptTemplate.prompt_category == "validate",
                    PromptTemplate.work_id == (prompt_data.work_id if prompt_data.work_id else None)
                )
            )
            existing = await db.execute(stmt)
            template = existing.scalar_one_or_none()
            
            if template:
                # 更新
                template.prompt_content = prompt_data.validate_prompt
                template.component_type = prompt_data.component_type
                await db.commit()
                await db.refresh(template)
                result["validate"] = PromptTemplateResponse(**template.to_dict())
            else:
                # 创建
                template = PromptTemplate(
                    name=f"{component_id} - 验证prompt",
                    description=f"组件 {component_id} 的验证prompt",
                    template_type="component_validate",
                    prompt_content=prompt_data.validate_prompt,
                    component_id=component_id,
                    component_type=prompt_data.component_type,
                    prompt_category="validate",
                    work_id=prompt_data.work_id,
                    creator_id=current_user_id,
                )
                db.add(template)
                await db.commit()
                await db.refresh(template)
                result["validate"] = PromptTemplateResponse(**template.to_dict())
        
        return result
        
    except Exception as e:
        await db.rollback()
        logger.error(f"创建组件prompt失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建组件prompt失败: {str(e)}")


@router.get("/work/{work_id}/components", response_model=Dict[str, Any])
async def get_work_component_prompts(
    work_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    """获取作品所有组件的prompt"""
    try:
        stmt = select(PromptTemplate).where(
            and_(
                PromptTemplate.work_id == work_id,
                PromptTemplate.component_id.isnot(None),
                PromptTemplate.is_active == True
            )
        )
        result = await db.execute(stmt)
        templates = result.scalars().all()
        
        # 按组件ID组织
        component_prompts = {}
        for template in templates:
            comp_id = template.component_id
            if comp_id not in component_prompts:
                component_prompts[comp_id] = {
                    "component_id": comp_id,
                    "component_type": template.component_type,
                    "generate": None,
                    "validate": None,
                }
            
            if template.prompt_category == "generate":
                component_prompts[comp_id]["generate"] = PromptTemplateResponse(**template.to_dict())
            elif template.prompt_category == "validate":
                component_prompts[comp_id]["validate"] = PromptTemplateResponse(**template.to_dict())
        
        return {
            "work_id": work_id,
            "components": component_prompts
        }
        
    except Exception as e:
        logger.error(f"获取作品组件prompt失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取作品组件prompt失败: {str(e)}")


@router.post("/batch", response_model=List[PromptTemplateResponse])
async def get_prompt_templates_by_ids(
    prompt_ids: List[int] = Body(..., description="Prompt模板ID列表"),
    db: AsyncSession = Depends(get_db_session),
):
    """根据ID列表批量获取Prompt模板"""
    try:
        if not prompt_ids:
            return []
        
        stmt = select(PromptTemplate).where(PromptTemplate.id.in_(prompt_ids))
        result = await db.execute(stmt)
        templates = result.scalars().all()
        
        return [PromptTemplateResponse(**t.to_dict()) for t in templates]
        
    except Exception as e:
        logger.error(f"批量获取Prompt模板失败: {e}")
        raise HTTPException(status_code=500, detail=f"批量获取模板失败: {str(e)}")

