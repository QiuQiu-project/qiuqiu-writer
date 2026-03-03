#!/bin/bash
# QiuQiuWriter 统一启动脚本

# 参数解析
USE_DOCKER=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --docker) USE_DOCKER=true ;;
        *) echo "未知参数: $1"; exit 1 ;;
    esac
    shift
done

echo "=========================================="
echo "启动 QiuQiuWriter 项目"
if [ "$USE_DOCKER" = true ]; then
    echo "运行模式: Docker 容器化"
else
    echo "运行模式: 本地开发"
fi
echo "=========================================="
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker 未安装，某些功能可能无法使用"
else
    if ! docker info > /dev/null 2>&1; then
        echo "⚠️  Docker daemon 未运行，正在启动..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open -a Docker
            echo "等待 Docker Desktop 启动..."
            sleep 5
        fi
    fi
fi

if [ "$USE_DOCKER" = true ]; then
    # ---------- Docker 模式 ----------
    echo "🐳 正在启动 Docker 容器..."
    cd "$(dirname "$0")/docker" || exit 1
    
    # 基础设施：不重新创建
    echo "  - 启动基础设施 (postgres, redis, mongodb...)"
    docker-compose up -d --no-recreate postgres redis mongodb qdrant neo4j
    
    # 应用容器
    echo "  - 启动应用服务 (backend, frontend, admin)"
    docker-compose up -d backend frontend admin
    
    echo ""
    echo "=========================================="
    echo "✅ 所有服务已在 Docker 中启动！"
    echo "=========================================="
    echo "前端: http://localhost:81"
    echo "管理后台: http://localhost:8889"
    echo "后端 API: http://localhost:8000"
    echo "API 文档: http://localhost:8000/docs"
    echo ""
    echo "使用 'docker-compose logs -f' 查看实时日志"
    echo "按 Ctrl+C 退出日志查看（容器将继续运行）"
    echo ""
    
    docker-compose logs -f
    exit 0
fi

# ---------- 本地模式 (默认) ----------

# 启动后端
echo "启动后端服务..."
cd "$(dirname "$0")/memos" || exit 1

if [ ! -d ".venv" ]; then
    echo "✗ 虚拟环境不存在，请先运行: python -m venv .venv && source .venv/bin/activate && pip install -e ."
    exit 1
fi

source .venv/bin/activate
export ENABLE_PREFERENCE_MEMORY=false

# 启动依赖服务
if command -v docker &> /dev/null && docker info > /dev/null 2>&1; then
    echo "检查依赖服务..."
    cd ../docker || exit 1
    docker-compose up -d --no-recreate postgres redis mongodb qdrant neo4j 2>/dev/null
    cd ..
    echo "✓ 依赖服务已启动"
fi

echo "启动 MemOS API 服务器..."
echo "后端将在 http://localhost:8001 运行"
echo ""

# 在后台启动后端
uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001 --workers 1 &
BACKEND_PID=$!

echo "后端进程 ID: $BACKEND_PID"
echo ""

# 等待后端启动
sleep 3

# 启动前端
echo "启动前端服务..."
cd "$(dirname "$0")/frontend" || exit 1

if [ ! -d "node_modules" ]; then
    echo "安装前端依赖..."
    npm install
fi

echo "前端将在 http://localhost:5173 运行"
echo ""
echo "=========================================="
echo "服务已启动！"
echo "=========================================="
echo "前端: http://localhost:5173"
echo "后端: http://localhost:8001"
echo "API 文档: http://localhost:8001/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 清理：当脚本退出时停止后端
trap "kill $BACKEND_PID 2>/dev/null" EXIT

# 启动前端（前台运行，方便查看日志）
npm run dev
