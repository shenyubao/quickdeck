#!/bin/bash
# QuickDeck 服务器启动脚本
# 用于在服务器上启动服务和管理开发环境


set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# 使用 docker-compose.yml 配置
COMPOSE_FILE="docker-compose.yml"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 未安装，请先安装"
        return 1
    fi
    return 0
}

# 检查 Docker 和 Docker Compose
check_dependencies() {
    log_info "检查依赖..."
    
    if ! check_command docker; then
        log_error "请安装 Docker"
        exit 1
    fi
    
    if ! check_command docker-compose; then
        log_error "请安装 Docker Compose"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行"
        exit 1
    fi
    
    log_success "依赖检查通过"
}

# 检查环境变量
check_prod_env() {
    log_info "检查环境配置..."
    
    # 检查必要的环境变量文件
    if [ ! -f ".env" ]; then
        log_error "缺少必要的环境变量文件: .env"
        log_error "请先配置环境变量文件（可以从 env.example 复制）"
        exit 1
    fi
    
    # 检查关键配置
    if grep -q "your-secret-key" .env 2>/dev/null; then
        log_warning ".env 中可能包含默认密钥，请修改为强密钥"
    fi
    
    log_success "环境配置检查完成"
}

# 等待数据库就绪（用于 docker-compose.yml）
wait_for_db() {
    log_info "等待数据库启动..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f "$COMPOSE_FILE" exec -T db pg_isready -U postgres &> /dev/null; then
            log_success "数据库已就绪"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done
    
    echo ""
    log_error "数据库启动超时"
    return 1
}

# 等待数据库就绪（用于 dev-base 模式）
wait_for_db_local() {
    log_info "检查数据库容器..."
    if ! docker ps | grep -q quickdeck-db; then
        log_info "数据库容器未运行，正在启动..."
        docker-compose -f docker-compose.dev-base.yml up -d db
    fi
    
    log_info "等待数据库启动..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f docker-compose.dev-base.yml exec -T db pg_isready -U postgres &> /dev/null; then
            log_success "数据库已就绪"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done
    
    echo ""
    log_error "数据库启动超时，请检查数据库容器状态"
    log_info "提示: 可以运行 'docker-compose -f docker-compose.dev-base.yml ps' 查看状态"
    return 1
}

# 运行数据库迁移
run_migrations() {
    log_info "运行数据库迁移..."
    
    if docker-compose -f "$COMPOSE_FILE" exec -T backend poetry run alembic upgrade head 2>/dev/null; then
        log_success "数据库迁移完成"
    else
        log_warning "数据库迁移失败，请检查日志"
    fi
}

# 运行数据库迁移（本地模式）
run_migrations_local() {
    log_info "运行数据库迁移..."
    
    if [ -d "backend" ] && [ -f "backend/pyproject.toml" ]; then
        cd backend
        if command -v poetry &> /dev/null; then
            if ! poetry run python -c "import email_validator" >/dev/null 2>&1; then
                log_info "检测到依赖未安装，正在安装依赖..."
                poetry install --no-interaction --no-ansi
            fi
            poetry run alembic upgrade head
            log_success "数据库迁移完成"
        else
            log_error "Poetry 未安装，请先安装 Poetry"
            return 1
        fi
        cd ..
    else
        log_error "后端目录不存在或配置不正确"
        return 1
    fi
}

# 拉取 Docker 镜像
pull_images() {
    log_info "拉取 Docker 镜像..."
    
    # 从 docker-compose.yml 中拉取镜像
    if docker-compose -f "$COMPOSE_FILE" pull; then
        log_success "Docker 镜像拉取完成"
    else
        log_error "Docker 镜像拉取失败"
        exit 1
    fi
}

# 启动服务
start_services() {
    log_info "启动服务..."
    
    # 构建镜像（每次都重新构建）
    log_info "构建 Docker 镜像..."
    docker-compose -f "$COMPOSE_FILE" build --progress=plain
    
    # 启动数据库
    log_info "启动数据库..."
    docker-compose -f "$COMPOSE_FILE" up -d db
    
    # 等待数据库就绪
    if wait_for_db; then
        run_migrations
    else
        log_warning "数据库未就绪，迁移将在服务启动后执行"
    fi
    
    # 启动所有服务
    log_info "启动所有服务..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    log_success "所有服务已启动"
}


# 显示服务状态
show_status() {
    echo ""
    log_info "服务状态："
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo ""
    log_info "服务访问地址："
    echo "  - 前端: http://localhost"
    echo "  - 后端 API: http://localhost/api"
    echo "  - API 文档: http://localhost/api/docs"
}

# 安装依赖
install_dependencies() {
    log_info "安装后端依赖..."
    if [ -d "backend" ] && [ -f "backend/pyproject.toml" ]; then
        cd backend
        if command -v poetry &> /dev/null; then
            poetry install
            log_success "后端依赖安装完成"
        else
            log_error "Poetry 未安装，请先安装 Poetry"
            cd ..
            return 1
        fi
        cd ..
    else
        log_warning "后端目录不存在，跳过后端依赖安装"
    fi
    
    log_info "安装前端依赖..."
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        cd frontend
        if command -v npm &> /dev/null; then
            npm install
            log_success "前端依赖安装完成"
        else
            log_error "npm 未安装，请先安装 Node.js 和 npm"
            cd ..
            return 1
        fi
        cd ..
    else
        log_warning "前端目录不存在，跳过前端依赖安装"
    fi
    
    log_success "所有依赖安装完成"
}

# 清理构建产物和依赖
clean_all() {
    log_info "清理所有构建产物和依赖..."
    
    log_info "停止并删除容器和卷..."
    docker-compose down -v 2>/dev/null || true
    docker-compose -f docker-compose.dev-base.yml down -v 2>/dev/null || true
    
    log_info "清理后端环境..."
    if [ -d "backend" ]; then
        cd backend
        if command -v poetry &> /dev/null; then
            poetry env remove --all 2>/dev/null || true
        fi
        cd ..
    fi
    
    log_info "清理前端构建产物..."
    if [ -d "frontend" ]; then
        cd frontend
        rm -rf node_modules .next 2>/dev/null || true
        cd ..
    fi
    
    log_success "清理完成"
}

# 创建数据库迁移
create_migration() {
    local message="$1"
    
    if [ -z "$message" ]; then
        log_error "请提供迁移描述，例如: $0 migrate-create 'create_users_table'"
        return 1
    fi
    
    wait_for_db_local
    
    log_info "创建数据库迁移: $message"
    if [ -d "backend" ] && [ -f "backend/pyproject.toml" ]; then
        cd backend
        if command -v poetry &> /dev/null; then
            if ! poetry run python -c "import email_validator" >/dev/null 2>&1; then
                log_info "检测到依赖未安装，正在安装依赖..."
                poetry install --no-interaction --no-ansi
            fi
            poetry run alembic revision --autogenerate -m "$message"
            log_success "迁移文件创建完成"
        else
            log_error "Poetry 未安装，请先安装 Poetry"
            cd ..
            return 1
        fi
        cd ..
    else
        log_error "后端目录不存在或配置不正确"
        return 1
    fi
}

# 显示迁移状态
show_migration_status() {
    wait_for_db_local
    
    log_info "当前迁移版本："
    if [ -d "backend" ] && [ -f "backend/pyproject.toml" ]; then
        cd backend
        if command -v poetry &> /dev/null; then
            if ! poetry run python -c "import email_validator" >/dev/null 2>&1; then
                log_info "检测到依赖未安装，正在安装依赖..."
                poetry install --no-interaction --no-ansi
            fi
            poetry run alembic current
            echo ""
            log_info "迁移历史："
            poetry run alembic history
        else
            log_error "Poetry 未安装，请先安装 Poetry"
            cd ..
            return 1
        fi
        cd ..
    else
        log_error "后端目录不存在或配置不正确"
        return 1
    fi
}

# 回退数据库迁移
downgrade_migration() {
    wait_for_db_local
    
    log_info "回退一个迁移版本..."
    if [ -d "backend" ] && [ -f "backend/pyproject.toml" ]; then
        cd backend
        if command -v poetry &> /dev/null; then
            if ! poetry run python -c "import email_validator" >/dev/null 2>&1; then
                log_info "检测到依赖未安装，正在安装依赖..."
                poetry install --no-interaction --no-ansi
            fi
            poetry run alembic downgrade -1
            log_success "迁移回退完成"
        else
            log_error "Poetry 未安装，请先安装 Poetry"
            cd ..
            return 1
        fi
        cd ..
    else
        log_error "后端目录不存在或配置不正确"
        return 1
    fi
}

# 构建 Docker 镜像
build_docker_images() {
    local registry="$1"
    local tag="${2:-latest}"
    
    if [ -z "$registry" ]; then
        log_error "请提供 REGISTRY 参数，例如: $0 docker-build REGISTRY=docker.io/yourusername TAG=latest"
        return 1
    fi
    
    log_info "构建后端镜像: $registry/quickdeck-backend:$tag"
    docker build -t "$registry/quickdeck-backend:$tag" \
        -t "$registry/quickdeck-backend:latest" \
        -f backend/Dockerfile backend/
    
    log_info "构建前端镜像: $registry/quickdeck-frontend:$tag"
    docker build -t "$registry/quickdeck-frontend:$tag" \
        -t "$registry/quickdeck-frontend:latest" \
        -f frontend/Dockerfile frontend/
    
    log_success "镜像构建完成！"
}

# 推送 Docker 镜像
push_docker_images() {
    local registry="$1"
    local tag="${2:-latest}"
    
    if [ -z "$registry" ]; then
        log_error "请提供 REGISTRY 参数，例如: $0 docker-push REGISTRY=docker.io/yourusername TAG=latest"
        return 1
    fi
    
    log_info "推送后端镜像: $registry/quickdeck-backend:$tag"
    docker push "$registry/quickdeck-backend:$tag"
    docker push "$registry/quickdeck-backend:latest"
    
    log_info "推送前端镜像: $registry/quickdeck-frontend:$tag"
    docker push "$registry/quickdeck-frontend:$tag"
    docker push "$registry/quickdeck-frontend:latest"
    
    log_success "镜像推送完成！"
}

# 主函数
main() {
    local command=${1:-"help"}
    shift || true
    
    case "$command" in
        start)
            check_dependencies
            check_prod_env
            start_services
            sleep 5
            show_status
            ;;
        stop)
            log_info "停止服务..."
            docker-compose -f "$COMPOSE_FILE" down
            docker-compose -f docker-compose.dev-base.yml down 2>/dev/null || true
            log_success "所有服务已停止"
            ;;
        restart)
            log_info "重启服务..."
            docker-compose -f "$COMPOSE_FILE" restart
            sleep 3
            show_status
            ;;
        status)
            show_status
            ;;
        logs)
            docker-compose -f "$COMPOSE_FILE" logs -f "${1:-}"
            ;;
        migrate)
            check_dependencies
            show_migration_status
            ;;
        migrate-upgrade)
            check_dependencies
            wait_for_db
            run_migrations
            ;;
        migrate-create)
            check_dependencies
            local message="$1"
            # 如果没有提供位置参数，尝试从环境变量获取
            if [ -z "$message" ]; then
                message="$MESSAGE"
            fi
            create_migration "$message"
            ;;
        migrate-downgrade)
            check_dependencies
            downgrade_migration
            ;;
        pull)
            check_dependencies
            pull_images
            ;;
        update)
            log_info "更新并重启服务..."
            check_dependencies
            check_prod_env
            
            # 1. 拉取最新镜像
            pull_images
            
            # 2. 停止并移除旧容器
            log_info "停止并移除旧容器..."
            docker-compose -f "$COMPOSE_FILE" down
            log_success "旧容器已移除"
            
            # 3. 启动新服务
            start_services
            sleep 5
            show_status
            
            log_success "服务更新完成"
            ;;
        install)
            install_dependencies
            ;;
        build)
            check_dependencies
            log_info "构建所有服务..."
            docker-compose -f "$COMPOSE_FILE" build
            log_success "构建完成"
            ;;
        dev)
            check_dependencies
            log_info "启动开发环境（Docker Compose，所有服务在容器中）..."
            docker-compose up --build
            ;;
        dev-base)
            check_dependencies
            log_info "启动基础服务（db 和 nginx 容器）..."
            docker-compose -f docker-compose.dev-base.yml up -d
            if wait_for_db_local; then
                log_success "基础服务已启动！"
                log_info "  - 数据库: localhost:5432"
                log_info "  - Nginx: http://localhost"
            fi
            ;;
        dev-backend)
            check_dependencies
            if ! wait_for_db_local; then
                log_error "无法连接到数据库，请确保数据库容器正在运行"
                log_info "提示: 运行 '$0 dev-base' 启动数据库和 nginx"
                exit 1
            fi
            
            log_info "检查后端依赖..."
            if [ -d "backend" ] && [ -f "backend/pyproject.toml" ]; then
                cd backend
                if ! poetry run python -c "import email_validator" >/dev/null 2>&1; then
                    log_info "检测到依赖未安装，正在安装依赖..."
                    poetry install --no-interaction --no-ansi
                fi
                cd ..
            fi
            
            log_info "启动后端服务（本地运行，启用自动重载）..."
            cd backend && poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info --reload
            ;;
        dev-frontend)
            log_info "启动前端服务（本地运行）..."
            if [ ! -d "frontend/node_modules" ]; then
                log_info "检测到依赖未安装，正在安装依赖..."
                cd frontend && npm install
                cd ..
            fi
            cd frontend && npm run dev
            ;;
        up)
            check_dependencies
            log_info "启动所有服务..."
            docker-compose -f "$COMPOSE_FILE" up -d
            log_success "所有服务已启动"
            ;;
        down)
            log_info "停止所有服务..."
            docker-compose -f "$COMPOSE_FILE" down
            docker-compose -f docker-compose.dev-base.yml down 2>/dev/null || true
            log_success "所有服务已停止"
            ;;
        clean)
            log_warning "这将清理所有构建产物和依赖，是否继续？(y/N)"
            read -r response
            if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
                clean_all
            else
                log_info "已取消清理操作"
            fi
            ;;
        docker-build)
            check_dependencies
            local registry="${REGISTRY:-}"
            local tag="${TAG:-latest}"
            
            # 解析命令行参数（格式：REGISTRY=xxx TAG=xxx）
            for arg in "$@"; do
                if [[ "$arg" =~ ^REGISTRY=(.+)$ ]]; then
                    registry="${BASH_REMATCH[1]}"
                elif [[ "$arg" =~ ^TAG=(.+)$ ]]; then
                    tag="${BASH_REMATCH[1]}"
                fi
            done
            
            build_docker_images "$registry" "$tag"
            ;;
        docker-push)
            check_dependencies
            local registry="${REGISTRY:-}"
            local tag="${TAG:-latest}"
            
            # 解析命令行参数（格式：REGISTRY=xxx TAG=xxx）
            for arg in "$@"; do
                if [[ "$arg" =~ ^REGISTRY=(.+)$ ]]; then
                    registry="${BASH_REMATCH[1]}"
                elif [[ "$arg" =~ ^TAG=(.+)$ ]]; then
                    tag="${BASH_REMATCH[1]}"
                fi
            done
            
            push_docker_images "$registry" "$tag"
            ;;
        docker-build-push)
            check_dependencies
            local registry="${REGISTRY:-}"
            local tag="${TAG:-latest}"
            
            # 解析命令行参数（格式：REGISTRY=xxx TAG=xxx）
            for arg in "$@"; do
                if [[ "$arg" =~ ^REGISTRY=(.+)$ ]]; then
                    registry="${BASH_REMATCH[1]}"
                elif [[ "$arg" =~ ^TAG=(.+)$ ]]; then
                    tag="${BASH_REMATCH[1]}"
                fi
            done
            
            build_docker_images "$registry" "$tag"
            push_docker_images "$registry" "$tag"
            log_success "所有镜像已构建并推送完成！"
            ;;
        help|*)
            echo "QuickDeck 服务器管理脚本"
            echo ""
            echo "用法: $0 [命令] [参数...]"
            echo ""
            echo "可用命令:"
            echo "  安装和构建:"
            echo "    install              - 安装所有依赖"
            echo "    build                - 构建所有服务"
            echo "  开发环境:"
            echo "    dev                  - 启动开发环境（Docker Compose，所有服务在容器中）"
            echo "    dev-base              - 启动基础服务（db 和 nginx 容器）"
            echo "    dev-backend           - 直接启动后端服务（需要先运行 dev-base）"
            echo "    dev-frontend          - 直接启动前端服务（需要先运行 dev-base）"
            echo "    up                    - 启动所有服务"
            echo "    down                  - 停止所有服务"
            echo "    clean                 - 清理所有构建产物和依赖"
            echo "  生产环境:"
            echo "    start                - 启动所有服务（构建镜像）"
            echo "    stop                 - 停止所有服务"
            echo "    restart              - 重启所有服务"
            echo "    status               - 显示服务状态"
            echo "    logs [服务]          - 查看日志"
            echo "    pull                 - 拉取 Docker 镜像"
            echo "    update               - 更新服务（拉取镜像、移除旧容器、启动新服务）"
            echo "  数据库迁移:"
            echo "    migrate-create MESSAGE - 创建新的迁移文件（需要提供 MESSAGE=描述）"
            echo "    migrate-upgrade      - 运行数据库迁移到最新版本"
            echo "    migrate-downgrade    - 回退一个迁移版本"
            echo "    migrate              - 显示迁移状态"
            echo "  Docker 镜像:"
            echo "    docker-build REGISTRY=xxx TAG=xxx - 构建 Docker 镜像"
            echo "    docker-push REGISTRY=xxx TAG=xxx  - 推送 Docker 镜像"
            echo "    docker-build-push REGISTRY=xxx TAG=xxx - 构建并推送镜像"
            echo "    示例: $0 docker-build-push REGISTRY=docker.io/yourusername TAG=v1.0.0"
            exit 1
            ;;
    esac
}

main "$@"

