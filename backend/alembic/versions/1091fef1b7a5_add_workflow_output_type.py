"""add_workflow_output_type

Revision ID: 1091fef1b7a5
Revises: f687a9e66d8b
Create Date: 2025-11-30 22:55:53.091731

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1091fef1b7a5'
down_revision: Union[str, None] = 'f687a9e66d8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 创建枚举类型（如果不存在）
    op.execute("DO $$ BEGIN CREATE TYPE outputtypeenum AS ENUM ('text', 'table'); EXCEPTION WHEN duplicate_object THEN null; END $$;")
    
    # 添加 output_type 字段到 workflows 表（如果不存在）
    connection = op.get_bind()
    result = connection.execute(sa.text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='workflows' AND column_name='output_type'
    """))
    if result.fetchone() is None:
        op.add_column('workflows', sa.Column('output_type', postgresql.ENUM('text', 'table', name='outputtypeenum', create_type=False), nullable=True, server_default=sa.text("'text'"), comment='输出类型（text/table）'))
        
        # 对于现有数据，设置默认值为 text
        op.execute("UPDATE workflows SET output_type = 'text' WHERE output_type IS NULL")
        
        # 将 output_type 字段设置为 NOT NULL
        op.alter_column('workflows', 'output_type', nullable=False)


def downgrade() -> None:
    # 删除 output_type 字段
    op.drop_column('workflows', 'output_type')
    
    # 删除枚举类型
    op.execute("DROP TYPE IF EXISTS outputtypeenum")

