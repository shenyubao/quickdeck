from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.database import get_db
from app.models import (
    Job, Project, User, Workflow, Option, Step,
    OptionTypeEnum, InputTypeEnum, StepTypeEnum, NodeTypeEnum
)
from app.schemas import JobCreate, JobUpdate, JobResponse, JobDetailResponse, JobRunRequest, JobRunResponse, ScriptTestRequest, ScriptTestResponse
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


@router.get("/{job_id}/detail", response_model=JobDetailResponse)
async def get_job_detail(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取任务详情（包含工作流信息）"""
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.owner_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在或无权限访问"
        )
    
    # 如果任务有工作流，需要加载关联数据
    workflow_data = None
    if job.workflow:
        workflow = job.workflow
        # 转换超时时间从秒到分钟（用于前端显示）
        timeout_minutes = None
        if workflow.timeout is not None:
            timeout_minutes = workflow.timeout // 60
        
        # 转换通知配置
        notifications_list = None
        if workflow.notifications:
            notifications_list = workflow.notifications
        
        workflow_data = {
            "id": workflow.id,
            "name": workflow.name,
            "timeout": timeout_minutes,
            "retry": workflow.retry,
            "node_type": workflow.node_type.value,
            "schedule_enabled": workflow.schedule_enabled,
            "schedule_crontab": workflow.schedule_crontab,
            "schedule_timezone": workflow.schedule_timezone,
            "notifications": notifications_list,
            "options": [
                {
                    "id": opt.id,
                    "option_type": opt.option_type.value,
                    "name": opt.name,
                    "label": opt.label,
                    "description": opt.description,
                    "default_value": opt.default_value,
                    "input_type": opt.input_type.value,
                    "required": opt.required,
                    "multi_valued": opt.multi_valued,
                }
                for opt in workflow.options
            ],
            "steps": [
                {
                    "id": step.id,
                    "order": step.order,
                    "step_type": step.step_type.value,
                    "extension": step.extension,
                }
                for step in workflow.steps
            ],
        }
    
    return {
        "id": job.id,
        "name": job.name,
        "path": job.path,
        "description": job.description,
        "owner_id": job.owner_id,
        "project_id": job.project_id,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "workflow": workflow_data,
    }


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    job_data: JobCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建任务（可选包含工作流）"""
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
    db.flush()  # 获取 job.id，但不提交事务
    
    # 如果提供了工作流配置，创建工作流
    if job_data.workflow:
        workflow_data = job_data.workflow
        
        # 转换超时时间从分钟到秒
        timeout_seconds = None
        if workflow_data.timeout is not None:
            timeout_seconds = workflow_data.timeout * 60
        
        # 转换通知配置为 JSON
        notifications_json = None
        if workflow_data.notifications:
            notifications_json = [
                {
                    "trigger": n.trigger,
                    "notification_type": n.notification_type,
                    "extensions": n.extensions
                }
                for n in workflow_data.notifications
            ]
        
        # 创建工作流
        workflow = Workflow(
            name=workflow_data.name,
            job_id=job.id,
            timeout=timeout_seconds,
            retry=workflow_data.retry,
            node_type=NodeTypeEnum(workflow_data.node_type),
            schedule_enabled=workflow_data.schedule_enabled,
            schedule_crontab=workflow_data.schedule_crontab,
            schedule_timezone=workflow_data.schedule_timezone,
            notifications=notifications_json
        )
        
        db.add(workflow)
        db.flush()  # 获取 workflow.id
        
        # 创建选项（参数）
        for option_data in workflow_data.options:
            option = Option(
                workflow_id=workflow.id,
                option_type=OptionTypeEnum(option_data.option_type),
                name=option_data.name,
                label=option_data.label,
                description=option_data.description,
                default_value=option_data.default_value,
                input_type=InputTypeEnum(option_data.input_type),
                required=option_data.required,
                multi_valued=option_data.multi_valued
            )
            db.add(option)
        
        # 创建步骤
        for step_data in workflow_data.steps:
            step = Step(
                workflow_id=workflow.id,
                order=step_data.order,
                step_type=StepTypeEnum(step_data.step_type),
                extension=step_data.extension
            )
            db.add(step)
    
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
    """更新任务（可选包含工作流）"""
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
    
    db.flush()  # 获取更新后的 job，但不提交事务
    
    # 如果提供了工作流配置，更新或创建工作流
    if job_data.workflow is not None:
        workflow_data = job_data.workflow
        
        # 转换超时时间从分钟到秒
        timeout_seconds = None
        if workflow_data.timeout is not None:
            timeout_seconds = workflow_data.timeout * 60
        
        # 转换通知配置为 JSON
        notifications_json = None
        if workflow_data.notifications:
            notifications_json = [
                {
                    "trigger": n.trigger,
                    "notification_type": n.notification_type,
                    "extensions": n.extensions
                }
                for n in workflow_data.notifications
            ]
        
        # 查找或创建工作流
        workflow = db.query(Workflow).filter(Workflow.job_id == job.id).first()
        
        if workflow:
            # 更新现有工作流
            workflow.name = workflow_data.name
            workflow.timeout = timeout_seconds
            workflow.retry = workflow_data.retry
            workflow.node_type = NodeTypeEnum(workflow_data.node_type)
            workflow.schedule_enabled = workflow_data.schedule_enabled
            workflow.schedule_crontab = workflow_data.schedule_crontab
            workflow.schedule_timezone = workflow_data.schedule_timezone
            workflow.notifications = notifications_json
            
            # 删除旧的选项和步骤
            db.query(Option).filter(Option.workflow_id == workflow.id).delete()
            db.query(Step).filter(Step.workflow_id == workflow.id).delete()
        else:
            # 创建新工作流
            workflow = Workflow(
                name=workflow_data.name,
                job_id=job.id,
                timeout=timeout_seconds,
                retry=workflow_data.retry,
                node_type=NodeTypeEnum(workflow_data.node_type),
                schedule_enabled=workflow_data.schedule_enabled,
                schedule_crontab=workflow_data.schedule_crontab,
                schedule_timezone=workflow_data.schedule_timezone,
                notifications=notifications_json
            )
            db.add(workflow)
        
        db.flush()  # 获取 workflow.id
        
        # 创建选项（参数）
        for option_data in workflow_data.options:
            option = Option(
                workflow_id=workflow.id,
                option_type=OptionTypeEnum(option_data.option_type),
                name=option_data.name,
                label=option_data.label,
                description=option_data.description,
                default_value=option_data.default_value,
                input_type=InputTypeEnum(option_data.input_type),
                required=option_data.required,
                multi_valued=option_data.multi_valued
            )
            db.add(option)
        
        # 创建步骤
        for step_data in workflow_data.steps:
            step = Step(
                workflow_id=workflow.id,
                order=step_data.order,
                step_type=StepTypeEnum(step_data.step_type),
                extension=step_data.extension
            )
            db.add(step)
    
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


@router.post("/{job_id}/run", response_model=JobRunResponse)
async def run_job(
    job_id: int,
    run_request: JobRunRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """运行任务"""
    from app.server.job_execute_service import JobExecuteService
    
    # 获取任务
    job = db.query(Job).filter(
        Job.id == job_id,
        Job.owner_id == current_user.id
    ).first()
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在或无权限访问"
        )
    
    # 获取工作流
    workflow = job.workflow
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="任务没有配置工作流"
        )
    
    # 调用服务执行任务
    return JobExecuteService.execute_job(
        job=job,
        workflow=workflow,
        args=run_request.args or {},
        user_id=current_user.id
    )


@router.post("/test-script", response_model=ScriptTestResponse)
async def test_script(
    test_request: ScriptTestRequest,
    current_user: User = Depends(get_current_user),
):
    """测试 Python 脚本"""
    from app.executors.python_script import PythonScriptExecutor
    
    try:
        # 创建执行器
        executor = PythonScriptExecutor()
        
        # 准备上下文和结果
        context = {
            "step_extension": {
                "script": test_request.script
            },
            "timeout": 300,  # 5分钟超时
        }
        
        result = {
            "text": "",
            "dataset": None,
        }
        
        # 执行脚本
        context, result = executor.execute(
            args=test_request.args or {},
            context=context,
            result=result
        )
        
        return ScriptTestResponse(
            output=result.get("text", ""),
            error=None
        )
    except Exception as e:
        return ScriptTestResponse(
            output="",
            error=str(e)
        )

