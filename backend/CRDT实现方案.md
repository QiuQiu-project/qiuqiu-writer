# CRDT实现方案 - 协作写作

## 什么是CRDT？

**CRDT (Conflict-free Replicated Data Type，无冲突复制数据类型)** 是一种数据结构，允许多个副本在没有协调的情况下独立并发地更新，并能自动解决可能出现的冲突，最终确保所有副本达到一致的状态。

## CRDT的优势

### ✅ 核心优势

1. **无冲突合并**
   - 不需要复杂的冲突解决算法
   - 自动处理并发操作
   - 保证最终一致性

2. **离线编辑支持**
   - 用户可以在离线状态下编辑
   - 网络恢复后自动合并
   - 不会丢失任何操作

3. **去中心化支持**
   - 不依赖中心服务器
   - 客户端之间可以直接同步
   - 更灵活的架构

4. **操作级同步**
   - 每个操作都有唯一标识
   - 操作可以任意顺序应用
   - 结果始终一致

## 当前系统 vs CRDT

### 当前系统（版本号+智能合并）

**优点**：
- ✅ 实现相对简单
- ✅ 已经可以工作
- ✅ 支持基本的多用户协作

**缺点**：
- ❌ 需要手动处理冲突
- ❌ 智能合并可能不完美
- ❌ 离线编辑支持有限
- ❌ 版本号管理复杂

### CRDT方案

**优点**：
- ✅ 自动处理所有冲突
- ✅ 完美的离线支持
- ✅ 操作级同步，精确可靠
- ✅ 理论保证最终一致性

**缺点**：
- ❌ 需要引入新的库（Yjs/Automerge）
- ❌ 需要重构现有代码
- ❌ 可能有性能开销（元数据）
- ❌ 学习曲线

## 推荐的CRDT实现方案

### 方案1：Yjs（推荐）⭐

**Yjs** 是最成熟和流行的CRDT实现，专为实时协作编辑设计。

#### 特点

- ✅ 成熟的生态系统
- ✅ 支持多种编辑器（Quill、ProseMirror、Monaco等）
- ✅ 高性能
- ✅ 有Python和JavaScript实现
- ✅ 支持Y.Array、Y.Text、Y.Map等数据类型

#### 架构

```
前端 (Yjs) ←→ WebSocket ←→ 后端 (Yjs Provider)
                ↓
            Redis/PostgreSQL (持久化)
```

#### 实现步骤

1. **安装依赖**

```bash
# 前端
npm install yjs y-websocket y-quill

# 后端
pip install pyyjs
```

2. **前端集成**

```typescript
import * as Y from 'yjs'
import { QuillBinding } from 'y-quill'
import { WebsocketProvider } from 'y-websocket'
import Quill from 'quill'

// 创建Yjs文档
const ydoc = new Y.Doc()

// 创建Y.Text类型（用于文本编辑）
const ytext = ydoc.getText('content')

// 连接WebSocket Provider
const provider = new WebsocketProvider(
  'ws://localhost:8001/ws',
  'work_4_chapter_6',
  ydoc
)

// 绑定到Quill编辑器
const quill = new Quill('#editor')
const binding = new QuillBinding(ytext, quill, provider.awareness)
```

3. **后端集成**

```python
from yjs import YDoc, YText
import json

class YjsProvider:
    def __init__(self):
        self.documents: Dict[str, YDoc] = {}
    
    async def get_document(self, doc_id: str) -> YDoc:
        if doc_id not in self.documents:
            self.documents[doc_id] = YDoc()
        return self.documents[doc_id]
    
    async def apply_update(self, doc_id: str, update: bytes):
        doc = await self.get_document(doc_id)
        Y.apply_update(doc, update)
        return doc
    
    async def get_update(self, doc_id: str) -> bytes:
        doc = await self.get_document(doc_id)
        return Y.encode_state_as_update(doc)
```

### 方案2：Automerge

**Automerge** 是另一个流行的CRDT实现，更轻量级。

#### 特点

- ✅ 轻量级
- ✅ 易于集成
- ✅ 支持JSON文档
- ✅ 有Python和JavaScript实现

#### 实现示例

```typescript
import * as Automerge from '@automerge/automerge'

// 创建文档
let doc = Automerge.init()

// 编辑文档
doc = Automerge.change(doc, (d) => {
  d.content = "Hello World"
})

// 合并更改
const changes = Automerge.getChanges(doc1, doc2)
const merged = Automerge.applyChanges(doc1, changes)
```

## 集成到现有系统

### 渐进式迁移策略

#### 阶段1：并行运行（推荐）

1. 保留现有的ShareDB服务
2. 添加Yjs Provider作为新选项
3. 允许用户选择使用哪种方式

```python
# backend/src/memos/api/services/collaboration_service.py
class CollaborationService:
    def __init__(self):
        self.sharedb_service = ShareDBService()
        self.yjs_provider = YjsProvider()  # 新增
    
    async def sync_document(self, method: str, **kwargs):
        if method == 'yjs':
            return await self.yjs_provider.sync(**kwargs)
        else:
            return await self.sharedb_service.sync_document(**kwargs)
```

#### 阶段2：逐步迁移

1. 新文档使用Yjs
2. 旧文档继续使用ShareDB
3. 提供迁移工具

#### 阶段3：完全切换

1. 所有文档使用Yjs
2. 移除ShareDB代码（可选）

## 具体实现方案

### 后端实现

#### 1. 安装Yjs Python库

```bash
pip install pyyjs
```

#### 2. 创建Yjs Provider服务

```python
# backend/src/memos/api/services/yjs_service.py
from yjs import YDoc, YText, apply_update, encode_state_as_update
import json
import redis.asyncio as redis

class YjsService:
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.documents: Dict[str, YDoc] = {}
    
    async def initialize(self):
        self.redis_client = await get_redis()
    
    async def get_document(self, doc_id: str) -> YDoc:
        """获取或创建Yjs文档"""
        if doc_id not in self.documents:
            # 尝试从Redis加载
            cached = await self.redis_client.get(f"yjs:{doc_id}")
            if cached:
                doc = YDoc()
                apply_update(doc, cached)
                self.documents[doc_id] = doc
            else:
                self.documents[doc_id] = YDoc()
        return self.documents[doc_id]
    
    async def apply_update(self, doc_id: str, update: bytes, user_id: int):
        """应用更新到文档"""
        doc = await self.get_document(doc_id)
        apply_update(doc, update)
        
        # 保存到Redis
        state = encode_state_as_update(doc)
        await self.redis_client.setex(
            f"yjs:{doc_id}",
            86400,  # 24小时
            state
        )
        
        # 广播更新给其他客户端
        await self._broadcast_update(doc_id, update)
        
        return doc
    
    async def get_state_vector(self, doc_id: str) -> bytes:
        """获取状态向量（用于同步）"""
        doc = await self.get_document(doc_id)
        return encode_state_vector(doc)
    
    async def _broadcast_update(self, doc_id: str, update: bytes):
        """广播更新给所有连接的客户端"""
        # 通过WebSocket广播
        pass
```

#### 3. WebSocket端点

```python
# backend/src/memos/api/ai_api.py
@app.websocket("/ws/yjs")
async def yjs_websocket(websocket: WebSocket, doc_id: str):
    await websocket.accept()
    
    yjs_service = YjsService()
    await yjs_service.initialize()
    
    # 发送初始状态
    state = await yjs_service.get_state_vector(doc_id)
    await websocket.send_bytes(state)
    
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.receive":
            if "bytes" in message:
                # 收到更新
                update = message["bytes"]
                await yjs_service.apply_update(doc_id, update, user_id)
```

### 前端实现

#### 1. 安装依赖

```bash
npm install yjs y-websocket y-quill
```

#### 2. 创建Yjs客户端

```typescript
// frontend/src/utils/yjsClient.ts
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { QuillBinding } from 'y-quill'

export class YjsClient {
  private ydoc: Y.Doc
  private provider: WebsocketProvider
  private ytext: Y.Text
  
  constructor(documentId: string, wsUrl: string = 'ws://localhost:8001/ws/yjs') {
    this.ydoc = new Y.Doc()
    this.ytext = this.ydoc.getText('content')
    
    this.provider = new WebsocketProvider(
      wsUrl,
      documentId,
      this.ydoc
    )
  }
  
  bindToQuill(quill: any): QuillBinding {
    return new QuillBinding(
      this.ytext,
      quill,
      this.provider.awareness
    )
  }
  
  getContent(): string {
    return this.ytext.toString()
  }
  
  destroy(): void {
    this.provider.destroy()
    this.ydoc.destroy()
  }
}
```

#### 3. 集成到编辑器

```typescript
// frontend/src/components/editor/NovelEditor.tsx
import { YjsClient } from '@/utils/yjsClient'
import { useEffect, useRef } from 'react'

export function NovelEditor({ documentId }: { documentId: string }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const yjsClientRef = useRef<YjsClient | null>(null)
  
  useEffect(() => {
    if (!editorRef.current) return
    
    // 初始化Quill
    const quill = new Quill(editorRef.current)
    
    // 初始化Yjs
    const yjsClient = new YjsClient(documentId)
    yjsClient.bindToQuill(quill)
    yjsClientRef.current = yjsClient
    
    return () => {
      yjsClient.destroy()
    }
  }, [documentId])
  
  return <div ref={editorRef} />
}
```

## 性能考虑

### Yjs性能优化

1. **增量更新**
   - Yjs只传输变化的部分
   - 比完整内容更新更高效

2. **状态向量**
   - 使用状态向量快速同步
   - 只传输缺失的更新

3. **持久化**
   - 定期保存到Redis/PostgreSQL
   - 避免内存占用过大

### 对比

| 指标 | 当前方案 | Yjs CRDT |
|------|---------|----------|
| 冲突处理 | 手动合并 | 自动处理 |
| 离线支持 | 有限 | 完美 |
| 网络传输 | 完整内容/操作 | 增量更新 |
| 实现复杂度 | 中等 | 低（使用库） |
| 性能 | 好 | 很好 |
| 可靠性 | 好 | 优秀 |

## 迁移建议

### 推荐方案：渐进式迁移

1. **第一阶段**（1-2周）
   - 安装Yjs库
   - 实现Yjs服务
   - 创建新的WebSocket端点

2. **第二阶段**（2-3周）
   - 前端集成Yjs
   - 测试新功能
   - 并行运行两套系统

3. **第三阶段**（1周）
   - 逐步迁移文档到Yjs
   - 监控性能
   - 收集用户反馈

4. **第四阶段**（可选）
   - 完全切换到Yjs
   - 移除旧代码

## 总结

**使用CRDT（特别是Yjs）实现协作写作是可行的，并且有很多优势**：

✅ **推荐使用Yjs**，因为：
- 成熟稳定
- 生态完善
- 性能优秀
- 易于集成

✅ **建议渐进式迁移**：
- 保留现有系统
- 并行运行
- 逐步切换

✅ **预期收益**：
- 更好的冲突处理
- 完美的离线支持
- 更可靠的同步
- 更好的用户体验

## 相关资源

- [Yjs官方文档](https://docs.yjs.dev/)
- [Yjs GitHub](https://github.com/yjs/yjs)
- [Automerge文档](https://automerge.org/)
- [CRDT论文](https://crdt.tech/)

