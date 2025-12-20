"""add_curl_step_type

Revision ID: f4a5d91fcd45
Revises: dc3dcab5901a
Create Date: 2025-12-20 18:40:38.995946

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a5d91fcd45'
down_revision: Union[str, None] = 'dc3dcab5901a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 由于 step_type 字段已经是 String 类型，而不是 Enum，
    # 所以不需要修改数据库结构，CURL 步骤类型可以直接使用
    pass


def downgrade() -> None:
    # 无需回滚操作
    pass

