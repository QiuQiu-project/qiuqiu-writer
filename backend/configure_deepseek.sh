#!/bin/bash

# DeepSeek AI 快速配置脚本

set -e

echo "=========================================="
echo "DeepSeek AI 配置脚本"
echo "=========================================="
echo ""

# 检查 .env 文件是否存在
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "创建 .env 文件..."
    cp ai_config.example .env
    echo "✅ 已创建 .env 文件（基于 ai_config.example）"
    echo ""
fi

# DeepSeek 配置
DEEPSEEK_API_KEY="sk-5b8dc562ef4647738b008c011bbf4acc"
DEEPSEEK_API_BASE="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-chat"

echo "配置 DeepSeek AI："
echo "  API Key: ${DEEPSEEK_API_KEY:0:10}..."
echo "  API Base: $DEEPSEEK_API_BASE"
echo "  Model: $DEEPSEEK_MODEL"
echo ""

# 更新 .env 文件
if grep -q "^OPENAI_API_KEY=" "$ENV_FILE"; then
    # 如果已存在，更新它
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$DEEPSEEK_API_KEY|" "$ENV_FILE"
        sed -i '' "s|^OPENAI_API_BASE=.*|OPENAI_API_BASE=$DEEPSEEK_API_BASE|" "$ENV_FILE"
        sed -i '' "s|^DEFAULT_AI_MODEL=.*|DEFAULT_AI_MODEL=$DEEPSEEK_MODEL|" "$ENV_FILE"
    else
        # Linux
        sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=$DEEPSEEK_API_KEY|" "$ENV_FILE"
        sed -i "s|^OPENAI_API_BASE=.*|OPENAI_API_BASE=$DEEPSEEK_API_BASE|" "$ENV_FILE"
        sed -i "s|^DEFAULT_AI_MODEL=.*|DEFAULT_AI_MODEL=$DEEPSEEK_MODEL|" "$ENV_FILE"
    fi
    echo "✅ 已更新 .env 文件中的 DeepSeek 配置"
else
    # 如果不存在，添加它
    echo "" >> "$ENV_FILE"
    echo "# DeepSeek AI 配置" >> "$ENV_FILE"
    echo "OPENAI_API_KEY=$DEEPSEEK_API_KEY" >> "$ENV_FILE"
    echo "OPENAI_API_BASE=$DEEPSEEK_API_BASE" >> "$ENV_FILE"
    echo "DEFAULT_AI_MODEL=$DEEPSEEK_MODEL" >> "$ENV_FILE"
    echo "✅ 已添加 DeepSeek 配置到 .env 文件"
fi

echo ""
echo "=========================================="
echo "配置完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 重启后端服务使配置生效："
echo "   ./start_ai_api.sh"
echo ""
echo "2. 或手动设置环境变量："
echo "   export OPENAI_API_KEY=$DEEPSEEK_API_KEY"
echo "   export OPENAI_API_BASE=$DEEPSEEK_API_BASE"
echo "   export DEFAULT_AI_MODEL=$DEEPSEEK_MODEL"
echo ""
echo "3. 验证配置："
echo "   curl http://localhost:8001/ai/health"
echo ""





