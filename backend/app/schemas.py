from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Dict, Any


class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    nickname: Optional[str] = None


class UserCreate(UserBase):
    password: str


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
    option_type: str  # "text" or "file"
    name: str
    label: Optional[str] = None
    description: Optional[str] = None
    default_value: Optional[str] = None
    input_type: str = "plain_text"  # "plain_text", "date", "number"
    required: bool = False
    multi_valued: bool = False


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
    label: Optional[str] = None
    description: Optional[str] = None
    default_value: Optional[str] = None
    input_type: str
    required: bool
    multi_valued: bool
    
    class Config:
        from_attributes = True


# Workflow 相关 schemas
class WorkflowCreate(BaseModel):
    name: str
    timeout: Optional[int] = None  # 超时时间（分钟）
    retry: int = 0  # 重试次数
    node_type: str = "local"  # "local" or "remote"
    schedule_enabled: bool = False  # 是否定时任务
    schedule_crontab: Optional[str] = None  # 定时任务规则
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


class JobDetailResponse(JobBase):
    id: int
    owner_id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    workflow: Optional[WorkflowResponse] = None
    
    class Config:
        from_attributes = True


class JobRunRequest(BaseModel):
    """任务运行请求"""
    args: Optional[Dict[str, Any]] = None  # 用户输入参数


class JobRunResponse(BaseModel):
    """任务运行响应"""
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

