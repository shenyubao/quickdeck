from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置类"""
    database_url: str = "postgresql://postgres:postgres@localhost:5432/quickdeck"
    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200  # 30天 (30 * 24 * 60)
    
    class Config:
        env_file = ".env"


settings = Settings()

