"""super usuario

Revision ID: a3f1d7c92b10
Revises: c4a7e19b52d3
Create Date: 2026-11-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a3f1d7c92b10'
down_revision: Union[str, Sequence[str], None] = 'c4a7e19b52d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

admin_action_type = postgresql.ENUM(
    'conta_suspensa', 'conta_reativada', 'conta_excluida', name='admin_action_type'
)
# O tipo já existe: sem create_type=False, o create_table tentaria criá-lo de novo.
user_role = postgresql.ENUM(
    'paciente', 'nutricionista', 'admin', name='user_role', create_type=False
)


def upgrade() -> None:
    """Upgrade schema.

    Nenhuma conta vira super usuário aqui: elas nascem só pelo comando
    `python -m app.create_superuser`.
    """
    # Permitido dentro de transação desde o Postgres 12, desde que o valor novo
    # não seja usado nela. Nada abaixo usa.
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin'")
    op.add_column('users', sa.Column('suspended_at', sa.DateTime(timezone=True), nullable=True))

    admin_action_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        'admin_actions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('actor_id', sa.Uuid(), nullable=True),
        sa.Column('target_id', sa.Uuid(), nullable=True),
        sa.Column(
            'action',
            postgresql.ENUM(name='admin_action_type', create_type=False),
            nullable=False,
        ),
        sa.Column('target_role', user_role, nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ['actor_id'], ['users.id'],
            name=op.f('fk_admin_actions_actor_id_users'), ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['target_id'], ['users.id'],
            name=op.f('fk_admin_actions_target_id_users'), ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_admin_actions')),
    )
    op.create_index(op.f('ix_admin_actions_created_at'), 'admin_actions', ['created_at'])
    op.create_index(op.f('ix_admin_actions_target_id'), 'admin_actions', ['target_id'])


def downgrade() -> None:
    """Downgrade schema.

    O Postgres não remove valor de ENUM: o tipo é refeito sem `admin`. As contas
    de super usuário são apagadas, porque o esquema antigo não sabe representá-las.
    """
    op.drop_index(op.f('ix_admin_actions_target_id'), table_name='admin_actions')
    op.drop_index(op.f('ix_admin_actions_created_at'), table_name='admin_actions')
    op.drop_table('admin_actions')
    admin_action_type.drop(op.get_bind(), checkfirst=True)
    op.drop_column('users', 'suspended_at')

    op.execute("DELETE FROM users WHERE role = 'admin'")
    op.drop_constraint(op.f('ck_users_nutricionista_com_crn'), 'users', type_='check')
    op.execute("ALTER TABLE users ALTER COLUMN role DROP DEFAULT")
    op.execute("ALTER TYPE user_role RENAME TO user_role_old")
    op.execute("CREATE TYPE user_role AS ENUM ('paciente', 'nutricionista')")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role")
    op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'paciente'")
    op.execute("DROP TYPE user_role_old")
    op.create_check_constraint(
        op.f('ck_users_nutricionista_com_crn'), 'users', "role <> 'nutricionista' OR crn IS NOT NULL"
    )
