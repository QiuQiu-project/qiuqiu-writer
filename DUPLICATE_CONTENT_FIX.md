# 重复内容问题修复说明

## 问题描述

当用户A写了一行内容，用户B由于获取了多次会产生多行重复内容。

## 根本原因

1. **后端合并逻辑问题**：
   - 在 `_merge_html_content_smart` 中，如果客户端HTML明显更长，会尝试提取更多内容
   - 但可能重复添加已经存在的块，导致内容重复

2. **前端重复应用更新**：
   - `performSync` 中应用合并后的内容
   - `pollForUpdates` 中也会应用服务器内容
   - WebSocket 更新也会应用内容
   - 这三个可能同时触发，导致重复应用相同版本的内容

3. **缺少版本检查**：
   - 前端在应用更新时没有检查版本号，可能重复应用相同版本的内容

## 已实施的修复

### 1. 后端：改进合并逻辑，避免重复添加 ✅

**位置**: `backend/src/memos/api/services/sharedb_service.py`

**改进**:
- 在提取客户端独有的文本节点时，确保只添加尚未在 `seen_hashes` 中的块
- 每个文本节点只添加一个块，避免重复
- 移除了 `_merge_html_content` 中可能导致重复的额外添加逻辑

**关键代码**:
```python
# 关键：只添加尚未在 seen_hashes 中的块
for text in client_only_texts:
    for block in client_blocks:
        block_hash = get_block_hash(block)
        # 确保块有内容且尚未添加
        if block_hash and block_hash not in seen_hashes and text in get_block_text(block):
            merged_blocks.append(block)
            seen_hashes.add(block_hash)
            break  # 每个文本节点只添加一个块，避免重复
```

### 2. 前端：添加版本检查，避免重复应用 ✅

**位置**: `frontend/src/utils/intelligentSync.ts`

**改进**:
- 添加 `appliedVersions` Set，记录已应用的版本号
- 在 `performSync`、`pollForUpdates` 和 WebSocket 更新中都检查版本是否已应用
- 如果版本已应用，跳过更新，避免重复应用

**关键代码**:
```typescript
const appliedVersions = useRef<Set<number>>(new Set()); // 记录已应用的版本

// 在应用更新前检查
if (appliedVersions.current.has(version)) {
  
  return;
}

// 应用更新后标记
appliedVersions.current.add(version);
```

### 3. 前端：清理旧版本记录 ✅

**位置**: `frontend/src/utils/intelligentSync.ts`

**改进**:
- 添加 `cleanupOldVersions` 函数，定期清理旧版本记录
- 只保留最近 10 个版本的记录，避免内存泄漏

**关键代码**:
```typescript
const cleanupOldVersions = useCallback(() => {
  const currentVersion = lastSyncedVersion.current;
  // 只保留最近 10 个版本的记录
  if (appliedVersions.current.size > 10) {
    const versionsToKeep = Array.from(appliedVersions.current)
      .filter(v => v >= currentVersion - 10)
      .sort((a, b) => b - a)
      .slice(0, 10);
    appliedVersions.current = new Set(versionsToKeep);
  }
}, []);
```

## 工作流程

### 场景：用户A写了一行，用户B获取多次

1. **用户A**：输入 `<p>内容A</p>`，同步成功，版本变成 2
2. **用户B**：轮询获取到版本 2
3. **用户B**：WebSocket 也收到版本 2 的更新
4. **用户B**：`performSync` 也返回版本 2
5. **修复前**：三个更新都会应用，导致重复
6. **修复后**：
   - 第一个更新（轮询）应用，标记版本 2 已应用
   - 第二个更新（WebSocket）检测到版本 2 已应用，跳过
   - 第三个更新（performSync）检测到版本 2 已应用，跳过
7. **结果**：✅ 只应用一次，不会重复

## 测试验证

### 测试1：多次获取同一版本

1. 用户A输入：`<p>内容A</p>`
2. 用户A同步成功，版本变成 2
3. 用户B同时收到：
   - 轮询更新（版本 2）
   - WebSocket 更新（版本 2）
   - 同步响应（版本 2）
4. **预期**：只应用一次，不会重复

### 测试2：合并时避免重复

1. 用户A输入：`<p>内容A</p>`
2. 用户B输入：`<p>内容B</p>`
3. 用户A先同步，版本变成 2
4. 用户B同步时，后端合并为：`<p>内容A</p><p>内容B</p>`
5. **预期**：合并后的内容只包含每个内容一次，不会重复

### 测试3：版本记录清理

1. 连续同步多次，产生多个版本
2. **预期**：`appliedVersions` 只保留最近 10 个版本，不会无限增长

## 调试方法

### 查看前端控制台

**关键日志**:
```
⚠️ [IntelligentSync] 版本已应用，跳过: X
⚠️ [IntelligentSync] 轮询检测到版本已应用，跳过: X
⚠️ [IntelligentSync] WebSocket 版本已应用，跳过: X
[IntelligentSync] 清理旧版本记录，保留: [X, Y, Z]
```

### 验证版本记录

在浏览器控制台执行：
```javascript
// 查看已应用的版本

```

## 关键改进点

1. **后端去重**：确保合并时不会重复添加相同的块
2. **前端版本检查**：确保每个版本只应用一次
3. **内存管理**：定期清理旧版本记录，避免内存泄漏
4. **统一更新逻辑**：所有更新路径（同步、轮询、WebSocket）都使用相同的版本检查

## 如果仍然重复

### 检查清单

1. ✅ 前端是否显示"版本已应用，跳过"？
2. ✅ 后端合并后的内容是否包含重复的块？
3. ✅ `appliedVersions` 是否正确记录版本？
4. ✅ 是否有多个更新路径同时触发？

### 进一步调试

如果问题仍然存在，可能需要：

1. **检查版本号**：确认版本号是否正确递增
2. **检查合并逻辑**：查看后端日志，确认合并是否正确去重
3. **检查更新路径**：确认是否有其他更新路径没有添加版本检查
4. **检查内容格式**：确认 HTML 格式是否被正确解析和去重

## 相关文件

- `backend/src/memos/api/services/sharedb_service.py` - 后端合并逻辑
- `frontend/src/utils/intelligentSync.ts` - 前端同步逻辑
- `frontend/src/utils/sharedbClient.ts` - ShareDB 客户端

