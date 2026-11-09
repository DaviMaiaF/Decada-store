# Super usuário — o painel de controle do sistema

Pedido do orientador: uma conta capaz de acompanhar e controlar o sistema. É um
**painel web**, servido pela própria API em `/admin`:

- local: `http://localhost:8000/admin`;
- publicado: `https://decada-api.onrender.com/admin`.

## Por que web, e por que na própria API

Tabela e dashboard rendem mais em tela grande, e o paciente não precisa carregar uma tela
de administração no APK. Estar na API evita duas coisas: liberar CORS numa API que serve
dado de saúde (a página e as rotas têm a mesma origem) e manter um segundo deploy (o merge
na `main` publica o painel junto).

## O que o painel faz

| Aba | Conteúdo |
|---|---|
| **Dashboard** | Contas por papel, cadastros por semana, planos, listas, pagamentos de teste, preços por origem e por região, preços com mais de 30 dias e tamanho do catálogo. Só números agregados |
| **Contas** | Busca por e-mail ou nome, filtro por papel, quantidade de planos, suspender, reativar e excluir |
| **Histórico** | Quem fez o quê, e quando |

## Criar a conta

Não existe cadastro público. A conta nasce por um comando, que pede a senha sem eco e
exige ao menos 12 caracteres:

```bash
cd backend && .venv/bin/python -m app.create_superuser --email voce@exemplo.com --name "Seu nome"
```

Ele recusa e-mail que já tem conta: um paciente não é promovido, porque cada conta tem um
papel só. Para o ambiente publicado, ver [`publicacao.md`](publicacao.md#criar-o-super-usuário).

## As regras (decisão 15)

1. **Não vê dado de saúde.** Nenhuma rota do painel devolve plano, item, despensa ou lista;
   de cada conta saem identificação e contagens.
2. **Porta própria.** `/auth/admin/login` só aceita este papel, e ele não entra pelas outras
   portas. Para os outros papéis as rotas de `/admin/api` respondem 404, e o login responde
   o mesmo 401 da senha errada (decisão 10).
3. **Sessão curta.** O token dura 1 hora (`ADMIN_TOKEN_EXPIRE_MINUTES`), contra 7 dias no
   app, e fica só em memória: recarregar a página pede a senha de novo.
4. **Suspender é reversível; excluir não é.** A conta suspensa não entra e o token dela para
   de valer na requisição seguinte, sem perder dado. A exclusão usa o mesmo serviço do
   `DELETE /auth/me` (`services/accounts.py`) e exige digitar o e-mail da conta.
5. **O histórico não lembra de quem foi excluído.** `admin_actions` guarda o vínculo com a
   conta, nunca o e-mail. Na exclusão o vínculo some, em todas as linhas dela, e fica só o
   papel (decisão 9).
6. **Conta de super usuário não é alterada pelo painel**, nem a própria nem a de outro
   (409). Uma sessão comprometida não consegue trancar as outras para fora.

## A página

HTML, CSS e JavaScript sem framework nem etapa de build, em `backend/app/admin_web/`.
Como a página roda com um token que alcança todas as contas, e nome e e-mail vêm do cadastro
público, dado da API só entra na tela como texto (`textContent`, nunca HTML). A CSP aceita
só arquivos do próprio servidor e proíbe embutir a página em outra.

O botão no topo troca o tema entre automático (segue o sistema), claro e escuro. A escolha
fica guardada no navegador; é a única coisa que o painel guarda ali, e o token não passa
perto dela (`theme.js` não conhece a sessão).

> Testes: `test_admin_api.py` (acesso, métricas, ausência de dado de saúde, suspensão,
> exclusão e histórico), `test_superuser.py` (criação, portas de login, suspensão),
> `test_admin_web.py` (cabeçalhos, arquivos servidos e o que o JavaScript não pode usar).
> O comportamento da tela foi conferido no navegador; não há teste automatizado dela.

## O que não faz

- **Editar catálogo, preços ou receitas.** Continuam vindo do seed e da NFC-e.
- **Limitar tentativas de login.** O projeto não tem limite em nenhuma porta. Com o painel
  exposto na internet, é a primeira coisa a resolver antes de uma produção de verdade; por
  ora a defesa é o bcrypt e a senha longa exigida no comando.
- **Avisar a pessoa** de que a conta foi suspensa ou excluída: para ela, a suspensão parece
  senha errada.
