"""fix_step_type_enum_to_string_force

Revision ID: dc3dcab5901a
Revises: 7e618fbc0d4d
Create Date: 2025-12-16 23:57:08.118492

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dc3dcab5901a'
down_revision: Union[str, None] = '7e618fbc0d4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 强制将 step_type 列从枚举类型改为字符串类型
    # 这个迁移确保即使之前的迁移没有正确执行，也能修复问题
    
    # 1. 将 step_type 列从枚举类型改为字符串类型
    # 使用 USING 子句将枚举值转换为文本
    op.execute("ALTER TABLE steps ALTER COLUMN step_type TYPE VARCHAR USING step_type::text")
    
    # 2. 删除不再使用的枚举类型（如果存在）
    op.execute("DROP TYPE IF EXISTS steptypeenum")


def downgrade() -> None:
    # 重新创建枚举类型
    op.execute("CREATE TYPE steptypeenum AS ENUM ('command', 'shell_script', 'python_script')")
    
    # 将字符串列改回枚举类型
    op.execute("ALTER TABLE steps ALTER COLUMN step_type TYPE steptypeenum USING step_type::steptypeenum")

