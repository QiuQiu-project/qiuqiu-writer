#!/usr/bin/env bash
# =============================================================================
# deploy.sh — 应用部署 / 更新脚本
# 功能：
#   1. 构建前端 & 管理后台静态资源
#   2. 用 uv sync 安装/更新后端 Python 依赖
#   3. 安装/更新 systemd service 并重启后端
#   4. 重新加载 nginx 配置
# 用法：sudo bash deploy/server/deploy.sh
# 在项目根目录执行，或设置 PROJECT_DIR 环境变量
# =============================================================================
set -euo pipefail

# ---------- 可调整参数 ----------
PROJECT_DIR="${PROJECT_DIR:-/root/xingqiu_writer}"  # 服务器上项目路径
WWW_DIR="/var/www/xingqiu_writer"                   # nginx 静态文件目录
APP_USER="root"                                      # 项目在 /root 下，用 root 用户
SERVICE_NAME="qiuqiuwriter-backend"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
NPM_REGISTRY="https://registry.npmmirror.com"    # 国内镜像，海外服务器可去掉
# --------------------------------

# 检查 root 权限（nginx、systemd 操作需要）
if [[ $EUID -ne 0 ]]; then
    echo "错误：请用 sudo 运行此脚本" >&2
    exit 1
fi

# 确保 uv 可用（install.sh 安装到 /root/.local/bin，或 /usr/local/bin）
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

echo "=== 项目目录：$PROJECT_DIR ==="

# ---------- 前端构建 ----------
echo ""
echo "=== [1/5] 构建前端 (frontend) ==="
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "  安装依赖..."
    npm install --registry="$NPM_REGISTRY"
fi
npm run build
echo "  复制产物到 $WWW_DIR/frontend ..."
rsync -a --delete dist/ "$WWW_DIR/frontend/"

# ---------- 管理后台构建 ----------
echo ""
echo "=== [2/5] 构建管理后台 (admin) ==="
cd "$PROJECT_DIR/admin"
if [ ! -d "node_modules" ]; then
    echo "  安装依赖..."
    npm install --registry="$NPM_REGISTRY"
fi
npm run build
echo "  复制产物到 $WWW_DIR/admin ..."
rsync -a --delete dist/ "$WWW_DIR/admin/"

# ---------- 后端 Python 依赖 ----------
echo ""
echo "=== [3/5] 安装后端 Python 依赖 (uv sync) ==="
cd "$PROJECT_DIR/backend"
# uv sync 读取 pyproject.toml，在 .venv 中安装所有依赖
# --no-dev 不安装开发/测试依赖，节省空间
# UV_INDEX_URL 指定清华 PyPI 镜像，加速国内下载
UV_INDEX_URL="https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/" \
    uv sync --no-dev
echo "  依赖安装完成，venv 位于 $PROJECT_DIR/backend/.venv"

# ---------- systemd service ----------
echo ""
echo "=== [4/5] 安装/更新 systemd service ==="
DEPLOY_SERVICE="$PROJECT_DIR/deploy/server/qiuqiuwriter-backend.service"
SYSTEM_SERVICE="/etc/systemd/system/${SERVICE_NAME}.service"

# 用 sed 替换 service 文件中的路径占位符为实际路径，然后安装
sed "s|/opt/qiuqiuwriter|$PROJECT_DIR|g" "$DEPLOY_SERVICE" > "$SYSTEM_SERVICE"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# 检查 backend/.env 是否存在
if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    echo "  警告：$PROJECT_DIR/backend/.env 不存在！"
    echo "  请先复制并编辑：cp $PROJECT_DIR/backend/.env.example $PROJECT_DIR/backend/.env"
    exit 1
fi

systemctl restart "$SERVICE_NAME"
echo "  后端服务已重启，查看日志：journalctl -u $SERVICE_NAME -f"

# ---------- nginx 配置 ----------
echo ""
echo "=== [5/5] 更新 nginx 配置 ==="
NGINX_SRC="$PROJECT_DIR/deploy/server"

cp "$NGINX_SRC/nginx-frontend.conf" "$NGINX_CONF_DIR/qiuqiuwriter-frontend.conf"
cp "$NGINX_SRC/nginx-admin.conf"    "$NGINX_CONF_DIR/qiuqiuwriter-admin.conf"

# 启用站点（若链接不存在则创建）
ln -sf "$NGINX_CONF_DIR/qiuqiuwriter-frontend.conf" "$NGINX_ENABLED_DIR/qiuqiuwriter-frontend.conf"
ln -sf "$NGINX_CONF_DIR/qiuqiuwriter-admin.conf"    "$NGINX_ENABLED_DIR/qiuqiuwriter-admin.conf"

# 删除 nginx 默认站点，避免端口冲突
rm -f "$NGINX_ENABLED_DIR/default"

nginx -t  # 语法检查
nginx -s reload
echo "  nginx 配置已重新加载"

# ---------- 完成 ----------
echo ""
echo "==========================================="
echo " 部署完成！"
echo " 前端：    http://<服务器IP>"
echo " 管理后台：http://<服务器IP>:8889"
echo " 后端状态：systemctl status $SERVICE_NAME"
echo " 后端日志：journalctl -u $SERVICE_NAME -f"
echo "==========================================="
