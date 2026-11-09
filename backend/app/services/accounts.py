"""Exclusão de conta (LGPD, exclusão sob demanda).

Serviço único para a pessoa que apaga a própria conta e para o super usuário: uma
regra de exclusão escrita em dois lugares acabaria esquecendo uma tabela em um deles.
"""

from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import MealPlan, PantryItem, Prescription, PriceRecord, ShoppingList, User
from app.schemas.auth import DeletionReceiptOut


def delete_account(session: Session, user: User) -> DeletionReceiptOut:
    """Apaga a conta e todos os dados pessoais dela e devolve o comprovante.

    Vão embora: a conta, os planos alimentares com seus itens, a despensa, as
    listas de compras e, da nutricionista, os planos que ela montou — por
    cascata declarada no modelo. O plano que um paciente já aceitou fica com
    ele: é uma cópia, e é dado dele.

    Ficam: os registros de preço que a pessoa contribuiu, com `user_id` nulo.
    Preço coletado de nota fiscal é informação sobre o mercado, não sobre quem
    passou no caixa; anonimizado, ele deixa de ser dado pessoal e continua
    servindo a média da região.

    Não dá `commit`: quem chama decide o que mais entra na mesma transação, como o
    registro no histórico do super usuário.
    """

    def count(query) -> int:
        return session.scalar(query) or 0

    receipt = DeletionReceiptOut(
        deleted_at=datetime.now(timezone.utc),
        meal_plans_deleted=count(
            select(func.count()).select_from(MealPlan).where(MealPlan.user_id == user.id)
        ),
        pantry_items_deleted=count(
            select(func.count()).select_from(PantryItem).where(PantryItem.user_id == user.id)
        ),
        shopping_lists_deleted=count(
            select(func.count())
            .select_from(ShoppingList)
            .join(MealPlan)
            .where(MealPlan.user_id == user.id)
        ),
        prescriptions_deleted=count(
            select(func.count())
            .select_from(Prescription)
            .where(Prescription.author_id == user.id)
        ),
        price_records_anonymized=count(
            select(func.count()).select_from(PriceRecord).where(PriceRecord.user_id == user.id)
        ),
    )

    # Feito à mão, e não pelo ON DELETE SET NULL, para que o desvínculo aconteça
    # antes de a linha sumir e possa ser contado no comprovante.
    session.execute(
        update(PriceRecord).where(PriceRecord.user_id == user.id).values(user_id=None)
    )
    session.delete(user)
    return receipt
