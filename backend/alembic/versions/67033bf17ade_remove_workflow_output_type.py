"""remove_workflow_output_type

Revision ID: 67033bf17ade
Revises: 1091fef1b7a5
Create Date: 2025-11-30 23:09:13.341400

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '67033bf17ade'
down_revision: Union[str, None] = '1091fef1b7a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 删除 output_type 字段
    op.drop_column('workflows', 'output_type')
    
    # 删除枚举类型
    op.execute("DROP TYPE IF EXISTS outputtypeenum")


def downgrade() -> None:
    # 重新创建枚举类型
    op.execute("CREATE TYPE outputtypeenum AS ENUM ('text', 'table')")
    
    # 重新添加 output_type 字段
    from sqlalchemy.dialects import postgresql
    op.add_column('workflows', sa.Column('output_type', postgresql.ENUM('text', 'table', name='outputtypeenum', create_type=False), nullable=True, server_default=sa.text("'text'"), comment='输出类型（text/table）'))
    
    # 设置默认值
    op.execute("UPDATE workflows SET output_type = 'text' WHERE output_type IS NULL")
    
    # 设置为 NOT NULL
    op.alter_column('workflows', 'output_type', nullable=False)

