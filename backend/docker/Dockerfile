# ==========================================
# qiuqiuwriter 后端生产环境 Dockerfile
# ==========================================

# 1. 基础镜像
FROM docker.m.daocloud.io/library/python:3.11-slim

# 2. 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    HF_ENDPOINT=https://hf-mirror.com

# 3. 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    libffi-dev \
    python3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 4. 设置工作目录
WORKDIR /app

# 5. 安装 Python 依赖
# 先拷贝 requirements.txt 以利用 Docker 缓存
COPY docker/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 6. 拷贝应用源码
# .dockerignore 会过滤掉不需要的文件
COPY . .

# 7. 暴露端口
EXPOSE 8000

# 8. 启动脚本
# 生产环境不使用 --reload
CMD ["uvicorn", "memos.api.ai_api:app", "--host", "0.0.0.0", "--port", "8000"]
