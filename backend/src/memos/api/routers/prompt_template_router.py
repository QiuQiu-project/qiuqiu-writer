"""
Prompt模板管理API路由
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from memos.api.core.database import get_async_db
from memos.api.routers.auth_router import get_current_user_id
from memos.api.models.prompt_template import PromptTemplate
from memos.api.services.book_analysis_service import BookAnalysisService
from memos.log import get_logger

logger = get_logger(__name__)

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
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.post("/", response_model=PromptTemplateResponse)
async def create_prompt_template(
    template_data: PromptTemplateCreate,
    db: AsyncSession = Depends(get_async_db),
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
    db: AsyncSession = Depends(get_async_db),
):
    """获取Prompt模板列表"""
    try:
        stmt = select(PromptTemplate)
        
        conditions = []
        if template_type:
            conditions.append(PromptTemplate.template_type == template_type)
        if is_active is not None:
            conditions.append(PromptTemplate.is_active == is_active)
        
        if conditions:
            from sqlalchemy import and_
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
    db: AsyncSession = Depends(get_async_db),
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
    db: AsyncSession = Depends(get_async_db),
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
    db: AsyncSession = Depends(get_async_db),
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
    db: AsyncSession = Depends(get_async_db),
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

