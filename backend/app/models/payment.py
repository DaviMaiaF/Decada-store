"""Pagamento — **simulado** — de uma lista de compras.

Não existe gateway de verdade: o serviço `payment_gateway` imita o Mercado Pago
para fechar o fluxo de compra na demonstração. Nada é cobrado.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, pg_enum
from app.models.enums import PaymentMethod, PaymentStatus

if TYPE_CHECKING:
    from app.models.shopping_list import ShoppingList


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Tentativa de pagar uma lista de compras.

    Uma lista pode ter várias tentativas — o cartão recusado e o Pix que veio
    depois —, mas só uma aprovada: o índice parcial abaixo garante isso no
    banco, e não só na rota.

    **Dado de cartão não é guardado.** Número, validade e CVV passam pelo
    serviço e são descartados; ficam a bandeira e os quatro últimos dígitos,
    o bastante para a pessoa reconhecer o cartão (decisão 5, minimização).
    """

    __tablename__ = "payments"
    __table_args__ = (
        Index(
            "uq_payments_aprovado_por_lista",
            "shopping_list_id",
            unique=True,
            postgresql_where=text("status = 'aprovado'"),
        ),
        CheckConstraint("amount > 0", name="valor_positivo"),
        # Bandeira e final só fazem sentido em cartão; código Pix só em Pix.
        CheckConstraint(
            "method = 'cartao_credito' OR (card_brand IS NULL AND card_last_four IS NULL)",
            name="cartao_so_no_cartao",
        ),
        CheckConstraint("method = 'pix' OR pix_code IS NULL", name="pix_so_no_pix"),
    )

    shopping_list_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("shopping_lists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    method: Mapped[PaymentMethod] = mapped_column(
        pg_enum(PaymentMethod, "payment_method"), nullable=False
    )
    status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"),
        nullable=False,
        default=PaymentStatus.PENDENTE,
        server_default=PaymentStatus.PENDENTE.value,
    )
    # O total estimado da lista no momento do pagamento. Copiado, e não lido da
    # lista, pela mesma razão do preço congelado: o valor pago não pode mudar
    # depois que foi pago.
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Motivo legível do status, como o `status_detail` do Mercado Pago:
    # "aprovado", "recusado pelo emissor", "aguardando pagamento".
    status_detail: Mapped[str | None] = mapped_column(String(120))

    card_brand: Mapped[str | None] = mapped_column(String(20))
    card_last_four: Mapped[str | None] = mapped_column(String(4))
    # Copia-e-cola fictício; o QR da tela é desenhado a partir dele.
    pix_code: Mapped[str | None] = mapped_column(Text)

    # Quando foi aprovado. Nulo enquanto não foi.
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="payments")
