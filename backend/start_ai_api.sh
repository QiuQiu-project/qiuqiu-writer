#!/bin/bash

# AI接口快速启动脚本（支持热部署）

set -e

echo "=========================================="
echo "启动AI接口服务"
echo "=========================================="

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR"

# 切换到 backend 目录
cd "$BACKEND_DIR"

# 加载 .env 文件（如果存在）
if [ -f ".env" ]; then
    echo "✅ 发现 .env 文件，正在加载环境变量..."
    # 使用 set -a 自动导出所有变量，然后 source .env
    # bash 会自动忽略以 # 开头的注释行和空行
    set -a
    source .env
    set +a
    echo "✅ 环境变量已加载（包括 QDRANT_HOST, QDRANT_PORT 等）"
    echo ""
fi

# 检查环境变量
if [ -z "$OPENAI_API_KEY" ]; then
    echo "警告: OPENAI_API_KEY 环境变量未设置"
    echo "请设置API密钥后再启动服务："
    echo "  export OPENAI_API_KEY=your_api_key_here"
    echo ""
    echo "或者创建 .env 文件（参考 ai_config.example）"
    echo ""
    read -p "是否继续启动（服务可能无法正常工作）？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 设置默认端口和主机
PORT=${PORT:-8001}
HOST=${HOST:-0.0.0.0}

# 设置热部署选项（默认启用，可通过环境变量 RELOAD=false 禁用）
RELOAD=${RELOAD:-true}

# SCRIPT_DIR 和 BACKEND_DIR 已在上面定义
SRC_DIR="$BACKEND_DIR/src"

echo "配置信息："
echo "  - 主机: $HOST"
echo "  - 端口: $PORT"
echo "  - 热部署: $RELOAD"
echo "  - API基础URL: http://$HOST:$PORT"
echo "  - API文档: http://$HOST:$PORT/docs"
echo ""

# 构建 uvicorn 命令参数
UVICORN_ARGS=(
    "memos.api.ai_api:app"
    "--host" "$HOST"
    "--port" "$PORT"
)

# 如果启用热部署，添加 --reload 参数
if [ "$RELOAD" = "true" ]; then
    UVICORN_ARGS+=("--reload")
    # 指定需要监控的目录，提高性能
    UVICORN_ARGS+=("--reload-dir" "$SRC_DIR")
    echo "✅ 热部署已启用 - 代码变更将自动重新加载"
    echo "   监控目录: $SRC_DIR"
    echo ""
fi

# 确保 src 目录在 PYTHONPATH 中
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$SRC_DIR"

# 设置 Hugging Face 模型缓存配置
# 如果模型已下载，强制只使用本地缓存（避免网络检查）
export HF_LOCAL_FILES_ONLY=${HF_LOCAL_FILES_ONLY:-true}
if [ "$HF_LOCAL_FILES_ONLY" = "true" ]; then
    echo "✅ 模型缓存模式: 仅使用本地缓存（HF_LOCAL_FILES_ONLY=true）"
    echo "   如果模型未下载，请先设置 HF_LOCAL_FILES_ONLY=false 进行首次下载"
    echo ""
fi

# 设置 Hugging Face 缓存目录（可选，默认是 ~/.cache/huggingface）
if [ -n "$HF_HOME" ]; then
    export HF_HOME
    echo "✅ 使用自定义缓存目录: $HF_HOME"
fi

# 已经在 backend 目录了，不需要再次切换

# 检查Python环境并启动服务
if command -v poetry &> /dev/null; then
    echo "使用 Poetry 启动服务..."
    poetry run uvicorn "${UVICORN_ARGS[@]}"
elif [ -d ".venv" ]; then
    echo "使用 .venv 启动服务..."
    source .venv/bin/activate
    uvicorn "${UVICORN_ARGS[@]}"
elif [ -d "venv" ]; then
    echo "使用 venv 启动服务..."
    source venv/bin/activate
    uvicorn "${UVICORN_ARGS[@]}"
else
    echo "使用系统 Python 启动服务..."
    uvicorn "${UVICORN_ARGS[@]}"
fi
