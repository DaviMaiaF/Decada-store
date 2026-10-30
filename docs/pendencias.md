# Pendências — retorno do professor

> Levantamento a partir das anotações da aula. O cronograma é responsabilidade de outra
> integrante do grupo e não entra aqui.

## O que já está atendido

- App consome a API com **axios** (`mobile/src/services/http.ts`)
- **Docker Compose** mantido (banco, API e app)
- Dependências do backend só no `pyproject.toml`, sem `requirements.txt`
- Chaves primárias **UUID** mantidas
- Primeira versão do front (React Native + TypeScript) e do back (FastAPI) com a stack definida
- **Conceito e justificativa do `test:smoke`**: em
  [`integracao-api.md`](integracao-api.md#o-que-é-um-smoke-test-e-por-que-este-projeto-tem-um),
  com a comparação entre as três suítes de teste
- **Código do app em MVVM** (model, view, viewModel): ViewModels em `mobile/src/viewmodels/`,
  convenção e mapa em [`arquitetura-mvvm.md`](arquitetura-mvvm.md)
- **Pagamento simulado, no molde do Mercado Pago**: Pix com QR e copia-e-cola, e cartão de
  crédito com os titulares de teste. Nada é cobrado; regras em
  [`design/telas.md`](design/telas.md#3-mercado), rotas em
  [`integracao-api.md`](integracao-api.md#pagamento-simulado)
- **API publicada**: no Render, com Postgres gerenciado no Neon, imagem de produção
  (`backend/Dockerfile.prod`) e `SECRET_KEY` própria obrigatória fora de desenvolvimento.
  O app abre de qualquer rede por APK Android e EAS Update. Como funciona e como manter
  em [`publicacao.md`](publicacao.md)

## O que falta

Nenhuma pendência aberta do retorno do professor.
