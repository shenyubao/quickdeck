from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from sqlalchemy import or_
from app.database import get_db
from app.models import Credential, Project, User, project_users
from app.schemas import CredentialCreate, CredentialUpdate, CredentialResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/credentials", tags=["credentials"])
security = HTTPBearer()


def check_project_permission(project: Project, current_user: User) -> bool:
    """检查用户是否有项目权限（是所有者或关联用户）"""
    if project.owner_id == current_user.id:
        return True
    return current_user.id in [u.id for u in project.accessible_users]


@router.get("", response_model=List[CredentialResponse])
async def get_credentials(
    project_id: Optional[int] = Query(None, description="项目ID，可选"),
    credential_type: Optional[str] = Query(None, description="凭证类型，可选"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的凭证列表（包括用户有权限访问的项目中的凭证）"""
    # 获取用户有权限访问的项目ID列表
    owned_projects = db.query(Project.id).filter(Project.owner_id == current_user.id).all()
    accessible_projects = db.query(project_users.c.project_id).filter(
        project_users.c.user_id == current_user.id
    ).all()
    project_ids = [p.id for p in owned_projects] + [p.project_id for p in accessible_projects]
    
    if not project_ids:
        # 如果没有可访问的项目，返回空列表
        return []
    
    query = db.query(Credential).filter(Credential.project_id.in_(project_ids))
    
    # 如果指定了项目ID，则过滤项目
    if project_id is not None:
        # 验证项目是否存在且用户有权限访问
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在或无权限访问"
            )
        # 检查权限（所有者或关联用户）
        if not check_project_permission(project, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="项目不存在或无权限访问"
            )
        query = query.filter(Credential.project_id == project_id)
    
    # 如果指定了凭证类型，则过滤类型
    if credential_type is not None:
        query = query.filter(Credential.credential_type == credential_type)
    
    credentials = query.order_by(Credential.created_at.desc()).all()
    return credentials


@router.get("/{credential_id}", response_model=CredentialResponse)
async def get_credential(
    credential_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取单个凭证"""
    credential = db.query(Credential).filter(Credential.id == credential_id).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="凭证不存在或无权限访问"
        )
    
    # 检查项目权限
    project = db.query(Project).filter(Project.id == credential.project_id).first()
    if not project or not check_project_permission(project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="凭证不存在或无权限访问"
        )
    
    return credential


@router.post("", response_model=CredentialResponse, status_code=status.HTTP_201_CREATED)
async def create_credential(
    credential_data: CredentialCreate,
    project_id: int = Query(..., description="项目ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建凭证（仅项目所有者）"""
    # 验证项目是否存在且当前用户是项目所有者
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在或无权限访问"
        )
    
    # 只有项目所有者可以创建凭证
    if project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有项目所有者可以创建凭证"
        )
    
    # 验证凭证类型
    valid_types = ["mysql", "oss", "deepseek"]
    if credential_data.credential_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的凭证类型，支持的类型: {', '.join(valid_types)}"
        )
    
    # 创建凭证
    credential = Credential(
        project_id=project_id,
        credential_type=credential_data.credential_type,
        name=credential_data.name,
        description=credential_data.description,
        config=credential_data.config
    )
    
    db.add(credential)
    db.commit()
    db.refresh(credential)
    
    return credential


@router.put("/{credential_id}", response_model=CredentialResponse)
async def update_credential(
    credential_id: int,
    credential_data: CredentialUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新凭证（仅项目所有者）"""
    credential = db.query(Credential).filter(Credential.id == credential_id).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="凭证不存在或无权限访问"
        )
    
    # 检查项目权限，只有项目所有者可以更新凭证
    project = db.query(Project).filter(Project.id == credential.project_id).first()
    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有项目所有者可以更新凭证"
        )
    
    # 更新字段
    if credential_data.credential_type is not None:
        valid_types = ["mysql", "oss", "deepseek"]
        if credential_data.credential_type not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"无效的凭证类型，支持的类型: {', '.join(valid_types)}"
            )
        credential.credential_type = credential_data.credential_type
    if credential_data.name is not None:
        credential.name = credential_data.name
    if credential_data.description is not None:
        credential.description = credential_data.description
    if credential_data.config is not None:
        credential.config = credential_data.config
    
    db.commit()
    db.refresh(credential)
    
    return credential


@router.delete("/{credential_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除凭证（仅项目所有者）"""
    credential = db.query(Credential).filter(Credential.id == credential_id).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="凭证不存在或无权限访问"
        )
    
    # 检查项目权限，只有项目所有者可以删除凭证
    project = db.query(Project).filter(Project.id == credential.project_id).first()
    if not project or project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有项目所有者可以删除凭证"
        )
    
    db.delete(credential)
    db.commit()
    
    return None

