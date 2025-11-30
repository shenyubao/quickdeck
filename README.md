# QuickDeck

这是一个使用 monorepo 架构的项目，包含前端和后端应用。

## 项目结构

```
quickdeck/
├── frontend/          # 前端应用（Next.js + Ant Design v6 + auth.js）
├── backend/           # 后端应用（FastAPI + SQLAlchemy + Alembic）
├── docker-compose.yml # Docker Compose 配置
├── Makefile          # 便捷命令脚本
└── README.md          # 项目说明
```

## 技术栈

### 前端
- Next.js 16
- React 19
- Ant Design v6
- auth.js (NextAuth.js v5)
- TypeScript
- Tailwind CSS

### 后端
- Python 3.12.11
- FastAPI (>=0.115.14,<0.116.0)
- SQLAlchemy (>=2.0.0,<3.0.0)
- Alembic (>=1.13.0,<2.0.0)
- Pydantic
- Poetry

### 基础设施
- Docker & Docker Compose
- PostgreSQL 16

## 快速开始

### 前置要求

- Docker 和 Docker Compose
- Node.js 20+ (本地开发)
- Python 3.12.11+ (本地开发)
- Poetry (本地开发)

### 使用 Docker Compose（推荐）

1. 克隆项目并进入目录

```bash
cd quickdeck
```

2. 配置环境变量

```bash
# 后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 文件，修改数据库连接等配置

# 前端环境变量
cp frontend/.env.example frontend/.env.local
# 编辑 frontend/.env.local 文件，修改 NEXTAUTH_SECRET 等配置
```

3. 启动所有服务

```bash
# 使用 Makefile（推荐）
make dev

# 或直接使用 docker-compose
docker-compose up --build
```

4. 访问应用

- 前端: http://localhost:3000
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs
- 数据库: localhost:5432

### 本地开发

#### 后端

1. 安装依赖

```bash
cd backend
poetry install
```

2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
```

3. 运行数据库迁移

```bash
poetry run alembic upgrade head
```

4. 启动开发服务器

```bash
poetry run uvicorn app.main:app --reload
```

#### 前端

1. 安装依赖

```bash
cd frontend
npm install
```

2. 配置环境变量

```bash
cp .env.example .env.local
# 编辑 .env.local 文件
```

3. 启动开发服务器

```bash
npm run dev
```

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

## 开发指南

详细开发指南请参考各子目录的 README 文件：

- [前端开发指南](./frontend/README.md)
- [后端开发指南](./backend/README.md)

## 许可证

MIT

