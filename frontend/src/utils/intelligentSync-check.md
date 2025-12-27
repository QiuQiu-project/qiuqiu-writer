# 轮询机制检查清单

## 当前配置
- **轮询间隔**: 10秒 (10000ms)
- **第一次轮询延迟**: 10秒
- **启用状态**: `enablePolling: true`

## 检查点

### 1. 轮询启动条件
- ✅ `enablePolling` 必须为 `true`
- ✅ `documentId` 不能为空
- ✅ `documentId` 格式必须正确（`work_${workId}_chapter_${chapterId}`）

### 2. 轮询执行流程
1. 打开章节时，`documentId` 被设置
2. `useEffect` 检测到 `documentId` 变化，启动轮询机制
3. 10秒后执行第一次轮询
4. 之后每10秒执行一次定期轮询

### 3. 日志输出
应该能看到以下日志：
- `🔄 [IntelligentSync] 启动轮询机制` - 轮询启动时
- `🔄 [IntelligentSync] 执行第一次轮询` - 10秒后
- `🔄 [IntelligentSync] 执行定期轮询` - 之后每10秒
- `🔄 [pollForUpdates] 开始执行轮询` - 每次轮询开始时
- `🔄 [IntelligentSync-pollForUpdates] 开始从服务器获取文档` - 开始请求
- `📡 [fetchFromServer] 发起 document 请求` - 实际发送请求
- `📥 [pollForUpdates] 获取到服务器文档` - 获取到结果

### 4. 可能的问题
1. **documentId 为空**: 检查控制台是否有 "documentId 为空" 的日志
2. **轮询已禁用**: 检查是否有 "轮询已禁用" 的日志
3. **定时器被清理**: 检查是否有 "清理轮询定时器" 的日志
4. **同步正在进行**: 检查是否有 "同步正在进行中，跳过" 的日志

### 5. 调试步骤
1. 打开浏览器控制台
2. 打开一个章节
3. 查看是否有 "启动轮询机制" 的日志
4. 等待10秒，查看是否有 "执行第一次轮询" 的日志
5. 再等待10秒，查看是否有 "执行定期轮询" 的日志
6. 检查是否有 document 请求（在 Network 标签中）


