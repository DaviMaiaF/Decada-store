"""Linha de comando do seed: `python -m app.seeds`."""

from app.core.database import SessionLocal
from app.seeds.runner import ensure_development_environment, run


def main() -> None:
    ensure_development_environment()

    with SessionLocal() as session:
        summary = run(session)

    print("Seed concluído.")
    print(f"  mercados ....... {summary.markets}")
    print(f"  produtos ....... {summary.products}")
    print(f"  preços ......... {summary.price_records}")
    print()
    print("ATENÇÃO: todos os dados carregados são FICTÍCIOS.")
    print("Mercados e produtos estão marcados com is_fictitious = true e")
    print("os preços têm origem 'seed'. Nenhum valor foi coletado de mercado real.")


if __name__ == "__main__":
    main()
