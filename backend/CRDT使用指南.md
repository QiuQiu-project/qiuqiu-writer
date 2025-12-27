# CRDT协作编辑使用指南

## 概述

已实现Yjs和Automerge两种CRDT协作编辑方案，支持多用户实时协作编辑，无需手动处理冲突。

## 安装依赖

### 后端

```bash
cd backend
pip install y-py automerge
```

### 前端

```bash
cd frontend
npm install yjs y-websocket @automerge/automerge @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

详细安装说明请参考：`CRDT_依赖安装说明.md`

## 架构

### Yjs架构

```
前端 (Yjs) ←→ WebSocket (/ws/yjs/{doc_id}) ←→ 后端 (y-py)
                ↓
            Redis (持久化)
```

### Automerge架构

```
前端 (Automerge) ←→ WebSocket (/ws/automerge/{doc_id}) ←→ 后端 (automerge)
                ↓
            Redis (持久化)
```

## 使用方法

### 1. 使用Yjs（推荐）

#### 前端示例

```typescript
import { useCollaboration } from '@/hooks/useCollaboration'
import { CollaborativeEditor } from '@/components/editor/CollaborativeEditor'

function MyComponent() {
  return (
    <CollaborativeEditor
      documentId="work_4_chapter_6"
      userId={123}
      userName="张三"
      userColor="#958DF1"
    />
  )
}
```

#### 直接使用Yjs客户端

```typescript
import { YjsClient } from '@/utils/yjsClient'

const client = new YjsClient({
  documentId: 'work_4_chapter_6',
  userId: 123,
  onConnect: () => ,
  onUpdate: (update, origin) => 
})

client.connect()

// 获取内容
const content = client.getContent()

// 设置内容
client.setContent('Hello World')

// 获取Y.Text（用于绑定编辑器）
const ytext = client.getText()
```

### 2. 使用Automerge

```typescript
import { AutomergeClient } from '@/utils/automergeClient'

const client = new AutomergeClient({
  documentId: 'work_4_chapter_6',
  userId: 123,
  onConnect: () => ,
  onUpdate: (doc) => 
})

client.connect()

// 获取内容
const content = client.getContent()

// 设置内容
client.setContent('Hello World')

// 应用本地更改
client.applyLocalChange((doc) => {
  doc.content = 'New Content'
})
```

### 3. 使用协作客户端工厂（推荐）

```typescript
import { CollaborationClient } from '@/utils/collaborationClient'

// 使用Yjs
const client = new CollaborationClient({
  type: 'yjs',
  documentId: 'work_4_chapter_6',
  userId: 123
})

// 使用Automerge
const automergeClient = new CollaborationClient({
  type: 'automerge',
  documentId: 'work_4_chapter_6',
  userId: 123
})

client.connect()
```

## TipTap集成

### 使用Yjs + TipTap

```typescript
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { YjsClient } from '@/utils/yjsClient'

const yjsClient = new YjsClient({
  documentId: 'work_4_chapter_6',
  userId: 123
})
yjsClient.connect()

const editor = useEditor({
  extensions: [
    StarterKit,
    Collaboration.configure({
      document: yjsClient.getDoc()
    }),
    CollaborationCursor.configure({
      provider: yjsClient.getAwareness(),
      user: {
        name: 'User Name',
        color: '#958DF1'
      }
    })
  ]
})
```

## WebSocket端点

### Yjs端点

```
ws://localhost:8001/ws/yjs/{document_id}
```

### Automerge端点

```
ws://localhost:8001/ws/automerge/{document_id}
```

## API说明

### YjsService (后端)

- `get_document(document_id)`: 获取或创建Yjs文档
- `apply_update(document_id, update, user_id)`: 应用更新
- `get_state_vector(document_id)`: 获取状态向量
- `get_document_update(document_id, state_vector)`: 获取文档更新
- `join_collaboration(websocket, document_id, user_id)`: 加入协作会话

### AutomergeService (后端)

- `get_document(document_id)`: 获取或创建Automerge文档
- `apply_changes(document_id, changes, user_id)`: 应用更改
- `get_changes(document_id, since)`: 获取更改
- `join_collaboration(websocket, document_id, user_id)`: 加入协作会话

## 优势对比

| 特性 | Yjs | Automerge |
|------|-----|-----------|
| 成熟度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 性能 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| TipTap支持 | ✅ 原生支持 | ❌ 需要适配 |
| Python支持 | ✅ y-py | ✅ automerge |
| 文档 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## 推荐使用

- **推荐使用Yjs**，因为：
  - 更成熟稳定
  - 有更好的TipTap集成
  - 性能更好
  - 文档更完善

- **Automerge适合**：
  - 需要更灵活的文档结构
  - 不需要富文本编辑器
  - 需要JSON文档

## 测试

### 1. 基本功能测试

1. 打开两个浏览器窗口
2. 都连接到同一个文档ID
3. 在一个窗口中输入内容
4. 观察另一个窗口是否实时更新

### 2. 冲突测试

1. 两个用户同时编辑同一段落
2. 观察是否自动合并
3. 检查是否丢失内容

### 3. 离线测试

1. 断开网络
2. 编辑内容
3. 恢复网络
4. 检查是否自动同步

## 故障排查

### 连接失败

1. 检查WebSocket URL是否正确
2. 检查后端服务是否运行
3. 检查防火墙设置

### 更新不同步

1. 检查网络连接
2. 查看浏览器控制台日志
3. 检查后端日志

### 内容丢失

1. 检查Redis是否正常运行
2. 检查文档ID是否正确
3. 查看同步历史

## 相关文件

- `backend/src/memos/api/services/yjs_service.py` - Yjs服务
- `backend/src/memos/api/services/automerge_service.py` - Automerge服务
- `frontend/src/utils/yjsClient.ts` - Yjs客户端
- `frontend/src/utils/automergeClient.ts` - Automerge客户端
- `frontend/src/hooks/useCollaboration.ts` - React Hook
- `frontend/src/components/editor/CollaborativeEditor.tsx` - 编辑器组件





