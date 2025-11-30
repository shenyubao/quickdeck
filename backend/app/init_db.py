"""初始化数据库测试数据"""
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash


def init_db():
    """初始化数据库测试数据（不创建表，表由 Alembic 迁移管理）"""
    db = SessionLocal()
    try:
        # 检查是否已有数据
        existing_users = db.query(User).count()
        if existing_users > 0:
            print("数据库已存在用户数据，跳过初始化")
            return
        
        # 创建管理员用户
        admin_user = User(
            username="admin",
            email="admin@example.com",
            nickname="管理员",
            hashed_password=get_password_hash("admin123"),
            is_active=True,
            is_admin=True,
        )
        db.add(admin_user)
        
        # 创建普通用户
        normal_user = User(
            username="user",
            email="user@example.com",
            nickname="普通用户",
            hashed_password=get_password_hash("user123"),
            is_active=True,
            is_admin=False,
        )
        db.add(normal_user)
        
        db.commit()
        print("测试数据初始化成功！")
        print("管理员账户: username=admin, password=admin123")
        print("普通用户账户: username=user, password=user123")
        
    except Exception as e:
        db.rollback()
        print(f"初始化失败: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init_db()

