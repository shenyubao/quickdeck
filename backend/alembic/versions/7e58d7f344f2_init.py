"""init

Revision ID: 7e58d7f344f2
Revises: 
Create Date: 2025-11-30 08:12:58.748474

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7e58d7f344f2'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 创建枚举类型
    op.execute("CREATE TYPE optiontypeenum AS ENUM ('text', 'file')")
    op.execute("CREATE TYPE inputtypeenum AS ENUM ('plain_text', 'date', 'number')")
    op.execute("CREATE TYPE steptypeenum AS ENUM ('command', 'shell_script', 'python_script')")
    op.execute("CREATE TYPE nodetypeenum AS ENUM ('local', 'remote')")
    op.execute("CREATE TYPE notificationtriggerenum AS ENUM ('on_start', 'on_success', 'on_failure', 'on_retryable_fail', 'average_duration_exceeded')")
    op.execute("CREATE TYPE notificationtypeenum AS ENUM ('webhook', 'dingtalk_webhook')")
    
    # 创建 users 表
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('username', sa.String(), nullable=False, comment='用户名，用户唯一标识'),
        sa.Column('email', sa.String(), nullable=True, comment='邮箱（可选）'),
        sa.Column('nickname', sa.String(), nullable=True, comment='昵称'),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('is_admin', sa.Boolean(), nullable=True, server_default=sa.text('false'), comment='是否为管理员'),
        sa.PrimaryKeyConstraint('id'),
        comment='用户表'
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    
    # 创建 projects 表
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('project_id', sa.String(), nullable=False, comment='项目ID'),
        sa.Column('owner_id', sa.Integer(), nullable=False, comment='项目Owner'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        comment='项目表'
    )
    op.create_index(op.f('ix_projects_id'), 'projects', ['id'], unique=False)
    op.create_index(op.f('ix_projects_project_id'), 'projects', ['project_id'], unique=True)
    
    # 创建 jobs 表
    op.create_table(
        'jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('name', sa.String(), nullable=False, comment='工具名称'),
        sa.Column('path', sa.String(), nullable=False, comment='工具路径'),
        sa.Column('description', sa.Text(), nullable=True, comment='工具描述'),
        sa.Column('owner_id', sa.Integer(), nullable=False, comment='工具Owner'),
        sa.Column('project_id', sa.Integer(), nullable=False, comment='所属项目'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='工具表'
    )
    op.create_index(op.f('ix_jobs_id'), 'jobs', ['id'], unique=False)
    op.create_index(op.f('ix_jobs_name'), 'jobs', ['name'], unique=False)
    op.create_index(op.f('ix_jobs_path'), 'jobs', ['path'], unique=False)
    
    # 创建 job_visible_users 关联表
    op.create_table(
        'job_visible_users',
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('job_id', 'user_id')
    )
    
    # 创建 workflows 表
    op.create_table(
        'workflows',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('name', sa.String(), nullable=False, comment='工作流名称'),
        sa.Column('job_id', sa.Integer(), nullable=False, comment='所属工具'),
        sa.Column('timeout', sa.Integer(), nullable=True, comment='超时时间（秒）'),
        sa.Column('retry', sa.Integer(), nullable=True, server_default=sa.text('0'), comment='重试次数'),
        sa.Column('schedule_enabled', sa.Boolean(), nullable=True, server_default=sa.text('false'), comment='是否启用调度'),
        sa.Column('schedule_crontab', sa.String(), nullable=True, comment='Crontab表达式'),
        sa.Column('schedule_timezone', sa.String(), nullable=True, server_default=sa.text("'UTC'"), comment='时区'),
        sa.Column('node_type', postgresql.ENUM('local', 'remote', name='nodetypeenum', create_type=False), nullable=False, server_default=sa.text("'local'"), comment='节点类型'),
        sa.Column('node_filter_expression', sa.Text(), nullable=True, comment='节点过滤表达式'),
        sa.Column('node_exclude_expression', sa.Text(), nullable=True, comment='节点排除表达式'),
        sa.Column('notifications', sa.JSON(), nullable=True, comment='通知配置列表，每个配置包含 trigger, notification_type, extensions'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('job_id'),
        comment='工作流表'
    )
    op.create_index(op.f('ix_workflows_id'), 'workflows', ['id'], unique=False)
    
    # 创建 options 表
    op.create_table(
        'options',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('workflow_id', sa.Integer(), nullable=False, comment='所属工作流'),
        sa.Column('option_type', postgresql.ENUM('text', 'file', name='optiontypeenum', create_type=False), nullable=False, comment='选项类型(Text/File)'),
        sa.Column('name', sa.String(), nullable=False, comment='选项名称'),
        sa.Column('label', sa.String(), nullable=True, comment='选项标签'),
        sa.Column('description', sa.Text(), nullable=True, comment='选项描述'),
        sa.Column('default_value', sa.Text(), nullable=True, comment='默认值'),
        sa.Column('input_type', postgresql.ENUM('plain_text', 'date', 'number', name='inputtypeenum', create_type=False), nullable=True, server_default=sa.text("'plain_text'"), comment='输入类型'),
        sa.Column('required', sa.Boolean(), nullable=True, server_default=sa.text('false'), comment='是否必需'),
        sa.Column('multi_valued', sa.Boolean(), nullable=True, server_default=sa.text('false'), comment='是否多值'),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_options_id'), 'options', ['id'], unique=False)
    
    # 创建 steps 表
    op.create_table(
        'steps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('workflow_id', sa.Integer(), nullable=False, comment='所属工作流'),
        sa.Column('order', sa.Integer(), nullable=False, comment='步骤顺序'),
        sa.Column('step_type', postgresql.ENUM('command', 'shell_script', 'python_script', name='steptypeenum', create_type=False), nullable=False, comment='步骤类型'),
        sa.Column('extension', sa.JSON(), nullable=True, comment='扩展配置（每种类型有自己的定义）'),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_steps_id'), 'steps', ['id'], unique=False)


def downgrade() -> None:
    # 删除表（按依赖关系倒序删除）
    op.drop_index(op.f('ix_steps_id'), table_name='steps')
    op.drop_table('steps')
    
    op.drop_index(op.f('ix_options_id'), table_name='options')
    op.drop_table('options')
    
    op.drop_index(op.f('ix_workflows_id'), table_name='workflows')
    op.drop_table('workflows')
    
    op.drop_table('job_visible_users')
    
    op.drop_index(op.f('ix_jobs_path'), table_name='jobs')
    op.drop_index(op.f('ix_jobs_name'), table_name='jobs')
    op.drop_index(op.f('ix_jobs_id'), table_name='jobs')
    op.drop_table('jobs')
    
    op.drop_index(op.f('ix_projects_project_id'), table_name='projects')
    op.drop_index(op.f('ix_projects_id'), table_name='projects')
    op.drop_table('projects')
    
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
    
    # 删除枚举类型
    op.execute("DROP TYPE IF EXISTS notificationtypeenum")
    op.execute("DROP TYPE IF EXISTS notificationtriggerenum")
    op.execute("DROP TYPE IF EXISTS nodetypeenum")
    op.execute("DROP TYPE IF EXISTS steptypeenum")
    op.execute("DROP TYPE IF EXISTS inputtypeenum")
    op.execute("DROP TYPE IF EXISTS optiontypeenum")

