# 小型服务器原生部署指南（uv + nginx，阿里云适配）

本方案适合资源有限的阿里云 VPS（Ubuntu 22.04 / 24.04），避免运行完整 Docker 镜像：

- **数据库层**：Docker Compose（PostgreSQL / Redis / MongoDB）
- **后端**：`uv` 管理依赖 + `systemd` 守护进程（直接跑在宿主机）
- **前端 / 管理后台**：系统 nginx 服务静态文件，并反代到后端

---

## 目录结构

```
deploy/server/
├── install.sh                    # 首次安装（Docker / uv / Node.js / nginx）
├── deploy.sh                     # 应用部署 / 更新
├── nginx-frontend.conf           # 前端 nginx 站点配置（端口 80）
├── nginx-admin.conf              # 管理后台 nginx 配置（端口 8889）
└── qiuqiuwriter-backend.service  # systemd 服务单元
```

---

## 一、首次部署

### 1. 服务器上克隆代码

```bash
git clone <repo_url> /opt/qiuqiuwriter
```

### 1. 服务器上克隆代码

```bash
git clone <repo_url> /root/xingqiu_writer
```

### 2. 安装依赖工具（阿里云镜像加速）

```bash
sudo bash /root/xingqiu_writer/deploy/server/install.sh
```

安装内容及使用的镜像源：

| 工具 | 来源 |
|------|------|
| apt 软件包 | mirrors.aliyun.com |
| Docker CE | mirrors.aliyun.com/docker-ce |
| Docker Hub 拉取 | 阿里云镜像加速器（可配置个人专属地址） |
| Node.js 二进制 | registry.npmmirror.com |
| npm 包 | registry.npmmirror.com |
| Python 包（uv） | mirrors.tuna.tsinghua.edu.cn/pypi |

> **提示**：登录 [cr.console.aliyun.com → 镜像加速器](https://cr.console.aliyun.com/cn-hangzhou/instances/mirrors) 获取个人专属加速地址，填入 `install.sh` 顶部的 `ALIYUN_DOCKER_MIRROR` 变量，Docker 拉取镜像会更稳定。

### 3. 配置环境变量

**数据库（Docker）环境变量：**

```bash
cp /root/xingqiu_writer/docker/.env.example /root/xingqiu_writer/docker/.env
nano /root/xingqiu_writer/docker/.env
```

**后端应用环境变量：**

```bash
cp /root/xingqiu_writer/backend/.env.example /root/xingqiu_writer/backend/.env
nano /root/xingqiu_writer/backend/.env
```

重点修改以下字段（连接本机数据库，不是 Docker 内网服务名）：

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432          # 与 docker/.env 中 POSTGRES_PORT 一致
REDIS_HOST=localhost
REDIS_PORT=6379
MONGODB_HOST=localhost
MONGODB_PORT=27017
SECRET_KEY=<随机字符串>
```

### 4. 启动数据库（仅基础设施）

```bash
cd /root/xingqiu_writer/docker
docker compose -f docker-compose.infra.yml up -d postgres redis mongodb
```

> Qdrant / Neo4j 是可选功能，按需启动。

### 5. 运行部署脚本

```bash
bash /root/xingqiu_writer/deploy/server/deploy.sh
```

---

## 二、更新部署

```bash
cd /root/xingqiu_writer
git pull
bash deploy/server/deploy.sh
```

---

## 三、nginx 域名配置

修改 `deploy/server/nginx-frontend.conf` 中的 `server_name`：

```nginx
server_name example.com www.example.com;
```

然后重新运行 `deploy.sh` 或手动 `nginx -s reload`。

### 启用 HTTPS（Let's Encrypt）

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d example.com -d www.example.com
```

Certbot 会自动修改 nginx 配置并续签证书。

---

## 四、常用运维命令

| 操作 | 命令 |
|------|------|
| 查看后端状态 | `systemctl status qiuqiuwriter-backend` |
| 查看后端日志 | `journalctl -u qiuqiuwriter-backend -f` |
| 重启后端 | `systemctl restart qiuqiuwriter-backend` |
| 重载 nginx | `nginx -s reload` 或 `systemctl reload nginx` |
| 查看数据库状态 | `docker compose -f docker/docker-compose.infra.yml ps` |
| 进入 psql | `docker exec -it qiuqiuwriter-postgres psql -U postgres -d writerai` |

---

## 五、资源参考（最低配置）

| 组件 | 内存占用 |
|------|--------|
| nginx | ~5 MB |
| uvicorn (2 workers) | ~150–300 MB |
| PostgreSQL (Docker) | ~80 MB |
| Redis (Docker) | ~10 MB |
| MongoDB (Docker) | ~100 MB |
| **合计** | **~350–500 MB** |

建议服务器内存 ≥ 1 GB，推荐 2 GB。
