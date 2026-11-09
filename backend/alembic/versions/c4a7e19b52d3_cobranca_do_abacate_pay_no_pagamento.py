"""cobranca do Abacate Pay no pagamento

Revision ID: c4a7e19b52d3
Revises: 82e821fa2951
Create Date: 2026-11-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a7e19b52d3'
down_revision: Union[str, Sequence[str], None] = '82e821fa2951'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('payments', sa.Column('external_id', sa.String(length=64), nullable=True))
    op.add_column('payments', sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint(op.f('uq_payments_external_id'), 'payments', ['external_id'])
    op.create_check_constraint(
        op.f('ck_payments_cobranca_so_no_pix'),
        'payments',
        "method = 'pix' OR external_id IS NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f('ck_payments_cobranca_so_no_pix'), 'payments', type_='check')
    op.drop_constraint(op.f('uq_payments_external_id'), 'payments', type_='unique')
    op.drop_column('payments', 'expires_at')
    op.drop_column('payments', 'external_id')
