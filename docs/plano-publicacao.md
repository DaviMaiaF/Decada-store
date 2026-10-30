# Plano: API publicada + app no Expo Go acessível de qualquer rede

> Plano proposto, **ainda não aprovado nem implementado**. Responde à pendência 1 de
> [`pendencias.md`](pendencias.md) (API publicada). Pelo `CLAUDE.md`, nenhum código é escrito
> antes da aprovação, e cada etapa vira um commit pequeno em português (Conventional Commits).

## Como retomar em outro chat

Cole isto no início da conversa nova:

> Leia `CLAUDE.md` e `docs/plano-publicacao.md`. Quero executar esse plano, uma etapa por vez,
> começando pela Etapa 1. Proponha o que vai mudar em cada etapa antes de escrever código.

## Decisões já tomadas

- **Hospedagem da API:** Render (plano gratuito) + Postgres no **Neon** (gratuito, sem prazo
  de expiração; o Postgres gratuito do Render expira em cerca de 30 dias).
- **Entrega do app:** Expo Go + **EAS Update**, para abrir de qualquer rede sem depender do
  notebook. A versão web (Vercel) fica **para depois**, fora deste plano.
- **Não usar Vercel para a API:** ela roda como função serverless, e o backend foi pensado
  como servidor contínuo (uvicorn, Docker). Exigiria pooling, revisão do SQLAlchemy e
  migrações à parte, sem ganho.
- Se o cold start do Render atrapalhar a demonstração, o Railway (~US$ 5/mês) entra no lugar
  sem mudar o código. Os preços e limites citados aqui devem ser confirmados nas páginas dos
  serviços.

## Arquitetura

```
Quem testa (Expo Go, qualquer rede) → Expo (EAS Update, serve o código)
                                    → Render (API) → Neon (Postgres)
```

Duas conexões diferentes:

| Conexão | Precisa da mesma rede? |
|---|---|
| App → API | Não, depois do deploy (URL pública `https://...onrender.com`) |
| Expo Go → código do app (Metro) | Sim, hoje (`expo start` serve do notebook). A EAS Update resolve |

## O que o código atual exige mudar

Levantado lendo `backend/Dockerfile`, `docker-compose.yml`, `backend/app/core/config.py`,
`backend/alembic/env.py` e `backend/app/main.py`:

1. **`Dockerfile` é de desenvolvimento:** instala `.[dev]`, roda com `--reload`, fixa a porta
   8000 e depende do volume do compose.
2. **O banco só aceita variáveis soltas** (`POSTGRES_HOST`, `POSTGRES_USER`…). Neon e Render
   entregam uma única `DATABASE_URL`, com `sslmode=require`.
3. **O CORS só existe com `app_env == "dev"`.** Está certo e **não muda** neste plano: o app
   nativo não usa CORS. Só volta à discussão na versão web.
4. **O seed é protegido por `ensure_development_environment()`:** fora de `dev` ele se recusa
   a rodar. Isso protege a regra "nunca inventar preço em produção", mas deixa o ambiente
   publicado sem catálogo.
5. **A URL da API do app** vem de `EXPO_PUBLIC_API_URL` (`mobile/src/services/config.ts`), que
   é **embutida no código na hora de publicar**. Sem ela, o app procura o IP do notebook.

## Etapas

### Parte A. Backend pronto para produção

1. **`DATABASE_URL` opcional no `Settings`.** Se existir, vence as `POSTGRES_*`. Converter
   `postgres://` e `postgresql://` para `postgresql+psycopg://`. Com teste (formatos de URL e
   caso sem a variável).
2. **`backend/Dockerfile.prod`.** Sem dependências de dev e sem `--reload`, com usuário sem
   privilégios, porta vinda de `$PORT` e `alembic upgrade head` antes do uvicorn (mantendo o
   `exec`). O `Dockerfile` e o compose de desenvolvimento ficam intactos.
3. **Barreira contra segredo padrão.** Fora de `dev`, a API se recusa a subir com a
   `SECRET_KEY` de desenvolvimento. `.env.example` ganha a seção de produção
   (`APP_ENV`, `DATABASE_URL`, `SECRET_KEY`, `ANTHROPIC_API_KEY`). Com teste.
4. **`APP_ENV=demo`.** Permite o seed fictício; `prod` continua proibindo. Os dados seguem
   marcados como fictícios (`is_fictitious = true`, origem `seed`). Com teste.

### Parte B. Publicar a API (a pessoa cria as contas; o agente só orienta)

5. **Neon e Render.**
   - Neon: criar o banco e copiar a `DATABASE_URL`.
   - Render: Web Service apontando para o repositório, `Dockerfile.prod`, health check em
     `/health`, variáveis `APP_ENV=demo`, `DATABASE_URL`, `SECRET_KEY` (gerada com
     `python -c "import secrets; print(secrets.token_urlsafe(48))"`) e `ANTHROPIC_API_KEY`.
   - Rodar o seed uma vez, de propósito, e conferir `/health` e a documentação da API.
   - O agente não cria contas nem vê segredos: as credenciais são coladas pela pessoa nos
     painéis.

### Parte C. App no Expo Go, fora da rede local

6. **Conferir a EAS Update:** compatibilidade com o SDK 58 e o Expo Go atual, e limites do
   plano gratuito. Plano B se não servir: `expo start --tunnel`, que exige o notebook ligado
   durante a demonstração.
7. **Configurar o projeto no Expo:** conta gratuita, `eas init`, canal de publicação (ex.:
   `demo`) e ajustes mínimos no `app.json`.
8. **Apontar o app para a API pública:** definir `EXPO_PUBLIC_API_URL` no ambiente do EAS (não
   no `mobile/.env`). O app deixa de depender do `HOST_IP` e da mesma rede.
9. **Publicar com `eas update`** e anotar o link e o QR para enviar.

### Parte D. Validação e documentação

10. **Teste de ponta a ponta.**
    - `npm run test:smoke` contra a URL pública (cria e apaga a própria conta).
    - Roteiro manual no celular, **em 4G e com o notebook desligado**: login, importar plano,
      casar itens, despensa, lista de compras e pagamento simulado.
11. **Documentação.** Seção "Publicação" (arquitetura, variáveis, cold start, rollback, como
    reiniciar o seed e como publicar atualização do app), ajustes em `integracao-api.md` e
    `lgpd.md` (só contas de teste em servidor público), a pendência 1 marcada como atendida
    em `pendencias.md` e o `CLAUDE.md` atualizado (parágrafo sobre o ambiente publicado em
    "Como rodar" e o link da nova seção em "Documentação").

## Depois (fora deste plano)

**Versão web na Vercel:** checar `expo-secure-store` (token), o seletor de foto da despensa e o
download de PDF na web; script de build web; CORS por lista de origens (variável
`CORS_ORIGINS`, nunca `*`); deploy estático em `mobile/`. Só começa com as Partes A a D
fechadas.

## Riscos

- **Cold start (~1 min) no Render gratuito:** chamar `/health` uns minutos antes da
  apresentação.
- **Quem testa precisa do Expo Go** instalado (e talvez de conta Expo; confirmar na Etapa 6).
- **Dependência do serviço da Expo:** se estiver fora do ar, o app não abre. Plano B:
  `--tunnel`.
- **Dado de saúde em servidor público (LGPD):** o ambiente de demonstração deve ter apenas
  contas de teste, e isso entra na documentação.
- **Migrações:** testar `alembic upgrade head` num Postgres limpo local antes do primeiro
  deploy. Preferir migrações aditivas; um deploy errado volta com um clique no Render, mas isso
  não desfaz migração já aplicada.
- **Congelar a `main`** uns 2 dias antes da entrega.

## Estimativa

Parte A ~1 dia, B ~1 dia, C ~1 dia, D ~1 dia: 3 a 4 dias, o que deixa folga na quinzena para o
parser de NFC-e (pendência maior em relação às decisões do projeto, ainda sem código).

## Pré-requisito: branches

Recomendado (não é exigência técnica): **fundir a `feature/aviso-despensa-alterada` na `main`
antes de começar.**

- O Render publica a partir de uma branch, normalmente a `main`. Se a branch da despensa não
  estiver nela, a API publicada não terá o fluxo novo da despensa, e as telas do app chamariam
  rotas que não existem no servidor.
- Fazer o deploy a partir da `main` antiga e fundir depois pode gerar conflitos em
  `config.py`, `docs/` e `pendencias.md`.
- Alternativa, se não quiser fundir agora: trabalhar a partir da branch atual e configurar o
  Render para publicá-la. Funciona, mas é mais confuso de manter.

Depois de fundir, o trabalho do deploy sai de uma branch nova a partir da `main` (ex.:
`feature/publicacao-api`), com PR de volta para ela.

O `.claude/launch.json` está modificado e sem commit: decidir se entra em um commit separado
ou se é descartado, antes de abrir qualquer branch.

## Como o `CLAUDE.md` pesa neste plano

O `CLAUDE.md` não tem alterações pendentes (só o `launch.json` aparecia modificado). O que ele
já define vale para toda a execução:

| Regra do `CLAUDE.md` | Efeito no plano |
|---|---|
| Plano antes de código; uma etapa por vez | Cada etapa é proposta e aprovada antes de implementada |
| Commits pequenos, em português, Conventional Commits | Um commit por etapa |
| Todo módulo de regra de negócio tem teste | Etapas 1, 3 e 4 (configuração e segurança) já preveem teste |
| Nunca inventar preço em produção | Razão do `APP_ENV=demo`: catálogo fictício só no demo; `prod` segue proibindo o seed |
| Python 3.10 (evitar recursos de 3.11+) | `Dockerfile.prod` usa `python:3.10-slim`, como o atual |
| Decisão 5 (LGPD) | Ambiente publicado só com contas de teste; entra na documentação |

**Atualização do próprio `CLAUDE.md`** (faz parte da Etapa 11): na seção "Como rodar", um
parágrafo curto sobre o ambiente publicado (API no Render, banco no Neon, app via EAS Update,
sem `HOST_IP`) e, na seção "Documentação", o link para a nova seção de publicação. A seção de
decisões não muda; só se o deploy trouxer uma decisão nova (ex.: o `APP_ENV=demo`), ela é
levada à discussão antes de entrar ali.
