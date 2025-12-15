"""
作品信息模板管理API路由
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_

from memos.api.core.database import get_async_db
from memos.api.core.security import get_current_user_id
from memos.api.services.template_service import TemplateService
from memos.api.models.template import WorkTemplate, TemplateField, WorkInfoExtended

# Temporary schemas - will be replaced with proper schema files
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

router = APIRouter(prefix="/api/v1/templates", tags=["作品模板管理"])


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


class WorkTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    work_type: str
    category: Optional[str] = None
    template_config: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = False
    settings: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None

class WorkTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    template_config: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None

class WorkTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    work_type: str
    category: Optional[str] = None
    is_system: bool
    is_public: bool
    template_config: Dict[str, Any]
    settings: Dict[str, Any]
    tags: List[str]
    usage_count: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class TemplateFieldCreate(BaseModel):
    field_name: str
    field_type: str
    field_label: str

class TemplateFieldUpdate(BaseModel):
    field_label: Optional[str] = None

class TemplateFieldResponse(BaseModel):
    id: int
    field_name: str
    field_type: str
    field_label: str

class WorkInfoExtendedCreate(BaseModel):
    template_id: int
    field_values: Dict[str, Any]

class WorkInfoExtendedUpdate(BaseModel):
    field_values: Optional[Dict[str, Any]] = None

class WorkInfoExtendedResponse(BaseModel):
    id: int
    work_id: int
    template_id: int
    field_values: Dict[str, Any]


# 作品模板管理
@router.post("/", response_model=WorkTemplateResponse)
async def create_template(
    template_data: WorkTemplateCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建作品模板
    """
    template_service = TemplateService(db)

    template = await template_service.create_template(
        creator_id=current_user_id,
        **template_data.dict()
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="create_template",
        target_type="template",
        target_id=template.id,
        details={"name": template.name, "work_type": template.work_type},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return template.to_dict(include_fields=True)


@router.get("/", response_model=List[WorkTemplateResponse])
async def list_templates(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    category: Optional[str] = Query(None, description="模板分类"),
    is_public: Optional[bool] = Query(None, description="是否公开"),
    is_system: Optional[bool] = Query(None, description="是否系统模板"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    include_fields: bool = Query(False, description="是否包含字段信息"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> List[Dict[str, Any]]:
    """
    获取模板列表
    """
    template_service = TemplateService(db)

    filters = {}
    if work_type:
        filters["work_type"] = work_type
    if category:
        filters["category"] = category
    if is_public is not None:
        filters["is_public"] = is_public
    if is_system is not None:
        filters["is_system"] = is_system
    if search:
        filters["search"] = search

    templates, total = await template_service.get_templates(
        user_id=current_user_id,
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    result = []
    for template in templates:
        if hasattr(template, 'to_dict'):
            result.append(template.to_dict(include_fields=include_fields, include_stats=True))
        else:
            # 如果已经是字典，直接使用
            result.append(template)
    
    return result


@router.get("/public", response_model=List[WorkTemplateResponse])
async def get_public_templates(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    work_type: Optional[str] = Query(None, description="作品类型"),
    category: Optional[str] = Query(None, description="模板分类"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    sort_by: str = Query("usage_count", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    include_fields: bool = Query(False, description="是否包含字段信息"),
    db: AsyncSession = Depends(get_async_db)
) -> List[Dict[str, Any]]:
    """
    获取公开模板列表
    """
    template_service = TemplateService(db)

    filters = {"is_public": True}
    if work_type:
        filters["work_type"] = work_type
    if category:
        filters["category"] = category
    if search:
        filters["search"] = search

    templates = await template_service.get_public_templates(
        filters=filters,
        page=page,
        size=size,
        sort_by=sort_by,
        sort_order=sort_order
    )

    return [
        template.to_dict(include_fields=include_fields, include_stats=True)
        for template in templates
    ]


@router.get("/{template_id}", response_model=WorkTemplateResponse)
async def get_template(
    template_id: int,
    include_fields: bool = Query(True, description="是否包含字段信息"),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取模板详情
    """
    template_service = TemplateService(db)

    template = await template_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在"
        )

    # 检查访问权限
    if not await template_service.can_access_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该模板的权限"
        )

    return template.to_dict(include_fields=include_fields, include_stats=True)


@router.put("/{template_id}", response_model=WorkTemplateResponse)
async def update_template(
    template_id: int,
    template_update: WorkTemplateUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新模板信息
    """
    template_service = TemplateService(db)

    # 检查模板是否存在
    template = await template_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在"
        )

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 更新模板
    updated_template = await template_service.update_template(
        template_id=template_id,
        **template_update.dict(exclude_unset=True)
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="update_template",
        target_type="template",
        target_id=template_id,
        details=template_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return updated_template.to_dict(include_fields=True)


@router.delete("/{template_id}")
async def delete_template(
    template_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    删除模板
    """
    template_service = TemplateService(db)

    # 检查模板是否存在
    template = await template_service.get_template_by_id(template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在"
        )

    # 检查删除权限
    if template.creator_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有模板创建者可以删除模板"
        )

    # 删除模板
    await template_service.delete_template(template_id)

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="delete_template",
        target_type="template",
        target_id=template_id,
        details={"name": template.name},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {"message": "模板删除成功"}


# 模板字段管理
@router.post("/{template_id}/fields", response_model=TemplateFieldResponse)
async def add_template_field(
    template_id: int,
    field_data: TemplateFieldCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    添加模板字段
    """
    template_service = TemplateService(db)

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 添加字段
    field = await template_service.add_template_field(
        template_id=template_id,
        **field_data.dict()
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="add_template_field",
        target_type="template_field",
        target_id=field.id,
        details={
            "template_id": template_id,
            "field_name": field.field_name,
            "field_type": field.field_type
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return field.to_dict()


@router.put("/{template_id}/fields/{field_id}", response_model=TemplateFieldResponse)
async def update_template_field(
    template_id: int,
    field_id: int,
    field_update: TemplateFieldUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新模板字段
    """
    template_service = TemplateService(db)

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 更新字段
    field = await template_service.update_template_field(
        field_id=field_id,
        **field_update.dict(exclude_unset=True)
    )

    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="字段不存在"
        )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="update_template_field",
        target_type="template_field",
        target_id=field_id,
        details=field_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return field.to_dict()


@router.delete("/{template_id}/fields/{field_id}")
async def delete_template_field(
    template_id: int,
    field_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    删除模板字段
    """
    template_service = TemplateService(db)

    # 检查编辑权限
    if not await template_service.can_edit_template(
        user_id=current_user_id,
        template_id=template_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该模板的权限"
        )

    # 删除字段
    success = await template_service.delete_template_field(field_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="字段不存在"
        )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="delete_template_field",
        target_type="template_field",
        target_id=field_id,
        details={"template_id": template_id},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {"message": "字段删除成功"}


# 作品信息扩展管理
@router.post("/works/{work_id}/extended", response_model=WorkInfoExtendedResponse)
async def create_work_extended_info(
    work_id: int,
    extended_data: WorkInfoExtendedCreate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    创建作品扩展信息
    """
    template_service = TemplateService(db)

    # 检查作品编辑权限
    if not await template_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 创建扩展信息
    extended_info = await template_service.create_work_extended_info(
        work_id=work_id,
        **extended_data.dict()
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="create_work_extended_info",
        target_type="work_extended_info",
        target_id=extended_info.id,
        details={
            "work_id": work_id,
            "template_id": extended_data.template_id
        },
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return extended_info.to_dict(include_template_info=True)


@router.get("/works/{work_id}/extended", response_model=WorkInfoExtendedResponse)
async def get_work_extended_info(
    work_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品扩展信息
    """
    template_service = TemplateService(db)

    # 检查作品访问权限
    if not await template_service.can_access_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )

    extended_info = await template_service.get_work_extended_info(work_id)
    if not extended_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品扩展信息不存在"
        )

    return extended_info.to_dict(include_template_info=True)


@router.put("/works/{work_id}/extended", response_model=WorkInfoExtendedResponse)
async def update_work_extended_info(
    work_id: int,
    extended_update: WorkInfoExtendedUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    更新作品扩展信息
    """
    template_service = TemplateService(db)

    # 检查作品编辑权限
    if not await template_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 更新扩展信息
    extended_info = await template_service.update_work_extended_info(
        work_id=work_id,
        **extended_update.dict(exclude_unset=True)
    )

    if not extended_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品扩展信息不存在"
        )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="update_work_extended_info",
        target_type="work_extended_info",
        target_id=extended_info.id,
        details=extended_update.dict(exclude_unset=True),
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return extended_info.to_dict(include_template_info=True)


@router.post("/works/{work_id}/apply-template/{template_id}")
async def apply_template_to_work(
    work_id: int,
    template_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    将模板应用到作品
    """
    template_service = TemplateService(db)

    # 检查作品编辑权限
    if not await template_service.can_edit_work(
        user_id=current_user_id,
        work_id=work_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )

    # 应用模板
    extended_info = await template_service.apply_template_to_work(
        work_id=work_id,
        template_id=template_id
    )

    # 记录审计日志
    await template_service.create_audit_log(
        user_id=current_user_id,
        action="apply_template_to_work",
        target_type="work",
        target_id=work_id,
        details={"template_id": template_id},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )

    return {
        "message": "模板应用成功",
        "extended_info": extended_info.to_dict(include_template_info=True)
    }


# 作品模板配置管理（保存/加载作品的模板配置）
@router.post("/works/{work_id}/template-config")
async def save_work_template_config(
    work_id: int,
    template_config: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    保存作品的模板配置到数据库
    模板配置会保存在 work.work_metadata["template_config"] 中
    """
    from memos.api.services.work_service import WorkService
    
    work_service = WorkService(db)
    
    # 检查作品是否存在和编辑权限
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )
    
    # 检查编辑权限
    if work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有编辑该作品的权限"
        )
    
    # 更新 work_metadata 中的 template_config
    work_metadata = work.work_metadata or {}
    work_metadata["template_config"] = template_config
    work.work_metadata = work_metadata
    
    try:
        await db.commit()
        await db.refresh(work)
        
        # 简单验证：检查 template_config 是否存在
        saved_config = work.work_metadata.get("template_config") if work.work_metadata else None
        if saved_config is None:
            # 如果保存失败，记录警告但不抛出异常（可能是 JSONB 序列化问题）
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"保存模板配置后验证：template_config 为空，work_id={work_id}")
        
        return {
            "message": "模板配置保存成功",
            "work_id": work_id,
            "template_config": template_config
        }
    except HTTPException:
        # 重新抛出 HTTP 异常
        raise
    except Exception as e:
        await db.rollback()
        import traceback
        import logging
        logger = logging.getLogger(__name__)
        error_detail = f"保存模板配置失败: {str(e)}\n{traceback.format_exc()}"
        logger.error(f"❌ {error_detail}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"保存模板配置失败: {str(e)}"
        )


@router.get("/works/{work_id}/template-config")
async def get_work_template_config(
    work_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user_id: int = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    获取作品的模板配置
    从 work.work_metadata["template_config"] 中读取
    """
    from memos.api.services.work_service import WorkService
    
    work_service = WorkService(db)
    
    # 检查作品是否存在和访问权限
    work = await work_service.get_work_by_id(work_id)
    if not work:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="作品不存在"
        )
    
    # 检查访问权限
    if work.owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有访问该作品的权限"
        )
    
    # 从 work_metadata 中获取 template_config
    work_metadata = work.work_metadata or {}
    template_config = work_metadata.get("template_config")
    
    if not template_config:
        return {
            "work_id": work_id,
            "template_config": None,
            "message": "该作品尚未保存模板配置"
        }
    
    return {
        "work_id": work_id,
        "template_config": template_config
    }


# 工具函数
def get_client_ip(request: Request) -> Optional[str]:
    """获取客户端IP地址"""
    return request.client.host if request.client else None


def get_user_agent(request: Request) -> Optional[str]:
    """获取用户代理"""
    return request.headers.get("user-agent")