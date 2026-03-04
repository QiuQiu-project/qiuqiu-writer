# 球球写作 (QiuQiu Writer) 文档

> AI 驱动的全栈写作平台，支持协同编辑、智能辅助与多体裁创作。

## 文档目录

| 文档 | 说明 |
|------|------|
| [用户使用指南](./user-guide.md) | 注册、写作、AI 助手、导入导出等操作说明 |
| [快速开始](./getting-started.md) | 环境搭建、依赖安装、本地运行 |
| [系统架构](./architecture.md) | 技术栈、模块划分、数据流 |
| [API 参考](./api-reference.md) | 所有 HTTP 接口详细说明 |
| [功能说明](./features.md) | 平台功能详细介绍 |
| [配置参考](./configuration.md) | 环境变量与配置项说明 |
| [部署指南](./deployment.md) | Docker 部署、生产环境配置 |
| [开发指南](./development.md) | 本地开发流程、代码规范、测试 |

## 项目简介

球球写作是一款面向小说、剧本等长篇创作的 AI 辅助写作平台，核心特性：

- **AI 辅助写作** — 接入 DeepSeek / OpenAI 等大语言模型，提供章节续写、内容分析、结构建议
- **实时协同编辑** — 基于 Yjs CRDT + ShareDB，多人同时编辑同一文档无冲突
- **多体裁支持** — 内置小说编辑器和剧本编辑器，支持卷章管理
- **版本历史** — Yjs 快照机制，随时回溯历史版本
- **深色/浅色主题** — CSS 变量主题系统，全局一键切换

## 应用组成

```
qiuqiuwriter/
├── frontend/     # 用户端前端  React 19 + TypeScript + Vite  端口 5173
├── admin/        # 管理后台   React 18 + Ant Design          独立端口
├── backend/      # API 服务   FastAPI + Python 3.10+         端口 8001
└── docker/       # 基础设施   PostgreSQL · Redis · MongoDB
```
