# QuickDeck

## 快速开始

### 启动服务
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local


```

3. 启动所有服务

```bash
# 使用 Makefile（推荐）
make dev

# 或直接使用 docker-compose
docker-compose up --build --progress=plain
```

4. 访问应用

- 前端: http://localhost:3000
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs
- 数据库: localhost:5432

### 本地开发

有两种开发模式：

#### 模式 1：混合开发模式（推荐）

在这种模式下，数据库和 nginx 在 Docker 容器中运行，后端和前端直接在本地运行，便于开发和调试。

1. 安装依赖

```bash
make install
```

2. 配置环境变量

```bash
# 后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 文件

# 前端环境变量
cp frontend/.env.example frontend/.env.local
# 编辑 frontend/.env.local 文件，设置 NEXT_PUBLIC_API_URL=http://localhost:8000
```

3. 启动基础服务（数据库和 nginx）

```bash
make dev-base
```

4. 运行数据库迁移

```bash
make migrate-upgrade
```

5. 启动后端服务（新终端窗口）

```bash
make dev-backend
```

6. 启动前端服务（新终端窗口）

```bash
make dev-frontend
```

访问应用：
- 前端: http://localhost（通过 nginx 代理）
- 后端 API: http://localhost:8000（直接访问）或 http://localhost/api（通过 nginx 代理）
- API 文档: http://localhost:8000/docs
- 数据库: localhost:5432

#### 模式 2：完全本地开发

所有服务都在本地运行，不使用 Docker。

1. 安装依赖

```bash
make install
```

2. 配置环境变量

```bash
# 后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 文件，确保 DATABASE_URL 指向本地 PostgreSQL

# 前端环境变量
cp frontend/.env.example frontend/.env.local
# 编辑 frontend/.env.local 文件，设置 NEXT_PUBLIC_API_URL=http://localhost:8000
```

3. 启动本地 PostgreSQL 数据库

```bash
# 需要本地安装 PostgreSQL，或使用 Docker 启动数据库
docker run -d --name quickdeck-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=quickdeck \
  -p 5432:5432 \
  postgres:16-alpine
```

4. 运行数据库迁移

```bash
make migrate-upgrade
```

5. 启动后端服务

```bash
cd backend
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

6. 启动前端服务（新终端窗口）

```bash
cd frontend
npm run dev
```

访问应用：
- 前端: http://localhost:3000
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

## 常用命令

使用 Makefile 提供的便捷命令：

```bash
make install    # 安装所有依赖
make dev       # 启动开发环境（Docker Compose）
make build     # 构建所有服务
make up        # 启动所有服务
make down      # 停止所有服务
make clean     # 清理所有构建产物和依赖
```

## 数据库迁移

```bash
cd backend

# 创建新的迁移
poetry run alembic revision --autogenerate -m "描述信息"

# 应用迁移
poetry run alembic upgrade head

# 回滚迁移
poetry run alembic downgrade -1
```

## 生产环境部署

### 前置要求

- Docker 和 Docker Compose
- 已构建的 Docker 镜像（或从 Docker Hub 拉取）

### 配置生产环境

1. 配置前端环境变量

```bash
# 创建并编辑 frontend/.env.local 文件
cp frontend/.env.example frontend/.env.local
# 编辑 frontend/.env.local，配置以下必需变量：
# - NODE_ENV=production
# - NEXTAUTH_URL=<你的生产环境URL>
# - NEXTAUTH_SECRET=<强随机密钥>
# - NEXT_PUBLIC_API_URL=<API访问地址>
```

2. 配置后端环境变量（如需要）

```bash
# 创建并编辑 backend/.env 文件
cp backend/.env.example backend/.env
# 编辑 backend/.env，配置数据库连接等
```

### 启动生产环境

```bash
# 使用生产环境配置文件启动
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 生产环境运维命令

#### 服务管理

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart frontend
docker-compose restart backend
docker-compose restart nginx

# 查看服务状态
docker-compose ps

# 查看服务资源使用情况
docker stats
```

#### 日志管理

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f nginx

# 查看最近 100 行日志
docker-compose logs --tail=100

# 查看最近 1 小时的日志
docker-compose logs --since 1h
```

#### 更新和部署

```bash
# 拉取最新镜像
docker pull ssybb1988/quickdeck-backend:latest
docker pull ssybb1988/quickdeck-frontend:latest

# 更新服务（拉取新镜像后）
docker-compose up -d --pull always

# 重新构建并启动（如果使用本地构建）
docker-compose up -d --build

# 更新特定服务
docker-compose up -d --no-deps frontend
docker-compose up -d --no-deps backend
```

#### 数据库管理

```bash
# 进入数据库容器
docker exec -it quickdeck-db psql -U postgres -d quickdeck

# 执行数据库迁移（在 backend 容器中）
docker exec -it quickdeck-backend poetry run alembic upgrade head

# 备份数据库
docker exec quickdeck-db pg_dump -U postgres quickdeck > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复数据库
docker exec -i quickdeck-db psql -U postgres quickdeck < backup_file.sql
```

#### 健康检查和故障排查

```bash
# 检查容器健康状态
docker-compose ps

# 进入容器进行调试
docker exec -it quickdeck-frontend sh
docker exec -it quickdeck-backend bash
docker exec -it quickdeck-nginx sh

# 检查网络连接
docker network inspect quickdeck_quickdeck-network

# 检查端口占用
netstat -tulpn | grep 11126
netstat -tulpn | grep 5432
```

#### 清理和维护

```bash
# 清理未使用的镜像和容器
docker system prune -a

# 清理未使用的卷（谨慎使用，会删除数据）
docker volume prune

# 查看磁盘使用情况
docker system df

# 查看特定服务的资源使用
docker stats quickdeck-frontend quickdeck-backend quickdeck-nginx quickdeck-db
```

## 开发指南

详细开发指南请参考各子目录的 README 文件：

- [前端开发指南](./frontend/README.md)
- [后端开发指南](./backend/README.md)

## 许可证

MIT

