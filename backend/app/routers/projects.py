from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Project, User, project_users
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectUserResponse, ProjectUserAddRequest
from app.routers.auth import get_current_user
import uuid

router = APIRouter(prefix="/api/projects", tags=["projects"])
security = HTTPBearer()


def check_project_permission(project: Project, current_user: User) -> bool:
    """检查用户是否有项目权限（是所有者或关联用户）"""
    if project.owner_id == current_user.id:
        return True
    return current_user.id in [u.id for u in project.accessible_users]


@router.get("", response_model=List[ProjectResponse])
async def get_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的所有项目（包括作为所有者的项目和关联的项目）"""
    from sqlalchemy import or_
    # 查询用户作为所有者的项目
    owned_projects = db.query(Project).filter(Project.owner_id == current_user.id).all()
    
    # 查询用户被关联到的项目
    accessible_projects = db.query(Project).join(project_users).filter(
        project_users.c.user_id == current_user.id
    ).all()
    
    # 合并并去重
    all_project_ids = {p.id for p in owned_projects}
    for p in accessible_projects:
        if p.id not in all_project_ids:
            owned_projects.append(p)
    
    return owned_projects


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取单个项目详情"""
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )
    
    # 检查权限
    if not check_project_permission(project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此项目"
        )
    
    return project


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建新项目"""
    # 生成 project_id（如果未提供）
    project_id = project_data.project_id or str(uuid.uuid4())
    
    # 检查 project_id 是否已存在
    existing_project = db.query(Project).filter(Project.project_id == project_id).first()
    if existing_project:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="项目ID已存在"
        )
    
    # 创建项目
    new_project = Project(
        project_id=project_id,
        name=project_data.name,
        description=project_data.description,
        owner_id=current_user.id
    )
    
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    
    return new_project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新项目（仅项目所有者）"""
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )
    
    # 只有项目所有者可以更新项目
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有项目所有者可以更新项目"
        )
    
    # 更新字段
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    
    db.commit()
    db.refresh(project)
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除项目（仅项目所有者）"""
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )
    
    # 只有项目所有者可以删除项目
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有项目所有者可以删除项目"
        )
    
    db.delete(project)
    db.commit()
    
    return None


@router.get("/{project_id}/users", response_model=List[ProjectUserResponse])
async def get_project_users(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取项目的关联用户列表"""
    # 检查项目是否存在，且当前用户是项目所有者或有权限访问
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )
    
    # 检查权限：项目所有者或有访问权限的用户
    has_permission = (
        project.owner_id == current_user.id or
        current_user.id in [u.id for u in project.accessible_users]
    )
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此项目"
        )
    
    # 返回项目的所有关联用户（包括owner）
    users = [project.owner] + list(project.accessible_users)
    return users


@router.post("/{project_id}/users", response_model=List[ProjectUserResponse])
async def add_project_users(
    project_id: int,
    request: ProjectUserAddRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """为项目添加关联用户（仅项目所有者）"""
    # 检查项目是否存在，且当前用户是项目所有者
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )
    
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有项目所有者可以管理项目用户"
        )
    
    # 验证用户是否存在
    users = db.query(User).filter(User.id.in_(request.user_ids)).all()
    if len(users) != len(request.user_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="部分用户不存在"
        )
    
    # 过滤掉已经是owner的用户和已经关联的用户
    existing_user_ids = {u.id for u in project.accessible_users}
    existing_user_ids.add(project.owner_id)
    new_user_ids = [uid for uid in request.user_ids if uid not in existing_user_ids]
    
    # 添加关联
    for user_id in new_user_ids:
        stmt = project_users.insert().values(project_id=project_id, user_id=user_id)
        db.execute(stmt)
    
    db.commit()
    
    # 返回更新后的用户列表
    db.refresh(project)
    users = [project.owner] + list(project.accessible_users)
    return users


@router.delete("/{project_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_user(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """从项目移除关联用户（仅项目所有者）"""
    # 检查项目是否存在，且当前用户是项目所有者
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )
    
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有项目所有者可以管理项目用户"
        )
    
    # 不能移除项目所有者
    if user_id == project.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能移除项目所有者"
        )
    
    # 删除关联
    stmt = project_users.delete().where(
        project_users.c.project_id == project_id,
        project_users.c.user_id == user_id
    )
    db.execute(stmt)
    db.commit()
    
    return None

