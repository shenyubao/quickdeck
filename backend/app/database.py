from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/quickdeck"
    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    class Config:
        env_file = ".env"


settings = Settings()

# 延迟创建 engine，避免在导入时就连接数据库
_engine: Optional[create_engine] = None
_SessionLocal: Optional[sessionmaker] = None


def _get_engine():
    """获取数据库引擎（延迟创建）"""
    global _engine
    if _engine is None:
        _engine = create_engine(settings.database_url)
    return _engine


def _get_session_local():
    """获取会话工厂（延迟创建）"""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_get_engine())
    return _SessionLocal


# 为了向后兼容，提供模块级属性访问（Python 3.7+）
def __getattr__(name: str):
    """模块级属性访问，支持延迟初始化"""
    if name == "engine":
        return _get_engine()
    elif name == "SessionLocal":
        return _get_session_local()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 基础模型类"""
    pass


def get_db():
    """数据库会话依赖"""
    db = _get_session_local()()
    try:
        yield db
    finally:
        db.close()

