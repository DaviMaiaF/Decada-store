"""Linha de comando: `python -m app.create_superuser --email voce@exemplo.com`.

A senha é pedida no terminal, sem eco, e nunca por argumento: argumento de comando
fica no histórico do shell e aparece na lista de processos.
"""

import argparse
import getpass
import sys

from app.core.database import SessionLocal
from app.services.superuser import SuperuserError, create_superuser


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria uma conta de super usuário da DÉCADA.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default=None, help="nome de quem vai usar a conta")
    args = parser.parse_args()

    password = getpass.getpass("Senha: ")
    if password != getpass.getpass("Repita a senha: "):
        print("As senhas não conferem. Nada foi criado.", file=sys.stderr)
        return 1

    with SessionLocal() as session:
        try:
            user = create_superuser(session, args.email, password, args.name)
        except SuperuserError as erro:
            print(f"Nada foi criado: {erro}.", file=sys.stderr)
            return 1
        print(f"Super usuário criado: {user.email}. Entre pelo painel em /admin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
