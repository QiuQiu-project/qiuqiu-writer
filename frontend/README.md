# WawaWriter Frontend

一个使用 React 和 TipTap 构建的现代化写作应用，后端使用 MemOS。

## 功能特性

- ✨ 现代化的富文本编辑器（基于 TipTap）
- 📝 文档管理和侧边栏
- 💾 自动保存功能（2秒防抖）
- 🔄 与 MemOS 后端集成
- 🎨 简洁美观的用户界面
- 📱 响应式设计

## 技术栈

- React 19
- TypeScript
- Vite
- TipTap (富文本编辑器)
- Lucide React (图标库)

## 后端集成

本项目使用 MemOS 作为后端，提供文档存储和管理功能。

### 启动后端

```bash
cd /Users/pang/Documents/MemOS
source .venv/bin/activate
export ENABLE_PREFERENCE_MEMORY=false
uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001 --workers 1
```

### API 端点

- `POST /api/documents/` - 创建文档
- `GET /api/documents/` - 列出所有文档
- `GET /api/documents/{doc_id}` - 获取文档
- `PUT /api/documents/{doc_id}` - 更新文档
- `DELETE /api/documents/{doc_id}` - 删除文档

## 安装和运行

```bash
# 安装依赖
npm install

# 配置环境变量（可选）
cp .env.example .env

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 项目结构

```
src/
├── components/          # React 组件
│   ├── Header.tsx      # 顶部导航栏
│   ├── Sidebar.tsx     # 侧边栏（文档列表）
│   ├── Editor.tsx      # 富文本编辑器
│   └── Toolbar.tsx     # 工具栏
├── hooks/              # React Hooks
│   └── useDocuments.ts # 文档管理 Hook
├── utils/              # 工具函数
│   └── api.ts          # API 客户端
├── App.tsx             # 主应用组件
└── index.css           # 全局样式
```

## 开发计划

- [x] 基础布局和组件
- [x] 富文本编辑器集成
- [x] 文档管理功能
- [x] 文档保存和加载
- [x] 与 MemOS 后端集成
- [ ] 用户认证
- [ ] 文档标题编辑
- [ ] 导出功能（PDF、Markdown等）
- [ ] 协作功能

## 许可证

MIT
