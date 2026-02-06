# Tiptap Yjs 同步方案迁移

## 概述

已成功将编辑器同步功能从自定义的 `useIntelligentSync` + `useChapterAutoSave` 方案迁移到 **Tiptap 官方的 Yjs Collaboration 扩展**。

## 主要优势

### 1. **原生支持，更可靠**
- 使用 Tiptap 官方的 `@tiptap/extension-collaboration` 扩展
- 基于成熟的 CRDT（Conflict-free Replicated Data Type）算法
- 自动处理冲突解决，无需手动编写合并逻辑

### 2. **离线优先**
- 使用 `y-indexeddb` 进行本地持久化
- 所有编辑内容自动保存到 IndexedDB
- 即使离线也能正常编辑，网络恢复后自动同步

### 3. **简化架构**
- 移除了 700+ 行复杂的自定义同步逻辑
- 减少了状态管理的复杂度
- 更少的 bug 和边界情况处理

### 4. **更好的性能**
- Yjs 的增量同步机制，只传输变更部分
- IndexedDB 提供快速的本地读写
- 自动批处理更新，减少网络请求

## 技术实现

### 安装的依赖

```json
{
  "yjs": "^13.x",
  "y-indexeddb": "^9.x",
  "@tiptap/extension-collaboration": "^3.19.0"
}
```

### 新增文件

#### 1. `frontend/src/hooks/useYjsEditor.ts`
自定义 Hook，集成 Yjs 编辑器：
- 管理 Yjs 文档生命周期
- 处理 IndexedDB 持久化
- 提供同步到服务器的接口
- 自动处理内容更新和字数统计

#### 2. `frontend/src/utils/yjsProvider.ts`
自定义 Yjs Provider（预留，当前未使用）：
- 连接到 RESTful API
- 管理同步状态
- 处理在线/离线切换

### 修改的文件

#### 1. `frontend/src/pages/NovelEditorPage.tsx`
- ✅ 移除 `useIntelligentSync` 和 `useChapterAutoSave`
- ✅ 使用 `useYjsEditor` 替代原有编辑器创建逻辑
- ✅ 简化 `handleManualSave`，直接调用 `syncToServer()`
- ✅ 移除章节加载的复杂逻辑，由 Yjs 自动处理
- ✅ 减少约 500 行代码

#### 2. `frontend/src/hooks/useYjsEditor.ts` (新建)
```typescript
export function useYjsEditor(options: UseYjsEditorOptions): UseYjsEditorReturn {
  // 创建 Yjs 文档
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  
  // IndexedDB 持久化
  const indexeddbProvider = useRef<IndexeddbPersistence | null>(null);
  
  // 创建 Tiptap 编辑器（集成 Collaboration 扩展）
  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExtension,
      Placeholder.configure({ placeholder }),
      Collaboration.configure({ document: ydoc }),
    ],
    // ...
  });
  
  // 自动同步到服务器（每 5 秒）
  useEffect(() => {
    const syncInterval = setInterval(() => {
      syncToServer().catch(console.error);
    }, 5000);
    return () => clearInterval(syncInterval);
  }, [editor, documentId]);
  
  return { editor, syncToServer, loadFromServer, isSyncing };
}
```

## 工作流程

### 编辑流程

1. **打开章节**
   - 生成文档 ID：`work_{workId}_chapter_{chapterId}`
   - 创建 Yjs 文档实例
   - 初始化 IndexedDB Provider
   - 从 IndexedDB 加载缓存内容（如果存在）
   - 从服务器加载最新内容

2. **用户编辑**
   - 所有编辑操作自动记录到 Yjs 文档
   - 自动保存到 IndexedDB（毫秒级）
   - 实时更新字数统计

3. **自动同步**
   - 每 5 秒自动同步到服务器
   - 使用现有的 `documentCache.syncDocumentState()` API
   - 失败时保留本地更改，下次继续尝试

4. **手动保存**
   - 用户点击保存按钮
   - 立即触发同步到服务器
   - 显示保存状态反馈

### 章节切换流程

1. `documentId` 变化触发 `useYjsEditor` 重新初始化
2. 销毁旧的 Yjs 文档和 IndexedDB Provider
3. 创建新的 Yjs 文档和 Provider
4. 从 IndexedDB 加载新章节的缓存
5. 从服务器加载新章节的最新内容

## 移除的代码

### 1. `useIntelligentSync` 相关
- 移除了轮询机制
- 移除了防抖同步逻辑
- 移除了协作更新检测
- 移除了内容比较和合并逻辑

### 2. `useChapterAutoSave` 相关
- 移除了手动的防抖保存
- 移除了 `saveTimeoutRef` 等多个 ref
- 移除了复杂的章节切换检测
- 移除了手动的内容验证

### 3. `loadChapterContent` 相关
- 移除了章节内容加载的复杂逻辑
- 移除了 `isChapterLoadingRef` 状态管理
- 移除了 `lastSetContentRef` 内容记录

## 兼容性

### 保持兼容
- ✅ 现有的 API 端点（`documentCache.syncDocumentState`）
- ✅ 文档 ID 格式（`work_{workId}_chapter_{chapterId}`）
- ✅ 元数据结构（`work_id`, `chapter_id`, `chapter_number`, `title`）
- ✅ 离线/在线状态管理（`syncManager`）

### 新增功能
- ✅ IndexedDB 持久化
- ✅ CRDT 冲突解决
- ✅ 更快的本地读写
- ✅ 自动批处理更新

## 测试建议

### 1. 基本编辑功能
- [ ] 打开章节，查看内容加载
- [ ] 输入文字，检查实时保存
- [ ] 刷新页面，验证内容恢复

### 2. 同步功能
- [ ] 编辑后等待 5 秒，查看自动同步
- [ ] 点击手动保存，验证立即同步
- [ ] 断网编辑，恢复网络后验证同步

### 3. 章节切换
- [ ] 快速切换章节，验证内容正确加载
- [ ] 在章节 A 编辑，切换到章节 B，再切回 A，验证内容保留

### 4. 多标签页（未来）
- [ ] 同一章节在多个标签页打开
- [ ] 在一个标签页编辑，另一个标签页应能看到更新
- [ ] （需要后续添加 WebSocket 或实时同步机制）

## 后续优化方向

### 1. 实时协作（可选）
如果需要多人实时协作编辑，可以：
- 添加 `y-websocket` Provider
- 在后端建立 WebSocket 服务器
- 实现 Yjs 协议的中继

### 2. 历史版本
利用 Yjs 的特性，可以：
- 记录所有变更历史
- 实现撤销/重做
- 实现版本回溯

### 3. 性能优化
- 延长自动同步间隔（当前 5 秒）
- 实现智能同步策略（仅在内容变化时同步）
- 压缩同步数据

## 注意事项

1. **IndexedDB 存储限制**
   - 浏览器对 IndexedDB 有存储限制（通常 50MB+）
   - 对于长篇小说，需要定期清理旧版本

2. **浏览器兼容性**
   - 所有现代浏览器都支持 IndexedDB
   - Safari 的 IndexedDB 实现有一些已知问题，但对基本功能无影响

3. **数据迁移**
   - 旧的缓存数据（`localCacheManager`）仍然存在
   - Yjs 会创建新的 IndexedDB 数据库
   - 首次打开章节会从服务器加载

## 总结

这次迁移大大简化了编辑器同步逻辑，提升了可靠性和用户体验。通过使用 Tiptap 官方的 Collaboration 扩展和 Yjs，我们获得了：

- ✅ 更简洁的代码（减少 500+ 行）
- ✅ 更可靠的同步机制
- ✅ 更好的离线支持
- ✅ 更快的本地响应
- ✅ 为未来的实时协作打下基础

---

**迁移完成日期**: 2026-02-05  
**迁移状态**: ✅ 完成  
**代码审查**: ⏳ 待审查  
**测试状态**: ⏳ 待测试
