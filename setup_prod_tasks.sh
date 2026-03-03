#!/bin/bash

# =================================================================
# qiuqiuwriter 生产环境自动化任务配置脚本
# 功能：
# 1. 赋予所有脚本执行权限
# 2. 生成 crontab 任务配置参考
# =================================================================

PROJECT_ROOT=$(pwd)

echo "⚙️ 正在配置生产环境自动化任务..."

# 1. 权限设置
chmod +x "$PROJECT_ROOT/deploy.sh"
chmod +x "$PROJECT_ROOT/backup.sh"
chmod +x "$PROJECT_ROOT/health_check.sh"
echo "✅ 权限设置完成。"

# 2. 生成定时任务建议
echo ""
echo "📅 请手动运行 'crontab -e' 并添加以下内容来启用定时任务："
echo "------------------------------------------------------------"
echo "# 每天凌晨 2 点执行数据库备份"
echo "0 2 * * * cd $PROJECT_ROOT && ./backup.sh >> ./backups/backup.log 2>&1"
echo ""
echo "# 每 5 分钟执行一次系统健康检查"
echo "*/5 * * * * cd $PROJECT_ROOT && ./health_check.sh >> ./health_check.log 2>&1"
echo "------------------------------------------------------------"

echo ""
echo "🚀 配置完成！"
echo "您可以现在运行 ./health_check.sh 验证系统状态。"
