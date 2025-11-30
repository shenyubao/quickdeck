"""add_project_name_description

Revision ID: f687a9e66d8b
Revises: 7e58d7f344f2
Create Date: 2025-11-30 09:26:45.568224

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f687a9e66d8b'
down_revision: Union[str, None] = '7e58d7f344f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 添加 name 和 description 字段
    op.add_column('projects', sa.Column('name', sa.String(), nullable=True, comment='项目名称'))
    op.add_column('projects', sa.Column('description', sa.Text(), nullable=True, comment='项目描述'))
    
    # 对于现有数据，将 project_id 的值复制到 name 字段
    op.execute("UPDATE projects SET name = project_id WHERE name IS NULL")
    
    # 将 name 字段设置为 NOT NULL
    op.alter_column('projects', 'name', nullable=False)


def downgrade() -> None:
    # 删除添加的字段
    op.drop_column('projects', 'description')
    op.drop_column('projects', 'name')

