#!/usr/bin/env bash
# =============================================================================
# deploy.sh — 服务器端部署 / 更新脚本（在服务器上执行）
# 功能：
#   1. 构建前端 & 管理后台（可跳过，改用本地打包 + upload-frontend.sh 上传）
#   2. 用 uv sync 安装/更新后端 Python 依赖
#   3. 安装/更新 systemd service 并重启后端
#   4. 重新加载 nginx 配置
#
# 用法：
#   bash deploy/server/deploy.sh               # 含前端打包
#   bash deploy/server/deploy.sh --skip-frontend  # 跳过前端打包（本地已上传）
# =============================================================================
set -euo pipefail

# ---------- 可调整参数 ----------
PROJECT_DIR="/root/xingqiu_writer"   # 服务器上项目路径
WWW_DIR="/var/www/xingqiu_writer"    # nginx 静态文件目录
SERVICE_NAME="qiuqiuwriter-backend"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
NPM_REGISTRY="https://registry.npmmirror.com"
# --------------------------------

SKIP_FRONTEND=false
for arg in "$@"; do
    [ "$arg" = "--skip-frontend" ] && SKIP_FRONTEND=true
done

# 确保 uv 可用
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

echo "=== 项目目录：$PROJECT_DIR ==="
[ "$SKIP_FRONTEND" = true ] && echo "=== 跳过前端打包（使用已上传的静态文件）==="

# ---------- 前端构建（可跳过）----------
if [ "$SKIP_FRONTEND" = false ]; then
    echo ""
    echo "=== [1/5] 构建前端 (frontend) ==="
    cd "$PROJECT_DIR/frontend"
    if [ ! -d "node_modules" ]; then
        npm install --registry="$NPM_REGISTRY"
    fi
    npm run build
    rsync -a --delete dist/ "$WWW_DIR/frontend/"
    echo "  前端已更新：$WWW_DIR/frontend/"

    echo ""
    echo "=== [2/5] 构建管理后台 (admin) ==="
    cd "$PROJECT_DIR/admin"
    if [ ! -d "node_modules" ]; then
        npm install --registry="$NPM_REGISTRY"
    fi
    npm run build
    rsync -a --delete dist/ "$WWW_DIR/admin/"
    echo "  管理后台已更新：$WWW_DIR/admin/"
else
    echo ""
    echo "=== [1/5] 跳过前端构建 ==="
    echo "=== [2/5] 跳过管理后台构建 ==="
fi

# ---------- 后端 Python 依赖 ----------
echo ""
echo "=== [3/5] 安装后端 Python 依赖 (uv sync) ==="
cd "$PROJECT_DIR/backend"
UV_INDEX_URL="https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/" \
    uv sync --no-dev --no-extras
echo "  依赖安装完成"

# ---------- systemd service ----------
echo ""
echo "=== [4/5] 安装/更新 systemd service ==="
cp "$PROJECT_DIR/deploy/server/qiuqiuwriter-backend.service" \
   "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    echo "  错误：$PROJECT_DIR/backend/.env 不存在！"
    echo "  请先执行：cp $PROJECT_DIR/backend/.env.example $PROJECT_DIR/backend/.env"
    exit 1
fi

systemctl restart "$SERVICE_NAME"
echo "  后端服务已重启"

# ---------- nginx 配置 ----------
echo ""
echo "=== [5/5] 更新 nginx 配置 ==="
cp "$PROJECT_DIR/deploy/server/nginx-frontend.conf" "$NGINX_CONF_DIR/qiuqiuwriter-frontend.conf"
cp "$PROJECT_DIR/deploy/server/nginx-admin.conf"    "$NGINX_CONF_DIR/qiuqiuwriter-admin.conf"

ln -sf "$NGINX_CONF_DIR/qiuqiuwriter-frontend.conf" "$NGINX_ENABLED_DIR/qiuqiuwriter-frontend.conf"
ln -sf "$NGINX_CONF_DIR/qiuqiuwriter-admin.conf"    "$NGINX_ENABLED_DIR/qiuqiuwriter-admin.conf"
rm -f "$NGINX_ENABLED_DIR/default"

nginx -t
nginx -s reload
echo "  nginx 配置已重新加载"

# ---------- 完成 ----------
echo ""
echo "==========================================="
echo " 部署完成！"
echo " 前端：    http://<服务器IP>"
echo " 管理后台：http://<服务器IP>:8889"
echo " 后端日志：journalctl -u $SERVICE_NAME -f"
echo "==========================================="
