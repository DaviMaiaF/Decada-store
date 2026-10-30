# Publicação — a DÉCADA fora do notebook

> O ambiente publicado é **de demonstração** (`APP_ENV=demo`): catálogo e preços
> fictícios, só contas de teste. Não é produção e não recebe dado real de saúde
> (decisões 5 e 13 do [`CLAUDE.md`](../CLAUDE.md)). O plano que levou até aqui, com as
> decisões e os desvios, está em [`plano-publicacao.md`](plano-publicacao.md).

## Arquitetura

```
Celular (APK ou Expo Go) ──código JS──▶ EAS Update (Expo), canal demo
        │
        └──HTTPS──▶ Render (API, Docker) ──TLS──▶ Neon (Postgres)
```

| Peça | Onde | Endereço / identificador |
|---|---|---|
| API | Render, plano gratuito, região Virginia | `https://decada-api.onrender.com` (`/health`, `/docs`) |
| Banco | Neon, plano gratuito, AWS US East 1 | conexão direta, sem pooling |
| App | EAS, projeto `@davi-maias-team/decada` | APK do perfil `preview`; updates no canal `demo` |

API e banco ficam na costa leste dos EUA, lado a lado: o que pesa é a distância
entre os dois, porque cada requisição faz várias consultas. Não há região do Render na
América do Sul.

## Variáveis

Nenhum segredo está no repositório. Cada valor é colado no painel do serviço.

**Render** (Environment do Web Service):

| Variável | Valor | Observação |
|---|---|---|
| `APP_ENV` | `demo` | libera o seed fictício; ver abaixo |
| `DATABASE_URL` | string do Neon | vence as `POSTGRES_*`; `postgresql://` vira `postgresql+psycopg://` |
| `SECRET_KEY` | gerada pelo Render (**Generate**) | com a chave padrão ou vazia, a API se recusa a subir |
| `ANTHROPIC_API_KEY` | opcional | sem ela, só a foto da despensa responde 503 |

O Render define `PORT` sozinho. O serviço usa `backend/Dockerfile.prod` (Root Directory
`backend`), com health check em `/health`.

**EAS** (ambiente `preview`):

| Variável | Valor |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://decada-api.onrender.com` |

O `eas update --environment preview` usa só as variáveis do EAS e **ignora o
`mobile/.env`** local, que aponta para o IP do notebook. Por isso o app publicado não
depende do `HOST_IP` nem da mesma rede.

## O que `APP_ENV=demo` muda

| | `dev` | `demo` | `prod` |
|---|---|---|---|
| `SECRET_KEY` padrão | aceita | recusada | recusada |
| Seed fictício (catálogo, preços, receitas) | sim | sim | **proibido** |
| Conta de desenvolvimento (`beta@example.com`) | criada | **não criada** | — |
| CORS para a versão web | sim | não | não |

A conta de desenvolvimento tem a senha versionada no repositório; num servidor público,
qualquer um entraria nela. No `demo`, quem testa cria a própria conta pelo app.

## Deploy, migração e rollback

- **Cada merge na `main` publica a API.** O container roda `alembic upgrade head` antes
  do uvicorn: migração nova entra junto com o código.
- **Rollback:** no Render, *Events* → deploy anterior → *Rollback*. Isso volta o
  código, **não a migração já aplicada**. Por isso as migrações são aditivas (coluna ou
  tabela nova, nunca renomear ou apagar no mesmo deploy).
- **Antes do primeiro deploy de uma migração**, rode-a num Postgres limpo local: suba a
  imagem de produção apontada para um banco vazio, como na validação da Etapa 2 do plano.

## Cold start

No plano gratuito o Render dorme depois de ~15 min sem chamada, e a primeira
requisição depois disso leva ~1 min. **Antes de apresentar, abra
`https://decada-api.onrender.com/health`** e espere o `{"status":"ok",...}`. Se a espera
atrapalhar, o Railway (~US$ 5/mês) entra no lugar sem mudar o código.

## Carregar ou recarregar o seed

O seed roda do notebook, apontado para o Neon; o Render gratuito não tem shell. É
idempotente: rodar de novo não duplica nada.

```bash
cd backend && read -rsp "Cole a string do Neon e tecle Enter: " DATABASE_URL && echo && read -rsp "Digite qualquer chave longa e tecle Enter: " SECRET_KEY && echo && APP_ENV=demo DATABASE_URL="$DATABASE_URL" SECRET_KEY="$SECRET_KEY" .venv/bin/python -m app.seeds
```

- A `SECRET_KEY` aqui só precisa ser diferente da padrão: o seed não assina token.
- Leva alguns minutos: são ~1.300 linhas, uma ida e volta ao banco por linha, do
  Brasil até a Virgínia. Sem saída na tela durante a carga é normal.
- Só depois do primeiro deploy, que é quem cria as tabelas.

## Publicar uma atualização do app

| O que mudou | O que fazer |
|---|---|
| Só código JS/TS, telas, estilos | `cd mobile && eas update --channel demo --environment preview --message "…"` |
| Dependência nativa nova, permissão, ícone, `app.json` | aumentar `version` no `app.json` e gerar APK novo: `eas build --profile preview --platform android` |

O APK e o Expo Go baixam o update ao abrir e aplicam na abertura seguinte. O
`runtimeVersion` segue a `version` do `app.json`: um update só chega ao APK da mesma
versão, o que impede código novo de rodar sobre módulos nativos antigos.

O plano gratuito da Expo tem ~15 builds Android por mês e 1.000 usuários ativos por
mês na EAS Update, sem cobrança de excedente (confirme em expo.dev/pricing).

## Quem consegue abrir o app

| Quem | Como |
|---|---|
| Qualquer pessoa com Android | instala o APK pelo link do build (Android pede para permitir "fontes desconhecidas") |
| Membros da organização `davi-maias-team` | Expo Go, entrando com a própria conta Expo |
| iPhone fora da organização | não há caminho: exigiria a conta paga da Apple, ou a versão web, fora do MVP |

Desde maio de 2026 o Expo Go só abre updates do EAS para quem é dono do projeto ou
membro da organização ([changelog da Expo](https://expo.dev/changelog/expo-go-loading-changes-may-2026)).
Para convidar alguém: expo.dev → organização `davi-maias-team` → *Members* → *Invite*.
O passo a passo para quem vai abrir o app está em [`abrir-no-celular.md`](abrir-no-celular.md).

## Testar o ambiente publicado

```bash
curl https://decada-api.onrender.com/health                          # acorda a API
cd mobile && EXPO_PUBLIC_API_URL=https://decada-api.onrender.com npm run test:smoke
```

O smoke cria a própria conta e a apaga no fim. Depois, o roteiro manual no celular,
**em 4G e com o notebook desligado**: cadastro, importar o plano
([`demo/plano-exemplo.pdf`](demo/plano-exemplo.pdf)), casar os itens, despensa, lista de
compras e pagamento simulado.
