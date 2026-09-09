"""Linha de comando do seed: `python -m app.seeds`."""

from app.core.database import SessionLocal
from app.seeds.runner import (
    DEV_USER_EMAIL,
    DEV_USER_PASSWORD,
    ensure_development_environment,
    run,
)


def main() -> None:
    ensure_development_environment()

    with SessionLocal() as session:
        summary = run(session)

    print("Seed concluído.")
    print(f"  mercados ....... {summary.markets}")
    print(f"  produtos ....... {summary.products}")
    print(f"  preços ......... {summary.price_records}")
    print(f"  receitas ....... {summary.recipes}")
    print()
    print("Conta de desenvolvimento para entrar no app:")
    print(f"  e-mail ......... {DEV_USER_EMAIL}")
    print(f"  senha .......... {DEV_USER_PASSWORD}")
    print()
    print("ATENÇÃO: todos os dados carregados são FICTÍCIOS.")
    print("Mercados, produtos e receitas estão marcados com is_fictitious = true e")
    print("os preços têm origem 'seed'. Nenhum valor foi coletado de mercado real.")


if __name__ == "__main__":
    main()
