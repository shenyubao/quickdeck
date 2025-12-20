"""fix_node_type_enum_to_string

Revision ID: 7e618fbc0d4d
Revises: f482bd2f67d8
Create Date: 2025-12-16 23:54:10.326669

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e618fbc0d4d'
down_revision: Union[str, None] = 'f482bd2f67d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 先删除依赖于枚举类型的默认值
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type DROP DEFAULT")
    
    # 2. 将 node_type 列从枚举类型改为字符串类型
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type TYPE VARCHAR USING node_type::text")
    
    # 3. 重新设置默认值为字符串
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type SET DEFAULT 'local'")
    
    # 4. 删除不再使用的枚举类型（如果存在）
    op.execute("DROP TYPE IF EXISTS nodetypeenum")


def downgrade() -> None:
    # 1. 重新创建枚举类型
    op.execute("CREATE TYPE nodetypeenum AS ENUM ('local', 'remote')")
    
    # 2. 删除字符串默认值
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type DROP DEFAULT")
    
    # 3. 将字符串列改回枚举类型
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type TYPE nodetypeenum USING node_type::nodetypeenum")
    
    # 4. 恢复枚举类型的默认值
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type SET DEFAULT 'local'::nodetypeenum")

