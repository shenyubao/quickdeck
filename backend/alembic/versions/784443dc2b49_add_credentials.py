"""add_credentials

添加凭证管理功能：创建凭证表，更新选项表支持凭证类型

Revision ID: 784443dc2b49
Revises: change_execution_enums_to_string
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '784443dc2b49'
down_revision: Union[str, None] = 'change_execution_enums_to_string'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 更新 optiontypeenum 枚举类型，添加 'credential'
    connection = op.get_bind()
    connection.execute(sa.text("ALTER TYPE optiontypeenum ADD VALUE IF NOT EXISTS 'credential'"))
    connection.execute(sa.text("COMMIT"))
    
    # 2. 在 options 表中添加 credential_type 字段
    op.add_column('options', sa.Column('credential_type', sa.String(), nullable=True, comment='凭证类型（当option_type为credential时使用）'))
    
    # 3. 创建 credentials 表
    op.create_table(
        'credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=False, comment='所属项目'),
        sa.Column('credential_type', sa.String(), nullable=False, comment='凭证类型（mysql/oss/deepseek）'),
        sa.Column('name', sa.String(), nullable=False, comment='凭证名称'),
        sa.Column('description', sa.Text(), nullable=True, comment='凭证描述'),
        sa.Column('config', sa.JSON(), nullable=False, comment='凭证配置信息（JSON格式）'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='凭证表'
    )
    op.create_index(op.f('ix_credentials_project_id'), 'credentials', ['project_id'], unique=False)


def downgrade() -> None:
    # 1. 删除 credentials 表
    op.drop_index(op.f('ix_credentials_project_id'), table_name='credentials')
    op.drop_table('credentials')
    
    # 2. 删除 options 表中的 credential_type 字段
    op.drop_column('options', 'credential_type')
    
    # 注意：无法直接删除枚举类型的值，所以 'credential' 会保留在 optiontypeenum 中
    # 但这不影响功能，因为代码中已经不再使用这个值

