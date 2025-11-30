# Docker 依赖管理问题彻底解决方案

## 问题原因

Docker Compose 配置中使用了匿名卷挂载 `/app/node_modules`：
```yaml
volumes:
  - ./frontend:/app
  - /app/node_modules  # 匿名卷，导致容器内外 node_modules 不同步
  - /app/.next
```

这导致：
1. 本地 `npm install` 的依赖不会同步到容器
2. 容器内的依赖来自 Docker 镜像构建时
3. `package.json` 更新后需要重新构建镜像

## 彻底解决方案

### 方案一：重新构建镜像（推荐）

每次更新 `package.json` 后执行：

```bash
cd /Users/shenyubao/Projects/qianhome/quickdeck

# 停止并删除容器（保留数据卷）
docker-compose down

# 重新构建并启动
docker-compose up --build
```

### 方案二：删除卷并重建

如果方案一无效，删除匿名卷：

```bash
cd /Users/shenyubao/Projects/qianhome/quickdeck

# 停止并删除容器和匿名卷
docker-compose down -v

# 重新构建并启动
docker-compose up --build
```

**警告**：`-v` 会删除所有卷，包括数据库数据！

### 方案三：在容器内安装（临时方案）

不重启的情况下添加依赖：

```bash
# 在运行的容器内安装
docker-compose exec frontend npm install [package-name]

# 清理 Next.js 缓存
docker-compose exec frontend rm -rf /app/.next/*

# 重启前端容器
docker-compose restart frontend
```

**缺点**：下次重建镜像时依赖会丢失

## 最佳实践

### 1. 修改 Dockerfile

优化依赖缓存，避免每次都重新安装所有依赖：

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 先复制 package 文件
COPY package*.json ./

# 安装依赖（利用 Docker 缓存）
RUN npm install

# 然后复制应用代码
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

### 2. 添加依赖的正确流程

```bash
# 1. 在本地添加依赖
cd frontend
npm install react-simple-code-editor prismjs @types/prismjs

# 2. 确认 package.json 已更新
git diff package.json

# 3. 重新构建 Docker 镜像
cd ..
docker-compose up --build
```

### 3. 使用命名卷替代匿名卷

修改 `docker-compose.yml`：

```yaml
services:
  frontend:
    volumes:
      - ./frontend:/app
      - frontend-node-modules:/app/node_modules  # 使用命名卷
      - /app/.next

volumes:
  postgres-data:
  backend-data:
  frontend-node-modules:  # 定义命名卷
```

这样可以更好地管理和查看卷。

## 当前项目已安装的依赖

已在 `package.json` 中添加：
- `react-simple-code-editor`: ^0.14.1
- `prismjs`: ^1.30.0
- `@types/prismjs`: ^1.26.5

## 快速修复命令

```bash
cd /Users/shenyubao/Projects/qianhome/quickdeck
docker-compose down
docker-compose up --build -d
```

## 验证安装

```bash
# 检查依赖是否安装
docker-compose exec frontend npm list react-simple-code-editor
docker-compose exec frontend npm list prismjs

# 查看容器日志
docker-compose logs frontend -f
```

