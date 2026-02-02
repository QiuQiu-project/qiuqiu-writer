from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

class AdminLoginRequest(BaseModel):
    username: str
    password: str

class AdminCreateRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: str | None = None

class AdminUserResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: str | None = None
    status: str
    created_at: str | None = None
    last_login_at: str | None = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: AdminUserResponse

class StatusUpdateRequest(BaseModel):
    status: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str | None = None
    display_name: str | None = None
    status: str
    created_at: str | None = None
    last_login_at: str | None = None
    role: str = "user"

class UserListResponse(BaseModel):
    total: int
    items: list[UserResponse]
    page: int
    size: int

class WorkResponse(BaseModel):
    id: str
    title: str
    work_type: str
    status: str
    owner_id: str
    created_at: str | None = None
    updated_at: str | None = None
    is_public: bool = False
    description: str | None = None

class WorkListResponse(BaseModel):
    total: int
    items: list[WorkResponse]
    page: int
    size: int

class PromptTemplateResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    template_type: str
    prompt_content: str
    version: str
    is_default: bool
    is_active: bool
    variables: dict | None = None
    metadata: dict | None = Field(None, validation_alias="template_metadata")
    usage_count: int
    component_id: str | None = None
    component_type: str | None = None
    prompt_category: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True
        populate_by_name = True

class PromptTemplateListResponse(BaseModel):
    total: int
    items: list[PromptTemplateResponse]
    page: int
    size: int

class PromptTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    template_type: str
    prompt_content: str
    version: str | None = "1.0"
    is_default: bool | None = False
    is_active: bool | None = True
    variables: dict | None = None
    metadata: dict | None = None
    component_id: str | None = None
    component_type: str | None = None
    prompt_category: str | None = None
    data_key: str | None = None

class PromptTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    template_type: str | None = None
    prompt_content: str | None = None
    version: str | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    variables: dict | None = None
    metadata: dict | None = None
    component_id: str | None = None
    component_type: str | None = None
    prompt_category: str | None = None
    data_key: str | None = None

