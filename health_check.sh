#!/bin/bash

# =================================================================
# qiuqiuwriter 生产环境健康检查脚本
# 功能：检查核心容器状态及 API 响应情况
# =================================================================

echo "🔍 正在执行系统健康检查..."
DATE=$(date "+%Y-%m-%d %H:%M:%S")
echo "检查时间: $DATE"

# 1. 检查 Docker 容器运行状态
containers=("qiuqiuwriter-backend" "qiuqiuwriter-frontend" "qiuqiuwriter-postgres" "qiuqiuwriter-redis")

for container in "${containers[@]}"; do
    STATUS=$(docker inspect -f '{{.State.Status}}' $container 2>/dev/null)
    if [ "$STATUS" == "running" ]; then
        echo "✅ $container: 运行中"
    else
        echo "❌ $container: 未运行 (状态: $STATUS)"
    fi
done

# 2. 检查 API 响应 (假设后端暴露在 8000 端口)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/v1/server/status 2>/dev/null || echo "000")

if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ 后端 API: 响应正常 (200 OK)"
else
    echo "❌ 后端 API: 响应异常 (HTTP Code: $HTTP_CODE)"
fi

# 3. 检查磁盘空间
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "⚠️ 警告: 磁盘空间严重不足 ($DISK_USAGE%)"
else
    echo "✅ 磁盘空间: 正常 ($DISK_USAGE%)"
fi

echo "-----------------------------------"
