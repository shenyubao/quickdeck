"""add_project_users_table

添加项目-用户关联表

Revision ID: add_project_users_table
Revises: 2c8bc1521fc8
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_project_users_table'
down_revision: Union[str, None] = '2c8bc1521fc8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 创建项目-用户关联表
    op.create_table(
        'project_users',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'user_id'),
        comment='项目-用户关联表'
    )
    op.create_index(op.f('ix_project_users_project_id'), 'project_users', ['project_id'], unique=False)
    op.create_index(op.f('ix_project_users_user_id'), 'project_users', ['user_id'], unique=False)


def downgrade() -> None:
    # 删除项目-用户关联表
    op.drop_index(op.f('ix_project_users_user_id'), table_name='project_users')
    op.drop_index(op.f('ix_project_users_project_id'), table_name='project_users')
    op.drop_table('project_users')

