"""add_job_executions

添加工具执行记录表

Revision ID: add_job_executions
Revises: update_option_model
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'add_job_executions'
down_revision: Union[str, None] = 'update_option_model'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 创建枚举类型
    op.execute("CREATE TYPE executiontypeenum AS ENUM ('manual', 'scheduled')")
    op.execute("CREATE TYPE executionstatusenum AS ENUM ('success', 'failure')")
    
    # 2. 创建 job_executions 表
    op.create_table(
        'job_executions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('job_id', sa.Integer(), nullable=False, comment='所属工具'),
        sa.Column('user_id', sa.Integer(), nullable=False, comment='执行人'),
        sa.Column('execution_type', postgresql.ENUM('manual', 'scheduled', name='executiontypeenum', create_type=False), nullable=False, server_default=sa.text("'manual'"), comment='执行方式（手动/定时工具）'),
        sa.Column('status', postgresql.ENUM('success', 'failure', name='executionstatusenum', create_type=False), nullable=False, comment='执行状态（成功/失败）'),
        sa.Column('args', postgresql.JSON(astext_type=sa.Text()), nullable=True, comment='入参（JSON格式）'),
        sa.Column('output_text', sa.Text(), nullable=True, comment='返回的text'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='错误信息（如果失败）'),
        sa.Column('executed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False, comment='执行时间'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        comment='工具执行记录表'
    )
    
    # 3. 创建索引
    op.create_index(op.f('ix_job_executions_id'), 'job_executions', ['id'], unique=False)
    op.create_index(op.f('ix_job_executions_job_id'), 'job_executions', ['job_id'], unique=False)
    op.create_index(op.f('ix_job_executions_user_id'), 'job_executions', ['user_id'], unique=False)
    op.create_index(op.f('ix_job_executions_executed_at'), 'job_executions', ['executed_at'], unique=False)


def downgrade() -> None:
    # 1. 删除索引
    op.drop_index(op.f('ix_job_executions_executed_at'), table_name='job_executions')
    op.drop_index(op.f('ix_job_executions_user_id'), table_name='job_executions')
    op.drop_index(op.f('ix_job_executions_job_id'), table_name='job_executions')
    op.drop_index(op.f('ix_job_executions_id'), table_name='job_executions')
    
    # 2. 删除表
    op.drop_table('job_executions')
    
    # 3. 删除枚举类型
    op.execute("DROP TYPE IF EXISTS executionstatusenum")
    op.execute("DROP TYPE IF EXISTS executiontypeenum")

