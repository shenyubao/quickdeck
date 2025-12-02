from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Credential, Project, User
from app.schemas import CredentialCreate, CredentialUpdate, CredentialResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/credentials", tags=["credentials"])
security = HTTPBearer()


@router.get("", response_model=List[CredentialResponse])
async def get_credentials(
    project_id: Optional[int] = Query(None, description="项目ID，可选"),
    credential_type: Optional[str] = Query(None, description="凭证类型，可选"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的凭证列表"""
    query = db.query(Credential).join(Project).filter(Project.owner_id == current_user.id)
    
    # 如果指定了项目ID，则过滤项目
    if project_id is not None:
        # 验证项目是否属于当前用户
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.owner_id == current_user.id
        ).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
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
    credential = db.query(Credential).join(Project).filter(
        Credential.id == credential_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
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
    """创建凭证"""
    # 验证项目是否存在且属于当前用户
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在或无权限访问"
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
    """更新凭证"""
    credential = db.query(Credential).join(Project).filter(
        Credential.id == credential_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="凭证不存在或无权限访问"
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
    """删除凭证"""
    credential = db.query(Credential).join(Project).filter(
        Credential.id == credential_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not credential:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="凭证不存在或无权限访问"
        )
    
    db.delete(credential)
    db.commit()
    
    return None

