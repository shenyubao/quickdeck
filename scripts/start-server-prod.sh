#!/bin/bash
# QuickDeck 生产环境启动脚本
# 用于在生产服务器上启动服务（使用生产环境配置）

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

# 使用生产环境配置
COMPOSE_FILE="docker-compose.prod.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    COMPOSE_FILE="docker-compose.yml"
    echo -e "${YELLOW}[WARNING]${NC} docker-compose.prod.yml 不存在，使用 docker-compose.yml"
fi

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

# 检查生产环境变量
check_prod_env() {
    log_info "检查生产环境配置..."
    
    # 检查必要的环境变量
    local missing_vars=()
    
    if [ ! -f "backend/.env" ]; then
        missing_vars+=("backend/.env")
    fi
    
    if [ ! -f "frontend/.env.local" ]; then
        missing_vars+=("frontend/.env.local")
    fi
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "缺少必要的环境变量文件:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        log_error "请先配置环境变量文件"
        exit 1
    fi
    
    # 检查关键配置
    if grep -q "your-secret-key" backend/.env 2>/dev/null; then
        log_warning "backend/.env 中可能包含默认密钥，请修改为生产环境密钥"
    fi
    
    if grep -q "your-secret-key" frontend/.env.local 2>/dev/null; then
        log_warning "frontend/.env.local 中可能包含默认密钥，请修改为生产环境密钥"
    fi
    
    log_success "环境配置检查完成"
}

# 等待数据库就绪
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

# 运行数据库迁移
run_migrations() {
    log_info "运行数据库迁移..."
    
    if docker-compose -f "$COMPOSE_FILE" exec -T backend poetry run alembic upgrade head 2>/dev/null; then
        log_success "数据库迁移完成"
    else
        log_warning "数据库迁移失败，请检查日志"
    fi
}

# 启动服务
start_services() {
    log_info "启动生产环境服务..."
    
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

# 主函数
main() {
    local command=${1:-"start"}
    
    case "$command" in
        start)
            check_dependencies
            check_prod_env
            start_services
            sleep 5
            show_status
            ;;
        stop)
            log_info "停止生产环境服务..."
            docker-compose -f "$COMPOSE_FILE" down
            log_success "所有服务已停止"
            ;;
        restart)
            log_info "重启生产环境服务..."
            docker-compose -f "$COMPOSE_FILE" restart
            sleep 3
            show_status
            ;;
        status)
            show_status
            ;;
        logs)
            docker-compose -f "$COMPOSE_FILE" logs -f "${2:-}"
            ;;
        migrate)
            check_dependencies
            wait_for_db
            run_migrations
            ;;
        *)
            echo "QuickDeck 生产环境管理脚本"
            echo ""
            echo "用法: $0 [命令]"
            echo ""
            echo "可用命令:"
            echo "  start      - 启动所有服务（构建镜像）"
            echo "  stop       - 停止所有服务"
            echo "  restart    - 重启所有服务"
            echo "  status     - 显示服务状态"
            echo "  logs [服务] - 查看日志"
            echo "  migrate    - 运行数据库迁移"
            exit 1
            ;;
    esac
}

main "$@"

