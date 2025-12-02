#!/bin/bash

# Docker 镜像构建和推送脚本
# 使用方法: ./scripts/build-and-push.sh [registry] [tag]
# 例如: ./scripts/build-and-push.sh docker.io/yourusername latest
# 或者: ./scripts/build-and-push.sh registry.example.com/quickdeck v1.0.0

set -e

# 默认值
REGISTRY="${1:-docker.io}"
TAG="${2:-latest}"
PROJECT_NAME="quickdeck"

# 如果提供了完整的仓库路径（包含用户名），直接使用
if [[ "$1" == *"/"* ]]; then
    REGISTRY_PATH="$1"
    TAG="${2:-latest}"
else
    # 否则需要用户提供用户名
    if [ -z "$1" ] || [ "$1" == "docker.io" ]; then
        echo "错误: 请提供 Docker 仓库路径"
        echo "使用方法: $0 <registry/username> [tag]"
        echo "示例: $0 docker.io/yourusername latest"
        echo "示例: $0 registry.example.com/quickdeck v1.0.0"
        exit 1
    fi
    REGISTRY_PATH="$1"
fi

echo "=========================================="
echo "构建和推送 Docker 镜像"
echo "=========================================="
echo "仓库路径: $REGISTRY_PATH"
echo "标签: $TAG"
echo "=========================================="

# 构建后端镜像
echo ""
echo "构建后端镜像..."
docker build -t "${REGISTRY_PATH}/${PROJECT_NAME}-backend:${TAG}" \
    -t "${REGISTRY_PATH}/${PROJECT_NAME}-backend:latest" \
    -f backend/Dockerfile \
    backend/

# 构建前端镜像
echo ""
echo "构建前端镜像..."
docker build -t "${REGISTRY_PATH}/${PROJECT_NAME}-frontend:${TAG}" \
    -t "${REGISTRY_PATH}/${PROJECT_NAME}-frontend:latest" \
    -f frontend/Dockerfile \
    frontend/

# 询问是否推送
echo ""
read -p "是否推送到镜像仓库? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "推送后端镜像..."
    docker push "${REGISTRY_PATH}/${PROJECT_NAME}-backend:${TAG}"
    docker push "${REGISTRY_PATH}/${PROJECT_NAME}-backend:latest"
    
    echo ""
    echo "推送前端镜像..."
    docker push "${REGISTRY_PATH}/${PROJECT_NAME}-frontend:${TAG}"
    docker push "${REGISTRY_PATH}/${PROJECT_NAME}-frontend:latest"
    
    echo ""
    echo "=========================================="
    echo "镜像推送完成！"
    echo "=========================================="
    echo "后端镜像: ${REGISTRY_PATH}/${PROJECT_NAME}-backend:${TAG}"
    echo "前端镜像: ${REGISTRY_PATH}/${PROJECT_NAME}-frontend:${TAG}"
else
    echo ""
    echo "已跳过推送，镜像已构建完成"
    echo "后端镜像: ${REGISTRY_PATH}/${PROJECT_NAME}-backend:${TAG}"
    echo "前端镜像: ${REGISTRY_PATH}/${PROJECT_NAME}-frontend:${TAG}"
fi

