from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models import Job, Project, User
from app.schemas import JobCreate, JobUpdate, JobResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
security = HTTPBearer()


@router.get("", response_model=List[JobResponse])
async def get_jobs(
    project_id: Optional[int] = Query(None, description="项目ID，可选"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户的任务列表"""
    query = db.query(Job).filter(Job.owner_id == current_user.id)
    
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
        query = query.filter(Job.project_id == project_id)
    
    jobs = query.order_by(Job.path, Job.name).all()
    return jobs


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取单个任务"""
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.owner_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在或无权限访问"
        )
    
    return job


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    job_data: JobCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建任务"""
    # 验证项目是否存在且属于当前用户
    project = db.query(Project).filter(
        Project.id == job_data.project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在或无权限访问"
        )
    
    # 创建任务
    job = Job(
        name=job_data.name,
        path=job_data.path,
        description=job_data.description,
        owner_id=current_user.id,
        project_id=job_data.project_id
    )
    
    db.add(job)
    db.commit()
    db.refresh(job)
    
    return job


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: int,
    job_data: JobUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新任务"""
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.owner_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在或无权限访问"
        )
    
    # 更新字段
    if job_data.name is not None:
        job.name = job_data.name
    if job_data.path is not None:
        job.path = job_data.path
    if job_data.description is not None:
        job.description = job_data.description
    
    db.commit()
    db.refresh(job)
    
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除任务"""
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.owner_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在或无权限访问"
        )
    
    db.delete(job)
    db.commit()
    
    return None

