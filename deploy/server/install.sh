#!/usr/bin/env bash
# =============================================================================
# install.sh — 服务器首次初始化（阿里云 Ubuntu 22.04 / 24.04）
# 功能：安装 Docker、uv、Node.js、nginx，并完成目录 / 权限初始化
# 用法：sudo bash deploy/server/install.sh
#
# 阿里云适配说明：
#   - apt 源换为阿里云镜像（mirrors.aliyun.com）
#   - Docker CE 从阿里云镜像仓库安装
#   - Docker Hub 拉取配置阿里云镜像加速器
#   - Node.js 从阿里云 npmmirror 下载二进制安装
#   - uv 通过 pip（清华 PyPI 镜像）安装，无需访问 astral.sh
# =============================================================================
set -euo pipefail

# ---------- 可调整参数 ----------
PROJECT_DIR="/root/xingqiu_writer"  # 服务器上项目存放路径
WWW_DIR="/var/www/xingqiu_writer"   # nginx 静态文件目录
APP_USER="root"                      # 项目在 /root 下，直接用 root 用户
NODE_MAJOR=22                     # Node.js 主版本
# 阿里云容器镜像服务个人加速地址（登录 cr.console.aliyun.com → 镜像加速器 获取）
# 不填则使用几个公共镜像，可能不稳定
ALIYUN_DOCKER_MIRROR=""           # 例：https://xxxxxx.mirror.aliyuncs.com
# --------------------------------

UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "jammy")
ARCH=$(dpkg --print-architecture)

echo "=== [1/7] 替换 apt 源为阿里云镜像 ==="
# 备份原始 sources.list
cp /etc/apt/sources.list /etc/apt/sources.list.bak 2>/dev/null || true
cat > /etc/apt/sources.list <<EOF
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME} main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME}-security main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME}-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ ${UBUNTU_CODENAME}-backports main restricted universe multiverse
EOF
apt-get update -y
apt-get install -y curl wget git ca-certificates gnupg lsb-release python3 python3-pip rsync

echo ""
echo "=== [2/7] 安装 Docker CE（阿里云源）==="
if ! command -v docker &>/dev/null; then
    # 添加 Docker 阿里云 GPG key
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg" \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    # 添加阿里云 Docker CE 仓库
    echo \
        "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] \
https://mirrors.aliyun.com/docker-ce/linux/ubuntu \
${UBUNTU_CODENAME} stable" \
        | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "Docker 安装完成：$(docker --version)"
else
    echo "Docker 已存在：$(docker --version)，跳过"
fi

echo ""
echo "=== [3/7] 配置 Docker 镜像加速器 ==="
DAEMON_JSON="/etc/docker/daemon.json"
mkdir -p /etc/docker

# 构建 registry-mirrors 列表
MIRRORS=()
if [ -n "$ALIYUN_DOCKER_MIRROR" ]; then
    MIRRORS+=("\"$ALIYUN_DOCKER_MIRROR\"")
fi
# 追加若干公共镜像备用（可能不稳定，但聊胜于无）
MIRRORS+=("\"https://docker.m.daocloud.io\"")
MIRRORS+=("\"https://dockerpull.org\"")

MIRRORS_JSON=$(printf '%s,' "${MIRRORS[@]}")
MIRRORS_JSON="[${MIRRORS_JSON%,}]"

cat > "$DAEMON_JSON" <<EOF
{
  "registry-mirrors": ${MIRRORS_JSON},
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
EOF
systemctl reload docker || systemctl restart docker
echo "Docker 镜像加速配置完成"
if [ -z "$ALIYUN_DOCKER_MIRROR" ]; then
    echo "  提示：建议登录 cr.console.aliyun.com → 镜像加速器 获取个人专属地址"
    echo "  填入 ALIYUN_DOCKER_MIRROR 变量后重新运行本脚本，或手动编辑 $DAEMON_JSON"
fi

echo ""
echo "=== [4/7] 安装 uv（通过 pip + 清华 PyPI 镜像）==="
if ! command -v uv &>/dev/null; then
    # 检测 pip 版本是否支持 --break-system-packages
    PIP_ARGS="-i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/"
    if pip3 install --help | grep -q "\--break-system-packages"; then
        PIP_ARGS="$PIP_ARGS --break-system-packages"
    fi
    
    echo "  正在安装 uv..."
    pip3 install uv $PIP_ARGS
    echo "uv 安装完成：$(uv --version)"
else
    echo "uv 已存在：$(uv --version)，跳过"
fi

echo ""
echo "=== [5/7] 安装 Node.js ${NODE_MAJOR}.x（npmmirror 二进制）==="
if ! command -v node &>/dev/null; then
    NODE_VERSION=$(curl -fsSL "https://registry.npmmirror.com/-/binary/node/latest-v${NODE_MAJOR}.x/SHASUMS256.txt" \
        | awk '/linux-x64.tar.gz/{print $2; exit}' | sed 's/node-//' | sed 's/-linux-x64.tar.gz//')
    if [ -z "$NODE_VERSION" ]; then
        # 备用：写死一个已知稳定版
        NODE_VERSION="v22.13.1"
    fi
    echo "  下载 Node.js $NODE_VERSION ..."
    wget -q "https://registry.npmmirror.com/-/binary/node/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.gz" \
        -O /tmp/nodejs.tar.gz
    tar -xzf /tmp/nodejs.tar.gz -C /usr/local --strip-components=1
    rm /tmp/nodejs.tar.gz
    echo "Node.js 安装完成：$(node --version)"
else
    echo "Node.js 已存在：$(node --version)，跳过"
fi

# 设置 npm 全局使用 npmmirror
npm config set registry https://registry.npmmirror.com

echo ""
echo "=== [6/7] 安装 nginx ==="
if ! command -v nginx &>/dev/null; then
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "nginx 安装完成：$(nginx -v 2>&1)"
else
    echo "nginx 已存在，跳过"
fi

echo ""
echo "=== [7/7] 创建目录结构 ==="
mkdir -p "$WWW_DIR/frontend" "$WWW_DIR/admin"
# root 用户目录无需 chown
mkdir -p "$PROJECT_DIR"
echo "目录创建完成"

echo ""
echo "============================================"
echo " 首次安装完成！下一步："
echo " 1. 克隆项目到服务器："
echo "    git clone <repo_url> $PROJECT_DIR"
echo " 2. 配置后端环境变量："
echo "    cp $PROJECT_DIR/backend/.env.example $PROJECT_DIR/backend/.env"
echo "    nano $PROJECT_DIR/backend/.env"
echo " 3. 配置 Docker 基础设施环境变量并启动："
echo "    cp $PROJECT_DIR/docker/.env.example $PROJECT_DIR/docker/.env"
echo "    cd $PROJECT_DIR/docker && docker compose -f docker-compose.infra.yml up -d postgres redis mongodb"
echo " 4. 运行部署脚本："
echo "    sudo bash $PROJECT_DIR/deploy/server/deploy.sh"
echo "============================================"
