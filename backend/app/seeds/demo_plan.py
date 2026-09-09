"""Plano alimentar fictício para demonstração.

Gera um PDF com um item por linha, que é o formato que o import lê bem. Planos
reais costumam quebrar o item em duas linhas e ter parágrafos longos de
substituição, e para esses o filtro de ruído ainda precisa evoluir — ver a
seção de divergências em `docs/design/telas.md`.

**É dado fictício.** A nutricionista, a paciente e o plano são inventados; os
itens apontam para produtos do catálogo de desenvolvimento.

Uso:
    .venv/bin/python -m app.seeds.demo_plan
"""

import pathlib

# Cabeçalho e nomes de refeição entram de propósito: são o ruído que o import
# precisa descartar, e vê-lo funcionando faz parte da demonstração.
DEMO_PLAN_LINES: tuple[str, ...] = (
    "Plano Alimentar",
    "Dra. Helena Marques",
    "CRN-1 12345",
    "08:00 - Café da manhã",
    "2 ovos de galinha",
    "200 ml de leite integral UHT",
    "50 g de aveia em flocos",
    "150 g de banana prata",
    "10:30 - Lanche da manhã",
    "170 g de iogurte natural integral",
    "30 g de castanha-do-pará",
    "12:30 - Almoço",
    "150 g de peito de frango sem pele",
    "100 g de arroz integral",
    "80 g de feijão carioca",
    "120 g de cenoura",
    "16:00 - Lanche da tarde",
    "200 g de mamão papaia",
    "100 g de queijo minas frescal",
    "20:00 - Jantar",
    "150 g de filé de tilápia",
    "200 g de batata doce",
    "100 g de abobrinha italiana",
    "Beba pelo menos dois litros de água ao longo do dia e evite líquidos durante as "
    "refeições principais para não atrapalhar a digestão dos alimentos.",
    "Página 1 de 1",
)


def build_pdf(lines: tuple[str, ...] | list[str]) -> bytes:
    """Um PDF de uma página com as linhas dadas, em Helvetica.

    Montado byte a byte para não depender de biblioteca de geração de PDF, que
    o projeto não precisa para mais nada.
    """

    def escape(text: str) -> str:
        return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    parts = ["BT", "/F1 12 Tf", "16 TL", "1 0 0 1 50 780 Tm"]
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


DESTINO = pathlib.Path(__file__).resolve().parents[3] / "docs" / "demo" / "plano-exemplo.pdf"


def main() -> None:
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_bytes(build_pdf(DEMO_PLAN_LINES))
    print(f"PDF de demonstração gerado em {DESTINO}")
    print("Todos os dados são FICTÍCIOS.")


if __name__ == "__main__":
    main()
