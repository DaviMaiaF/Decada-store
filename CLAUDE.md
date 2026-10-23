# DÉCADA — Contexto do Projeto

> Este arquivo é lido automaticamente pelo Claude Code em toda sessão.
> Mantenha-o atualizado conforme o projeto evolui.

## O que é

Aplicativo mobile que recebe o plano alimentar de uma nutricionista, traduz os itens
prescritos em produtos reais de supermercado, calcula o custo estimado da compra
(com preço médio e variação por região) e sugere receitas usando apenas os
ingredientes da lista.

Projeto acadêmico — Engenharia de Software, UCB. Prioridade é **MVP funcional e
bem documentado**, não escala de produção.

## Regras de trabalho

- **Sempre proponha um plano antes de escrever código.** Espere aprovação.
- **Uma etapa por vez.** Não implemente funcionalidades que não foram pedidas.
- **Commits pequenos e descritivos**, em português, no padrão Conventional Commits
  (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- **Todo módulo de regra de negócio precisa de teste.** Sem exceção para:
  casamento item–produto, cálculo de preço, parser de NFC-e.
- **Nunca invente dados de preço em produção.** Dados fictícios só no seed de
  desenvolvimento, e claramente marcados como tal.
- Se uma decisão de arquitetura for ambígua, **pergunte** em vez de escolher sozinho.
- Código e comentários em português; nomes de variáveis, funções e tabelas em inglês.

## Stack

| Camada | Tecnologia |
|---|---|
| Mobile | React Native + Expo (SDK 58), TypeScript |
| Backend | Python 3.10+, FastAPI, Pydantic v2 |
| ORM / migrações | SQLAlchemy 2.x + Alembic |
| Banco | PostgreSQL 16 |
| Testes | pytest (backend), Jest + React Native Testing Library (mobile) |
| Ambiente | Docker Compose para banco, API e app |

## Estrutura de pastas

```
decada/
├── backend/
│   ├── app/
│   │   ├── api/           # rotas FastAPI
│   │   ├── core/          # config, segurança
│   │   ├── models/        # SQLAlchemy
│   │   ├── schemas/       # Pydantic
│   │   ├── services/      # regras de negócio
│   │   └── main.py
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── mobile/
│   ├── src/
│   │   ├── screens/       # View
│   │   ├── components/    # View
│   │   ├── viewmodels/    # ViewModel: um hook por tela
│   │   ├── services/      # Model: cliente HTTP e regras puras
│   │   └── types/         # Model: contrato da API
│   └── app.json
├── docs/
│   └── design/        # protótipos, sistema de design, contrato das telas
└── docker-compose.yml
```

## Domínio — conceitos centrais

- **MealPlan (plano alimentar)**: conjunto de itens prescritos por uma nutricionista.
- **PlanItem (item do plano)**: descrição textual + quantidade + unidade.
  Exemplo: "peito de frango", 1200, "g".
- **Product (produto)**: item real de supermercado, com marca, embalagem e unidade.
- **Match (casamento)**: associação entre um PlanItem e um ou mais Products candidatos,
  com um score de confiança. Nunca é 100% automático — o usuário confirma.
- **PriceRecord (registro de preço)**: preço de um Product, em um Market, em uma data,
  com uma origem (`nfce`, `scraping`, `usuario`, `seed`).
- **PantryItem (item da despensa)**: o que o usuário já tem em casa. Abate da lista
  de compras e alimenta a sugestão de receitas. Entra pelo cadastro manual ou por
  foto do que se tem em casa — ver decisão 11.
- **ShoppingList (lista de compras)**: resultado final — produtos escolhidos,
  quantidades e custo estimado.
- **Recipe (receita)**: preparo que consome ingredientes presentes na lista
  ou na despensa. Não confundir com a "receita" da nutricionista, que é a
  prescrição — no código, `Prescription`.
- **Prescription (plano da nutricionista)**: plano alimentar que a nutricionista
  monta no app, no formato do Dietbox: refeições com horário, alimentos com
  quantidade e medida caseira, substituições e orientação. Chega ao paciente
  pelo e-mail ou em PDF — ver decisão 12.

## Decisões já tomadas (não reabrir sem discutir)

1. Preço nunca é um valor único: sempre média + mediana + desvio, com data e origem.
   Preço com mais de 30 dias é exibido como estimativa.
2. Média é calculada **por região**, nunca nacional.
3. A fonte principal de preço é o **QR Code da NFC-e** escaneado pelo usuário.
   Scraping é apenas carga inicial do catálogo de produtos.
4. O app **não prescreve dieta**. Ele operacionaliza uma prescrição existente.
5. Plano alimentar é dado pessoal sensível de saúde (LGPD, art. 5º, II):
   consentimento explícito, minimização e exclusão sob demanda são requisitos.
6. A marca é **DÉCADA** (feminina: *a* DÉCADA). Tabelas, colunas e enums seguem
   em inglês, como sempre.
7. Import de plano é **PDF com texto** — ou o plano que a nutricionista monta no
   app (decisão 12). OCR da *prescrição* por foto está fora do MVP — errar ali
   faz comida sumir da dieta de alguém. Não confundir com a decisão 11, que é
   foto de comida, não de documento.
8. Substituição de alimento só existe se veio da nutricionista. O app pode comparar
   preços do mesmo item; não pode trocar o alimento prescrito por outro.
9. Autenticação é JWT assinado; senha é hash bcrypt. Exclusão de conta apaga a
   linha de verdade — sem soft delete —, e só o preço sobrevive, anonimizado.
10. Recurso de outra pessoa responde 404, nunca 403; senha errada e e-mail
    inexistente respondem igual. Ver [`docs/lgpd.md`](docs/lgpd.md).
11. A despensa pode ser preenchida por **foto do que se tem em casa**: o app
    reconhece os alimentos e **propõe**; quem confirma é a pessoa, item a item, como
    no casamento do plano. O que o reconhecimento não resolver aparece como não
    identificado, nunca entra sozinho. **A imagem não é guardada** — o app extrai os
    itens e descarta o arquivo (decisão 5, minimização). Isso enche a despensa; não
    forma preço, que continua sendo a decisão 3.
12. Há dois papéis de conta, **paciente e nutricionista** (`users.role`), cada um
    com sua porta de login; a rota do outro papel responde 404. A nutricionista
    **monta o plano alimentar** no app e o entrega **pelo e-mail do paciente** ou
    **em PDF** que o import lê de volta. O envio responde igual exista conta ou
    não (decisão 10). O plano só vira do paciente quando ele **aceita, com
    consentimento**, e o que ele recebe é uma **cópia**: sobrevive à nutricionista
    excluir a conta, e o plano aceito não muda mais. Só a opção principal de cada
    refeição vai para a compra; substituições e orientação são para ler.

## Design

Os protótipos das telas, o sistema de design e o contrato que cada tela exige do
backend estão em [`docs/design/`](docs/design/). Antes de implementar qualquer tela
ou endpoint que a alimente, leia [`docs/design/telas.md`](docs/design/telas.md): ele
diz o que já existe, o que falta e o que ficou fora do MVP.

O app segue **MVVM** ([`docs/arquitetura-mvvm.md`](docs/arquitetura-mvvm.md)): a tela
(`screens/`, `components/`) só desenha e repassa toques; estado, queries, mutations e
ações ficam num hook em `src/viewmodels/`, que tem teste próprio com `renderHook`. A
View não importa `services/api`, `@tanstack/react-query` nem `services/auth` — o teste
`viewmodels/__tests__/arquitetura.test.ts` quebra se importar.

A interface tem quatro abas: **Dieta · Mercado · Despensa · Economia**, e uma tela de
início fora delas, onde o app abre e para onde a compra concluída leva. O app vive em
`mobile/`; os tokens do sistema de design estão em `mobile/src/theme/tokens.ts` e
vêm do bloco de tokens de `docs/design/sistema-de-design.md`.

## Documentação

- [`docs/modelo-dados.md`](docs/modelo-dados.md) — diagrama ER e a razão de cada
  regra de exclusão.
- [`docs/lgpd.md`](docs/lgpd.md) — consentimento, minimização e exclusão, cada um
  com o teste que o sustenta.
- [`docs/integracao-api.md`](docs/integracao-api.md) — como o app consome a API:
  a instância do axios, os interceptors, as rotas e o que cada status faz na tela.
- [`docs/arquitetura-mvvm.md`](docs/arquitetura-mvvm.md) — as camadas do app (Model,
  View, ViewModel), a convenção entre elas e o que fica de fora.

## Como rodar

```bash
docker compose up --build                  # sobe tudo: Postgres 16 + API + app (defina HOST_IP no .env)
docker compose up -d db                    # ou só o Postgres, para rodar back e front à mão
scripts/atualizar-ip.sh                    # ao trocar de rede: atualiza o HOST_IP e recria o app

cd backend
python3 -m venv .venv                      # apenas na primeira vez
.venv/bin/pip install -e ".[dev]"          # apenas na primeira vez
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --reload  # API em http://localhost:8000, alcançável pelo celular

.venv/bin/pytest -q                        # testes do backend

cd ../mobile && npx expo start             # app mobile (npm run dev:api-url fixa o IP da API no .env)
cd ../mobile && npm test                   # testes do app
cd ../mobile && npm run test:smoke         # ponta a ponta: exige a API de pé
```

> **Trocou de rede** (casa, faculdade, hotspot)? O IP do notebook muda e o QR code do
> Expo fica apontando para o antigo — o app abre, mas não alcança a API. Rode
> `scripts/atualizar-ip.sh`: ele descobre o IP, grava no `HOST_IP` do `.env` e recria
> só o container do app. No hotspot do celular, o MTU menor derruba o HTTPS de dentro
> dos containers (`ECONNRESET`); a regra abaixo corrige até o próximo reboot:
> `sudo iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1360`

> O `node_modules` do app no compose mora no volume `mobile_node_modules`. Ao subir, o
> container compara o volume com o `package-lock.json` e roda `npm ci` só se o lock mudou
> (`mobile/sync-node-modules.sh`) — sem isso, dependência nova não chegava ao volume e o
> app abria em página branca.

> O `test:smoke` fala com o backend de verdade e cria a própria conta, que apaga
> no fim. Ele não entra no `npm test` porque sem servidor de pé falharia — ver
> [`docs/integracao-api.md`](docs/integracao-api.md).

> **Nota de ambiente:** a máquina de desenvolvimento tem Python 3.10.12.
> A stack (FastAPI, Pydantic v2, SQLAlchemy 2.x) roda sem restrição nessa versão,
> então o mínimo do projeto é 3.10. Evite recursos exclusivos de 3.11+
> (`tomllib`, `enum.StrEnum`, `typing.Self`).
