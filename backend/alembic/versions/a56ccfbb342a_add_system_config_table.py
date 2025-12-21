"""add_system_config_table

Revision ID: a56ccfbb342a
Revises: f4a5d91fcd45
Create Date: 2025-12-21 08:56:42.162777

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a56ccfbb342a'
down_revision: Union[str, None] = 'f4a5d91fcd45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 创建系统配置表
    op.create_table(
        'system_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False, comment='配置名称（唯一标识）'),
        sa.Column('value', sa.Text(), nullable=True, comment='配置值'),
        sa.Column('description', sa.Text(), nullable=True, comment='配置描述'),
        sa.Column('default_value', sa.Text(), nullable=True, comment='默认值'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        comment='系统配置表'
    )
    op.create_index(op.f('ix_system_configs_id'), 'system_configs', ['id'], unique=False)
    op.create_index(op.f('ix_system_configs_name'), 'system_configs', ['name'], unique=True)
    
    # 插入初始系统配置
    op.execute("""
        INSERT INTO system_configs (name, value, description, default_value, created_at)
        VALUES ('site_name', 'QuickDeck', '网站名称', 'QuickDeck', now())
    """)


def downgrade() -> None:
    # 删除索引和表
    op.drop_index(op.f('ix_system_configs_name'), table_name='system_configs')
    op.drop_index(op.f('ix_system_configs_id'), table_name='system_configs')
    op.drop_table('system_configs')

