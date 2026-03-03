#!/bin/bash
# QiuQiuWriter 统一启动脚本

# 参数解析
USE_DOCKER=false
START_INFRA=false
START_APP=false

# 检查参数
for arg in "$@"; do
    case $arg in
        --docker)
            USE_DOCKER=true
            ;;
        --infra)
            START_INFRA=true
            ;;
        --app)
            START_APP=true
            ;;
        *)
            echo "未知参数: $arg"
            exit 1
            ;;
    esac
done

# 如果指定了 --docker 但没有指定 infra 或 app，默认启动全部
if [ "$USE_DOCKER" = true ] && [ "$START_INFRA" = false ] && [ "$START_APP" = false ]; then
    START_INFRA=true
    START_APP=true
fi

echo "=========================================="
echo "启动 QiuQiuWriter 项目"
if [ "$USE_DOCKER" = true ]; then
    echo "运行模式: Docker 容器化"
    if [ "$START_INFRA" = true ]; then echo "  - 包含: 基础设施 (DBs)"; fi
    if [ "$START_APP" = true ]; then echo "  - 包含: 应用服务 (App)"; fi
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

# ---------- Docker 模式 ----------
if [ "$USE_DOCKER" = true ]; then
    echo "🐳 正在启动 Docker 容器..."
    cd "$(dirname "$0")/docker" || exit 1
    
    # 基础设施
    if [ "$START_INFRA" = true ]; then
        echo "  - 启动基础设施 (postgres, redis, mongodb...)"
        # 使用 -p qiuqiuwriter-infra 保持独立的项目名称
        # --no-recreate: 如果容器已经存在，不要重新创建，防止数据丢失或不必要的重启
        docker-compose -f docker-compose.infra.yml -p qiuqiuwriter-infra up -d --no-recreate --remove-orphans
    fi
    
    # 应用容器
    if [ "$START_APP" = true ]; then
        echo "  - 启动应用服务 (backend, frontend, admin)"
        # 使用 -p qiuqiuwriter-app 保持独立的项目名称
        docker-compose -f docker-compose.app.yml -p qiuqiuwriter-app up -d --remove-orphans
    fi
    
    echo ""
    echo "=========================================="
    echo "✅ 指定的服务已在 Docker 中启动！"
    echo "=========================================="
    echo "前端: http://localhost:81"
    echo "管理后台: http://localhost:8889"
    echo "后端 API: http://localhost:8000"
    echo "API 文档: http://localhost:8000/docs"
    echo ""
    echo "使用 'cd docker && docker-compose -f ... logs -f' 查看实时日志"
    echo "按 Ctrl+C 退出日志查看（容器将继续运行）"
    echo ""
    
    # 显示日志 (优先显示 App 日志，如果只启动了 Infra 则显示 Infra 日志)
    if [ "$START_APP" = true ]; then
        docker-compose -f docker-compose.app.yml -p qiuqiuwriter-app logs -f
    elif [ "$START_INFRA" = true ]; then
        docker-compose -f docker-compose.infra.yml -p qiuqiuwriter-infra logs -f
    fi
    exit 0
fi

# ---------- 本地模式 (默认) ----------

# 启动依赖服务 (Infra)
if command -v docker &> /dev/null && docker info > /dev/null 2>&1; then
    echo "检查依赖服务..."
    cd "$(dirname "$0")/docker" || exit 1
    # 只启动基础设施
    docker-compose -f docker-compose.infra.yml -p qiuqiuwriter-infra up -d 2>/dev/null
    cd ..
    echo "✓ 依赖服务已启动"
fi

# 启动后端
echo "启动后端服务..."
# 尝试定位后端目录
if [ -d "$(dirname "$0")/backend" ]; then
    cd "$(dirname "$0")/backend" || exit 1
elif [ -d "$(dirname "$0")/memos" ]; then
    cd "$(dirname "$0")/memos" || exit 1
else
    echo "✗ 找不到 backend 或 memos 目录"
    exit 1
fi

if [ ! -d ".venv" ]; then
    echo "✗ 虚拟环境不存在，请先运行: python -m venv .venv && source .venv/bin/activate && pip install -e ."
    exit 1
fi

source .venv/bin/activate
export ENABLE_PREFERENCE_MEMORY=false
# 添加 src 到 PYTHONPATH (适配 backend/src/memos 结构)
export PYTHONPATH=$PYTHONPATH:$(pwd)/src

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
# 回到项目根目录再进入 frontend
cd ..
cd frontend || exit 1

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
