# NutriCart

Aplicativo mobile que recebe o plano alimentar de uma nutricionista, traduz os itens
prescritos em produtos reais de supermercado, calcula o custo estimado da compra
(preço médio por região, com data e origem do dado) e sugere receitas usando apenas
os ingredientes da lista.

Projeto acadêmico — Engenharia de Software, UCB.

> **Status:** etapa 1 concluída — esqueleto do backend, health check, banco em Docker
> e modelo de dados completo com migração Alembic. Seed do catálogo, motor de
> casamento, cálculo de preço, NFC-e e app mobile ainda não existem.

## Stack

| Camada | Tecnologia |
|---|---|
| Mobile | React Native + Expo (SDK 57), TypeScript |
| Backend | Python 3.10+, FastAPI, Pydantic v2 |
| ORM / migrações | SQLAlchemy 2.x + Alembic |
| Banco | PostgreSQL 16 |
| Testes | pytest (backend), Jest + React Native Testing Library (mobile) |
| Ambiente | Docker Compose para o banco |

## Pré-requisitos

- Python 3.10 ou superior
- Docker e Docker Compose
- Node.js 20+ (apenas a partir da etapa do app mobile)

## Instalação

```bash
git clone <url-do-repositorio>
cd Decada

cp .env.example .env          # ajuste as variáveis se necessário
docker compose up -d          # sobe o PostgreSQL 16

cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/alembic upgrade head   # cria as tabelas
```

## Banco de dados

As migrações ficam em `backend/alembic/versions/` e leem a URL de conexão do `.env`,
via `Settings` — o `alembic.ini` não guarda credenciais.

```bash
cd backend
.venv/bin/alembic upgrade head        # aplica todas as migrações
.venv/bin/alembic current             # mostra a revisão aplicada
.venv/bin/alembic downgrade base      # desfaz tudo (apaga os dados)
.venv/bin/alembic check               # acusa modelo fora de sincronia com as migrações
```

Depois de mudar um modelo, gere a revisão e **leia o arquivo gerado antes de aplicar**:

```bash
cd backend
.venv/bin/alembic revision --autogenerate -m "descricao da mudanca"
```

As dez tabelas do domínio são `users`, `meal_plans`, `plan_items`, `products`,
`markets`, `price_records`, `shopping_lists`, `shopping_list_items`, `recipes` e
`recipe_ingredients`. O diagrama ER entra em `docs/modelo-dados.md` na etapa 10.

## Execução

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload
```

- API: <http://localhost:8000>
- Documentação interativa (Swagger): <http://localhost:8000/docs>

Validando que está tudo de pé:

```bash
curl -i http://localhost:8000/health
```

Resposta esperada — `200 OK` com:

```json
{"status": "ok", "app": "nutricart", "env": "dev"}
```

Estado do banco:

```bash
docker compose ps
```

O serviço `db` deve aparecer como `running (healthy)`.

## Testes

```bash
cd backend
.venv/bin/pytest
```

Com relatório de cobertura:

```bash
cd backend
.venv/bin/pytest --cov=app --cov-report=term-missing
```

## Configuração

Todas as variáveis ficam no `.env` da raiz (veja `.env.example`). O backend as lê via
`pydantic-settings` em `backend/app/core/config.py`.

| Variável | Padrão | Descrição |
|---|---|---|
| `APP_ENV` | `dev` | Ambiente da aplicação |
| `POSTGRES_USER` | `nutricart` | Usuário do banco |
| `POSTGRES_PASSWORD` | `nutricart` | Senha do banco (só desenvolvimento) |
| `POSTGRES_DB` | `nutricart` | Nome do banco |
| `POSTGRES_HOST` | `localhost` | Host do banco visto pelo backend |
| `POSTGRES_PORT` | `5432` | Porta publicada pelo container |

Se a porta 5432 já estiver em uso, altere `POSTGRES_PORT` no `.env` e rode
`docker compose up -d` novamente.

## Estrutura

```
.
├── backend/
│   ├── app/
│   │   ├── core/          # configuração e sessão do banco
│   │   ├── models/        # modelos SQLAlchemy
│   │   └── main.py        # aplicação FastAPI
│   ├── alembic/           # migrações
│   ├── tests/
│   └── pyproject.toml
├── docs/
├── docker-compose.yml
└── CLAUDE.md              # contexto do projeto para o Claude Code
```

## Aviso sobre os dados de preço

Nenhum preço exibido pelo aplicativo é inventado. Dados fictícios existem apenas no
seed de desenvolvimento e são marcados como tal (origem `seed`). Todo preço é
apresentado com a data da coleta e a origem do registro.

## Privacidade

Plano alimentar é dado pessoal sensível de saúde (LGPD, art. 5º, II). O projeto exige
consentimento explícito, minimização de dados e exclusão sob demanda.
