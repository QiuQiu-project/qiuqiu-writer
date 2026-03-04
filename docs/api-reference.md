# API 参考

所有接口均在后端 `http://localhost:8001` 提供。交互式文档见 http://localhost:8001/docs。

## 认证说明

除公开接口外，所有接口需在请求头携带 JWT：

```
Authorization: Bearer <access_token>
```

Token 通过 `/api/v1/auth/login` 获取，过期后用 `/api/v1/auth/refresh` 刷新。

---

## 认证模块 `/api/v1/auth`

### 注册

```
POST /api/v1/auth/register
```

**请求体：**

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "StrongPass123",
  "invitation_code": "INVITE-XXXX"
}
```

**响应：**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": 1, "username": "alice", "email": "alice@example.com" }
}
```

> 注册需要邀请码，由管理员通过后台生成。

---

### 登录

```
POST /api/v1/auth/login
```

**请求体：**

```json
{
  "username": "alice",   // 用户名或邮箱
  "password": "StrongPass123"
}
```

**响应：** 同注册响应格式。

---

### 刷新 Token

```
POST /api/v1/auth/refresh
```

**请求体：**

```json
{ "refresh_token": "eyJ..." }
```

---

### 登出

```
POST /api/v1/auth/logout
```

将当前 Token 加入黑名单，需携带 Authorization 头。

---

### 获取当前用户信息

```
GET /api/v1/auth/me
```

---

### 更新个人资料

```
PUT /api/v1/auth/me
```

**请求体（部分字段可选）：**

```json
{
  "display_name": "Alice",
  "bio": "热爱写作",
  "avatar_url": "https://..."
}
```

---

## 作品模块 `/api/v1/works`

### 创建作品

```
POST /api/v1/works
```

**请求体：**

```json
{
  "title": "我的小说",
  "work_type": "novel",   // novel | script
  "description": "简介...",
  "is_public": false
}
```

---

### 获取作品列表

```
GET /api/v1/works?page=1&page_size=20&work_type=novel&status=active
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页数量，默认 20 |
| `work_type` | string | 过滤类型 `novel` / `script` |
| `status` | string | 过滤状态 `active` / `archived` |

---

### 获取公开作品

```
GET /api/v1/works/public
```

---

### 获取作品详情

```
GET /api/v1/works/{work_id}
```

---

### 更新作品

```
PUT /api/v1/works/{work_id}
```

---

### 删除作品

```
DELETE /api/v1/works/{work_id}
```

硬删除，不可恢复，请谨慎操作。

---

### 发布作品

```
POST /api/v1/works/{work_id}/publish
```

---

### 归档作品

```
POST /api/v1/works/{work_id}/archive
```

---

### 协作者管理

```
GET    /api/v1/works/{work_id}/collaborators          # 获取协作者列表
POST   /api/v1/works/{work_id}/collaborators          # 添加协作者
PUT    /api/v1/works/{work_id}/collaborators/{uid}    # 更新协作者权限
DELETE /api/v1/works/{work_id}/collaborators/{uid}    # 移除协作者
```

---

## 章节模块 `/api/v1/chapters`

### 创建章节

```
POST /api/v1/chapters
```

**请求体：**

```json
{
  "work_id": 1,
  "title": "第一章 开端",
  "chapter_number": 1,
  "volume_number": 1
}
```

---

### 获取章节列表

```
GET /api/v1/chapters?work_id=1&page=1&page_size=50
```

---

### 获取章节详情

```
GET /api/v1/chapters/{chapter_id}
```

---

### 更新章节

```
PUT /api/v1/chapters/{chapter_id}
```

---

### 删除章节（软删除）

```
DELETE /api/v1/chapters/{chapter_id}
```

章节进入回收站，可通过 `restore` 接口恢复。

---

### 恢复已删除章节

```
POST /api/v1/chapters/{chapter_id}/restore
```

---

### Yjs 快照（版本历史）

```
GET  /api/v1/chapters/{chapter_id}/yjs-snapshots          # 获取快照列表
POST /api/v1/chapters/{chapter_id}/yjs-snapshots          # 创建快照
GET  /api/v1/chapters/{chapter_id}/yjs-snapshots/{snap_id} # 获取指定快照
```

---

### 实时协同（WebSocket）

```
WS /api/v1/chapters/{chapter_id}/collaborate
```

连接后遵循 Yjs y-websocket 协议，实现多人实时协同编辑。

---

## 卷模块 `/api/v1/volumes`

```
POST   /api/v1/volumes             # 创建卷
GET    /api/v1/volumes?work_id=1   # 获取卷列表
PUT    /api/v1/volumes/{volume_id} # 更新卷
DELETE /api/v1/volumes/{volume_id} # 删除卷
```

---

## AI 服务 `/ai`

> 所有 AI 接口支持流式（Server-Sent Events）和非流式两种响应模式。

### 章节 AI 分析

```
POST /ai/chapter/analyze
```

**请求体：**

```json
{
  "chapter_id": 1,
  "analysis_type": "structure"   // structure | plot | character | style
}
```

---

### AI 续写

```
POST /ai/chapter/generate
```

**请求体：**

```json
{
  "chapter_id": 1,
  "prompt": "继续写下去，主角即将遇到...",
  "max_tokens": 500,
  "stream": true
}
```

---

### 书籍整体分析

```
POST /ai/book/analyze
```

---

### 健康检查

```
GET /ai/health
```

---

## 产品级 AI 功能 `/v1`

### 对话补全

```
POST /v1/chat/completions
```

兼容 OpenAI Chat Completions API 格式。

---

### 语义搜索

```
POST /v1/search
```

**请求体：**

```json
{
  "query": "主角第一次遇到反派",
  "work_id": 1,
  "top_k": 5
}
```

---

### 记忆管理

```
GET  /v1/memory          # 获取记忆列表
POST /v1/memory          # 写入记忆
DELETE /v1/memory/{id}   # 删除记忆
```

---

## 反馈模块 `/api/v1/feedback`

### 提交反馈

```
POST /api/v1/feedback
```

**请求体：**

```json
{
  "type": "bug",          // bug | feature | other
  "title": "编辑器卡顿",
  "description": "在写到 1 万字后，编辑器响应变慢..."
}
```

---

## 管理后台 `/api/v1/admin`

> 所有管理接口需要管理员权限。

### 系统监控

```
GET /api/v1/admin/system-monitor
```

**响应示例：**

```json
{
  "cpu_percent": 23.5,
  "memory_percent": 68.2,
  "disk_usage_percent": 45.1
}
```

---

### 用户管理

```
GET    /api/v1/admin/users              # 用户列表
PUT    /api/v1/admin/users/{user_id}    # 更新用户状态
```

---

### 邀请码管理

```
GET    /api/v1/admin/invitation-codes           # 邀请码列表
POST   /api/v1/admin/invitation-codes           # 生成邀请码
DELETE /api/v1/admin/invitation-codes/{code_id} # 删除邀请码
```

---

### 提示词模板管理

```
GET    /api/v1/prompt-templates          # 获取模板列表
POST   /api/v1/prompt-templates          # 创建模板
PUT    /api/v1/prompt-templates/{id}     # 更新模板
DELETE /api/v1/prompt-templates/{id}     # 删除模板
```

---

## 通用响应格式

### 成功响应

```json
{
  "code": 0,
  "message": "success",
  "data": { /* 业务数据 */ }
}
```

### 错误响应

```json
{
  "code": 40001,
  "message": "用户名已存在",
  "detail": "username already exists"
}
```

### 常见状态码

| HTTP 状态码 | 含义 |
|------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证（Token 无效或过期） |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 422 | 请求体校验失败 |
| 500 | 服务器内部错误 |
