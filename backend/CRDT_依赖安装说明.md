# CRDT依赖安装说明

## 后端依赖

### 安装Yjs Python库

Yjs的Python实现主要有两个选择：

#### 选项1：y-py（推荐）

```bash
pip install y-py
```

或者添加到 `pyproject.toml`:

```toml
[tool.poetry.dependencies]
y-py = "^0.6.0"
```

#### 选项2：pyyjs（如果y-py不可用）

```bash
pip install pyyjs
```

**注意**: `pyyjs` 可能不是官方维护的，建议使用 `y-py`。

### 安装Automerge Python库

```bash
pip install automerge
```

或者添加到 `pyproject.toml`:

```toml
[tool.poetry.dependencies]
automerge = "^0.2.0"
```

## 前端依赖

### 安装Yjs相关包

```bash
cd frontend
npm install yjs y-websocket
```

### 安装TipTap协作扩展（如果使用TipTap）

```bash
npm install @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

### 安装Automerge

```bash
npm install @automerge/automerge
```

## 完整安装命令

### 后端

```bash
cd backend
pip install y-py automerge
# 或者使用poetry
poetry add y-py automerge
```

### 前端

```bash
cd frontend
npm install yjs y-websocket @automerge/automerge @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

## 验证安装

### 后端验证

```python
# 测试Yjs
try:
    import y_py as yjs
    print("✅ Yjs (y-py) 安装成功")
except ImportError:
    print("❌ Yjs (y-py) 未安装")

# 测试Automerge
try:
    import automerge
    print("✅ Automerge 安装成功")
except ImportError:
    print("❌ Automerge 未安装")
```

### 前端验证

```typescript
// 测试Yjs
try {
  const Y = await import('yjs')
  
} catch (e) {
  console.error('❌ Yjs 未安装', e)
}

// 测试Automerge
try {
  const Automerge = await import('@automerge/automerge')
  
} catch (e) {
  console.error('❌ Automerge 未安装', e)
}
```

## 注意事项

1. **y-py版本**: 确保使用最新版本的 `y-py`，旧版本可能有兼容性问题
2. **Automerge版本**: Automerge的Python实现可能不如JavaScript版本成熟，建议优先使用Yjs
3. **网络问题**: 如果安装失败，可以尝试使用国内镜像源

## 替代方案

如果Python库安装困难，可以考虑：

1. **使用Node.js后端**: 在Node.js中运行Yjs/Automerge服务器
2. **使用HTTP API**: 通过HTTP API与JavaScript库通信
3. **仅前端使用**: 前端使用CRDT，后端只做持久化





