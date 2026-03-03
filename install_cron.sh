#!/bin/bash

# =================================================================
# qiuqiuwriter 定时任务 (crontab) 自动安装脚本
# 功能：
# 1. 自动识别当前项目路径
# 2. 将备份和健康检查任务写入当前用户的 crontab
# 3. 具备幂等性，不会重复添加相同任务
# =================================================================

PROJECT_ROOT=$(pwd)
BACKUP_SCRIPT="$PROJECT_ROOT/backup.sh"
HEALTH_SCRIPT="$PROJECT_ROOT/health_check.sh"

# 定义任务条目
CRON_BACKUP="0 2 * * * cd $PROJECT_ROOT && ./backup.sh >> ./backups/backup.log 2>&1"
CRON_HEALTH="*/5 * * * * cd $PROJECT_ROOT && ./health_check.sh >> ./health_check.log 2>&1"

echo "⏲️ 正在配置 crontab 定时任务..."

# 检查脚本是否存在
if [ ! -f "$BACKUP_SCRIPT" ] || [ ! -f "$HEALTH_SCRIPT" ]; then
    echo "❌ 错误: 找不到 backup.sh 或 health_check.sh，请确保在项目根目录运行此脚本。"
    exit 1
fi

# 获取当前 crontab 内容
TMP_CRON=$(mktemp)
crontab -l > "$TMP_CRON" 2>/dev/null || touch "$TMP_CRON"

# 1. 添加备份任务 (如果不存在)
if grep -Fq "$BACKUP_SCRIPT" "$TMP_CRON"; then
    echo "ℹ️ 备份任务已存在，跳过。"
else
    echo "$CRON_BACKUP" >> "$TMP_CRON"
    echo "✅ 已添加每日备份任务 (凌晨 2:00)。"
fi

# 2. 添加健康检查任务 (如果不存在)
if grep -Fq "$HEALTH_SCRIPT" "$TMP_CRON"; then
    echo "ℹ️ 健康检查任务已存在，跳过。"
else
    echo "$CRON_HEALTH" >> "$TMP_CRON"
    echo "✅ 已添加健康检查任务 (每 5 分钟)。"
fi

# 应用新的 crontab
crontab "$TMP_CRON"
rm "$TMP_CRON"

echo ""
echo "🎉 定时任务安装成功！"
echo "您可以运行 'crontab -l' 查看当前所有任务。"
