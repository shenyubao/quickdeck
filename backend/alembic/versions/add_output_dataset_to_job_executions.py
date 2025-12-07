"""add_output_dataset_to_job_executions

添加 output_dataset 字段到 job_executions 表

Revision ID: add_output_dataset_to_job_executions
Revises: change_execution_enums_to_string
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'add_output_dataset'
down_revision: Union[str, None] = 'change_execution_enums_to_string'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 output_dataset 字段
    op.add_column(
        'job_executions',
        sa.Column(
            'output_dataset',
            postgresql.JSON(astext_type=sa.Text()),
            nullable=True,
            comment='返回的dataset数据详情（TOP10条）'
        )
    )


def downgrade() -> None:
    # 删除 output_dataset 字段
    op.drop_column('job_executions', 'output_dataset')

