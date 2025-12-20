"""merge_heads

Revision ID: f482bd2f67d8
Revises: add_json_schema_to_options, add_project_users_table
Create Date: 2025-12-16 23:45:08.730701

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f482bd2f67d8'
down_revision: Union[str, None] = ('add_json_schema_to_options', 'add_project_users_table')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

