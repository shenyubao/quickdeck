"""change_node_type_and_step_type_to_string

Revision ID: 01e1bb988d83
Revises: 4812a19947a8
Create Date: 2025-12-02 17:23:07.205953

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '01e1bb988d83'
down_revision: Union[str, None] = '4812a19947a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 先删除依赖于枚举类型的默认值
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type DROP DEFAULT")
    
    # 2. 将 node_type 列从枚举类型改为字符串类型
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type TYPE VARCHAR USING node_type::text")
    
    # 3. 重新设置默认值为字符串
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type SET DEFAULT 'local'")
    
    # 4. 将 step_type 列从枚举类型改为字符串类型
    op.execute("ALTER TABLE steps ALTER COLUMN step_type TYPE VARCHAR USING step_type::text")
    
    # 5. 删除不再使用的枚举类型（如果存在）
    op.execute("DROP TYPE IF EXISTS nodetypeenum")
    op.execute("DROP TYPE IF EXISTS steptypeenum")


def downgrade() -> None:
    # 1. 重新创建枚举类型
    op.execute("CREATE TYPE nodetypeenum AS ENUM ('local', 'remote')")
    op.execute("CREATE TYPE steptypeenum AS ENUM ('command', 'shell_script', 'python_script')")
    
    # 2. 删除字符串默认值
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type DROP DEFAULT")
    
    # 3. 将字符串列改回枚举类型
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type TYPE nodetypeenum USING node_type::nodetypeenum")
    op.execute("ALTER TABLE steps ALTER COLUMN step_type TYPE steptypeenum USING step_type::steptypeenum")
    
    # 4. 恢复枚举类型的默认值
    op.execute("ALTER TABLE workflows ALTER COLUMN node_type SET DEFAULT 'local'::nodetypeenum")

