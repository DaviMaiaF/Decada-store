<p align="center">
  <img src="docs/design/marca/logo-decada.svg" alt="DÉCADA" width="120">
</p>

# DÉCADA

**Do plano alimentar à lista de compras — com o custo estimado antes de sair de casa.**

DÉCADA é um aplicativo mobile que pega o plano alimentar prescrito por uma
nutricionista, traduz cada alimento em produtos reais de supermercado, estima o custo
da compra (preço médio por região, sempre com data e origem do dado) e sugere receitas
usando só o que está na lista ou na despensa.

O app **não prescreve dieta**: ele operacionaliza uma prescrição que já existe.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![React Native](https://img.shields.io/badge/React_Native-Expo_57-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

Projeto acadêmico — Engenharia de Software, UCB. Prioridade: MVP funcional e bem
documentado.

> **Status:** beta. Backend e app mobile funcionando de ponta a ponta com dados de
> preço **fictícios** (seed de desenvolvimento). A leitura de NFC-e, fonte real de
> preço, está fora do MVP.

## Funcionalidades

- **Dois papéis de conta** — paciente e nutricionista, cada um com sua porta de login.
- **Nutricionista monta o plano no app** (refeições, horários, medidas caseiras,
  substituições, orientação) e entrega por **e-mail do paciente** ou **PDF**.
- **Paciente aceita com consentimento** (LGPD) e fica com uma cópia do plano; também
  pode importar um **PDF com texto** por conta própria.
- **Casamento item–produto**: cada item prescrito recebe produtos candidatos com score
  de confiança; quem confirma é sempre a pessoa.
- **Lista de compras** por região, com preço médio, data e origem de cada item, item
  avulso, marcação de comprado e **simulação** de outras quantidades.
- **Despensa** com quantidade, que abate da lista de compras — preenchida à mão ou
  **por foto** do que se tem em casa (o app propõe, a pessoa confirma, a imagem é
  descartada).
- **Receitas** ordenadas pelo que já se tem disponível.
- **Aba Economia** e fluxo de compra concluída.
- **Privacidade by design**: consentimento explícito, minimização e exclusão de conta
  que apaga de verdade — ver [`docs/lgpd.md`](docs/lgpd.md).

## Princípios

1. Preço nunca é um valor único: média, mediana e desvio, com data e origem.
2. Média sempre **por região**, nunca nacional.
3. Nunca se inventa preço em produção; dado fictício existe só no seed de dev e é marcado.
4. Substituição de alimento só existe se veio da nutricionista.

## Design

Os protótipos das telas, o sistema de design e o contrato que cada tela exige do
backend estão em [`docs/design/`](docs/design/). O aplicativo tem quatro abas —
Dieta, Mercado, Despensa e Economia — e uma tela de início.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/modelo-dados.md`](docs/modelo-dados.md) | Diagrama ER e a razão de cada regra de exclusão |
| [`docs/lgpd.md`](docs/lgpd.md) | Consentimento, minimização e exclusão, cada um com o teste que o sustenta |
| [`docs/integracao-api.md`](docs/integracao-api.md) | Como o app consome a API |
| [`docs/design/telas.md`](docs/design/telas.md) | Contrato tela a tela: o que existe, o que falta |
| [`docs/demo/roteiro.md`](docs/demo/roteiro.md) | Roteiro de demonstração de cinco minutos |
| [`docs/estado-do-projeto.md`](docs/estado-do-projeto.md) | Levantamento do estado das branches |

## O que falta

| O que | Situação |
|---|---|
| Leitura de NFC-e por QR Code | Fora do MVP — hoje todo preço do catálogo vem do seed fictício |
| Refeições com horário e status | Depende de um modelo `Meal`, fora do MVP. Ver [`docs/design/telas.md`](docs/design/telas.md) |
| OCR da prescrição por foto | Fora do MVP por decisão: errar ali faz comida sumir da dieta de alguém |

A foto da despensa enche a despensa; **não forma preço**. A fonte principal de preço
continua sendo a NFC-e.

## Stack

| Camada | Tecnologia |
|---|---|
| Mobile | React Native + Expo (SDK 57), TypeScript |
| Backend | Python 3.10+, FastAPI, Pydantic v2 |
| ORM / migrações | SQLAlchemy 2.x + Alembic |
| Banco | PostgreSQL 16 |
| Testes | pytest (backend), Jest + React Native Testing Library (mobile) |
| Reconhecimento de foto | API do Claude (opcional) |
| Ambiente | Docker Compose para banco, API e app |

## Pré-requisitos

- Docker e Docker Compose (caminho mais simples — dispensa o resto)
- Para rodar fora do Docker: Python 3.10+ e Node.js 20+
- Um celular com o app **Expo Go** na mesma rede Wi-Fi do computador (ou um emulador)
- Opcional: chave da API do Claude (`ANTHROPIC_API_KEY`) para a despensa por foto

## Subir tudo com um comando

Banco, API e app (Expo) sobem juntos no Docker:

```bash
cp .env.example .env          # defina HOST_IP com o IP da sua máquina na rede local
docker compose up --build     # db + api (migrações automáticas) + mobile
```

Em outro terminal, carregue o catálogo fictício e a conta de desenvolvimento (o
Compose aplica as migrações, mas **não** roda o seed; sem ele não há produtos nem
preços):

```bash
docker compose exec api python -m app.seeds
```

Depois é só abrir o app no celular pelo QR code e entrar com a
[conta de desenvolvimento](#conta-de-desenvolvimento).

- A API fica em `http://localhost:8000` e o QR code do Expo aparece nos logs do `mobile`.
- `HOST_IP` (ex.: `hostname -I | awk '{print $1}'` no Linux) é o endereço que o celular usa
  para alcançar o Metro e a API; sem ele, vale `localhost`, que só serve no emulador.
  O `.env.example` traz um `HOST_IP` de exemplo (`192.168.0.10`): **troque pelo seu**.
- A despensa por foto precisa de `ANTHROPIC_API_KEY` no `.env`; sem ela, só a foto
  responde 503 e o resto do app funciona normalmente.
- O código de `backend/` e `mobile/` é montado por volume: editar recarrega sozinho.
  Se mudar o `package.json`, rode `docker compose down -v` e suba de novo para refazer o `node_modules`.
- Para o app abrir na tela de login, sem tocar no banco (só limpa o token do aparelho, e só em desenvolvimento):
  - numa subida só: `RESET_SESSION=1 docker compose up --build`;
  - em toda subida: ponha `RESET_SESSION=1` no `.env` (volte para `0` para desligar).
  Com o app já aberto no celular, recarregue-o (agite o aparelho → Reload) depois de subir.
- Os passos abaixo continuam valendo para rodar cada parte fora do Docker.

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

Carrega 3 mercados no DF, 120 produtos, 1.080 registros de preço, 10 receitas e a
conta de desenvolvimento. É idempotente: rodar de novo atualiza as mesmas linhas em vez de duplicá-las.

**Todos esses dados são fictícios.** Mercados, produtos e receitas ficam com
`is_fictitious = true`, os preços têm origem `seed` e as marcas são inventadas.
O script se recusa a rodar se `APP_ENV` não for `dev`.

As tabelas do domínio estão documentadas em
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

Nutricionista tem porta própria — `/auth/nutritionist/register`, com `full_name` e
`crn` obrigatórios, e `/auth/nutritionist/login`. Cada porta só aceita contas do seu
papel, e a rota do outro papel responde 404.

Senha é guardada como hash bcrypt, nunca em texto. O token é um JWT assinado com
`SECRET_KEY` — **gere uma chave própria fora de desenvolvimento**, e saiba que
trocá-la invalida todos os tokens já emitidos.

### Rotas

| Método | Caminho | O que faz |
|---|---|---|
| `POST` | `/auth/register` | Cria a conta e devolve o token |
| `POST` | `/auth/login` | Troca e-mail e senha por um token |
| `POST` | `/auth/nutritionist/register` | Cria a conta de nutricionista (nome e CRN obrigatórios) |
| `POST` | `/auth/nutritionist/login` | Entrada da nutricionista |
| `GET` | `/auth/me` | A conta de quem está autenticado |
| `DELETE` | `/auth/me` | Apaga a conta e todos os dados pessoais (LGPD) |
| `POST` | `/meal-plans` | Importa o plano do PDF (multipart: `file` + `consent_accepted`) |
| `GET` | `/meal-plans` | Planos do usuário, do mais recente ao mais antigo, sem os itens |
| `GET` | `/meal-plans/{id}` | Plano com seus itens |
| `GET` | `/meal-plans/{id}/items/{item_id}/candidates` | Produtos candidatos para o item |
| `POST` | `/meal-plans/{id}/items/{item_id}/confirmation` | Confirma o produto escolhido |
| `POST` | `/meal-plans/{id}/shopping-lists` | Gera a lista de compras para uma região |
| `GET` | `/meal-plans/{id}/shopping-lists` | Listas já geradas para o plano, da mais recente à mais antiga |
| `GET` | `/shopping-lists/{id}` | Lista com preço, data e origem de cada item |
| `POST` | `/shopping-lists/{id}/items` | Acrescenta à compra um produto que o plano não pediu |
| `PATCH` | `/shopping-lists/{id}/items/{item_id}` | Marca ou desmarca o item como comprado |
| `DELETE` | `/shopping-lists/{id}/items/{item_id}` | Tira o item avulso da lista. Item prescrito responde 422 |
| `POST` | `/shopping-lists/{id}/simulation` | Quanto custaria com outras quantidades. **Não grava nada** |
| `GET` `POST` | `/pantry` | Lê e adiciona itens da despensa |
| `PATCH` | `/pantry/{id}` | Vincula o produto ou mede um item já salvo |
| `DELETE` | `/pantry/{id}` | Remove item da despensa |
| `GET` | `/pantry/{id}/candidates` | Produtos parecidos com um item já salvo |
| `POST` | `/pantry/photo` | Alimentos reconhecidos na foto, com os produtos candidatos. Só propõe |
| `GET` | `/products/search` | Produtos parecidos com um texto livre (`?q=`) |
| `GET` | `/recipes/suggestions` | Receitas ordenadas por disponibilidade |
| `GET` `POST` | `/nutritionist/prescriptions` | Planos que a nutricionista montou; cria um rascunho |
| `GET` `PUT` `DELETE` | `/nutritionist/prescriptions/{id}` | Lê, troca inteiro ou apaga. Plano já aceito responde 409 ao `PUT` |
| `POST` | `/nutritionist/prescriptions/{id}/send` | Envia ao e-mail do paciente. Responde igual exista conta ou não |
| `GET` | `/nutritionist/prescriptions/{id}/pdf` | O plano em PDF com texto, que o import lê de volta |
| `GET` | `/prescriptions/received` | Planos enviados ao e-mail do paciente, esperando resposta |
| `POST` | `/prescriptions/received/{id}/accept` | Aceita com `consent_accepted`: o plano vira dele |
| `POST` | `/prescriptions/received/{id}/decline` | Recusa. Nada é gravado |

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

## Demonstração

Roteiro de cinco minutos, com os números esperados em cada passo, em
[`docs/demo/roteiro.md`](docs/demo/roteiro.md). O plano alimentar de exemplo é
gerado por:

```bash
cd backend && .venv/bin/python -m app.seeds.demo_plan
```

## App mobile

```bash
cd mobile
npm install                  # apenas na primeira vez
npx expo start
```

Na maioria dos casos não há nada a configurar: sem `EXPO_PUBLIC_API_URL`, o app usa
o IP do computador que o Expo já conhece (e `10.0.2.2` no emulador Android). Se a
detecção não servir para a sua rede (VPN, várias placas), escreva o `.env` com o IP
da máquina — o comando é o mesmo em Windows, macOS e Linux:

```bash
cd mobile && npm run dev:api-url
```

O backend precisa aceitar conexões de fora da máquina:

```bash
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --reload
```

No Windows o executável fica em `.venv\Scripts\uvicorn`. Se o celular ainda não
alcançar a API, libere a porta 8000 no firewall e confirme que celular e computador
estão na mesma rede Wi-Fi.

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
npm run test:smoke # ponta a ponta: exige a API de pé; cria e apaga a própria conta
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
| `ANTHROPIC_API_KEY` | vazio | Chave da API do Claude para a despensa por foto. Sem ela, só a foto fica indisponível (503). Crie em console.anthropic.com → API Keys; **nunca versione** |
| `VISION_MODEL` | `claude-haiku-5-5` | Modelo que reconhece os alimentos na foto |
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
│   │   ├── components/    # cartão, botão, chip, campo, despensa por foto
│   │   ├── navigation/    # abas Dieta, Mercado, Despensa, Economia
│   │   ├── screens/       # início, login, dieta, mercado, despensa, economia, nutricionista
│   │   ├── services/      # cliente HTTP, sessão, formatação
│   │   ├── theme/         # tokens do sistema de design
│   │   └── types/         # contrato da API
│   └── App.tsx
├── docs/
│   ├── design/        # protótipos, sistema de design, contrato das telas
│   ├── lgpd.md        # consentimento, minimização e exclusão
│   └── modelo-dados.md # diagrama ER e regras de exclusão
├── .github/workflows/     # CI: pytest + ruff, tsc + jest
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

## CI

O GitHub Actions roda a cada push na `main` e em todo pull request: `ruff` e `pytest`
(contra um Postgres 16 de verdade) no backend, e `tsc` e `jest` no app.
