from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers import auth, projects, jobs, executions, credentials
from app.init_db import init_db
from alembic.config import Config
from alembic import command
import os
import sys
import time
import logging
import traceback
from starlette.middleware.base import BaseHTTPMiddleware

# 配置日志 - 确保输出到标准输出和标准错误
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    force=True,  # 强制重新配置日志
    handlers=[
        logging.StreamHandler()  # 明确指定输出到标准输出
    ]
)

# 配置根日志记录器
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# 配置 uvicorn 日志
uvicorn_logger = logging.getLogger("uvicorn")
uvicorn_logger.setLevel(logging.INFO)
uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.setLevel(logging.INFO)
uvicorn_error_logger = logging.getLogger("uvicorn.error")
uvicorn_error_logger.setLevel(logging.INFO)

# 应用日志记录器
logger = logging.getLogger("app.main")
logger.setLevel(logging.INFO)

# 确保日志输出到控制台
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(handler)
    logger.propagate = True  # 允许传播到根日志记录器


class LoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件"""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # 记录请求信息
        method = request.method
        path = request.url.path
        client_ip = request.client.host if request.client else "unknown"
        
        log_message = f"收到请求: {method} {path} - 客户端IP: {client_ip}"
        logger.info(log_message)
        
        # 处理请求
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            # 记录响应信息
            status_code = response.status_code
            log_message = (
                f"请求完成: {method} {path} - "
                f"状态码: {status_code} - "
                f"处理时间: {process_time:.3f}s"
            )
            logger.info(log_message)
            # 同时使用 print 确保输出（用于调试）
            print(log_message, flush=True)
            
            return response
        except Exception as e:
            process_time = time.time() - start_time
            error_traceback = traceback.format_exc()
            log_message = (
                f"请求失败: {method} {path} - "
                f"错误: {str(e)} - "
                f"处理时间: {process_time:.3f}s"
            )
            logger.error(log_message)
            logger.error(f"错误堆栈跟踪:\n{error_traceback}")
            # 同时使用 print 确保错误输出（用于调试）
            print(f"ERROR: {log_message}", file=sys.stderr, flush=True)
            print(f"ERROR: 错误堆栈跟踪:\n{error_traceback}", file=sys.stderr, flush=True)
            raise


app = FastAPI(
    title="QuickDeck API",
    description="QuickDeck Backend API",
    version="0.1.0",
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器，捕获所有未处理的异常"""
    error_traceback = traceback.format_exc()
    
    # 记录详细的错误信息
    error_msg = f"未处理的异常: {type(exc).__name__}: {str(exc)}"
    path_msg = f"请求路径: {request.method} {request.url.path}"
    
    logger.error(error_msg)
    logger.error(path_msg)
    logger.error(f"错误堆栈跟踪:\n{error_traceback}")
    
    # 同时使用 print 确保错误输出到控制台（用于调试）
    print(f"ERROR: {error_msg}", file=sys.stderr, flush=True)
    print(f"ERROR: {path_msg}", file=sys.stderr, flush=True)
    print(f"ERROR: 错误堆栈跟踪:\n{error_traceback}", file=sys.stderr, flush=True)
    
    # 如果是 HTTPException，保持原有行为
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )
    
    # 其他异常返回 500 错误
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"内部服务器错误: {str(exc)}",
            "type": type(exc).__name__
        }
    )


# 添加日志中间件（需要在 CORS 之前添加）
app.add_middleware(LoggingMiddleware)

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
app.include_router(projects.router)
app.include_router(jobs.router)
app.include_router(executions.router)
app.include_router(credentials.router)


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

