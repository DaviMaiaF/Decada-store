"""despensa revisada no plano alimentar

Revision ID: 82e821fa2951
Revises: 54ea5109aa75
Create Date: 2026-10-28 16:42:17.039036

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '82e821fa2951'
down_revision: Union[str, Sequence[str], None] = '54ea5109aa75'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nulo de propósito: nos planos que já existem ninguém disse que concluiu a
    # despensa, e preencher agora inventaria uma resposta.
    op.add_column(
        'meal_plans', sa.Column('pantry_reviewed_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('meal_plans', 'pantry_reviewed_at')
