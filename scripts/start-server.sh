#!/bin/bash
# QuickDeck 服务器启动脚本
# 用于在服务器上启动整套服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

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
        log_error "请安装 Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! check_command docker-compose; then
        log_error "请安装 Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # 检查 Docker 服务是否运行
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行，请启动 Docker 服务"
        exit 1
    fi
    
    log_success "依赖检查通过"
}

# 检查并创建环境变量文件
setup_env_files() {
    log_info "检查环境变量配置..."
    
    # 后端环境变量
    if [ ! -f "backend/.env" ]; then
        log_warning "backend/.env 不存在，从 env.example 创建..."
        if [ -f "backend/env.example" ]; then
            cp backend/env.example backend/.env
            log_warning "请编辑 backend/.env 文件，修改数据库连接和密钥配置"
        else
            log_error "backend/env.example 不存在"
            exit 1
        fi
    fi
    
    # 前端环境变量
    if [ ! -f "frontend/.env.local" ]; then
        log_warning "frontend/.env.local 不存在，从 env.example 创建..."
        if [ -f "frontend/env.example" ]; then
            cp frontend/env.example frontend/.env.local
            log_warning "请编辑 frontend/.env.local 文件，修改 NEXTAUTH_SECRET 等配置"
        else
            log_error "frontend/env.example 不存在"
            exit 1
        fi
    fi
    
    log_success "环境变量文件检查完成"
}

# 等待数据库就绪
wait_for_db() {
    log_info "等待数据库启动..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose exec -T db pg_isready -U postgres &> /dev/null; then
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

# 运行数据库迁移
run_migrations() {
    log_info "运行数据库迁移..."
    
    if docker-compose exec -T backend poetry run alembic upgrade head 2>/dev/null; then
        log_success "数据库迁移完成"
    else
        log_warning "数据库迁移失败，可能是首次运行或数据库未就绪，稍后会自动重试"
    fi
}

# 启动服务
start_services() {
    log_info "启动所有服务..."
    
    # 先启动数据库
    log_info "启动数据库..."
    docker-compose up -d db
    
    # 等待数据库就绪
    if wait_for_db; then
        # 运行迁移
        run_migrations
    else
        log_warning "数据库未就绪，迁移将在服务启动后自动执行"
    fi
    
    # 启动所有服务
    log_info "启动所有服务（backend, frontend, nginx）..."
    docker-compose up -d
    
    log_success "所有服务已启动"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    local max_attempts=30
    local attempt=0
    local all_healthy=false
    
    while [ $attempt -lt $max_attempts ]; do
        # 检查 nginx
        if curl -sf http://localhost/health &> /dev/null; then
            # 检查后端
            if docker-compose exec -T backend curl -sf http://localhost:8000/health &> /dev/null 2>&1 || \
               docker-compose ps backend | grep -q "Up"; then
                all_healthy=true
                break
            fi
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    echo ""
    
    if [ "$all_healthy" = true ]; then
        log_success "所有服务健康检查通过"
        return 0
    else
        log_warning "部分服务可能未就绪，请检查日志"
        return 1
    fi
}

# 显示服务状态
show_status() {
    echo ""
    log_info "服务状态："
    docker-compose ps
    
    echo ""
    log_info "服务访问地址："
    echo "  - 前端: http://localhost"
    echo "  - 后端 API: http://localhost/api"
    echo "  - API 文档: http://localhost/api/docs"
    echo "  - 健康检查: http://localhost/health"
}

# 显示日志
show_logs() {
    local service=${1:-""}
    if [ -n "$service" ]; then
        docker-compose logs -f "$service"
    else
        docker-compose logs -f
    fi
}

# 停止服务
stop_services() {
    log_info "停止所有服务..."
    docker-compose down
    log_success "所有服务已停止"
}

# 重启服务
restart_services() {
    log_info "重启所有服务..."
    docker-compose restart
    log_success "所有服务已重启"
}

# 主函数
main() {
    local command=${1:-"start"}
    
    case "$command" in
        start)
            check_dependencies
            setup_env_files
            start_services
            sleep 3
            health_check
            show_status
            ;;
        stop)
            stop_services
            ;;
        restart)
            restart_services
            health_check
            show_status
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "$2"
            ;;
        migrate)
            check_dependencies
            wait_for_db
            run_migrations
            ;;
        health)
            health_check
            ;;
        *)
            echo "QuickDeck 服务器管理脚本"
            echo ""
            echo "用法: $0 [命令]"
            echo ""
            echo "可用命令:"
            echo "  start      - 启动所有服务（默认）"
            echo "  stop       - 停止所有服务"
            echo "  restart    - 重启所有服务"
            echo "  status     - 显示服务状态"
            echo "  logs [服务] - 查看日志（可选服务名: backend, frontend, nginx, db）"
            echo "  migrate    - 运行数据库迁移"
            echo "  health     - 执行健康检查"
            echo ""
            echo "示例:"
            echo "  $0 start              # 启动所有服务"
            echo "  $0 logs               # 查看所有服务日志"
            echo "  $0 logs backend       # 查看后端日志"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"

