"""tabela pantry_items

Revision ID: 340a72bb7130
Revises: e6f844d31c0c
Create Date: 2026-09-08 20:37:29.598753

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '340a72bb7130'
down_revision: Union[str, Sequence[str], None] = 'e6f844d31c0c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# O tipo measurement_unit já foi criado pela migração inicial, junto com
# plan_items. Sem create_type=False esta migração tentaria criá-lo de novo e
# falharia com "type measurement_unit already exists".
measurement_unit = postgresql.ENUM(
    'g', 'kg', 'ml', 'l', 'unidade', name='measurement_unit', create_type=False
)


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('pantry_items',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('raw_description', sa.Text(), nullable=False),
    sa.Column('normalized_description', sa.String(length=255), nullable=True),
    sa.Column('product_id', sa.Uuid(), nullable=True),
    sa.Column('quantity', sa.Numeric(precision=12, scale=3), nullable=True),
    sa.Column('unit', measurement_unit, nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], name=op.f('fk_pantry_items_product_id_products'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_pantry_items_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_pantry_items'))
    )
    op.create_index(op.f('ix_pantry_items_normalized_description'), 'pantry_items', ['normalized_description'], unique=False)
    op.create_index(op.f('ix_pantry_items_product_id'), 'pantry_items', ['product_id'], unique=False)
    op.create_index(op.f('ix_pantry_items_user_id'), 'pantry_items', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_pantry_items_user_id'), table_name='pantry_items')
    op.drop_index(op.f('ix_pantry_items_product_id'), table_name='pantry_items')
    op.drop_index(op.f('ix_pantry_items_normalized_description'), table_name='pantry_items')
    op.drop_table('pantry_items')
    # O tipo measurement_unit não é removido aqui: ele foi criado pela migração
    # inicial e continua em uso por plan_items, shopping_list_items e outras.
