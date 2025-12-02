# QuickDeck 服务器部署指南

本指南介绍如何在服务器上部署和启动 QuickDeck 服务。

## 前置要求

1. **操作系统**: Linux (Ubuntu 20.04+ / CentOS 7+ / Debian 10+)
2. **Docker**: 20.10+
3. **Docker Compose**: 1.29+
4. **磁盘空间**: 至少 10GB 可用空间
5. **内存**: 至少 2GB RAM
6. **网络**: 开放 80 端口（HTTP）

## 快速开始

### 1. 安装 Docker 和 Docker Compose

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 重新登录以应用用户组更改
newgrp docker
```

### 2. 克隆项目

```bash
cd /opt  # 或其他目录
git clone <your-repo-url> quickdeck
cd quickdeck
```

### 3. 配置环境变量

#### 后端配置

```bash
cp backend/env.example backend/.env
nano backend/.env
```

修改以下配置：
```env
DATABASE_URL=postgresql://postgres:your-strong-password@db:5432/quickdeck
SECRET_KEY=your-very-strong-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
```

#### 前端配置

```bash
cp frontend/env.example frontend/.env.local
nano frontend/.env.local
```

修改以下配置：
```env
NEXTAUTH_URL=http://your-domain.com
NEXTAUTH_SECRET=your-very-strong-secret-key-here
NEXT_PUBLIC_API_URL=http://your-domain.com/api
```

**重要**: 
- `NEXTAUTH_SECRET` 和 `SECRET_KEY` 必须是强随机字符串
- 可以使用以下命令生成：`openssl rand -base64 32`

### 4. 修改 docker-compose.yml（生产环境）

如果需要在生产环境使用不同的配置，可以创建 `docker-compose.prod.yml`：

```yaml
# 示例：修改为生产环境配置
services:
  backend:
    command: poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
    environment:
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@db:5432/quickdeck
      - SECRET_KEY=${SECRET_KEY}
  
  frontend:
    environment:
      - NODE_ENV=production
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
```

### 5. 启动服务

#### 使用启动脚本（推荐）

```bash
# 给脚本添加执行权限
chmod +x scripts/start-server.sh

# 启动服务
./scripts/start-server.sh start

# 查看服务状态
./scripts/start-server.sh status

# 查看日志
./scripts/start-server.sh logs
./scripts/start-server.sh logs backend  # 只看后端日志
```

#### 使用 Docker Compose 直接启动

```bash
# 启动所有服务
docker-compose up -d

# 运行数据库迁移
docker-compose exec backend poetry run alembic upgrade head

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 6. 验证服务

```bash
# 健康检查
curl http://localhost/health

# 检查服务状态
./scripts/start-server.sh status
```

## 常用命令

### 启动脚本命令

```bash
./scripts/start-server.sh start      # 启动所有服务
./scripts/start-server.sh stop       # 停止所有服务
./scripts/start-server.sh restart    # 重启所有服务
./scripts/start-server.sh status     # 查看服务状态
./scripts/start-server.sh logs       # 查看所有日志
./scripts/start-server.sh logs backend  # 查看后端日志
./scripts/start-server.sh migrate    # 运行数据库迁移
./scripts/start-server.sh health     # 健康检查
```

### Docker Compose 命令

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看日志
docker-compose logs -f [service_name]

# 进入容器
docker-compose exec backend bash
docker-compose exec frontend sh

# 查看资源使用
docker stats
```

## 作为系统服务运行（可选）

### 使用 systemd

1. 复制服务文件：

```bash
sudo cp scripts/quickdeck.service /etc/systemd/system/
```

2. 编辑服务文件，修改路径：

```bash
sudo nano /etc/systemd/system/quickdeck.service
```

修改以下行：
```ini
WorkingDirectory=/opt/quickdeck  # 改为实际项目路径
ExecStart=/opt/quickdeck/scripts/start-server.sh start
ExecStop=/opt/quickdeck/scripts/start-server.sh stop
ExecReload=/opt/quickdeck/scripts/start-server.sh restart
```

3. 启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable quickdeck
sudo systemctl start quickdeck
```

4. 管理服务：

```bash
sudo systemctl status quickdeck
sudo systemctl stop quickdeck
sudo systemctl restart quickdeck
sudo journalctl -u quickdeck -f  # 查看日志
```

## 数据库管理

### 备份数据库

```bash
# 创建备份
docker-compose exec db pg_dump -U postgres quickdeck > backup_$(date +%Y%m%d_%H%M%S).sql

# 或使用压缩
docker-compose exec -T db pg_dump -U postgres quickdeck | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 恢复数据库

```bash
# 恢复备份
cat backup.sql | docker-compose exec -T db psql -U postgres quickdeck

# 或从压缩文件恢复
gunzip < backup.sql.gz | docker-compose exec -T db psql -U postgres quickdeck
```

### 数据库迁移

```bash
# 运行迁移
./scripts/start-server.sh migrate

# 或直接使用
docker-compose exec backend poetry run alembic upgrade head

# 查看迁移历史
docker-compose exec backend poetry run alembic history

# 回滚迁移
docker-compose exec backend poetry run alembic downgrade -1
```

## 监控和维护

### 查看资源使用

```bash
# Docker 容器资源使用
docker stats

# 磁盘使用
df -h
docker system df

# 清理未使用的资源
docker system prune -a
```

### 日志管理

```bash
# 查看最近日志
docker-compose logs --tail=100

# 实时查看日志
docker-compose logs -f

# 查看特定服务的日志
docker-compose logs -f backend

# 清理日志（谨慎使用）
docker-compose down
docker system prune -a
```

### 更新服务

```bash
# 1. 拉取最新代码
git pull

# 2. 停止服务
./scripts/start-server.sh stop

# 3. 重新构建镜像
docker-compose build --no-cache

# 4. 运行数据库迁移（如果有）
./scripts/start-server.sh migrate

# 5. 启动服务
./scripts/start-server.sh start
```

## 故障排查

### 服务无法启动

1. 检查 Docker 服务：
```bash
sudo systemctl status docker
```

2. 检查端口占用：
```bash
sudo netstat -tulpn | grep :80
```

3. 查看详细日志：
```bash
./scripts/start-server.sh logs
docker-compose logs
```

### 数据库连接失败

1. 检查数据库容器状态：
```bash
docker-compose ps db
```

2. 检查数据库日志：
```bash
docker-compose logs db
```

3. 测试数据库连接：
```bash
docker-compose exec db pg_isready -U postgres
```

### 前端无法访问后端 API

1. 检查 nginx 配置：
```bash
docker-compose exec nginx nginx -t
```

2. 检查后端服务：
```bash
docker-compose exec backend curl http://localhost:8000/health
```

3. 查看 nginx 日志：
```bash
docker-compose logs nginx
```

## 安全建议

1. **使用 HTTPS**: 配置 SSL 证书，使用 HTTPS 访问
2. **防火墙**: 只开放必要的端口（80, 443）
3. **强密码**: 数据库密码和密钥使用强随机字符串
4. **定期更新**: 定期更新 Docker 镜像和系统
5. **备份**: 定期备份数据库和配置文件
6. **监控**: 设置监控和告警系统

## 性能优化

1. **增加后端工作进程**:
```yaml
command: poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

2. **使用生产环境构建前端**:
```yaml
frontend:
  command: npm run start  # 使用生产构建
```

3. **配置数据库连接池**:
在 `backend/.env` 中配置 SQLAlchemy 连接池参数

4. **使用反向代理缓存**:
在 nginx 配置中添加缓存规则

## 支持

如遇到问题，请查看：
- 项目 README.md
- Docker Compose 日志
- 各服务的日志文件

