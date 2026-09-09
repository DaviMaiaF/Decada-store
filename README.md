# DÉCADA

Aplicativo mobile que recebe o plano alimentar de uma nutricionista, traduz os itens
prescritos em produtos reais de supermercado, calcula o custo estimado da compra
(preço médio por região, com data e origem do dado) e sugere receitas usando apenas
os ingredientes da lista.

Projeto acadêmico — Engenharia de Software, UCB.

> **Status:** beta. Backend completo e app mobile com login, envio da prescrição em
> PDF, confirmação dos produtos, lista de compras, despensa e sugestão de receitas. A
> aba Economia ainda não tem interface. NFC-e continua fora do MVP.

## Design

Os protótipos das telas, o sistema de design e o contrato que cada tela exige do
backend estão em [`docs/design/`](docs/design/). O aplicativo tem quatro abas —
Dieta, Mercado, Despensa e Economia.

## O que falta

| O que | Situação |
|---|---|
| Aba Economia | Sem protótipo; hoje mostra a conta e o botão de sair |
| Vincular item da despensa ao catálogo | O item entra por texto e só desconta da compra depois de vinculado |
| Leitura de NFC-e por QR Code | Fora do MVP |
| Item avulso na lista de compras | Exige `plan_item_id` nulo em `ShoppingListItem` |

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

As onze tabelas do domínio estão documentadas em
[`docs/modelo-dados.md`](docs/modelo-dados.md), com diagrama ER e a razão de cada
regra de exclusão.

## Execução

```bash
cd backend
.venv/bin/uvicorn app.main:app --reload
```

- API: <http://localhost:8000>
- Documentação interativa (Swagger): <http://localhost:8000/docs>

### Autenticação

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "voce@exemplo.com", "password": "uma-senha-boa"}'
```

A resposta traz `access_token`. Mande-o em toda rota de domínio:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8000/pantry
```

Senha é guardada como hash bcrypt, nunca em texto. O token é um JWT assinado com
`SECRET_KEY` — **gere uma chave própria fora de desenvolvimento**, e saiba que
trocá-la invalida todos os tokens já emitidos.

### Rotas

| Método | Caminho | O que faz |
|---|---|---|
| `POST` | `/auth/register` | Cria a conta e devolve o token |
| `POST` | `/auth/login` | Troca e-mail e senha por um token |
| `GET` | `/auth/me` | A conta de quem está autenticado |
| `DELETE` | `/auth/me` | Apaga a conta e todos os dados pessoais (LGPD) |
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

## App mobile

```bash
cd mobile
npm install                  # apenas na primeira vez
cp .env.example .env         # ajuste EXPO_PUBLIC_API_URL
npx expo start
```

No navegador, `localhost` funciona. **No celular ou no emulador, não**: eles
resolvem esse nome para o próprio aparelho, não para a máquina que roda o backend.
Este comando descobre o IP da sua máquina na rede e escreve o `.env` já preenchido:

```bash
cd mobile && printf 'EXPO_PUBLIC_API_URL=http://%s:8000\n' "$(hostname -I | awk '{print $1}')" > .env && cat .env
```

E o backend precisa aceitar conexões de fora da máquina:

```bash
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --reload
```

### Conta de desenvolvimento

O seed cria uma conta pronta, para não precisar cadastrar uma a cada banco novo:

| | |
|---|---|
| e-mail | `beta@example.com` |
| senha | `decada-beta-2026` |

Não é exceção na autenticação — é um usuário comum, com senha passando pelo mesmo
bcrypt. O que a protege é a trava de ambiente do seed, que se recusa a rodar se
`APP_ENV` não for `dev`.

Verificação:

```bash
cd mobile
npm test          # Jest + React Native Testing Library
npm run typecheck # tsc --noEmit
```

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
| `SECRET_KEY` | valor de desenvolvimento | Assina os tokens. **Troque em produção** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | Validade do token, em minutos (7 dias) |
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
├── mobile/
│   ├── src/
│   │   ├── components/    # cartão, botão, chip, campo
│   │   ├── navigation/    # abas Dieta, Mercado, Despensa, Economia
│   │   ├── screens/       # login, upload, confirmação, mercado
│   │   ├── services/      # cliente HTTP, sessão, formatação
│   │   ├── theme/         # tokens do sistema de design
│   │   └── types/         # contrato da API
│   └── App.tsx
├── docs/
│   ├── design/        # protótipos, sistema de design, contrato das telas
│   ├── lgpd.md        # consentimento, minimização e exclusão
│   └── modelo-dados.md # diagrama ER e regras de exclusão
├── docker-compose.yml
└── CLAUDE.md              # contexto do projeto para o Claude Code
```

## Aviso sobre os dados de preço

Nenhum preço exibido pelo aplicativo é inventado. Dados fictícios existem apenas no
seed de desenvolvimento e são marcados como tal (origem `seed`). Todo preço é
apresentado com a data da coleta e a origem do registro.

## Privacidade

Plano alimentar é dado pessoal sensível de saúde (LGPD, art. 5º, II). O projeto exige
consentimento explícito, minimização de dados e exclusão sob demanda — cada uma
dessas exigências virou código, e [`docs/lgpd.md`](docs/lgpd.md) aponta o teste que
sustenta cada uma. `DELETE /auth/me` apaga tudo e devolve o comprovante do que foi
removido.
