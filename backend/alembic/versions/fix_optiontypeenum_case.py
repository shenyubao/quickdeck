"""fix_optiontypeenum_case

修复 optiontypeenum 枚举类型的大小写不一致问题

Revision ID: fix_optiontypeenum_case
Revises: 784443dc2b49
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'fix_optiontypeenum_case'
down_revision: Union[str, None] = '784443dc2b49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 创建新的枚举类型（统一为小写）
    op.execute("CREATE TYPE optiontypeenum_new AS ENUM ('text', 'date', 'number', 'file', 'credential')")
    
    # 2. 添加临时列使用新枚举类型
    op.add_column('options', sa.Column('option_type_new', sa.Enum('text', 'date', 'number', 'file', 'credential', name='optiontypeenum_new'), nullable=True))
    
    # 3. 迁移数据：将旧枚举值转换为新枚举值（统一为小写）
    op.execute("""
        UPDATE options 
        SET option_type_new = CASE 
            WHEN option_type::text = 'TEXT' THEN 'text'::optiontypeenum_new
            WHEN option_type::text = 'FILE' THEN 'file'::optiontypeenum_new
            WHEN option_type::text = 'date' THEN 'date'::optiontypeenum_new
            WHEN option_type::text = 'number' THEN 'number'::optiontypeenum_new
            WHEN option_type::text = 'credential' THEN 'credential'::optiontypeenum_new
            ELSE NULL
        END
    """)
    
    # 4. 删除旧列
    op.drop_column('options', 'option_type')
    
    # 5. 重命名新列为原列名
    op.alter_column('options', 'option_type_new', new_column_name='option_type', existing_type=sa.Enum('text', 'date', 'number', 'file', 'credential', name='optiontypeenum_new'), existing_nullable=False)
    
    # 6. 删除旧枚举类型并重命名新类型
    op.execute("DROP TYPE optiontypeenum")
    op.execute("ALTER TYPE optiontypeenum_new RENAME TO optiontypeenum")


def downgrade() -> None:
    # 恢复为混合大小写的枚举类型
    op.execute("CREATE TYPE optiontypeenum_old AS ENUM ('TEXT', 'FILE', 'date', 'number', 'credential')")
    op.execute("ALTER TABLE options ALTER COLUMN option_type TYPE optiontypeenum_old USING option_type::text::optiontypeenum_old")
    op.execute("DROP TYPE optiontypeenum")
    op.execute("ALTER TYPE optiontypeenum_old RENAME TO optiontypeenum")

