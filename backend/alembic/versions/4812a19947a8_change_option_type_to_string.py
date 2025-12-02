"""change_option_type_to_string

将 option_type 从数据库枚举类型改为字符串类型

Revision ID: 4812a19947a8
Revises: fix_optiontypeenum_case
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '4812a19947a8'
down_revision: Union[str, None] = 'fix_optiontypeenum_case'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 将 option_type 列从枚举类型改为字符串类型
    # 先转换为文本类型
    op.execute("ALTER TABLE options ALTER COLUMN option_type TYPE VARCHAR USING option_type::text")
    
    # 2. 删除不再使用的枚举类型（如果存在）
    # 注意：只有在没有其他表使用这个枚举类型时才能删除
    op.execute("DROP TYPE IF EXISTS optiontypeenum")


def downgrade() -> None:
    # 恢复为枚举类型
    op.execute("CREATE TYPE optiontypeenum AS ENUM ('text', 'date', 'number', 'file', 'credential')")
    op.execute("ALTER TABLE options ALTER COLUMN option_type TYPE optiontypeenum USING option_type::optiontypeenum")

