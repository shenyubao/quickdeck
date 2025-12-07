"""merge_output_dataset_and_node_step_type

Revision ID: 2c8bc1521fc8
Revises: 01e1bb988d83, add_output_dataset_to_job_executions
Create Date: 2025-12-07 22:37:46.997937

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c8bc1521fc8'
down_revision: Union[str, None] = ('01e1bb988d83', 'add_output_dataset')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

