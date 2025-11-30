from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth
from app.init_db import init_db
from alembic.config import Config
from alembic import command
import os
import time

app = FastAPI(
    title="QuickDeck API",
    description="QuickDeck Backend API",
    version="0.1.0",
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router)


@app.on_event("startup")
async def startup_event():
    """应用启动时运行数据库迁移并初始化数据"""
    # 等待数据库就绪
    max_retries = 30
    retry_count = 0
    
    # 运行 Alembic 迁移
    while retry_count < max_retries:
        try:
            # 获取 Alembic 配置
            alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
            # 运行迁移
            command.upgrade(alembic_cfg, "head")
            print("数据库迁移成功")
            break
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                print(f"数据库迁移失败（已重试 {max_retries} 次）: {e}")
                raise
            print(f"等待数据库就绪... ({retry_count}/{max_retries})")
            time.sleep(2)
    
    # 初始化测试数据（如果数据库为空）
    try:
        init_db()
    except Exception as e:
        print(f"测试数据初始化失败（可能已存在）: {e}")


@app.get("/")
async def root():
    return {"message": "Welcome to QuickDeck API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

