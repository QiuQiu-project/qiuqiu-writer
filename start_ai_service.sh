#!/bin/bash

# AI服务快速启动脚本

set -e

echo "=========================================="
echo "🚀 启动 QiuQiuWriter AI 服务"
echo "=========================================="

# 进入backend目录
cd "$(dirname "$0")/backend"

# 加载环境变量
if [ -f ".env" ]; then
    echo "✅ 加载环境变量从 .env 文件"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  警告: .env 文件不存在"
    echo "请创建 .env 文件或设置环境变量："
    echo "  OPENAI_API_KEY"
    echo "  OPENAI_API_BASE"
    echo "  DEFAULT_AI_MODEL"
    echo ""
fi

# 检查必需的环境变量
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ 错误: OPENAI_API_KEY 未设置"
    exit 1
fi

# 设置默认值
PORT=${API_PORT:-8001}
HOST=${API_HOST:-0.0.0.0}

echo ""
echo "配置信息："
echo "  - 主机: $HOST"
echo "  - 端口: $PORT"
echo "  - API基础URL: $OPENAI_API_BASE"
echo "  - 默认模型: $DEFAULT_AI_MODEL"
echo ""

# 检查端口是否被占用
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  端口 $PORT 已被占用"
    read -p "是否杀掉占用进程？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PID=$(lsof -Pi :$PORT -sTCP:LISTEN -t)
        kill -9 $PID
        echo "✅ 已杀掉进程 $PID"
        sleep 2
    else
        echo "❌ 取消启动"
        exit 1
    fi
fi

# 启动服务
echo "🚀 启动 AI 服务..."
echo ""

python3 -m memos.api.ai_api --port $PORT --host $HOST

echo ""
echo "=========================================="
echo "✅ AI 服务已启动"
echo "=========================================="
echo ""
echo "访问以下URL进行测试："
echo "  - 服务状态: http://localhost:$PORT/"
echo "  - 健康检查: http://localhost:$PORT/ai/health"
echo "  - API文档: http://localhost:$PORT/docs"
echo ""


