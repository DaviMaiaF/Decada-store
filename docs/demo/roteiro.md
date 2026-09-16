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

**6. Voltar ao Mercado e gerar a lista de novo.** O total continua em
**R$ 110,95**, e é preciso explicar por quê: o abatimento da compra exige saber
*quanto* se tem em casa, e a tela de Despensa ainda cadastra o item sem
quantidade. O desconto existe e está testado no backend — só não há como
informar a quantidade pela interface. Para as receitas, item sem quantidade
conta como disponível; para a compra, não abate nada. É a regra oposta, e de
propósito: numa sugestão o custo do erro é uma receita imprecisa, numa compra é
comida de menos.

**7. Aba Economia.** Mostra o total da compra, quanto já foi para o carrinho e
o que a despensa poupou. Pelo motivo do passo anterior, a economia aparece como
**R$ 0,00** — e a tela diz por quê em vez de exibir um número inventado.

Com quantidade informada, o cálculo funciona: os mesmos 15 itens com meio quilo
de aveia e uma dúzia de ovos em casa dão **R$ 90,93** de lista e **R$ 20,02**
de economia. Dá para mostrar isso pela API enquanto a tela não tem o campo.

## O que dizer sobre o que falta

- A tela de **Despensa não informa quantidade**, então o abatimento da compra
  e a economia não aparecem pela interface. O backend faz os dois.
- **Desperdício evitado** continua fora: exigiria validade no item da despensa.
- Leitura de **NFC-e por QR Code** está fora do MVP.
- Item da despensa **já salvo** não pode ser vinculado depois ao catálogo.
- O filtro de ruído do PDF foi calibrado em planos simples; plano real ainda
  exige ajuste.

Todos os dados de catálogo, preço e receita são **fictícios** e estão marcados
como tal no banco.
