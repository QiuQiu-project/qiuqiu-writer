#!/bin/bash

# =================================================================
# qiuqiuwriter 自动化部署脚本
# 功能：
# 1. 检查并安装前端/管理后台依赖
# 2. 编译前端/管理后台静态资源 (dist)
# 3. 启动 Docker Compose 容器
# =================================================================

# 错误处理：任何命令失败即停止
set -e

# 获取项目根目录
PROJECT_ROOT=$(pwd)
DOCKER_DIR="$PROJECT_ROOT/docker"

echo "🚀 开始自动化部署流程..."

# 1. 编译前端 (frontend)
echo "📦 正在准备前端项目 (frontend)..."
cd "$PROJECT_ROOT/frontend"
if [ ! -d "node_modules" ]; then
    echo "  - 正在安装依赖..."
    npm install --registry=https://registry.npmmirror.com
fi
echo "  - 正在编译静态资源..."
npm run build

# 2. 编译管理后台 (admin)
echo "📦 正在准备管理后台项目 (admin)..."
cd "$PROJECT_ROOT/admin"
if [ ! -d "node_modules" ]; then
    echo "  - 正在安装依赖..."
    npm install --registry=https://registry.npmmirror.com
fi
echo "  - 正在编译静态资源..."
npm run build

# 3. 数据备份（可选，建议在生产环境下执行）
if [ "$1" == "--backup" ]; then
    echo "💾 正在执行部署前备份..."
    bash "$PROJECT_ROOT/backup.sh"
fi

# 4. 启动 Docker 容器
echo "🐳 正在启动 Docker 容器..."
cd "$DOCKER_DIR"

# 检查 .env 文件是否存在
if [ ! -f ".env" ]; then
    echo "⚠️ 警告: 未找到 $DOCKER_DIR/.env 文件，请确保已配置。"
fi

# 仅更新应用容器，保持数据库等基础设施容器不动
# --no-recreate 会防止已存在的容器被重新创建
echo "  - 启动基础设施容器 (如果未运行)..."
docker-compose up -d --no-recreate postgres redis mongodb qdrant neo4j

echo "  - 更新并启动应用容器..."
docker-compose up -d --build backend frontend admin

echo "✅ 部署完成！"
echo "🌐 前端访问地址: http://localhost"
echo "🛠️ 管理后台地址: http://localhost:8889"
echo "📁 后端 API 地址: http://localhost:8000"
