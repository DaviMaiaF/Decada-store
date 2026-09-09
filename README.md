# DÉCADA

Aplicativo mobile que recebe o plano alimentar de uma nutricionista, traduz os itens
prescritos em produtos reais de supermercado, calcula o custo estimado da compra
(preço médio por região, com data e origem do dado) e sugere receitas usando apenas
os ingredientes da lista.

Projeto acadêmico — Engenharia de Software, UCB.

> **Status:** etapa 9 concluída pela metade — o backend está completo e exposto por
> uma API REST de 11 rotas: import do plano por PDF, casamento item–produto, cálculo
> de preço por região, despensa, lista de compras já descontada e precificada e
> sugestão de receitas. **Falta a segunda metade da etapa 9, o app mobile**, e falta
> a autenticação (etapa 10) — até lá as rotas identificam o usuário por um cabeçalho
> provisório. NFC-e continua fora.

## Design

Os protótipos das telas, o sistema de design e o contrato que cada tela exige do
backend estão em [`docs/design/`](docs/design/). O aplicativo tem quatro abas —
Dieta, Mercado, Despensa e Economia.

## Próximas etapas

| Etapa | O que é |
|---|---|
| 9 | App mobile em React Native (as rotas da API já existem) |
| 10 | Autenticação, LGPD (consentimento e exclusão) e documentação final |

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

## Dados de desenvolvimento

```bash
cd backend
.venv/bin/python -m app.seeds
```

Carrega 3 mercados no DF, 120 produtos, 1.080 registros de preço e 10 receitas.
É idempotente:
rodar de novo atualiza as mesmas linhas em vez de duplicá-las.

**Todos esses dados são fictícios.** Mercados, produtos e receitas ficam com
`is_fictitious = true`, os preços têm origem `seed` e as marcas são inventadas.
O script se recusa a rodar se `APP_ENV` não for `dev`.

As onze tabelas do domínio são `users`, `meal_plans`, `plan_items`, `products`,
`markets`, `price_records`, `shopping_lists`, `shopping_list_items`, `recipes`,
`recipe_ingredients` e `pantry_items`. O diagrama ER entra em `docs/modelo-dados.md`
na etapa 10.

## Execução

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload
```

- API: <http://localhost:8000>
- Documentação interativa (Swagger): <http://localhost:8000/docs>

### Autenticação provisória

Enquanto a etapa 10 não chega, as rotas de domínio identificam o usuário pelo
cabeçalho `X-User-Id`, com o UUID de uma linha da tabela `users`. Sem ele a resposta
é `401`. Quando a autenticação existir, só o corpo de `get_current_user` muda — as
rotas continuam iguais.

```bash
curl -H "X-User-Id: <uuid-do-usuario>" http://localhost:8000/pantry
```

### Rotas

| Método | Caminho | O que faz |
|---|---|---|
| `POST` | `/meal-plans` | Importa o plano do PDF (multipart: `file` + `consent_accepted`) |
| `GET` | `/meal-plans/{id}` | Plano com seus itens |
| `GET` | `/meal-plans/{id}/items/{item_id}/candidates` | Produtos candidatos para o item |
| `POST` | `/meal-plans/{id}/items/{item_id}/confirmation` | Confirma o produto escolhido |
| `POST` | `/meal-plans/{id}/shopping-lists` | Gera a lista de compras para uma região |
| `GET` | `/shopping-lists/{id}` | Lista com preço, data e origem de cada item |
| `GET` `POST` | `/pantry` | Lê e adiciona itens da despensa |
| `DELETE` | `/pantry/{id}` | Remove item da despensa |
| `GET` | `/pantry/{id}/candidates` | Produtos parecidos com o item digitado |
| `GET` | `/recipes/suggestions` | Receitas ordenadas por disponibilidade |

Valores decimais viajam como **string** no JSON (`"12.90"`), não como número: é o que
preserva a precisão de dinheiro no cliente.

Validando que está tudo de pé:

```bash
curl -i http://localhost:8000/health
```

Resposta esperada — `200 OK` com:

```json
{"status": "ok", "app": "decada", "env": "dev"}
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

Parte dos testes usa um banco de testes (`decada_test`), criado automaticamente
no mesmo container. Sem Docker no ar, rode apenas os que não dependem do banco:

```bash
cd backend
.venv/bin/pytest -m "not db"
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
| `CONSENT_VERSION` | `v1` | Versão vigente do termo de consentimento (LGPD) |
| `POSTGRES_USER` | `decada` | Usuário do banco |
| `POSTGRES_PASSWORD` | `decada` | Senha do banco (só desenvolvimento) |
| `POSTGRES_DB` | `decada` | Nome do banco |
| `POSTGRES_HOST` | `localhost` | Host do banco visto pelo backend |
| `POSTGRES_PORT` | `5432` | Porta publicada pelo container |

Se a porta 5432 já estiver em uso, altere `POSTGRES_PORT` no `.env` e rode
`docker compose up -d` novamente.

## Estrutura

```
.
├── backend/
│   ├── app/
│   │   ├── api/           # rotas HTTP, dependências e tratamento de erro
│   │   ├── core/          # configuração e sessão do banco
│   │   ├── models/        # modelos SQLAlchemy
│   │   ├── schemas/       # contrato de entrada e saída (Pydantic)
│   │   ├── seeds/         # catálogo fictício de desenvolvimento
│   │   ├── services/      # regras de negócio
│   │   └── main.py        # aplicação FastAPI
│   ├── alembic/           # migrações
│   ├── tests/
│   └── pyproject.toml
├── docs/
│   └── design/        # protótipos, sistema de design, contrato das telas
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
