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
> A autenticação existe e o app tem tela de login, que **nenhum protótipo previu** —
> nenhuma das quatro telas mostra como a pessoa entra no aplicativo. Ela foi montada
> com os mesmos tokens do sistema de design.
>
> O app em `mobile/` implementa a jornada principal: login, upload, confirmação,
> lista de compras e despensa — esta com as receitas ordenadas por
> disponibilidade dentro dela, e Economia. As quatro abas têm tela.

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
| `GET /products/search` | produtos parecidos com um texto livre, para o cadastro da despensa |
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

**O relatório do descarte ganhou lugar na tela.** O import devolve as linhas que ignorou
e o motivo ("cabeçalho de refeição", "número de página", "texto de orientação"). O
protótipo não tinha onde exibir isso; o app mostra a lista depois do envio, com o aviso
de conferir se alguma delas era comida. Sem esse espaço, uma linha mal interpretada
viraria comida sumindo do plano sem a pessoa saber.

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
| Marcar "já comprei" | ✅ | `purchased_at` em `ShoppingListItem`, gravado por `PATCH /shopping-lists/{id}/items/{item_id}` |
| Progresso "14 de 22 (63%)" | ✅ | A tela conta sobre os itens; o servidor devolve o fato de cada um, não o agregado |
| "8 itens dispensados da compra" | ✅ | Item dispensado fica na lista com quantidade zero (`dispensed_by_pantry`) |
| Previsão mensal ~ R$ 690,00 | ⛔ | Projeção; a base semanal existe |
| "Dica de economia da semana" | ⛔ | Ver divergência 3 |
| Adicionar item avulso | 🔨 | Exige `plan_item_id` nulo em `ShoppingListItem`; a rota ainda não existe |
| Exportar para WhatsApp | ⛔ | |

**O item comprado é do servidor, não da tela.** `purchased_at` guarda o instante
em que a pessoa marcou, e não um booleano: sair da tela e voltar não perde o
progresso da compra, e fica registrado *quando* cada item entrou no carrinho. A
marcação é otimista na interface — quem está no corredor do mercado não pode ver
o toque esperar a rede —, mas quem manda é a resposta do servidor: se ela falhar,
o item volta a aparecer como não comprado.

Item que a despensa dispensou também aceita marcação. O servidor guarda o fato e
a tela é que decide não oferecer o botão; a contagem do progresso conta só entre
os itens que havia para comprar.

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
| Lista do que tem em casa | ✅ | Tela pronta: chips com remoção |
| Adicionar e remover item | ✅ | Digita, escolhe o produto do catálogo e salva |
| Quantidade do que se tem em casa | 🔨 | A tela envia só descrição e produto. **Sem quantidade a compra não é abatida** e a aba Economia fica em zero |
| "3 receitas 100% compatíveis" | ✅ | Tela ordena por disponibilidade |
| "85% disponível (falta chia)" | ✅ | Percentual, barra e "Falta: …" na tela |
| "+ Chia" → lista de mercado | 🔨 | **Fora da beta.** Depende da rota de item avulso, que não existe |
| Fotos das receitas | ⛔ | Não há campo de imagem em `Recipe` |
| "Economia estimada: R$ 14,00" | ⛔ | Ver divergência 4 |
| "Desperdício Zero +R$ 42" | ⛔ | Aba Economia |
| Validade / "itens perto da validade" | ⛔ | `PantryItem` no MVP guarda item e quantidade, sem validade |

**Item da despensa sem produto do catálogo não abate da compra.** Por isso o cadastro
pede a escolha do produto: digita, o app busca no catálogo por semelhança de nome e a
pessoa toca no produto certo. Guardar só como texto continua possível, para o que não
existe no catálogo — e nesse caso a tela marca o chip com contorno tracejado e avisa
quantos itens estão assim.

O protótipo mostrava o cadastro num toque só. Ele não previa que um item sem produto
não faz nada: nem desconta da lista, nem conta para as receitas.

**O que conta como disponível.** A porcentagem soma duas fontes: a despensa e a lista
de compras corrente. "100% disponível" quer dizer que a receita não exige nenhuma ida
extra ao mercado, não que tudo já esteja em casa — se a tela precisar separar as duas
coisas, `suggest_recipes` aceita ser chamada sem lista.

O percentual é a proporção de ingredientes **obrigatórios** disponíveis: 3 de 4 são 75%.
Ingrediente opcional não entra na conta. Item da despensa sem quantidade conta como
disponível — regra oposta à da lista de compras, onde item sem quantidade não abate
nada, porque aqui o custo do erro é uma sugestão imprecisa, não uma compra a menos.

## 5. Economia

Não tem protótipo. A tela mostra só conta que o servidor sabe fazer:

| A tela mostra | Backend | Observação |
|---|---|---|
| "A despensa poupou R$ X" | ✅ | `ShoppingListItem.pantry_savings`, somado na lista |
| Total estimado da compra | ✅ | `ShoppingList.estimated_total` |
| Já no carrinho · ainda falta | ✅ | Soma de `estimated_cost` dos itens com `purchased` |
| Itens com preço · sem preço na região | ✅ | Contagem sobre os itens |
| Selo do preço mais fraco da lista | ✅ | `price_confidence` e `price_reference_date` |
| Sair da conta | ✅ | Fica no rodapé desta aba |
| Desperdício evitado · previsão mensal | ⛔ | Ver divergência 4: não há conta que os sustente |

**A economia da despensa é uma diferença, não uma multiplicação.** O `estimated_cost` já
é calculado sobre a quantidade descontada. Multiplicar `quantity_from_pantry` pelo preço
daria número errado para produto embalado: quem precisa de 1 L e tem 200 ml em casa leva
a caixa de 1 L do mesmo jeito, e não poupou nada. A conta é

> o que custaria a quantidade prescrita inteira **−** o que de fato se compra

respeitando o arredondamento para embalagem fechada do
[`_quantity_to_charge`](../../backend/app/services/pricing.py). Para item a granel dá a
proporção; para embalado que não reduziu o número de pacotes dá zero, que é a verdade.
Item sem preço fica com economia **nula**, não zero — nulo é "não sei", zero é "não
poupou".

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

**4. Números de economia sem base.** ~~"Evitou desperdício de R$ 14,00" e "+R$ 42"~~ —
**resolvida definindo a conta, não omitindo o número.** A economia da despensa tem base:
é a diferença entre o custo da prescrição inteira e o da compra descontada, descrita na
seção 5 e testada em `tests/test_pricing.py`.

O que continua de fora é o **desperdício evitado**, que exigiria saber o que foi consumido
antes de vencer — e `PantryItem` não guarda validade. Esse número segue sem aparecer.

**5. Consentimento ausente no upload.** Descrito na seção 1. O backend já não permite
gravar plano sem consentimento; a tela é que ainda não tem o passo de aceite.

---

## Resumo do que entra no MVP

**Entra:** despensa (`PantryItem`) e o desconto dela na lista de compras; import de plano
por PDF com texto; agrupamento por corredor; marcar item como comprado; receitas com
percentual de disponibilidade; aba Economia com o que a despensa poupou.

**Fica fora:** refeições com horário e status, hidratação, carrossel semanal, OCR de foto,
projeção mensal, métricas de desperdício, dicas de substituição geradas pelo app, validade
de item da despensa, exportação para WhatsApp e fotos de receita.
