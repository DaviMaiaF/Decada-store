# Roteiro de demonstração

Cinco minutos, o produto inteiro. Números conferidos contra o catálogo de
desenvolvimento — se os seus baterem com os daqui, está tudo funcionando.

## Antes de começar

```bash
docker compose up -d
cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seeds
```

O seed imprime as credenciais da conta de demonstração ao terminar.

Em dois terminais:

```bash
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --reload
```

```bash
cd mobile && npx expo start
```

| | |
|---|---|
| conta | `beta@example.com` · `decada-beta-2026` |
| plano de exemplo | [`plano-exemplo.pdf`](plano-exemplo.pdf) |

O PDF é fictício e foi feito para ser lido bem: um item por linha. Plano real
costuma quebrar o item em duas linhas e ter parágrafos de substituição, e o
filtro de ruído ainda não dá conta disso — está registrado em
[`../design/telas.md`](../design/telas.md).

## O roteiro

**1. Entrar.** A tela diz, antes de qualquer coisa, que a DÉCADA não prescreve
dieta. É a decisão nº 4 do projeto aparecendo na primeira tela.

**2. Aba Dieta — enviar o plano.** Escolha o PDF, marque o aceite e envie.
Repare que o botão só libera com o aceite marcado: sem consentimento explícito
não existe caminho no código que grave um plano alimentar.

Resultado esperado:

| | |
|---|---|
| itens lidos | 15 |
| encontrados no mercado | 15 |
| linhas descartadas | 10 |

As 10 descartadas aparecem com o motivo — nome da nutricionista, CRN, horário
das refeições, número de página, o parágrafo de orientação. **Nada some em
silêncio**, e esse é o ponto a mostrar: se uma linha de comida fosse descartada
por engano, a pessoa veria.

**3. Confirmar os produtos.** "Ovos de galinha" casa com o produto do catálogo,
mas quem confirma é o usuário — o casamento nunca é automático. Confirme alguns
itens e mostre o contador subindo.

**4. Aba Mercado — gerar a lista.** Com os 15 itens confirmados:

| | |
|---|---|
| total estimado | **R$ 110,95** |
| itens com preço | 15 |
| corredores | Hortifrúti 5 · Mercearia 4 · Laticínios 3 · Carnes & Ovos 3 |

Abra um item e mostre a linha embaixo do preço: **"coletado há 3 dias · dado
fictício de desenvolvimento · 6 coleta(s)"**. Nenhum preço aparece sozinho —
sempre com data, origem e tamanho da amostra. É a decisão nº 1 do projeto.

**5. Aba Despensa — o que já tem em casa.** Digite `aveia em flocos`, toque no
`+`, escolha "Aveia em flocos" (aparece com 100% de semelhança). As receitas
que usam aveia sobem de 0% para 33% na hora.

Adicione `banana prata` e `ovos de galinha` do mesmo jeito e a **Panqueca de
aveia e banana chega a 100%**.

**6. Voltar ao Mercado e gerar a lista de novo.** Agora os itens que estão na
despensa aparecem descontados, e o total cai.

## O que dizer sobre o que falta

- A aba **Economia** ainda não tem tela.
- Leitura de **NFC-e por QR Code** está fora do MVP.
- Item da despensa **já salvo** não pode ser vinculado depois ao catálogo.
- O filtro de ruído do PDF foi calibrado em planos simples; plano real ainda
  exige ajuste.

Todos os dados de catálogo, preço e receita são **fictícios** e estão marcados
como tal no banco.
