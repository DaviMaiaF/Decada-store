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
| Mobile | React Native + Expo (SDK 57), TypeScript |
| Backend | Python 3.10+, FastAPI, Pydantic v2 |
| ORM / migrações | SQLAlchemy 2.x + Alembic |
| Banco | PostgreSQL 16 |
| Testes | pytest (backend), Jest + React Native Testing Library (mobile) |
| Ambiente | Docker Compose para o banco |

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
│   │   ├── screens/
│   │   ├── components/
│   │   ├── services/      # cliente HTTP
│   │   └── types/
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
  de compras e alimenta a sugestão de receitas.
- **ShoppingList (lista de compras)**: resultado final — produtos escolhidos,
  quantidades e custo estimado.
- **Recipe (receita)**: preparo que consome ingredientes presentes na lista
  ou na despensa.

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
7. Import de plano é **PDF com texto**. OCR de foto está fora do MVP.
8. Substituição de alimento só existe se veio da nutricionista. O app pode comparar
   preços do mesmo item; não pode trocar o alimento prescrito por outro.
9. Autenticação é JWT assinado; senha é hash bcrypt. Exclusão de conta apaga a
   linha de verdade — sem soft delete —, e só o preço sobrevive, anonimizado.
10. Recurso de outra pessoa responde 404, nunca 403; senha errada e e-mail
    inexistente respondem igual. Ver [`docs/lgpd.md`](docs/lgpd.md).

## Design

Os protótipos das telas, o sistema de design e o contrato que cada tela exige do
backend estão em [`docs/design/`](docs/design/). Antes de implementar qualquer tela
ou endpoint que a alimente, leia [`docs/design/telas.md`](docs/design/telas.md): ele
diz o que já existe, o que falta e o que ficou fora do MVP.

A interface tem quatro abas: **Dieta · Mercado · Despensa · Economia**.

## Documentação

- [`docs/modelo-dados.md`](docs/modelo-dados.md) — diagrama ER e a razão de cada
  regra de exclusão.
- [`docs/lgpd.md`](docs/lgpd.md) — consentimento, minimização e exclusão, cada um
  com o teste que o sustenta.

## Como rodar

```bash
docker compose up -d                       # sobe o Postgres 16

cd backend
python3 -m venv .venv                      # apenas na primeira vez
.venv/bin/pip install -e ".[dev]"          # apenas na primeira vez
.venv/bin/uvicorn app.main:app --reload    # API em http://localhost:8000

.venv/bin/pytest -q                        # testes do backend

cd ../mobile && npx expo start             # (ainda não existe — última etapa)
```

> **Nota de ambiente:** a máquina de desenvolvimento tem Python 3.10.12.
> A stack (FastAPI, Pydantic v2, SQLAlchemy 2.x) roda sem restrição nessa versão,
> então o mínimo do projeto é 3.10. Evite recursos exclusivos de 3.11+
> (`tomllib`, `enum.StrEnum`, `typing.Self`).
