# O que cada tela exige do backend

Mapa entre os protótipos e o código. Serve para responder duas perguntas antes de
implementar qualquer tela: *o que falta no backend?* e *isto entra no MVP?*

Legenda:

- ✅ **existe** — a regra de negócio já está implementada e testada
- 🔨 **falta** — entra no MVP, ainda não foi feito
- ⛔ **fora do MVP** — documentado, fica para depois

> **As rotas existem desde a etapa 9.** Onde este documento diz ✅, há regra de
> negócio em `app/services/` e rota HTTP que a expõe. A lista de rotas está no
> [README](../../README.md#rotas). Falta o app mobile que as consome.
>
> Até a etapa 10 as rotas identificam o usuário pelo cabeçalho `X-User-Id`, e não
> por autenticação de verdade.

## O que já está pronto no backend

| Camada | O que tem |
|---|---|
| Modelos | `User`, `MealPlan`, `PlanItem`, `Product`, `Market`, `PriceRecord`, `ShoppingList`, `ShoppingListItem`, `Recipe`, `RecipeIngredient`, `PantryItem` |
| `services/text.py` | normalização de texto para comparação |
| `services/units.py` | conversão para a unidade base do produto (kg, l, unidade) |
| `services/parsing.py` | leitura de uma linha do plano: quantidade + unidade + descrição |
| `services/matching.py` | casamento item do plano ↔ produto do catálogo, com score |
| `services/pricing.py` | média, mediana e desvio por região; custo da lista de compras |
| `services/pantry.py` | quanto da compra a despensa já cobre, com abatimento parcial |
| `services/shopping.py` | geração da lista: casamento confirmado, desconto da despensa e preço |
| `services/recipes.py` | disponibilidade de receita pela despensa somada à lista de compras |
| `services/pdf.py` | texto de PDF pesquisável; recusa arquivo digitalizado |
| `services/import_plan.py` | PDF → plano alimentar, com consentimento e relatório do descarte |

---

## 1. Upload de prescrição

[Protótipo](prototipos/01-upload-prescricao.html) · [captura](prototipos/capturas/01-upload-prescricao.png)

| A tela mostra | Backend | Observação |
|---|---|---|
| Escolher PDF | ✅ | `import_plan.import_plan_from_pdf` (etapa 8) |
| Tirar foto | ⛔ | Exige OCR. **O botão não entra no MVP** — some da tela ou fica desabilitado com aviso |
| Nome e CRN da nutricionista | 🔨 | `nutritionist_name` é parâmetro de quem importa, não é detectado no PDF; **CRN não tem campo** |
| "Plano de 4 semanas • Foco: Energia" | ⛔ | Não há duração nem objetivo no modelo |
| "5 refeições diárias organizadas" | ⛔ | Depende de `Meal`, que está fora do MVP |
| "28 itens mapeados" | ✅ | `ImportedPlan.items_matched` |
| "100% válido" | ✅ | `ImportedPlan.items_unidentified == 0` |
| "Custo semanal estimado R$ 168,50" | ✅ | `pricing.price_shopping_list` — mas veja as divergências abaixo |
| Confirmar e gerar lista | ✅ | `shopping.generate_shopping_list` (etapa 6) |

**Falta um passo de consentimento na tela.** `import_plan_from_pdf` exige `consent_at`
como argumento obrigatório e sem valor padrão: desde a etapa 8 não existe caminho de
código que grave um plano sem registrar quando a pessoa aceitou o termo (decisão 5, LGPD).
A versão do termo vem de `CONSENT_VERSION`. O protótipo, porém, vai direto do upload para
o resultado — a tela precisa de um aceite antes de enviar o arquivo, senão não há o que
passar para a função.

**Falta onde mostrar o que foi descartado.** O import devolve as linhas que ignorou e o
motivo ("cabeçalho de refeição", "número de página", "texto de orientação"). Nada some em
silêncio no backend, mas o protótipo não tem lugar para exibir isso. Sem esse espaço, uma
linha mal interpretada vira comida que some do plano sem a pessoa saber.

## 2. Dieta

[Protótipo](prototipos/02-dieta.html) · [captura](prototipos/capturas/02-dieta.png)

| A tela mostra | Backend | Observação |
|---|---|---|
| Carrossel da semana | ⛔ | Depende de `Meal` com data |
| "Refeições 3/5 · 60% cumprido" | ⛔ | Depende de registro de consumo |
| Água 1.8 / 2.5 L | ⛔ | Não é do domínio do app hoje |
| Linha do dia com horário e "Feito/Pendente" | ⛔ | Depende de `Meal` |
| Texto de cada refeição | ✅ | `PlanItem.raw_description` |
| "Tudo disponível na sua despensa!" | ✅ | `pantry.coverage`, campo `fully_covered` |
| Substituições autorizadas | ⛔ | Ver divergência 3 |
| Card "Mercado Inteligente · ~ R$ 42,80" | ✅ | `ShoppingList.estimated_total` |

**No MVP esta tela vira a lista dos itens prescritos do plano ativo**, sem horário, sem
status e sem carrossel — com o card de custo e o atalho para a lista de compras.

Para implementar a tela completa depois: um modelo `Meal` (plano, dia, horário, tipo) com
os `PlanItem` pendurados nele, mais um registro de consumo (refeição, data, horário do
aceite). O parser precisaria reconhecer os cabeçalhos de refeição do PDF, não só as linhas
de item.

## 3. Mercado

[Protótipo](prototipos/03-mercado.html) · [captura](prototipos/capturas/03-mercado.png)

| A tela mostra | Backend | Observação |
|---|---|---|
| Agrupamento por corredor | ✅ | `Product.category` já existe e o catálogo já usa `hortifruti`, `proteinas`, `laticinios`, `mercearia` — falta só o rótulo de exibição |
| "Est. R$ 5,50" por item | ✅ | `ShoppingListItem.estimated_cost` |
| "R$ 174,20 / 7 dias" | ✅ | `ShoppingList.estimated_total` |
| Marcar "já comprei" | 🔨 | Campo novo em `ShoppingListItem` (ex.: `purchased_at`) |
| Progresso "14 de 22 (63%)" | 🔨 | Contagem sobre o campo acima |
| "8 itens dispensados da compra" | ✅ | Item dispensado fica na lista com quantidade zero (`dispensed_by_pantry`) |
| Previsão mensal ~ R$ 690,00 | ⛔ | Projeção; a base semanal existe |
| "Dica de economia da semana" | ⛔ | Ver divergência 3 |
| Adicionar item avulso | 🔨 | Exige `plan_item_id` nulo em `ShoppingListItem`; a rota ainda não existe |
| Exportar para WhatsApp | ⛔ | |

O mapa de rótulos, para não inventar categoria nova no banco:

| `Product.category` | Rótulo na tela |
|---|---|
| `hortifruti` | Hortifrúti |
| `proteinas` | Carnes & Ovos |
| `laticinios` | Laticínios |
| `mercearia` | Mercearia & Grãos |

## 4. Despensa

[Protótipo](prototipos/04-despensa.html) · [captura](prototipos/capturas/04-despensa.png)

| A tela mostra | Backend | Observação |
|---|---|---|
| Lista do que tem em casa | ✅ | `PantryItem` e `services/pantry.py` (etapa 5) |
| Adicionar e remover item | ✅ | `POST` e `DELETE /pantry` |
| "3 receitas 100% compatíveis" | ✅ | `recipes.suggest_recipes` com `minimum_percentage=100` |
| "85% disponível (falta chia)" | ✅ | `RecipeAvailability.percentage` e `.missing` (etapa 7) |
| "+ Chia" → lista de mercado | 🔨 | `missing` já diz o que falta; depende da rota de item avulso |
| Fotos das receitas | ⛔ | Não há campo de imagem em `Recipe` |
| "Economia estimada: R$ 14,00" | ⛔ | Ver divergência 4 |
| "Desperdício Zero +R$ 42" | ⛔ | Aba Economia |
| Validade / "itens perto da validade" | ⛔ | `PantryItem` no MVP guarda item e quantidade, sem validade |

**O que conta como disponível.** A porcentagem soma duas fontes: a despensa e a lista
de compras corrente. "100% disponível" quer dizer que a receita não exige nenhuma ida
extra ao mercado, não que tudo já esteja em casa — se a tela precisar separar as duas
coisas, `suggest_recipes` aceita ser chamada sem lista.

O percentual é a proporção de ingredientes **obrigatórios** disponíveis: 3 de 4 são 75%.
Ingrediente opcional não entra na conta. Item da despensa sem quantidade conta como
disponível — regra oposta à da lista de compras, onde item sem quantidade não abate
nada, porque aqui o custo do erro é uma sugestão imprecisa, não uma compra a menos.

## 5. Economia

Não tem protótipo. No MVP a aba fica como tela informativa simples, reaproveitando o que
o cálculo de preço já devolve: total estimado da lista, quantos itens têm preço, quantos
não têm e o selo de confiança do preço mais fraco.

---

## Divergências entre o protótipo e as decisões do projeto

Estas cinco precisam ser resolvidas na implementação — o protótipo, como está, contraria
decisões já tomadas.

**1. Preço aparece sem data e sem origem.** As telas mostram "Est. R$ 5,50" e "R$ 174,20"
soltos. A decisão 1 exige que todo preço carregue data da coleta e origem, e que preço com
mais de 30 dias seja exibido como estimativa. O `pricing.py` já devolve tudo isso
(`price_reference_date`, `price_origin`, `price_confidence`); a tela é que precisa mostrar
— ao menos um selo de confiança na lista e data + origem no detalhe do item.

**2. Região fixa.** A tela de upload diz "baseado na feira e mercados locais de São Paulo".
A decisão 2 é média **por região**, e a região tem que vir do usuário — o catálogo de
desenvolvimento é do DF. O texto da tela não pode ser fixo.

**3. O app opinando sobre a dieta.** A tela de Mercado sugere "substituir morango fresco
por banana ou mamão" como dica de economia. Isso é o app alterando uma prescrição, o que
a decisão 4 proíbe. A tela de Dieta faz certo: lista "opções autorizadas pela Nutri
Camila". Regra: **substituição só existe se veio da nutricionista.** Economia se mostra
comparando preços do mesmo item, nunca trocando o alimento prescrito.

**4. Números de economia sem base.** "Evitou desperdício de R$ 14,00" e "+R$ 42" não têm
como ser calculados com o que o modelo guarda, e a decisão de nunca inventar dado de preço
vale também para dado de economia. Ou se define a conta (o que entrou na despensa, a que
preço, e o que foi consumido antes de vencer) ou o número não aparece.

**5. Consentimento ausente no upload.** Descrito na seção 1. O backend já não permite
gravar plano sem consentimento; a tela é que ainda não tem o passo de aceite.

---

## Resumo do que entra no MVP

**Entra:** despensa (`PantryItem`) e o desconto dela na lista de compras; import de plano
por PDF com texto; agrupamento por corredor; marcar item como comprado; receitas com
percentual de disponibilidade.

**Fica fora:** refeições com horário e status, hidratação, carrossel semanal, OCR de foto,
projeção mensal, métricas de desperdício, dicas de substituição geradas pelo app, validade
de item da despensa, exportação para WhatsApp e fotos de receita.
