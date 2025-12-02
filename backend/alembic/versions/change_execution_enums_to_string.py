"""change_execution_enums_to_string

将执行记录的枚举类型改为字符串类型

Revision ID: change_execution_enums_to_string
Revises: add_job_executions
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'change_execution_enums_to_string'
down_revision: Union[str, None] = 'add_job_executions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 将枚举列改为字符串类型
    op.alter_column(
        'job_executions',
        'execution_type',
        type_=sa.String(),
        existing_type=postgresql.ENUM('manual', 'scheduled', name='executiontypeenum', create_type=False),
        existing_nullable=False,
        server_default=sa.text("'manual'")
    )
    
    op.alter_column(
        'job_executions',
        'status',
        type_=sa.String(),
        existing_type=postgresql.ENUM('success', 'failure', name='executionstatusenum', create_type=False),
        existing_nullable=False
    )
    
    # 2. 删除不再使用的枚举类型
    op.execute("DROP TYPE IF EXISTS executionstatusenum")
    op.execute("DROP TYPE IF EXISTS executiontypeenum")


def downgrade() -> None:
    # 1. 重新创建枚举类型
    op.execute("CREATE TYPE executiontypeenum AS ENUM ('manual', 'scheduled')")
    op.execute("CREATE TYPE executionstatusenum AS ENUM ('success', 'failure')")
    
    # 2. 将字符串列改回枚举类型
    op.alter_column(
        'job_executions',
        'execution_type',
        type_=postgresql.ENUM('manual', 'scheduled', name='executiontypeenum', create_type=False),
        existing_type=sa.String(),
        existing_nullable=False,
        server_default=sa.text("'manual'")
    )
    
    op.alter_column(
        'job_executions',
        'status',
        type_=postgresql.ENUM('success', 'failure', name='executionstatusenum', create_type=False),
        existing_type=sa.String(),
        existing_nullable=False
    )

