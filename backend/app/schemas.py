from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Dict, Any


class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    nickname: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    nickname: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


# Project 相关 schemas
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    project_id: Optional[str] = None  # 可选，如果不提供则自动生成


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(ProjectBase):
    id: int
    project_id: str
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Job 相关 schemas
class JobBase(BaseModel):
    name: str
    path: str
    description: Optional[str] = None


# Option 相关 schemas
class OptionCreate(BaseModel):
    option_type: str  # "text", "date", "number", "file", "credential"
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    default_value: Optional[str] = None
    required: bool = False
    credential_type: Optional[str] = None  # 凭证类型（当option_type为credential时使用）


# Step 相关 schemas
class StepCreate(BaseModel):
    order: int
    step_type: str  # "command", "shell_script", "python_script"
    extension: Dict[str, Any]  # 扩展配置


class StepResponse(BaseModel):
    id: int
    order: int
    step_type: str
    extension: Dict[str, Any]
    
    class Config:
        from_attributes = True


# Notification 相关 schemas
class NotificationCreate(BaseModel):
    trigger: str  # "on_start", "on_success", "on_failure", etc.
    notification_type: str  # "webhook", "dingtalk_webhook"
    extensions: Dict[str, Any]  # 通知扩展配置


class NotificationResponse(BaseModel):
    trigger: str
    notification_type: str
    extensions: Dict[str, Any]


# Option 相关 schemas (Response)
class OptionResponse(BaseModel):
    id: int
    option_type: str
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    default_value: Optional[str] = None
    required: bool
    credential_type: Optional[str] = None  # 凭证类型（当option_type为credential时使用）
    
    class Config:
        from_attributes = True


# Workflow 相关 schemas
class WorkflowCreate(BaseModel):
    name: str
    timeout: Optional[int] = None  # 超时时间（分钟）
    retry: int = 0  # 重试次数
    node_type: str = "local"  # "local" or "remote"
    schedule_enabled: bool = False  # 是否定时工具
    schedule_crontab: Optional[str] = None  # 定时工具规则
    schedule_timezone: str = "UTC"  # 时区
    options: List[OptionCreate] = []  # 参数列表
    steps: List[StepCreate] = []  # 步骤列表
    notifications: List[NotificationCreate] = []  # 通知规则列表


class WorkflowResponse(BaseModel):
    id: int
    name: str
    timeout: Optional[int] = None  # 超时时间（秒）
    retry: int = 0
    node_type: str
    schedule_enabled: bool
    schedule_crontab: Optional[str] = None
    schedule_timezone: str
    notifications: Optional[List[Dict[str, Any]]] = None
    options: List[OptionResponse] = []
    steps: List[StepResponse] = []
    
    class Config:
        from_attributes = True


class JobCreate(JobBase):
    project_id: int
    workflow: Optional[WorkflowCreate] = None  # 可选的工作流配置


class JobUpdate(BaseModel):
    name: Optional[str] = None
    path: Optional[str] = None
    description: Optional[str] = None
    workflow: Optional[WorkflowCreate] = None  # 可选的工作流配置


class JobResponse(JobBase):
    id: int
    owner_id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class OwnerInfo(BaseModel):
    """负责人信息"""
    id: int
    username: str
    nickname: Optional[str] = None


class JobDetailResponse(JobBase):
    id: int
    owner_id: int
    owner: Optional[OwnerInfo] = None
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    workflow: Optional[WorkflowResponse] = None
    
    class Config:
        from_attributes = True


class JobRunRequest(BaseModel):
    """工具运行请求"""
    args: Optional[Dict[str, Any]] = None  # 用户输入参数


class JobRunResponse(BaseModel):
    """工具运行响应"""
    output: str  # HTML 输出
    result: Dict[str, Any]  # 执行结果
    error: Optional[str] = None  # 错误信息（如果有）


class ScriptTestRequest(BaseModel):
    """脚本测试请求"""
    script: str  # Python 脚本内容
    args: Optional[Dict[str, Any]] = None  # 测试参数


class ScriptTestResponse(BaseModel):
    """脚本测试响应"""
    output: str  # 输出文本
    error: Optional[str] = None  # 错误信息（如果有）


# 执行记录相关 schemas
class JobExecutionResponse(BaseModel):
    """执行记录响应"""
    id: int
    job_id: int
    user_id: int
    execution_type: str  # "manual" or "scheduled"
    status: str  # "success" or "failure"
    args: Optional[Dict[str, Any]] = None  # 入参
    output_text: Optional[str] = None  # 返回的text
    error_message: Optional[str] = None  # 错误信息
    executed_at: datetime  # 执行时间
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class JobExecutionDetailResponse(JobExecutionResponse):
    """执行记录详情响应（包含关联信息）"""
    job_name: Optional[str] = None  # 工具名称
    user_username: Optional[str] = None  # 执行人用户名
    user_nickname: Optional[str] = None  # 执行人昵称


# 凭证相关 schemas
class CredentialBase(BaseModel):
    credential_type: str  # "mysql", "oss", "deepseek"
    name: str
    description: Optional[str] = None
    config: Dict[str, Any]  # 凭证配置信息


class CredentialCreate(CredentialBase):
    pass


class CredentialUpdate(BaseModel):
    credential_type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class CredentialResponse(CredentialBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

