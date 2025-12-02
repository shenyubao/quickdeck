"""update_option_model

合并参数类型和输入类型，移除多值属性，将label改为display_name

Revision ID: update_option_model
Revises: 67033bf17ade
Create Date: 2025-12-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'update_option_model'
down_revision: Union[str, None] = '67033bf17ade'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 更新 optiontypeenum 枚举类型，添加 'date' 和 'number'
    # 注意：PostgreSQL 要求新枚举值必须先提交才能使用
    # 使用连接对象并手动提交
    connection = op.get_bind()
    connection.execute(sa.text("ALTER TYPE optiontypeenum ADD VALUE IF NOT EXISTS 'date'"))
    connection.execute(sa.text("ALTER TYPE optiontypeenum ADD VALUE IF NOT EXISTS 'number'"))
    # 提交以让新枚举值可用
    connection.execute(sa.text("COMMIT"))
    
    # 2. 迁移数据：将 input_type 的值合并到 option_type
    # 如果 option_type 是 'text'，根据 input_type 更新为 'text', 'date', 或 'number'
    op.execute("""
        UPDATE options 
        SET option_type = CASE 
            WHEN option_type::text = 'text' AND input_type::text = 'date' THEN 'date'::optiontypeenum
            WHEN option_type::text = 'text' AND input_type::text = 'number' THEN 'number'::optiontypeenum
            ELSE option_type
        END
    """)
    
    # 3. 将 label 列重命名为 display_name
    op.alter_column('options', 'label', new_column_name='display_name', existing_type=sa.String(), existing_nullable=True)
    
    # 4. 删除 input_type 列
    op.drop_column('options', 'input_type')
    
    # 5. 删除 multi_valued 列
    op.drop_column('options', 'multi_valued')
    
    # 6. 删除不再使用的 inputtypeenum 枚举类型
    # 注意：需要先检查是否有其他表使用这个枚举类型
    op.execute("DROP TYPE IF EXISTS inputtypeenum")


def downgrade() -> None:
    # 1. 重新创建 inputtypeenum 枚举类型
    op.execute("CREATE TYPE inputtypeenum AS ENUM ('plain_text', 'date', 'number')")
    
    # 2. 重新添加 multi_valued 列
    op.add_column('options', sa.Column('multi_valued', sa.Boolean(), nullable=True, server_default=sa.text('false'), comment='是否多值'))
    
    # 3. 重新添加 input_type 列
    op.add_column('options', sa.Column('input_type', postgresql.ENUM('plain_text', 'date', 'number', name='inputtypeenum', create_type=False), nullable=True, server_default=sa.text("'plain_text'"), comment='输入类型'))
    
    # 4. 恢复数据：根据 option_type 设置 input_type
    op.execute("""
        UPDATE options 
        SET input_type = CASE 
            WHEN option_type::text = 'date' THEN 'date'::inputtypeenum
            WHEN option_type::text = 'number' THEN 'number'::inputtypeenum
            ELSE 'plain_text'::inputtypeenum
        END
    """)
    
    # 5. 将 option_type 恢复为 'text'（如果原来是 'date' 或 'number'）
    op.execute("""
        UPDATE options 
        SET option_type = 'text'::optiontypeenum
        WHERE option_type::text IN ('date', 'number')
    """)
    
    # 6. 将 display_name 列重命名为 label
    op.alter_column('options', 'display_name', new_column_name='label', existing_type=sa.String(), existing_nullable=True)
    
    # 注意：无法直接删除枚举类型的值，所以 'date' 和 'number' 会保留在 optiontypeenum 中
    # 但这不影响功能，因为代码中已经不再使用这些值

