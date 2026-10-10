"""crn da nutricionista no plano alimentar

Revision ID: ff0258316c62
Revises: 45f461c0d4c0
Create Date: 2026-10-10 14:12:35.118204

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ff0258316c62'
down_revision: Union[str, Sequence[str], None] = '45f461c0d4c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nulo de propósito: os planos já importados não têm CRN, e exigir o
    # registro agora inventaria um dado que ninguém informou.
    op.add_column('meal_plans', sa.Column('nutritionist_crn', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('meal_plans', 'nutritionist_crn')
