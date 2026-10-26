# O que cada tela exige do backend

Mapa entre os protótipos e o código. Serve para responder duas perguntas antes de
implementar qualquer tela: *o que falta no backend?* e *isto entra no MVP?*

Legenda:

- ✅ **existe** — a regra de negócio já está implementada e testada
- 🔨 **falta** — entra no MVP, ainda não foi feito
- ⛔ **fora do MVP** — documentado, fica para depois

> **As rotas existem desde a etapa 9.** Onde este documento diz ✅, há regra de
> negócio em `app/services/` e rota HTTP que a expõe, e o app já a consome. A lista
> de rotas está no [README](../../README.md#rotas).
>
> A autenticação existe e o app tem tela de login, que **nenhum protótipo previu** —
> nenhuma das quatro telas mostra como a pessoa entra no aplicativo. Ela foi montada
> com os mesmos tokens do sistema de design.
>
> O app em `mobile/` implementa a jornada principal: login, upload, confirmação,
> lista de compras e despensa — esta com as receitas ordenadas por
> disponibilidade dentro dela, e Economia. As quatro abas têm tela.
>
> Cada tela tem um ViewModel em `mobile/src/viewmodels/` com o estado e as chamadas à
> API; a tela só desenha (ver [`arquitetura-mvvm.md`](../arquitetura-mvvm.md)). Implementar
> uma tela nova é escrever os dois, e o teste do ViewModel junto.
>
> Há também a **área da nutricionista** (seção 6), que nenhum protótipo previu: o
> login escolhe o papel, e a conta de nutricionista monta planos alimentares no
> formato do Dietbox e os entrega ao paciente.

## O que já está pronto no backend

| Camada | O que tem |
|---|---|
| Modelos | `User`, `MealPlan`, `PlanItem`, `Product`, `Market`, `PriceRecord`, `ShoppingList`, `ShoppingListItem`, `Recipe`, `RecipeIngredient`, `PantryItem`, `Prescription`, `PrescriptionMeal`, `PrescriptionItem`, `Payment` |
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
| `POST` · `DELETE` em `/shopping-lists/{id}/items` | item avulso: entra na compra, e só ele pode sair |
| `services/import_plan.py` | PDF → plano alimentar, com consentimento e relatório do descarte |
| `GET /meal-plans` · `GET /meal-plans/{id}/shopping-lists` | o que o usuário já tem, sem os itens: é como o app reabre onde parou |
| `services/prescriptions.py` | plano da nutricionista: edição, envio, aceite com cópia para o paciente, texto do documento |
| `services/pdf_writer.py` | PDF com texto, de várias páginas, no formato que o import lê |
| `services/payment_gateway.py` · `/shopping-lists/{id}/payments` | pagamento **simulado** da lista, no molde do Mercado Pago: Pix com BR Code fictício e cartão que responde pelo titular de teste. Nada é cobrado |
| `services/pantry_photo.py` · `POST /pantry/photo` | foto do que se tem em casa → alimentos reconhecidos, cada um com os produtos do catálogo que podem ser ele. Só propõe, não grava |

---

## 1. Upload de prescrição

[Protótipo](prototipos/01-upload-prescricao.html) · [captura](prototipos/capturas/01-upload-prescricao.png)

| A tela mostra | Backend | Observação |
|---|---|---|
| Plano enviado pela nutricionista | ✅ | Aparece **antes** do envio de PDF, só quando há algum: quem assinou, o plano inteiro para ler, o mesmo termo de consentimento e os botões de aceitar e recusar. Aceitar segue para a confirmação, como depois de um import. Ver seção 6 |
| Escolher PDF | ✅ | `import_plan.import_plan_from_pdf` (etapa 8) |
| Tirar foto | ⛔ | Exige OCR **da prescrição**. **O botão não entra no MVP** — some da tela ou fica desabilitado com aviso. Não confundir com a foto da despensa (seção 4), que é foto de comida, não de documento |
| Nome e CRN da nutricionista | ✅ | `nutritionist_name` e `nutritionist_crn` são campos opcionais da tela de upload, informados por quem importa — nenhum dos dois é detectado no PDF |
| "Plano de 4 semanas • Foco: Energia" | ⛔ | Não há duração nem objetivo no modelo |
| "5 refeições diárias organizadas" | ⛔ | O plano importado por PDF continua sem refeições. O montado no app as tem, mas só para ler (`prescribed_meals`) |
| "28 itens mapeados" | ✅ | `ImportedPlan.items_matched` |
| "100% válido" | ✅ | `ImportedPlan.items_unidentified == 0` |
| "Custo semanal estimado R$ 168,50" | ✅ | `pricing.price_shopping_list` — mas veja as divergências abaixo |
| Confirmar e gerar lista | ✅ | `shopping.generate_shopping_list` (etapa 6) |

**O consentimento é um passo da tela.** `import_plan_from_pdf` exige `consent_at` como
argumento obrigatório e sem valor padrão: desde a etapa 8 não existe caminho de código que
grave um plano sem registrar quando a pessoa aceitou o termo (decisão 5, LGPD). A versão do
termo vem de `CONSENT_VERSION`. O protótipo ia direto do upload para o resultado; a tela
ganhou o aceite antes do envio, e o botão de enviar só libera com ele marcado.

**O plano é reencontrado ao reabrir.** Os ids do plano e da lista viviam no estado da tela:
recarregar a página mandava a pessoa de volta para o envio de um PDF cujo plano já estava
no banco. A partida consulta `GET /meal-plans`, e havendo plano a aba Dieta abre na
confirmação, com "Enviar outro plano" como saída. A verdade fica no servidor, e não no
aparelho: guardar o id localmente não sobreviveria à troca de aparelho e deixaria um
ponteiro para dado sensível de saúde no dispositivo, contra a minimização da decisão 5.

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
| Substituições autorizadas | ✅ | Só no plano montado pela nutricionista no app: "Ver refeições e substituições" na confirmação. Vêm dela, então aparecem (decisão 8); não vão para a compra. No plano por PDF, o import as descarta e elas não aparecem |
| Card "Mercado Inteligente · ~ R$ 42,80" | ✅ | `ShoppingList.estimated_total` |

**No MVP esta tela vira a lista dos itens prescritos do plano ativo**, sem horário, sem
status e sem carrossel — com o card de custo e o atalho para a lista de compras.

Para implementar a tela completa depois: um modelo `Meal` (plano, dia, horário, tipo) com
os `PlanItem` pendurados nele, mais um registro de consumo (refeição, data, horário do
aceite). O parser precisaria reconhecer os cabeçalhos de refeição do PDF, não só as linhas
de item.

**A confirmação aceita lote e edição.** Um plano de quinze itens pedia quinze toques em
"Confirmar". A tela ganhou caixas de seleção, "Selecionar sugeridos (N de M)" e "Confirmar
selecionados" (o "de M" deixa claro que o lote é só parte da lista). O lote confirma a sugestão principal de cada item marcado, com uma chamada
de `POST …/items/{id}/confirmation` por item. Se uma falhar, só aquele item avisa e continua
marcado. Só entra no lote o item **a confirmar**. Ficam de fora o **não encontrado**
(o melhor candidato ficou abaixo do score mínimo do casamento; na primeira versão ele
entrava, e um plano real teve "Tapioca" confirmada como filé de tilápia num toque só), o
de **unidade diferente** e o **sem sugestão**: é onde o casamento por nome mais erra, e a
confirmação deles continua sendo um toque por item. Nada é marcado sem a pessoa marcar (decisão 4). Item confirmado ganhou "Editar", que
abre os candidatos com o produto atual destacado e reconfirma com o escolhido. O backend
não mudou: a rota de confirmação já sobrescrevia a anterior.

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
| Adicionar item avulso | ✅ | Busca no catálogo, quantidade na unidade do produto, e o item entra no corredor dele |
| Escolher a região antes de gerar | ✅ | UF e cidade na tela, lembradas entre sessões; resolve a divergência 2 |
| Aviso quando a região não tem preço | ✅ | Nenhum item com `estimated_cost` quer dizer região sem coleta, e a tela diz isso |
| Simular a compra sem um item | ✅ | Soma local em `services/simulation.ts`; não altera a lista |
| Simular outra quantidade | ✅ | `POST /shopping-lists/{id}/simulation`: a conta da embalagem é do servidor |
| Finalizar compra | ✅ | **Simulada**: `CheckoutScreen` avisa que os valores são fictícios e nenhum pedido é feito. Tem duas etapas, o resumo e o pagamento; aprovado o pagamento, marca como comprados os itens que faltavam (o mesmo `PATCH` do "já comprei"), mostra o ícone de sucesso animado e leva à tela de início |
| Pagamento simulado | ✅ | Pix (QR, copia-e-cola e "simular pagamento recebido") ou cartão de crédito com os titulares de teste do Mercado Pago. `POST /shopping-lists/{id}/payments`; ver abaixo |
| Aviso de lista desatualizada | ✅ | `GET /shopping-lists/{id}` devolve `outdated_items`: produto trocado, item que deixou de estar confirmado ou confirmado depois da geração. Mercado e checkout avisam e oferecem "Gerar lista atualizada" na mesma região; a lista salva nunca se corrige sozinha |
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

**O item avulso muda a compra, nunca a prescrição.** O que a receita pede e o que
acabou em casa entram na lista de compras sem passar pelo plano alimentar: o
`plan_item_id` fica nulo, e é ele que separa o que a nutricionista mandou comprar do
que a pessoa decidiu levar. Por isso só o avulso pode ser removido depois — tirar da
lista um alimento prescrito seria o aplicativo opinando sobre a dieta, que a decisão 4
proíbe. Para ver a compra sem um item prescrito existe a simulação, que não grava.

A despensa abate o avulso como abate qualquer item: ter chia em casa não deixa de ser
verdade porque o pedido partiu do usuário. O que garante que o mesmo estoque não seja
abatido duas vezes é o produto entrar na lista uma vez só — pedir um produto que já
está lá responde 409 em vez de criar uma segunda linha.

Na tela, acrescentar tem os mesmos dois passos do cadastro da despensa — escolher o
produto do catálogo e dizer quanto —, e pela mesma razão: item sem produto não tem preço,
e quantidade em grandeza que o produto não usa não vira compra nenhuma. O item avulso
aparece no corredor dele, marcado como **fora da prescrição**, e é o único com "Tirar da
lista" — que fica por último no cartão, depois das ações de simular, porque remover é a
única ali que não se desfaz sozinha.

Acrescentar um item **não reprecifica a lista**. Só o item novo recebe preço; o que a
geração congelou continua congelado, e `calculated_at` não se move, porque ele diz
quando a lista foi precificada e isso não aconteceu de novo. Reprecificar aqui faria o
total mudar por causa de uma coleta que chegou no meio, e não por causa do que a pessoa
acrescentou.

**A simulação não toca na lista nem na prescrição.** "E se eu não levar isto?" é
respondido somando os `estimated_cost` que sobraram, na própria tela: nada é enviado ao
servidor, a lista salva continua inteira e o item some apenas visualmente, desbotado em
vez de removido. A decisão 8 vale aqui também — o app pode comparar o custo do que foi
prescrito, nunca decidir que a pessoa não deve levar um alimento.

A soma é feita em centavos, com inteiros. Somar `Number("5.32") + Number("12.31")` em
ponto flutuante acumula erro e produz casas que não existem, justamente no número que a
pessoa usa para decidir a compra.

**Mexer na quantidade é pergunta para o servidor.** Dobrar um item não é dobrar o preço:
produto embalado sobe de pacote em pacote, e essa conta é do
[`quantity_to_charge`](../../backend/app/services/pricing.py). Fazê-la na tela seria copiar
regra de negócio para um lugar onde ela não tem teste, então a tela pergunta a
`POST /shopping-lists/{id}/simulation` e recebe o custo de cada item de volta. A soma
continua sendo do cliente: somar não é regra de negócio, arredondar embalagem é.

O preço usado é **o que a lista congelou**. Consultar de novo faria a simulação misturar
duas mudanças — a quantidade que a pessoa mexeu e a coleta que chegou no meio — e a
comparação deixaria de responder à pergunta feita.

**A diferença tem sinal.** Simular quantidade maior encarece a compra, e a tela diz "a
mais"; chamar isso de economia seria mentir para quem está decidindo o que levar.

**Região sem coleta não é lista errada.** O catálogo de desenvolvimento só tem preço em
Brasília e Taguatinga. Pedir a lista em outra cidade devolve os itens certos com preço
nulo, e o total em R$ 0,00 — dizer "sem preço" item a item não explica a causa. Quando
*nenhum* item tem preço, a tela nomeia a região e oferece as duas saídas honestas: gerar
em outra cidade, ou escanear a NFC-e para começar a formar o preço dali.

**O pagamento é simulado, e diz isso em toda tela.** Não há gateway, adquirente nem PSP:
o [`payment_gateway`](../../backend/app/services/payment_gateway.py) imita o Mercado Pago
para fechar o fluxo da demonstração, e a resposta da API carrega `simulated: true` para
a tela não ter como esquecer o aviso. O valor cobrado é o total estimado da lista,
**copiado** no pagamento — se a lista mudar depois, o que foi pago não muda.

- **Pix** nasce pendente, com um copia-e-cola no formato do BR Code (EMV, com CRC16) e o
  QR desenhado a partir dele. A chave é `simulado@decada.invalid`: o domínio `.invalid` é
  reservado e nunca existe, então nem o app de um banco de verdade consegue pagar o
  código. O recebimento é o botão "Simular pagamento recebido", que faz o papel do aviso
  que o PSP mandaria (`POST …/payments/{id}/confirmation`).
- **Cartão** responde na hora, pelo nome do titular, como os cartões de teste do Mercado
  Pago: `APRO` aprova, `OTHE`, `FUND`, `SECU`, `EXPI` e `CALL` recusam com motivos
  diferentes, `CONT` fica em análise até a mesma confirmação simulada. Qualquer outro
  nome aprova, como um cartão comum. O número passa pelo Luhn e precisa de bandeira
  conhecida (Visa, Mastercard, Amex, Elo, Hipercard); validade e tamanho do CVV também
  são conferidos. Os números de teste do Mercado Pago funcionam: `4235 6477 2802 5682`
  (Visa), `5031 4332 1540 6351` (Mastercard), `3753 651535 56885` (Amex).

**Recusado não é erro.** Cartão recusado responde 201 com `status: "recusado"`: a
tentativa existiu e fica no histórico, e a tela mostra o motivo e deixa tentar de novo.
Erro é o que o formulário de verdade também recusaria — número, validade ou CVV
inválidos —, que responde 422 e não grava nada.

**Uma lista é paga uma vez.** Pode haver várias tentativas, mas o banco só aceita um
pagamento aprovado por lista (índice único parcial), e a API responde 409 a quem tentar
de novo — inclusive ao Pix que ficou pendente enquanto o cartão aprovava. Ao reabrir uma
lista já paga, a etapa de pagamento oferece só "Concluir compra", que é também a saída
quando a marcação dos itens falhou depois da aprovação.

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
| Adicionar e remover item | ✅ | Digita, escolhe o produto do catálogo e diz quanto tem |
| Quantidade do que se tem em casa | ✅ | Segundo passo do cadastro, já preenchido com a embalagem do produto; continua podendo ficar em branco |
| Corrigir item já salvo | ✅ | Tocar no chip abre o mesmo par produto + quantidade (`PATCH /pantry/{id}`) |
| Encher a despensa por foto | ✅ | Não estava no protótipo. Câmera ou galeria; o app diz o que viu e a pessoa confirma, troca o produto ou descarta cada item (`POST /pantry/photo`) |
| "3 receitas 100% compatíveis" | ✅ | Tela ordena por disponibilidade, contando despensa **e** lista de compras |
| "85% disponível (falta chia)" | ✅ | Percentual, barra e "Falta: …" na tela |
| "+ Chia" → lista de mercado | ✅ | Um botão por ingrediente que falta, na quantidade que a receita pede |
| Fotos das receitas | ⛔ | Não há campo de imagem em `Recipe` |
| "Economia estimada: R$ 14,00" | ⛔ | Ver divergência 4 |
| "Desperdício Zero +R$ 42" | ⛔ | Aba Economia |
| Validade / "itens perto da validade" | ⛔ | `PantryItem` no MVP guarda item e quantidade, sem validade |

**O que já está na lista não vira botão.** A receita pode acusar falta de um ingrediente
que já está na compra — falta porque ela pede mais do que a lista traz, não porque ninguém
o comprou. Oferecer "+ ovos" ali levaria direto ao 409, então a tela troca o botão por uma
linha que diz o que está acontecendo: *"Ovos de galinha já está na sua lista, em quantidade
menor do que esta receita pede."* O botão fica só para o que de fato pode entrar.

Para saber disso a tela lê a lista corrente pela mesma chave de cache do Mercado, sem
requisição nova — como a trilha já fazia.

**Item da despensa sem produto do catálogo não abate da compra.** Por isso o cadastro
pede a escolha do produto: digita, o app busca no catálogo por semelhança de nome e a
pessoa toca no produto certo. Guardar só como texto continua possível, para o que não
existe no catálogo — e nesse caso a tela marca o chip com contorno tracejado e avisa
quantos itens estão assim.

O protótipo mostrava o cadastro num toque só. Ele não previa que um item sem produto
não faz nada: nem desconta da lista, nem conta para as receitas.

**Quantidade sem produto também não abate**, e a tela avisa quantos itens estão nesse
meio-termo — vinculados, mas sem medida. Quem cadastrou às pressas tem caminho de volta:
tocar no chip reabre produto e quantidade do item já salvo.

**A unidade não é livre.** Cada produto é vendido em uma grandeza (`Product.base_unit`), e
"500 ml" de um produto vendido por quilo produziria o pior item possível: aparece na
despensa, a pessoa acha que descontou, e `available_quantity` o conta como não medido
porque a conversão não existe. A tela oferece só as unidades compatíveis, e o servidor
recusa o resto com 422 (`pantry.ensure_measurable`) — na criação, na edição, e também
quando só o produto muda e a medida antiga fica em outra grandeza.

**O que conta como disponível.** A porcentagem soma duas fontes: a despensa e a lista
de compras corrente. "100% disponível" quer dizer que a receita não exige nenhuma ida
extra ao mercado, não que tudo já esteja em casa — se a tela precisar separar as duas
coisas, `suggest_recipes` aceita ser chamada sem lista.

O percentual é a proporção de ingredientes **obrigatórios** disponíveis: 3 de 4 são 75%.
Ingrediente opcional não entra na conta. Item da despensa sem quantidade conta como
disponível — regra oposta à da lista de compras, onde item sem quantidade não abate
nada, porque aqui o custo do erro é uma sugestão imprecisa, não uma compra a menos.

**Encher a despensa por foto.** A pessoa fotografa o que tem
em casa (a prateleira, a geladeira, as compras em cima da mesa) e **o app diz o que viu**.
O que ela confirmar vira item da despensa. Nasceu de um problema de uso, não do protótipo:
cadastrar item por item é trabalhoso o bastante para a pessoa não fazer — e despensa vazia
desliga as duas coisas que dependem dela, o abatimento da lista e a ordem das receitas.

O reconhecimento **propõe**; quem decide é a pessoa, item a item, como já acontece no
casamento do plano alimentar — nunca 100% automático (decisão 11). A foto devolve nomes
("arroz", "ovos"), não produtos do catálogo: daí para a frente vale o caminho que já
existe, `services/text.py` e `services/matching.py`, o mesmo motor de `GET
/products/search`. O que o reconhecimento não resolver aparece como não identificado e
espera a pessoa, igual ao relatório do descarte do import de PDF. Nada entra sozinho.

**Foto não pesa arroz.** O item reconhecido entra vinculado ao produto, com a medida em
branco ou na embalagem padrão — o mesmo que o cadastro manual já faz. Isso aciona a regra
de sempre: item sem quantidade conta para a receita e **não** abate da lista de compras.
A foto melhora a sugestão de receitas no mesmo instante; só ajuda na compra depois que a
pessoa disser quanto tem.

**A imagem não é guardada.** Foto do interior da casa de alguém é dado pessoal, e a
decisão 5 pede minimização: o app extrai os itens e descarta o arquivo — não há coluna
para imagem, nem nada a apagar depois. O reconhecimento é feito por serviço de terceiros
(a API do Claude), então o aceite vem antes de a primeira foto sair do aparelho.

**Como ficou.** O botão "Encher por foto" fica no cartão da despensa, logo abaixo do
campo de digitar. Ele abre um painel com o aceite e dois botões, **Tirar foto** e
**Escolher da galeria**, desativados até a pessoa aceitar. A foto vai para
`POST /pantry/photo`, que responde com uma lista de propostas — `name`, `identified` e
até cinco `candidates` — e **não grava nada**.

A revisão mostra cada alimento com o produto mais parecido já escolhido. A pessoa
**confirma**, **troca o produto** entre os candidatos ou **descarta**. O que não chega
ao corte do casamento (`MINIMUM_SCORE`, o mesmo do plano alimentar) aparece em
"Não identificados", sem produto escolhido: dá para escolher um dos candidatos,
guardar só como texto ou descartar. Confirmar é o `POST /pantry` de sempre, com
`product_id` e sem quantidade. "Concluir" fecha o painel, e o que ninguém confirmou
simplesmente não entra.

**O reconhecimento erra, e o nome se corrige ali mesmo.** Cada alimento da revisão tem
**Editar**: um campo já preenchido com o que a foto mostrou, e **Buscar** procura o nome
corrigido no catálogo pelo mesmo `GET /products/search` do cadastro manual. A proposta
inteira é trocada — nome, candidatos e produto escolhido —, e um nome sem produto parecido
vai para os não identificados, pelo mesmo corte do servidor. Corrigir não grava nada:
continua sendo proposta até a pessoa confirmar.

O servidor reduz a foto a 1280 px no lado maior e a regrava em JPEG antes de enviá-la,
o que também descarta o EXIF — e, com ele, a localização que o celular costuma gravar.
O modelo é o Claude Haiku 5.5 (`VISION_MODEL`), o mais barato com visão: listar o que
está numa prateleira não pede mais que isso, e cada foto custa uma fração de centavo.
Sem `ANTHROPIC_API_KEY` a rota responde 503 e o resto do app continua igual.

**Limite conhecido do casamento.** Com nomes curtos de uma palavra, o motor de
`matching.py` às vezes passa do corte com um produto que não tem nada a ver: "pitaia"
casa com "Uva itália" (0,625) e "picanha" com "Castanha-do-pará" (0,667). Como a pessoa
confirma cada item, nada errado entra sozinho, mas a proposta aparece como
identificada. O motor é o mesmo do plano alimentar e não foi alterado.

**Duas correções na busca da despensa** (`pantry.rank_by_food_name`), sem mexer no motor
do plano alimentar. Valem para a foto, para o campo de digitar e para os candidatos de um
item salvo: a busca é feita
com o singular e o plural da primeira palavra — a foto diz "ovo" e o catálogo vende "Ovos
de galinha" —, e entre os produtos que passam do corte vem antes o que **começa** pelo
alimento: "tomate" propõe "Tomate italiano" antes de "Molho de tomate". Os dois casos
acima, de nome sem parente no catálogo, continuam como estão.

**Isto não é a decisão 7.** O que está fora do MVP lá é OCR do *plano alimentar* — ler a
prescrição de uma foto, onde errar significa comida sumindo da dieta de alguém. Aqui o
erro custa um item a mais ou a menos numa lista que a pessoa está olhando na hora.

**E não forma preço.** A foto enche a despensa; a NFC-e (decisão 3) é que formaria o
preço, e continua fora do MVP. São duas câmeras com dois propósitos, e não vale
confundi-las.

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
[`quantity_to_charge`](../../backend/app/services/pricing.py). Para item a granel dá a
proporção; para embalado que não reduziu o número de pacotes dá zero, que é a verdade.
Item sem preço fica com economia **nula**, não zero — nulo é "não sei", zero é "não
poupou".

---

## 6. Área da nutricionista

**Sem protótipo.** Montada com os cartões, campos e chips do sistema de design.

O login tem "Sou paciente / Sou nutricionista" no topo; o cadastro da nutricionista pede
nome e CRN, que assinam o plano. A conta dela não tem abas — Dieta, Mercado, Despensa e
Economia são do paciente — e abre na lista de planos.

| A tela mostra | Backend | Observação |
|---|---|---|
| Lista de planos com paciente e situação | ✅ | `GET /nutritionist/prescriptions`. Rascunho, enviado, aceito ou recusado |
| Editor no formato do Dietbox | ✅ | Refeição com horário obrigatório; alimento com quantidade de compra, unidade e medida caseira; orientação da refeição e geral; substituições para a refeição inteira |
| Enviar pelo e-mail do paciente | ✅ | Salva antes e envia a versão da tela. A mensagem é a mesma exista ou não conta com o e-mail (decisão 10) |
| Baixar PDF | ✅ | Salva antes. O paciente importa o arquivo pelo envio de PDF de sempre, e o import rende os mesmos itens que o aceite pelo e-mail |
| Plano aceito | ✅ | Só leitura: o paciente tem uma cópia, e os dois não podem divergir. Ainda dá para baixar o PDF |

**Por que o editor tem os limites que tem.** Nome de alimento com até 45 caracteres,
sem " - " e começando por letra; medida caseira até 25; nome de refeição até 40,
começando por letra. Não é estética: com eles a linha do PDF fica abaixo de 90
caracteres, que é onde o import passa a lê-la como parágrafo. O editor checa antes de
enviar (`services/prescriptionForm.ts`) e diz em qual refeição está o problema.

**O que vai para a compra.** Só os alimentos principais de cada refeição viram itens do
plano do paciente, casados com o catálogo como no import, e ele confirma um a um. As
substituições e a orientação ele lê.

---

## Divergências entre o protótipo e as decisões do projeto

Eram cinco pontos em que o protótipo contrariava decisões já tomadas. **Todos foram
resolvidos**; o registro fica porque a razão de cada um continua valendo para a próxima
tela que alguém desenhar.

**1. Preço aparece sem data e sem origem.** ~~"Est. R$ 5,50" e "R$ 174,20" soltos~~ —
**resolvida.** A decisão 1 exige que todo preço carregue data da coleta e origem, e que
preço com mais de 30 dias seja exibido como estimativa. Cada item da lista traz agora a
linha de procedência — confiança, data, origem e tamanho da amostra —, e o teste
"nenhum preço aparece sem data, origem e amostra" a sustenta.

**2. Região fixa.** ~~"baseado na feira e mercados locais de São Paulo"~~ — **resolvida.**
A decisão 2 é média **por região**, e a região passou a vir do usuário: a tela pede UF e
cidade antes de gerar a lista e as lembra entre sessões. O catálogo de desenvolvimento é
do DF, e é por isso que existe o aviso de região sem coleta descrito na seção 3.

**3. O app opinando sobre a dieta.** ~~"substituir morango fresco por banana ou mamão"~~ —
**resolvida por omissão deliberada: a dica não foi construída.** Seria o app alterando uma
prescrição, o que a decisão 4 proíbe. A tela de Dieta faz certo: lista "opções autorizadas
pela Nutri Camila". Regra que continua valendo: **substituição só existe se veio da
nutricionista.** Economia se mostra comparando preços do mesmo item, nunca trocando o
alimento prescrito.

**4. Números de economia sem base.** ~~"Evitou desperdício de R$ 14,00" e "+R$ 42"~~ —
**resolvida definindo a conta, não omitindo o número.** A economia da despensa tem base:
é a diferença entre o custo da prescrição inteira e o da compra descontada, descrita na
seção 5 e testada em `tests/test_pricing.py`.

O que continua de fora é o **desperdício evitado**, que exigiria saber o que foi consumido
antes de vencer — e `PantryItem` não guarda validade. Esse número segue sem aparecer.

**5. Consentimento ausente no upload.** ~~O protótipo ia do upload direto ao resultado~~ —
**resolvida.** O backend nunca permitiu gravar plano sem consentimento, e agora a tela
tem o aceite: o botão de enviar só libera com ele marcado. Descrito na seção 1.

---

## A trilha da jornada

As quatro abas do protótipo continuam livres, e por cima delas passou a existir uma
trilha: **Enviar → Confirmar → Região → Comprar**, marcando o que já foi cumprido e o
quanto falta da etapa em andamento ("6/15").

O protótipo não previa isso porque cada tela foi desenhada isolada. Na prática, quem
abria o Mercado antes de confirmar os produtos via uma tela quase vazia sem entender que
o problema era a etapa anterior — a ordem existia no código e não na interface.

A trilha **não é clicável**, de propósito: a barra de abas logo abaixo já navega, e dois
lugares diferentes para a mesma navegação confundiriam em vez de guiar. Ela também tomou
o lugar do cabeçalho, que só repetia o nome da aba enquanto cada tela já abre com o
próprio título.

Etapa com alguma seguinte cumprida aparece **ultrapassada** (círculo verde com ✓), mesmo
sem ter sido cumprida por inteiro: quem gerou a lista com 9 de 16 itens confirmados já
passou da confirmação. O progresso parcial ("9/16") só aparece na etapa em andamento.

### Tela de início

O app abre numa tela de início (`HomeScreen`), **fora das quatro abas**: ela não é mais
um lugar para navegar, e sim a porta de entrada. Mostra a próxima etapa da trilha e um
botão que leva à aba que a resolve e, abaixo, um card para cada aba, para quem quer ir
direto a outro lugar. A compra concluída volta para ela, que então aponta a aba Economia.
Nas abas, o botão **Início** ao lado da trilha volta a ela a qualquer momento.

Quando a nutricionista envia um plano para o e-mail da conta e ele ainda espera resposta,
o início mostra acima da próxima etapa o aviso **"Seu plano alimentar já foi montado"**,
com quem o enviou e o botão **Conferir o plano**, que leva à aba Dieta — é lá que a pessoa
lê, aceita com consentimento ou recusa. O aviso lê a mesma consulta da Dieta
(`GET /prescriptions/received`), então some assim que o plano é respondido.

---

## Resumo do que entra no MVP

**Entra:** item avulso na lista de compras — o ingrediente que falta para a receita e o
que acabou em casa; despensa (`PantryItem`) com quantidade, o desconto dela na lista de
compras e a correção do item já salvo; **a despensa preenchida por foto**, com confirmação
item a item; import de plano por PDF com texto, com aceite na tela; o plano e a lista
reencontrados ao reabrir o app; escolha da região antes de gerar a lista, com aviso quando
ela não tem coleta; agrupamento por corredor; marcar item como comprado; receitas com
percentual de disponibilidade; aba Economia com o que a despensa poupou; trilha da
jornada; simulação de compra sem um item; **pagamento simulado** por Pix ou cartão; **conta de nutricionista**, que monta o plano
alimentar com refeições e substituições e o entrega pelo e-mail do paciente ou em PDF.

**Fica fora:** status e registro de consumo das refeições, refeições do plano importado
por PDF, hidratação, carrossel semanal, OCR da
prescrição por foto, projeção mensal, métricas de desperdício, dicas de substituição
geradas pelo app, pagamento de verdade (gateway, pedido e entrega), validade de item da despensa, exportação para WhatsApp e fotos de
receita.
