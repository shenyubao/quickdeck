.PHONY: help install dev build up down clean

help:
	@echo "QuickDeck Monorepo 管理命令"
	@echo ""
	@echo "可用命令:"
	@echo "  make install    - 安装所有依赖"
	@echo "  make dev        - 启动开发环境（Docker Compose）"
	@echo "  make build      - 构建所有服务"
	@echo "  make up         - 启动所有服务"
	@echo "  make down       - 停止所有服务"
	@echo "  make clean      - 清理所有构建产物和依赖"

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

