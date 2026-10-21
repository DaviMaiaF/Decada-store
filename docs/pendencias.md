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

## O que falta

| # | Pendência | Observação |
|---|---|---|
| 1 | **API publicada** (Railway, Render ou Vercel) | Não há deploy. O Dockerfile atual é de desenvolvimento (`--reload`); precisa de Postgres gerenciado e `SECRET_KEY` próprio |
