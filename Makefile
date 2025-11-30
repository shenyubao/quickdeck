.PHONY: help install dev build up down clean migrate migrate-create migrate-upgrade migrate-downgrade wait-for-db

help:
	@echo "QuickDeck Monorepo 管理命令"
	@echo ""
	@echo "可用命令:"
	@echo "  安装和构建:"
	@echo "    make install         - 安装所有依赖"
	@echo "    make build           - 构建所有服务"
	@echo "  开发环境:"
	@echo "    make dev             - 启动开发环境（Docker Compose）"
	@echo "    make up              - 启动所有服务"
	@echo "    make down            - 停止所有服务"
	@echo "    make clean           - 清理所有构建产物和依赖"
	@echo "  数据库迁移:"
	@echo "    make migrate-create  - 创建新的迁移文件（需要提供 MESSAGE=描述）"
	@echo "    make migrate-upgrade - 运行数据库迁移到最新版本"
	@echo "    make migrate-downgrade - 回退一个迁移版本"
	@echo "    make migrate         - 显示迁移状态"

install:
	@echo "安装后端依赖..."
	cd backend && poetry install
	@echo "安装前端依赖..."
	cd frontend && npm install

dev:
	docker-compose up --build

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

clean:
	docker-compose down -v
	cd backend && poetry env remove --all || true
	cd frontend && rm -rf node_modules .next

# 等待数据库就绪的辅助函数
wait-for-db:
	@echo "启动数据库服务..."
	@docker-compose up -d db || true
	@echo "等待数据库就绪..."
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if docker-compose exec -T db pg_isready -U postgres > /dev/null 2>&1; then \
			echo "数据库已就绪"; \
			break; \
		fi; \
		echo "等待数据库启动... (剩余 $$timeout 秒)"; \
		sleep 1; \
		timeout=$$((timeout - 1)); \
	done; \
	if [ $$timeout -eq 0 ]; then \
		echo "错误: 数据库启动超时"; \
		exit 1; \
	fi

# 数据库迁移命令
migrate-create: wait-for-db
	@if [ -z "$(MESSAGE)" ]; then \
		echo "错误: 请提供迁移描述，例如: make migrate-create MESSAGE='create_users_table'"; \
		exit 1; \
	fi
	@echo "检查依赖..."
	cd backend && poetry install --no-interaction --no-ansi || true
	cd backend && poetry run alembic revision --autogenerate -m "$(MESSAGE)"

migrate-upgrade: wait-for-db
	@echo "检查依赖..."
	cd backend && poetry install --no-interaction --no-ansi || true
	cd backend && poetry run alembic upgrade head

migrate-downgrade: wait-for-db
	@echo "检查依赖..."
	cd backend && poetry install --no-interaction --no-ansi || true
	cd backend && poetry run alembic downgrade -1

migrate: wait-for-db
	@echo "检查依赖..."
	cd backend && poetry install --no-interaction --no-ansi || true
	cd backend && poetry run alembic current
	cd backend && poetry run alembic history

