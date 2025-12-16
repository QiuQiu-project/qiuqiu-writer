# CRDT依赖安装问题解决

## 问题描述

安装 `automerge` 时失败，错误信息：
```
Cargo, the Rust package manager, is not installed or is not on PATH.
This package requires Rust and Cargo to compile extensions.
```

## 解决方案

### 方案1：安装Rust（推荐用于Automerge）

如果确实需要使用Automerge，需要先安装Rust：

```bash
# 安装Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 重新加载环境变量
source ~/.cargo/env

# 验证安装
rustc --version
cargo --version

# 然后重新安装automerge
pip install automerge -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 方案2：仅使用Yjs（推荐）⭐

**Automerge的Python实现需要Rust编译，比较复杂。建议优先使用Yjs**，因为：
- ✅ Yjs更成熟稳定
- ✅ y-py安装简单（已成功安装）
- ✅ 有更好的TipTap支持
- ✅ 性能更好

**操作**：
1. 只使用Yjs，不使用Automerge
2. 代码已经处理了Automerge不可用的情况（会优雅降级）

### 方案3：使用JavaScript版本的Automerge（仅前端）

如果确实需要Automerge，可以：
1. 后端不使用Automerge Python库
2. 前端使用 `@automerge/automerge`
3. 通过WebSocket传输Automerge的二进制数据
4. 后端只做转发，不处理Automerge逻辑

## 当前状态

### ✅ 已成功安装
- `y-py` - Yjs的Python实现

### ❌ 安装失败
- `automerge` - 需要Rust编译

## 代码兼容性

代码已经处理了依赖不可用的情况：

### Yjs服务
```python
try:
    import y_py as y_py_module
    YJS_AVAILABLE = True
except ImportError:
    YJS_AVAILABLE = False
    yjs_service = None
```

### Automerge服务
```python
try:
    import automerge
    AUTOMERGE_AVAILABLE = True
except ImportError:
    AUTOMERGE_AVAILABLE = False
    automerge_service = None
```

**WebSocket端点也会检查服务是否可用**：
```python
if not yjs_service:
    await websocket.close(code=1003, reason="Yjs服务不可用，请安装y-py")
    return
```

## 推荐方案

### 仅使用Yjs

1. **不需要安装Rust**
2. **y-py已经安装成功**
3. **Yjs功能完整，足以满足需求**

### 使用步骤

1. **后端**：只使用Yjs服务
   - `/ws/yjs/{document_id}` 端点可用
   - Automerge端点会返回错误（这是正常的）

2. **前端**：只使用Yjs客户端
   ```typescript
   const client = new CollaborationClient({
     type: 'yjs',  // 只使用yjs
     documentId: 'work_4_chapter_6',
     userId: 123
   })
   ```

## 如果确实需要Automerge

### 选项A：安装Rust

```bash
# macOS
brew install rust

# 或使用官方安装脚本
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 然后重新安装
pip install automerge
```

### 选项B：使用Docker

在Docker容器中安装Rust，然后编译automerge。

### 选项C：仅前端使用

后端不安装automerge，前端使用JavaScript版本，通过WebSocket传输数据。

## 验证安装

### 检查Yjs

```python
python3 -c "import y_py; print('✅ y-py installed')"
```

### 检查Automerge（如果安装了Rust）

```python
python3 -c "import automerge; print('✅ automerge installed')"
```

## 总结

**推荐做法**：
1. ✅ 使用Yjs（已安装成功）
2. ❌ 跳过Automerge（需要Rust，复杂）
3. ✅ 代码已经兼容，Automerge不可用时不会报错

**如果将来需要Automerge**：
- 可以安装Rust后重新安装
- 或者使用仅前端的方案


