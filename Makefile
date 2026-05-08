# QiuQiuWriter Makefile
# 替代 start.sh 的功能，用于管理 Docker 容器和服务

# 变量定义
DOCKER_COMPOSE = docker-compose
DOCKER_DIR = docker
INFRA_COMPOSE = -f $(DOCKER_DIR)/docker-compose.infra.yml -p qiuqiuwriter-infra
APP_COMPOSE = -f $(DOCKER_DIR)/docker-compose.app.yml -p qiuqiuwriter-app

# 默认目标
.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo "=========================================="
	@echo "QiuQiuWriter Makefile 管理工具"
	@echo "=========================================="
	@echo "可用命令:"
	@echo "  make up       - 启动所有服务 (Infra + App)"
	@echo "  make infra    - 仅启动基础设施 (数据库等)"
	@echo "  make app      - 仅启动应用服务 (Backend, Frontend, Admin)"
	@echo "  make down     - 停止并删除所有容器"
	@echo "  make restart  - 重启所有服务"
	@echo "  make logs     - 查看所有日志"
	@echo "  make logs-app - 查看应用日志"
	@echo "  make status   - 查看容器状态"
	@echo "  make down-infra     - 停止基础设施容器"
	@echo "  make down-app     	 - 停止应用容器"
	@echo "  make build-frontend - 构建前端项目"
	@echo "  make build-admin    - 构建后台管理项目"
	@echo "  make build-all      - 构建所有前端项目"
	@echo "  make build-backend  - 构建后端 Docker 镜像"
	@echo "  make rebuild        - 重新构建所有并重启服务"
	@echo "=========================================="

# 检查 Docker 是否运行 (仅作为简单检查)
check-docker:
	@docker info > /dev/null 2>&1 || (echo "⚠️  Docker 未运行，请先启动 Docker Desktop" && exit 1)

# 启动基础设施
.PHONY: infra
infra: check-docker
	@echo "🚀 启动基础设施..."
	$(DOCKER_COMPOSE) $(INFRA_COMPOSE) up -d --no-recreate --remove-orphans
	@echo "✅ 基础设施启动完成"

# 启动应用
.PHONY: app
app: check-docker
	@echo "🚀 启动应用服务..."
	$(DOCKER_COMPOSE) $(APP_COMPOSE) up -d --remove-orphans
	@echo "✅ 应用服务启动完成"
	@echo ""
	@echo "访问地址:"
	@echo "  前端: http://localhost:81"
	@echo "  管理后台: http://localhost:8889"
	@echo "  后端 API: http://localhost:8000"
	@echo "  API 文档: http://localhost:8000/docs"

# 构建前端项目
.PHONY: build-frontend
build-frontend:
	@echo "📦 构建 Frontend..."
	cd frontend && npm ci && npm run build
	@echo "✅ Frontend 构建完成"

# 构建后台管理项目
.PHONY: build-admin
build-admin:
	@echo "📦 构建 Admin..."
	cd admin && npm ci && npm run build
	@echo "✅ Admin 构建完成"

# 构建所有前端
.PHONY: build-all
build-all: build-frontend build-admin
	@echo "✅ 所有前端项目构建完成"

# 构建后端 Docker 镜像
.PHONY: build-backend
build-backend:
	@echo "📦 构建 Backend Docker 镜像..."
	docker buildx build --platform linux/amd64,linux/arm64  -t qiuqiuwriter-backend:latest -f backend/docker/Dockerfile backend
	@echo "✅ Backend 镜像构建完成"

# 重新构建应用并重启 (不影响 infra)
.PHONY: rebuild
rebuild: down-app build-all build-backend app
	@echo "✅ 应用已重新构建并重启"

# 启动所有
.PHONY: up
up: infra app

# 停止所有
.PHONY: down
down:
	@echo "🛑 停止所有服务..."
	$(DOCKER_COMPOSE) $(APP_COMPOSE) down
	$(DOCKER_COMPOSE) $(INFRA_COMPOSE) down
	@echo "✅ 所有服务已停止"

# 仅停止应用
.PHONY: down-app
down-app:
	@echo "🛑 停止应用服务..."
	$(DOCKER_COMPOSE) $(APP_COMPOSE) down
	@echo "✅ 应用服务已停止"

# 重启
.PHONY: restart
restart: down up

# 查看日志
.PHONY: logs
logs:
	$(DOCKER_COMPOSE) $(APP_COMPOSE) logs -f & \
	$(DOCKER_COMPOSE) $(INFRA_COMPOSE) logs -f

.PHONY: logs-app
logs-app:
	$(DOCKER_COMPOSE) $(APP_COMPOSE) logs -f

.PHONY: logs-infra
logs-infra:
	$(DOCKER_COMPOSE) $(INFRA_COMPOSE) logs -f

# 查看状态
.PHONY: status
status:
	@echo "--- Infrastructure ---"
	@$(DOCKER_COMPOSE) $(INFRA_COMPOSE) ps
	@echo ""
	@echo "--- Application ---"
	@$(DOCKER_COMPOSE) $(APP_COMPOSE) ps
