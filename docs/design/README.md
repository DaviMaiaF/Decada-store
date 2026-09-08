# Design da DÉCADA

Referência visual do aplicativo. Tudo que a interface faz — cores, tipografia,
componentes e fluxo de telas — é derivado desta pasta.

## O que tem aqui

| Arquivo | O que é |
|---|---|
| [`sistema-de-design.md`](sistema-de-design.md) | Tokens (cores, tipografia, espaçamento, raio) e as regras de aplicação de cada componente. |
| [`telas.md`](telas.md) | Por tela: o que o backend precisa entregar, o que já existe, o que falta e o que ficou fora do MVP. |
| [`prototipos/`](prototipos/) | Os quatro protótipos navegáveis, em HTML. |
| [`prototipos/capturas/`](prototipos/capturas/) | Captura de cada protótipo em PNG, para consulta rápida sem abrir o navegador. |
| [`marca/`](marca/) | Logo em SVG e o avatar de exemplo usado nas telas. |

## As quatro telas

Na ordem da jornada de uso, não na ordem da navegação inferior:

1. **[Upload de prescrição](prototipos/01-upload-prescricao.html)** — importa o plano da
   nutricionista e mostra o que foi reconhecido. Porta de entrada do app.
2. **[Dieta](prototipos/02-dieta.html)** — o dia de hoje: refeições com horário, o que já
   foi consumido e a próxima refeição em destaque. Tela inicial depois do primeiro uso.
3. **[Mercado](prototipos/03-mercado.html)** — a lista de compras agrupada por corredor,
   com estimativa de custo e progresso das compras.
4. **[Despensa](prototipos/04-despensa.html)** — o que já tem em casa e as receitas que
   dá para fazer com isso.

A navegação inferior tem quatro abas: **Dieta · Mercado · Despensa · Economia**.
A aba Economia ainda não tem protótipo.

Para abrir, é só apontar o navegador para o arquivo:

```bash
xdg-open docs/design/prototipos/02-dieta.html
```

## Ao ler os protótipos

- **São protótipos, não código do app.** São HTML com Tailwind via CDN, gerados como
  referência visual. O app é React Native (etapa 8) — o que se aproveita daqui é o
  sistema de design e o comportamento das telas, não o markup.
- **As imagens são remotas e vão quebrar.** Fotos de comida, avatar e logo apontam para
  URLs do Google que não são permanentes. A logo em vetor e o avatar estão salvos em
  [`marca/`](marca/); as fotos de comida são ilustrativas e não fazem parte do produto.
- **Os dados são fictícios.** Marina, a Dra. Camila Fernandes, os preços e as receitas
  são exemplos de tela. Nenhum preço ali foi coletado de mercado real.

## Quando o texto e os tokens divergirem, valem os tokens

O `sistema-de-design.md` tem duas partes: o bloco de tokens no cabeçalho (YAML) e a
prosa que explica cada decisão. Os dois discordam em alguns valores — a prosa cita
`#D97706` para a secundária e `#FBFBFA` para a superfície, enquanto os tokens usam
`#904d00` e `#f6fbf5`.

**Vale o bloco de tokens**, porque é ele que os protótipos realmente renderizam. A prosa
descreve a intenção da cor; o token é a cor.
