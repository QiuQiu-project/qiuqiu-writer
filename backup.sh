#!/bin/bash

# =================================================================
# qiuqiuwriter 数据库备份脚本
# 功能：
# 1. 备份 PostgreSQL (核心业务数据)
# 2. 备份 MongoDB (ShareDB 文档数据)
# 3. 备份 Neo4j (知识图谱数据)
# =================================================================

# 错误处理
set -e

PROJECT_ROOT=$(pwd)
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DOCKER_ENV="$PROJECT_ROOT/docker/.env"

# 加载环境变量
if [ -f "$DOCKER_ENV" ]; then
    export $(grep -v '^#' "$DOCKER_ENV" | xargs)
else
    echo "❌ 错误: 未找到 $DOCKER_ENV 文件"
    exit 1
fi

# 创建备份目录
mkdir -p "$BACKUP_DIR/$TIMESTAMP"

echo "💾 开始备份数据库..."

# 1. PostgreSQL 备份
echo "🐘 正在备份 PostgreSQL ($POSTGRES_DB)..."
docker exec qiuqiuwriter-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/$TIMESTAMP/postgres_backup.sql"

# 2. MongoDB 备份
echo "🍃 正在备份 MongoDB ($MONGODB_DATABASE)..."
docker exec qiuqiuwriter-mongodb mongodump --db "$MONGODB_DATABASE" --archive > "$BACKUP_DIR/$TIMESTAMP/mongodb_backup.archive"

# 3. Neo4j 备份 (由于 Neo4j 社区版限制，运行时只能备份元数据或通过 apoc 导出)
# 这里尝试导出 Cypher 脚本，如果安装了 APOC 插件的话。
# 如果没有 APOC，建议停止容器后备份 volumes 目录。
echo "🕸️ 正在尝试备份 Neo4j (Cypher export)..."
# 注意：这需要容器内有写入权限，或者重定向输出
docker exec qiuqiuwriter-neo4j bash -c "export NEO4J_AUTH=$NEO4J_USER/$NEO4J_PASSWORD; cypher-shell 'MATCH (n) RETURN n' " > "$BACKUP_DIR/$TIMESTAMP/neo4j_nodes_sample.txt" 2>/dev/null || echo "  - Neo4j 备份跳过 (建议手动备份 volumes 数据)"

# 压缩备份文件
echo "🗜️ 正在压缩备份文件..."
cd "$BACKUP_DIR"
tar -czf "backup_$TIMESTAMP.tar.gz" "$TIMESTAMP"
rm -rf "$TIMESTAMP"

# 4. 远程同步 (生产环境建议)
# echo "☁️ 正在同步到远程存储 (S3/OSS)..."
# ossutil cp "backup_$TIMESTAMP.tar.gz" oss://my-backup-bucket/qiuqiuwriter/
# 或者使用 AWS CLI:
# aws s3 cp "backup_$TIMESTAMP.tar.gz" s3://my-backup-bucket/

echo "✅ 备份完成！"
echo "📂 备份文件位置: $BACKUP_DIR/backup_$TIMESTAMP.tar.gz"

# 清理旧备份 (保留最近 7 天的备份)
# find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +7 -delete
