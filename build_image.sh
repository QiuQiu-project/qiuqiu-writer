#!/bin/bash

# =================================================================
# qiuqiuwriter 后端镜像构建脚本 (生产环境)
# 功能：构建并标记后端镜像，可用于部署或推送到镜像仓库
# =================================================================

PROJECT_ROOT=$(pwd)
BACKEND_DIR="$PROJECT_ROOT/backend"
IMAGE_NAME="qiuqiuwriter-backend"
TAG=$(date "+%Y%m%d%H%M%S")

echo "🏗️  正在构建后端生产镜像..."

# 检查后端目录是否存在
if [ ! -d "$BACKEND_DIR" ]; then
    echo "❌ 错误: 找不到 backend 目录，请在项目根目录运行此脚本。"
    exit 1
fi

# 检查 Dockerfile 是否存在
if [ ! -f "$BACKEND_DIR/docker/Dockerfile" ]; then
    echo "❌ 错误: 找不到 $BACKEND_DIR/docker/Dockerfile，请先创建它。"
    exit 1
fi

# 执行构建
# 使用 --no-cache 确保每次构建都是最新的依赖（可选）
cd "$BACKEND_DIR"
docker build -t "$IMAGE_NAME:latest" -t "$IMAGE_NAME:$TAG" -f docker/Dockerfile .

if [ $? -eq 0 ]; then
    echo "✅ 镜像构建成功！"
    echo "📦 镜像名称: $IMAGE_NAME:latest"
    echo "📦 镜像标签: $IMAGE_NAME:$TAG"
    echo ""
    echo "💡 您可以使用以下命令查看镜像:"
    echo "docker images | grep $IMAGE_NAME"
else
    echo "❌ 镜像构建失败，请检查 Docker 日志。"
    exit 1
fi
