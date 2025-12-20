.PHONY: help install dev build up down clean migrate migrate-create migrate-upgrade migrate-downgrade wait-for-db docker-build docker-push docker-build-push dev-base dev-backend dev-frontend

help:
	@echo "QuickDeck Monorepo 管理命令"
	@echo ""
	@echo "可用命令:"
	@echo "  安装和构建:"
	@echo "    make install         - 安装所有依赖"
	@echo "    make build           - 构建所有服务"
	@echo "  开发环境:"
	@echo "    make dev             - 启动开发环境（Docker Compose，所有服务在容器中）"
	@echo "    make dev-base        - 启动基础服务（db 和 nginx 容器）"
	@echo "    make dev-backend     - 直接启动后端服务（需要先运行 make dev-base）"
	@echo "    make dev-frontend    - 直接启动前端服务（需要先运行 make dev-base）"
	@echo "    make up              - 启动所有服务"
	@echo "    make down            - 停止所有服务"
	@echo "    make clean           - 清理所有构建产物和依赖"
	@echo "  数据库迁移:"
	@echo "    make migrate-create  - 创建新的迁移文件（需要提供 MESSAGE=描述）"
	@echo "    make migrate-upgrade - 运行数据库迁移到最新版本"
	@echo "    make migrate-downgrade - 回退一个迁移版本"
	@echo "    make migrate         - 显示迁移状态"
	@echo "  Docker 镜像:"
	@echo "    make docker-build    - 构建 Docker 镜像（需要提供 REGISTRY=和 TAG=）"
	@echo "    make docker-push     - 推送 Docker 镜像（需要提供 REGISTRY=和 TAG=）"
	@echo "    make docker-build-push - 构建并推送镜像（需要提供 REGISTRY=和 TAG=）"
	@echo "    示例: make docker-build-push REGISTRY=docker.io/yourusername TAG=v1.0.0"

install:
	@echo "安装后端依赖..."
	cd backend && poetry install
	@echo "安装前端依赖..."
	cd frontend && npm install

dev:
	docker-compose up --build

# 开发模式：只启动基础服务（db 和 nginx）
dev-base:
	@echo "启动基础服务（db 和 nginx）..."
	docker-compose -f docker-compose.dev-base.yml up -d
	@echo "等待数据库就绪..."
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if docker-compose -f docker-compose.dev-base.yml exec -T db pg_isready -U postgres > /dev/null 2>&1; then \
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
	@echo "基础服务已启动！"
	@echo "  - 数据库: localhost:5432"
	@echo "  - Nginx: http://localhost"

# 开发模式：直接启动后端服务（本地运行，不走容器）
dev-backend: wait-for-db-local
	@echo "检查后端依赖..."
	@cd backend && \
	if ! poetry run python -c "import email_validator" >/dev/null 2>&1; then \
		echo "检测到依赖未安装，正在安装依赖..." && \
		poetry install --no-interaction --no-ansi; \
	fi
	@echo "检查数据库连接..."
	@if ! docker-compose -f docker-compose.dev-base.yml exec -T db pg_isready -U postgres > /dev/null 2>&1; then \
		echo "错误: 无法连接到数据库，请确保数据库容器正在运行"; \
		echo "提示: 运行 'make dev-base' 启动数据库和 nginx"; \
		exit 1; \
	fi
	@echo "启动后端服务（本地运行，启用自动重载）..."
	@cd backend && poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info --reload

# 开发模式：直接启动前端服务（本地运行，不走容器）
dev-frontend:
	@echo "启动前端服务（本地运行）..."
	@cd frontend && npm run dev

build:
	docker-compose build 

up:
	docker-compose up -d

down:
	docker-compose down
	@docker-compose -f docker-compose.dev-base.yml down 2>/dev/null || true

clean:
	docker-compose down -v
	cd backend && poetry env remove --all || true
	cd frontend && rm -rf node_modules .next

# 等待数据库就绪的辅助函数（用于 docker-compose.yml）
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

# 等待数据库就绪的辅助函数（用于 dev-base 模式）
wait-for-db-local:
	@echo "检查数据库容器..."
	@if ! docker ps | grep -q quickdeck-db; then \
		echo "数据库容器未运行，正在启动..." && \
		docker-compose -f docker-compose.dev-base.yml up -d db; \
	fi
	@echo "等待数据库就绪..."
	@timeout=30; \
	while [ $$timeout -gt 0 ]; do \
		if docker-compose -f docker-compose.dev-base.yml exec -T db pg_isready -U postgres > /dev/null 2>&1; then \
			echo "数据库已就绪"; \
			break; \
		fi; \
		echo "等待数据库启动... (剩余 $$timeout 秒)"; \
		sleep 1; \
		timeout=$$((timeout - 1)); \
	done; \
	if [ $$timeout -eq 0 ]; then \
		echo "错误: 数据库启动超时，请检查数据库容器状态"; \
		echo "提示: 可以运行 'docker-compose -f docker-compose.dev-base.yml ps' 查看状态"; \
		exit 1; \
	fi

# 数据库迁移命令
migrate-create: wait-for-db
	@if [ -z "$(MESSAGE)" ]; then \
		echo "错误: 请提供迁移描述，例如: make migrate-create MESSAGE='create_users_table'"; \
		exit 1; \
	fi
	@echo "检查依赖..."
	cd backend && poetry run alembic revision --autogenerate -m "$(MESSAGE)"

migrate-upgrade: wait-for-db
	@echo "检查依赖..."
	cd backend && poetry run alembic upgrade head

migrate-downgrade: wait-for-db
	@echo "检查依赖..."
	cd backend && poetry run alembic downgrade -1

migrate: wait-for-db
	@echo "检查依赖..."
	cd backend && poetry run alembic current
	cd backend && poetry run alembic history

# Docker 镜像构建和推送
docker-build:
	@if [ -z "$(REGISTRY)" ]; then \
		echo "错误: 请提供 REGISTRY 参数，例如: make docker-build REGISTRY=docker.io/yourusername TAG=latest"; \
		exit 1; \
	fi
	@TAG=$${TAG:-latest}; \
	echo "构建后端镜像: $(REGISTRY)/quickdeck-backend:$$TAG"; \
	docker build -t "$(REGISTRY)/quickdeck-backend:$$TAG" \
		-t "$(REGISTRY)/quickdeck-backend:latest" \
		-f backend/Dockerfile backend/; \
	echo "构建前端镜像: $(REGISTRY)/quickdeck-frontend:$$TAG"; \
	docker build -t "$(REGISTRY)/quickdeck-frontend:$$TAG" \
		-t "$(REGISTRY)/quickdeck-frontend:latest" \
		-f frontend/Dockerfile frontend/; \
	echo "镜像构建完成！"

docker-push:
	@if [ -z "$(REGISTRY)" ]; then \
		echo "错误: 请提供 REGISTRY 参数，例如: make docker-push REGISTRY=docker.io/yourusername TAG=latest"; \
		exit 1; \
	fi
	@TAG=$${TAG:-latest}; \
	echo "推送后端镜像: $(REGISTRY)/quickdeck-backend:$$TAG"; \
	docker push "$(REGISTRY)/quickdeck-backend:$$TAG"; \
	docker push "$(REGISTRY)/quickdeck-backend:latest"; \
	echo "推送前端镜像: $(REGISTRY)/quickdeck-frontend:$$TAG"; \
	docker push "$(REGISTRY)/quickdeck-frontend:$$TAG"; \
	docker push "$(REGISTRY)/quickdeck-frontend:latest"; \
	echo "镜像推送完成！"

docker-build-push: docker-build docker-push
	@echo "所有镜像已构建并推送完成！"

