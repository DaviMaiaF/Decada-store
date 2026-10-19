"""Utilitários compartilhados pelos testes.

Ficam aqui, e não dentro de um arquivo de teste, para que nenhum módulo de
teste precise importar de outro — o que o ruff acusa e que faz um teste quebrar
por causa de uma mudança no vizinho.
"""

import copy

from app.models import User

# O mesmo gerador que produz o PDF de demonstração, para o teste exercitar
# exatamente o que a apresentação usa.
from app.seeds.demo_plan import build_pdf
from app.services.security import create_access_token

__all__ = [
    "build_pdf",
    "auth_headers",
    "importar_plano",
    "plano_confirmado",
    "plano_da_nutricionista",
    "PLANO_REALISTA",
]


def auth_headers(user: User) -> dict[str, str]:
    """Cabeçalho de autenticação do usuário.

    Desde a etapa 10 é um token de verdade. Foi só esta função que mudou quando
    o cabeçalho provisório `X-User-Id` saiu — os testes de rota continuaram
    iguais, do mesmo jeito que as rotas continuaram iguais.
    """
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


# Um PDF parecido com o que uma nutricionista entrega: cabeçalho, refeições,
# itens, uma orientação em prosa e o rodapé.
PLANO_REALISTA = [
    "Plano Alimentar Personalizado",
    "Dra. Camila Fernandes",
    "CRN-3 48291",
    "Café da Manhã:",
    "2 ovos de galinha",
    "200 ml de leite integral UHT",
    "07:30 - Lanche da manhã",
    "1 banana prata",
    "Almoço",
    "150 g de peito de frango sem pele",
    "100 g de arroz integral",
    "Beba pelo menos dois litros de água ao longo do dia e evite líquidos "
    "durante as refeições principais para não atrapalhar a digestão.",
    "Página 1 de 2",
]


def importar_plano(client, user: User, linhas: list[str] | None = None) -> dict:
    """Importa um plano pela API e devolve o corpo da resposta."""
    resposta = client.post(
        "/meal-plans",
        headers=auth_headers(user),
        files={"file": ("plano.pdf", build_pdf(linhas or PLANO_REALISTA), "application/pdf")},
        data={"consent_accepted": "true"},
    )
    assert resposta.status_code == 201, resposta.text
    return resposta.json()


def plano_confirmado(client, user: User, db_session, produto_nome="Peito de frango sem pele"):
    """Importa um plano de um item só e confirma o produto dele."""
    from sqlalchemy import select

    from app.models import Product

    plano = importar_plano(client, user, [f"1,2 kg de {produto_nome.lower()}"])
    item = plano["meal_plan"]["items"][0]
    produto = db_session.scalars(select(Product).where(Product.name == produto_nome)).one()

    client.post(
        f"/meal-plans/{plano['meal_plan']['id']}/items/{item['id']}/confirmation",
        headers=auth_headers(user),
        json={"product_id": str(produto.id)},
    )
    return plano["meal_plan"]["id"], produto


# Plano montado pela nutricionista no app: refeições com horário, medida
# caseira e uma substituição.
PLANO_DA_NUTRICIONISTA = {
    "title": "Plano de outubro",
    "patient_name": "Paciente Fictícia",
    "notes": "Beba dois litros de água por dia.",
    "meals": [
        {
            "name": "Café da manhã",
            "time": "08:30",
            "notes": "Evite açúcar no café.",
            "items": [
                {
                    "food": "Pão francês",
                    "household_measure": "1 unidade média",
                    "quantity": "50",
                    "unit": "g",
                },
                {"food": "Ovos de galinha", "quantity": "2", "unit": "unidade"},
            ],
            "substitutions": [
                [
                    {"food": "Tapioca", "household_measure": "2 colheres de sopa",
                     "quantity": "35", "unit": "g"},
                    {"food": "Banana prata", "quantity": "1", "unit": "unidade"},
                ]
            ],
        },
        {
            "name": "Almoço",
            "time": "12:30",
            "items": [
                {"food": "Arroz branco cozido", "household_measure": "6 colheres de sopa",
                 "quantity": "150", "unit": "g"},
                {"food": "Feijão cozido", "household_measure": "1 concha pequena",
                 "quantity": "50", "unit": "g"},
            ],
        },
    ],
}


def plano_da_nutricionista(**mudancas) -> dict:
    """Corpo de um plano montado no app, no formato do Dietbox. Dados inventados."""
    corpo = copy.deepcopy(PLANO_DA_NUTRICIONISTA)
    corpo.update(mudancas)
    return corpo
