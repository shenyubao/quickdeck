"""add_json_schema_to_options

添加 json_schema 字段到 options 表

Revision ID: add_json_schema_to_options
Revises: update_option_model
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_json_schema_to_options'
down_revision: Union[str, None] = 'update_option_model'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 json_schema 列到 options 表
    op.add_column('options', sa.Column('json_schema', sa.Text(), nullable=True, comment='Json Schema描述（当option_type为json_schema时使用）'))


def downgrade() -> None:
    # 删除 json_schema 列
    op.drop_column('options', 'json_schema')

