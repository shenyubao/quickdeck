from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth

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


@app.get("/")
async def root():
    return {"message": "Welcome to QuickDeck API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

