FROM python:3.12.11-slim

WORKDIR /app

# 安装 Poetry
RUN pip install poetry==1.8.3

# 配置 Poetry 不使用虚拟环境（因为 Docker 容器本身就是隔离的）
RUN poetry config virtualenvs.create false

# 复制依赖文件
COPY pyproject.toml poetry.lock* ./

# 安装依赖
RUN poetry install --no-interaction --no-ansi

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

