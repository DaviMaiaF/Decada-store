"""Utilitários compartilhados pelos testes.

Ficam aqui, e não dentro de um arquivo de teste, para que nenhum módulo de
teste precise importar de outro — o que o ruff acusa e que faz um teste quebrar
por causa de uma mudança no vizinho.
"""

from app.models import User
from app.services.security import create_access_token


def build_pdf(lines: list[str]) -> bytes:
    """Um PDF de uma página com as linhas dadas, em Helvetica.

    Montado byte a byte de propósito: o teste mostra exatamente o que está
    sendo lido, e o repositório não carrega binário nem uma dependência a mais
    só para gerar PDF.
    """

    def escape(text: str) -> str:
        return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    parts = ["BT", "/F1 12 Tf", "14 TL", "1 0 0 1 50 780 Tm"]
    for line in lines:
        parts.append(f"({escape(line)}) Tj")
        parts.append("T*")
    parts.append("ET")
    stream = "\n".join(parts).encode("cp1252")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for numero, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{numero} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)


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
