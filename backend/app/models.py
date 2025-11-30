import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    ForeignKey,
    Text,
    JSON,
    Table,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class BaseModel(Base):
    """基础模型类"""
    __abstract__ = True
    
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# 枚举类型定义
class OptionTypeEnum(str, enum.Enum):
    """选项类型"""
    TEXT = "text"
    FILE = "file"


class InputTypeEnum(str, enum.Enum):
    """输入类型"""
    PLAIN_TEXT = "plain_text"
    DATE = "date"
    NUMBER = "number"


class StepTypeEnum(str, enum.Enum):
    """步骤类型"""
    COMMAND = "command"
    SHELL_SCRIPT = "shell_script"
    PYTHON_SCRIPT = "python_script"
    # 可以根据需要扩展更多类型


class NodeTypeEnum(str, enum.Enum):
    """节点类型"""
    LOCAL = "local"
    REMOTE = "remote"


class NotificationTriggerEnum(str, enum.Enum):
    """通知触发器类型"""
    ON_START = "on_start"
    ON_SUCCESS = "on_success"
    ON_FAILURE = "on_failure"
    ON_RETRYABLE_FAIL = "on_retryable_fail"
    AVERAGE_DURATION_EXCEEDED = "average_duration_exceeded"


class NotificationTypeEnum(str, enum.Enum):
    """通知类型"""
    WEBHOOK = "webhook"
    DINGTALK_WEBHOOK = "dingtalk_webhook"


# 用户模型
class User(BaseModel):
    __tablename__ = "users"
    
    username = Column(String, unique=True, index=True, nullable=False, comment="用户名，用户唯一标识")
    email = Column(String, unique=True, index=True, nullable=True, comment="邮箱（可选）")
    nickname = Column(String, comment="昵称")
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False, comment="是否为管理员")
    
    # 关系
    owned_projects = relationship("Project", back_populates="owner")
    owned_jobs = relationship("Job", back_populates="owner")
    visible_jobs = relationship("Job", secondary="job_visible_users", back_populates="visible_users")


# 项目模型
class Project(BaseModel):
    __tablename__ = "projects"
    
    project_id = Column(String, unique=True, index=True, nullable=False, comment="项目ID")
    name = Column(String, nullable=False, comment="项目名称")
    description = Column(Text, nullable=True, comment="项目描述")
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="项目Owner")
    
    # 关系
    owner = relationship("User", back_populates="owned_projects")
    jobs = relationship("Job", back_populates="project", cascade="all, delete-orphan")
    
    # 索引
    __table_args__ = (
        {"comment": "项目表"}
    )


# 任务可见用户关联表
job_visible_users = Table(
    "job_visible_users",
    Base.metadata,
    Column("job_id", Integer, ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


# 任务模型
class Job(BaseModel):
    __tablename__ = "jobs"
    
    name = Column(String, nullable=False, index=True, comment="任务名称")
    path = Column(String, nullable=False, index=True, comment="任务路径")
    description = Column(Text, comment="任务描述")
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="任务Owner")
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, comment="所属项目")
    
    # 关系
    owner = relationship("User", back_populates="owned_jobs")
    project = relationship("Project", back_populates="jobs")
    visible_users = relationship("User", secondary="job_visible_users", back_populates="visible_jobs")
    workflow = relationship("Workflow", back_populates="job", uselist=False, cascade="all, delete-orphan")
    
    # 索引
    __table_args__ = (
        {"comment": "任务表"}
    )


# 工作流模型
class Workflow(BaseModel):
    __tablename__ = "workflows"
    
    name = Column(String, nullable=False, comment="工作流名称")
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, unique=True, comment="所属任务")
    timeout = Column(Integer, comment="超时时间（秒）")
    retry = Column(Integer, default=0, comment="重试次数")
    
    # Schedule 属性（调度配置）
    schedule_enabled = Column(Boolean, default=False, comment="是否启用调度")
    schedule_crontab = Column(String, comment="Crontab表达式")
    schedule_timezone = Column(String, default="UTC", comment="时区")
    
    # NodeFilter 属性（节点过滤配置）
    node_type = Column(SQLEnum(NodeTypeEnum), nullable=False, default=NodeTypeEnum.LOCAL, comment="节点类型")
    node_filter_expression = Column(Text, comment="节点过滤表达式")
    node_exclude_expression = Column(Text, comment="节点排除表达式")
    
    # Notification 属性（通知配置，使用 JSON 存储多个通知配置）
    notifications = Column(JSON, comment="通知配置列表，每个配置包含 trigger, notification_type, extensions")
    
    # 关系
    job = relationship("Job", back_populates="workflow")
    options = relationship("Option", back_populates="workflow", cascade="all, delete-orphan", order_by="Option.id")
    steps = relationship("Step", back_populates="workflow", cascade="all, delete-orphan", order_by="Step.order")
    
    # 索引
    __table_args__ = (
        {"comment": "工作流表"}
    )


# 选项模型
class Option(BaseModel):
    __tablename__ = "options"
    
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, comment="所属工作流")
    option_type = Column(SQLEnum(OptionTypeEnum), nullable=False, comment="选项类型(Text/File)")
    name = Column(String, nullable=False, comment="选项名称")
    label = Column(String, comment="选项标签")
    description = Column(Text, comment="选项描述")
    default_value = Column(Text, comment="默认值")
    input_type = Column(SQLEnum(InputTypeEnum), default=InputTypeEnum.PLAIN_TEXT, comment="输入类型")
    required = Column(Boolean, default=False, comment="是否必需")
    multi_valued = Column(Boolean, default=False, comment="是否多值")
    
    # 关系
    workflow = relationship("Workflow", back_populates="options", foreign_keys=[workflow_id])


# 步骤模型
class Step(BaseModel):
    __tablename__ = "steps"
    
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, comment="所属工作流")
    order = Column(Integer, nullable=False, comment="步骤顺序")
    step_type = Column(SQLEnum(StepTypeEnum), nullable=False, comment="步骤类型")
    extension = Column(JSON, comment="扩展配置（每种类型有自己的定义）")
    
    # 关系
    workflow = relationship("Workflow", back_populates="steps", foreign_keys=[workflow_id])



