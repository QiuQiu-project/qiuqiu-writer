#!/bin/bash

# =================================================================
# qiuqiuwriter 自动化部署脚本 (仅前端)
# 功能：
# 1. 检查并安装前端依赖
# 2. 编译前端静态资源 (dist)
# 3. 启动 Docker Compose 前端容器
# =================================================================

# 错误处理：任何命令失败即停止
set -e

# 获取项目根目录
PROJECT_ROOT=$(pwd)
DOCKER_DIR="$PROJECT_ROOT/docker"

echo "🚀 开始自动化部署流程 (前端服务)..."

# 1. 编译前端 (frontend)
echo "📦 正在准备前端项目 (frontend)..."
cd "$PROJECT_ROOT/frontend"
echo "  - 正在安装/更新依赖（使用 lockfile，可复现安装）..."
npm ci --registry=https://registry.npmmirror.com
echo "  - 正在编译静态资源..."
npm run build

# 2. 启动 Docker 容器
echo "🐳 正在启动 Docker 容器..."
cd "$DOCKER_DIR"

# 检查 .env 文件是否存在
if [ ! -f ".env" ]; then
    echo "⚠️ 警告: 未找到 $DOCKER_DIR/.env 文件，请确保已配置。"
fi

echo "  - 更新并启动应用容器..."
docker-compose up -d --build frontend

echo "✅ 部署完成！"
echo "🌐 前端访问地址: http://localhost"
echo "📁 后端 API 地址: http://api.qiuqiuwriter.top:8000/docs (远程)"

