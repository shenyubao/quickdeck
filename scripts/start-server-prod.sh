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

# 检查镜像是否存在且代码是否有更新
check_images() {
    log_info "检查 Docker 镜像和代码更新..."
    
    # 检查需要构建的服务（backend 和 frontend）
    local need_build=false
    
    # 获取项目名称（docker-compose 默认使用目录名作为项目前缀）
    local project_name=$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')
    
    # 检查 backend 和 frontend 服务的镜像是否存在
    for service in backend frontend; do
        # 检查服务是否有 build 配置
        if docker-compose -f "$COMPOSE_FILE" config 2>/dev/null | grep -A 10 "^  ${service}:" | grep -q "build:"; then
            local image_id=""
            local image_found=false
            
            # 方法1: 使用 docker-compose images 检查（如果容器存在）
            image_id=$(docker-compose -f "$COMPOSE_FILE" images -q "$service" 2>/dev/null | head -1)
            if [ -n "$image_id" ]; then
                image_found=true
            else
                # 方法2: 直接检查 docker images 中是否存在相关镜像
                # docker-compose 构建的镜像名称格式通常是：项目名_服务名 或 项目名-服务名
                # 尝试多种可能的命名格式
                for pattern in "${project_name}_${service}" "${project_name}-${service}" "quickdeck_${service}" "quickdeck-${service}"; do
                    image_id=$(docker images --format "{{.ID}}" --filter "reference=${pattern}:*" 2>/dev/null | head -1)
                    if [ -n "$image_id" ]; then
                        image_found=true
                        break
                    fi
                done
            fi
            
            if [ "$image_found" = false ]; then
                need_build=true
                log_info "服务 $service 的镜像不存在，需要构建"
                break
            else
                # 镜像存在，检查代码是否有更新
                local code_updated=false
                
                # 获取镜像创建时间
                local image_created=$(docker inspect --format='{{.Created}}' "$image_id" 2>/dev/null)
                if [ -z "$image_created" ]; then
                    # 如果无法获取创建时间，默认需要重新构建
                    code_updated=true
                    log_info "无法获取镜像创建时间，将重新构建服务 $service"
                else
                    # 转换镜像创建时间为 Unix 时间戳
                    # Docker 镜像时间格式: 2024-01-01T12:00:00.123456789Z
                    local image_timestamp=0
                    if [[ "$OSTYPE" == "darwin"* ]]; then
                        # macOS
                        local date_str="${image_created%.*}"  # 移除纳秒部分
                        date_str="${date_str%Z}"  # 移除 Z
                        date_str="${date_str%+*}"  # 移除时区偏移
                        image_timestamp=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$date_str" +%s 2>/dev/null || echo "0")
                    else
                        # Linux
                        image_timestamp=$(date -d "$image_created" +%s 2>/dev/null || echo "0")
                    fi
                    
                    # 如果时间戳转换失败，默认需要重新构建
                    if [ "$image_timestamp" = "0" ]; then
                        code_updated=true
                        log_info "无法解析镜像创建时间，将重新构建服务 $service"
                    else
                        # 只有在时间戳有效时才检查文件更新
                        # 检查关键文件的修改时间
                        local service_dir="${PROJECT_DIR}/${service}"
                        local dockerfile="${service_dir}/Dockerfile"
                        
                        # 检查 Dockerfile
                        if [ "$code_updated" = false ] && [ -f "$dockerfile" ]; then
                            local dockerfile_timestamp=$(stat -f %m "$dockerfile" 2>/dev/null || stat -c %Y "$dockerfile" 2>/dev/null || echo "0")
                            if [ "$dockerfile_timestamp" != "0" ] && [ "$dockerfile_timestamp" -gt "$image_timestamp" ]; then
                                code_updated=true
                                log_info "服务 $service 的 Dockerfile 已更新，需要重新构建"
                            fi
                        fi
                        
                        # 检查依赖文件
                        if [ "$code_updated" = false ]; then
                            if [ "$service" = "backend" ]; then
                                local dep_file="${service_dir}/pyproject.toml"
                                if [ -f "$dep_file" ]; then
                                    local dep_timestamp=$(stat -f %m "$dep_file" 2>/dev/null || stat -c %Y "$dep_file" 2>/dev/null || echo "0")
                                    if [ "$dep_timestamp" != "0" ] && [ "$dep_timestamp" -gt "$image_timestamp" ]; then
                                        code_updated=true
                                        log_info "服务 $service 的依赖文件已更新，需要重新构建"
                                    fi
                                fi
                            elif [ "$service" = "frontend" ]; then
                                local dep_file="${service_dir}/package.json"
                                if [ -f "$dep_file" ]; then
                                    local dep_timestamp=$(stat -f %m "$dep_file" 2>/dev/null || stat -c %Y "$dep_file" 2>/dev/null || echo "0")
                                    if [ "$dep_timestamp" != "0" ] && [ "$dep_timestamp" -gt "$image_timestamp" ]; then
                                        code_updated=true
                                        log_info "服务 $service 的依赖文件已更新，需要重新构建"
                                    fi
                                fi
                            fi
                        fi
                        
                        # 检查源代码目录是否有更新（检查最近修改的文件）
                        if [ "$code_updated" = false ] && ([ -d "${service_dir}/app" ] || [ -d "${service_dir}/src" ]); then
                            # 查找源代码目录中最新的文件修改时间
                            local source_dir=""
                            if [ -d "${service_dir}/app" ]; then
                                source_dir="${service_dir}/app"
                            elif [ -d "${service_dir}/src" ]; then
                                source_dir="${service_dir}/src"
                            fi
                            
                            if [ -n "$source_dir" ]; then
                                # 获取源代码目录中最新的文件修改时间
                                local latest_source_timestamp=$(find "$source_dir" -type f -exec stat -f %m {} \; 2>/dev/null | sort -rn | head -1)
                                if [ -z "$latest_source_timestamp" ]; then
                                    latest_source_timestamp=$(find "$source_dir" -type f -exec stat -c %Y {} \; 2>/dev/null | sort -rn | head -1)
                                fi
                                
                                if [ -n "$latest_source_timestamp" ] && [ "$latest_source_timestamp" -gt "$image_timestamp" ]; then
                                    code_updated=true
                                    log_info "服务 $service 的源代码已更新，需要重新构建"
                                fi
                            fi
                        fi
                    fi
                fi
                
                if [ "$code_updated" = true ]; then
                    need_build=true
                    break
                fi
            fi
        fi
    done
    
    if [ "$need_build" = true ]; then
        return 1
    else
        log_success "所有镜像已存在且代码未更新，跳过构建"
        return 0
    fi
}

# 启动服务
start_services() {
    log_info "启动生产环境服务..."
    
    # 构建镜像（如果需要）
    if ! check_images; then
        log_info "构建 Docker 镜像..."
        docker-compose -f "$COMPOSE_FILE" build --progress=plain
    fi
    
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

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    local max_attempts=60
    local attempt=0
    local all_healthy=false
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf http://localhost/health &> /dev/null; then
            if docker-compose -f "$COMPOSE_FILE" ps backend | grep -q "Up"; then
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
            health_check
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
            health_check
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

