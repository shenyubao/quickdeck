from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime
import logging
import traceback
from app.database import get_db
from app.models import JobExecution, Job, User, ExecutionTypeEnum, ExecutionStatusEnum, job_visible_users
from app.schemas import JobExecutionResponse, JobExecutionDetailResponse
from app.routers.auth import get_current_user

logger = logging.getLogger("app.routers.executions")
logger.setLevel(logging.INFO)

# 确保日志输出到控制台
import sys
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(handler)
    logger.propagate = True  # 允许传播到根日志记录器

router = APIRouter(prefix="/api/executions", tags=["executions"])


@router.get("", response_model=List[JobExecutionDetailResponse])
async def get_executions(
    job_id: Optional[int] = Query(None, description="任务ID，可选"),
    status_filter: Optional[str] = Query(None, description="状态过滤：success 或 failure"),
    execution_type: Optional[str] = Query(None, description="执行方式过滤：manual 或 scheduled"),
    limit: int = Query(100, ge=1, le=1000, description="返回记录数限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取执行记录列表"""
    try:
        logger.info(f"获取执行记录列表 - 用户: {current_user.username}, job_id: {job_id}, status_filter: {status_filter}, execution_type: {execution_type}, limit: {limit}, offset: {offset}")
        
        query = db.query(JobExecution).options(
            joinedload(JobExecution.job),
            joinedload(JobExecution.user)
        )
        
        # 只返回当前用户有权限查看的任务的执行记录
        # 用户可以看到自己拥有的任务或可见的任务的执行记录
        # 使用子查询来查找可见的任务
        visible_job_ids_subq = db.query(job_visible_users.c.job_id).filter(
            job_visible_users.c.user_id == current_user.id
        )
        
        query = query.join(Job).filter(
            or_(
                Job.owner_id == current_user.id,
                Job.id.in_(visible_job_ids_subq)
            )
        )
        
        # 如果指定了任务ID，则过滤任务
        if job_id is not None:
            # 验证任务是否属于当前用户或可见
            visible_job_ids_subq = db.query(job_visible_users.c.job_id).filter(
                job_visible_users.c.user_id == current_user.id
            )
            
            job = db.query(Job).filter(
                Job.id == job_id,
                or_(
                    Job.owner_id == current_user.id,
                    Job.id.in_(visible_job_ids_subq)
                )
            ).first()
            if not job:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="任务不存在或无权限访问"
                )
            query = query.filter(JobExecution.job_id == job_id)
        
        # 状态过滤
        if status_filter:
            try:
                # 验证状态值是否有效
                ExecutionStatusEnum(status_filter)
                # 数据库字段是 String 类型，直接使用字符串值比较
                query = query.filter(JobExecution.status == status_filter)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"无效的状态值: {status_filter}，必须是 'success' 或 'failure'"
                )
        
        # 执行方式过滤
        if execution_type:
            try:
                # 验证执行方式值是否有效
                ExecutionTypeEnum(execution_type)
                # 数据库字段是 String 类型，直接使用字符串值比较
                query = query.filter(JobExecution.execution_type == execution_type)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"无效的执行方式值: {execution_type}，必须是 'manual' 或 'scheduled'"
                )
        
        # 按执行时间倒序排列
        query = query.order_by(JobExecution.executed_at.desc())
        
        # 分页
        executions = query.offset(offset).limit(limit).all()
        
        # 构建响应
        result = []
        for execution in executions:
            result.append({
                "id": execution.id,
                "job_id": execution.job_id,
                "user_id": execution.user_id,
                "execution_type": execution.execution_type,  # 数据库字段是 String，直接使用
                "status": execution.status,  # 数据库字段是 String，直接使用
                "args": execution.args,
                "output_text": execution.output_text,
                "error_message": execution.error_message,
                "executed_at": execution.executed_at,
                "created_at": execution.created_at,
                "updated_at": execution.updated_at,
                "job_name": execution.job.name if execution.job else None,
                "user_username": execution.user.username if execution.user else None,
                "user_nickname": execution.user.nickname if execution.user else None,
            })
        
        logger.info(f"成功获取 {len(result)} 条执行记录")
        return result
    except Exception as e:
        error_traceback = traceback.format_exc()
        error_msg = f"获取执行记录列表时发生错误: {str(e)}"
        logger.error(error_msg)
        logger.error(f"错误堆栈跟踪:\n{error_traceback}")
        # 同时使用 print 确保错误输出到控制台（用于调试）
        import sys
        print(f"ERROR: {error_msg}", file=sys.stderr, flush=True)
        print(f"ERROR: 错误堆栈跟踪:\n{error_traceback}", file=sys.stderr, flush=True)
        raise


@router.get("/{execution_id}", response_model=JobExecutionDetailResponse)
async def get_execution(
    execution_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取单个执行记录详情"""
    execution = db.query(JobExecution).options(
        joinedload(JobExecution.job),
        joinedload(JobExecution.user)
    ).filter(JobExecution.id == execution_id).first()
    
    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="执行记录不存在"
        )
    
    # 验证权限：用户必须拥有该任务或任务对用户可见
    job = execution.job
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="关联的任务不存在"
        )
    
    # 检查用户是否有权限
    has_permission = False
    if job.owner_id == current_user.id:
        has_permission = True
    else:
        # 检查任务是否对用户可见
        visible_count = db.query(job_visible_users).filter(
            job_visible_users.c.job_id == job.id,
            job_visible_users.c.user_id == current_user.id
        ).count()
        if visible_count > 0:
            has_permission = True
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权限访问此执行记录"
        )
    
    return {
        "id": execution.id,
        "job_id": execution.job_id,
        "user_id": execution.user_id,
        "execution_type": execution.execution_type,  # 数据库字段是 String，直接使用
        "status": execution.status,  # 数据库字段是 String，直接使用
        "args": execution.args,
        "output_text": execution.output_text,
        "error_message": execution.error_message,
        "executed_at": execution.executed_at,
        "created_at": execution.created_at,
        "updated_at": execution.updated_at,
        "job_name": execution.job.name if execution.job else None,
        "user_username": execution.user.username if execution.user else None,
        "user_nickname": execution.user.nickname if execution.user else None,
    }

