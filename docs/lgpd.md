# LGPD — como o projeto trata dado pessoal

Plano alimentar é **dado pessoal sensível de saúde** (LGPD, art. 5º, II). Isso não
é uma observação no README: é o que determina três decisões de código que este
documento reúne, cada uma com o teste que a sustenta.

## O que o aplicativo guarda

| Dado | Onde | Por que precisa existir |
|---|---|---|
| E-mail e nome | `users` | Identificar a conta |
| Papel e CRN | `users.role`, `users.crn` | Abrir a navegação certa; o CRN assina o plano que a nutricionista monta. Declarado, não verificado |
| Hash da senha | `users.password_hash` | Autenticar. A senha em si nunca é guardada |
| Plano alimentar e seus itens | `meal_plans`, `plan_items` | É o serviço |
| Texto integral do PDF | `meal_plans.source_text` | Auditoria: permite conferir depois o que o parser leu errado. No plano aceito pelo e-mail, é o mesmo texto do PDF que a nutricionista geraria |
| Refeições e substituições do plano aceito | `meal_plans.prescribed_meals` | O paciente consultar o que a nutricionista prescreveu além do que vai para a compra |
| Plano montado pela nutricionista | `prescriptions` e filhas | É o trabalho dela. Guarda o nome e o e-mail do paciente para o cabeçalho do PDF e para o envio |
| O que a pessoa tem em casa | `pantry_items` | Descontar da compra |
| Listas de compras | `shopping_lists` | Histórico de custo |
| Pagamentos simulados da lista | `payments` | Saber se a lista foi paga e mostrar as tentativas. Do cartão, só bandeira e os quatro últimos dígitos |
| Preços que a pessoa contribuiu | `price_records.user_id` | Creditar a coleta — e é o único campo que sobrevive à exclusão, anonimizado |

O plano que a nutricionista monta é dado de saúde do paciente **tratado pela
profissional de saúde**, no exercício da profissão (art. 11, II, *f*). Ele só passa a ser
dado do paciente *no aplicativo* quando ele aceita, com consentimento — antes disso, nada
é gravado na conta dele.

**O que não é guardado:** CPF, endereço, telefone, data de nascimento, peso,
altura, condição clínica, restrição alimentar em campo próprio. Nada disso é
necessário para traduzir uma prescrição em lista de compras.

**A foto da despensa também não.** Foto do interior da casa de alguém é dado pessoal,
e o app só precisa dos nomes dos alimentos que ela mostra. Não há coluna, arquivo nem
log com a imagem: ela é lida em memória, reduzida, enviada ao reconhecimento e
descartada na mesma requisição.

## Consentimento

`meal_plans.consent_at` e `meal_plans.consent_version` são `NOT NULL`, e
`import_plan_from_pdf` exige `consent_at` como argumento obrigatório e **sem
valor padrão**. Não existe caminho de código que grave um plano alimentar sem
registrar quando a pessoa aceitou o termo e qual versão dele estava valendo.

A versão vem de `CONSENT_VERSION`, na configuração, e não de quem chama a
função: assim o texto exibido e o texto registrado não podem divergir. Trocar o
termo muda a versão dos planos novos e **não reescreve** o que já foi aceito.

Na API, o cliente manda um booleano de aceite e **o servidor carimba a hora**.
Aceitar o horário informado pelo cliente seria usar como prova de consentimento
um dado que o cliente controla.

O plano enviado pela nutricionista segue a mesma regra. Aceitar exige o mesmo aceite do
PDF, carimbado no servidor; sem ele a resposta é 422 e nada é gravado. Recusar não grava
nada na conta do paciente.

A foto da despensa tem aceite próprio, porque **sai do servidor para um terceiro**: o
reconhecimento é feito pela API do Claude, da Anthropic. Sem `consent_accepted`, a rota
responde 422 antes de ler o arquivo, e a foto não vai a lugar nenhum. A tela diz para
quem a foto vai e que ela não é guardada, e os botões de câmera e galeria só funcionam
depois do aceite. Este aceite não é gravado — não há nada gravado a que ele se refira.

> Testes: `test_import_plan.py::test_grava_consentimento_com_data_e_versao`,
> `::test_nao_da_para_importar_sem_informar_o_consentimento`,
> `test_api.py::test_sem_aceite_do_termo_nao_grava_plano`,
> `test_prescription_delivery.py::test_sem_consentimento_nada_e_gravado`,
> `::test_recusar_nao_grava_nada`,
> `test_pantry_photo.py::test_sem_consentimento_a_foto_nem_e_enviada`;
> no app, `DespensaPorFoto.test.tsx` › "não deixa enviar a foto sem o aceite".

## Minimização

O casamento item–produto usa só a descrição textual do item. O cálculo de preço
usa produto, região e data. A sugestão de receitas usa a despensa e a lista. Em
nenhum ponto o sistema pede ou infere condição de saúde.

O aplicativo **não prescreve dieta** — ele operacionaliza uma prescrição que já
existe. Substituição de alimento só aparece se veio da nutricionista. No plano montado
no app, quem prescreve é a nutricionista, com nome e CRN; o app só leva as substituições
dela até o paciente, para ler, e não as põe na compra.

**Da foto da despensa, o terceiro recebe o mínimo.** O servidor reduz a imagem a 1280 px
no lado maior e a regrava do zero antes do envio. Regravar descarta o EXIF, e com ele a
localização que o celular costuma gravar na foto, o modelo do aparelho e a hora. Vai a
imagem, sem nome, e-mail ou identificador da conta. O que volta são nomes de alimentos,
e nem eles são gravados até a pessoa confirmar item a item (decisão 11).

> Testes: `test_pantry_photo.py::test_descarta_a_localizacao_da_foto`,
> `::test_rota_nao_grava_nada_na_despensa`,
> `::test_fluxo_completo_com_reconhecedor_falso` (o reconhecedor recebe a foto
> preparada, nunca o arquivo original).

**Do cartão, o pagamento simulado guarda o mínimo.** O formulário envia número,
titular, validade e CVV porque é assim que um checkout de verdade funciona, e o
gateway simulado precisa deles para validar e responder. Nenhum deles vai para o banco:
`payments` tem `card_brand` e `card_last_four`, o bastante para a pessoa reconhecer o
cartão no histórico, e mais nada. O Pix, por sua vez, não aceita dado de cartão — a API
recusa o pedido em vez de descartar em silêncio o que não devia ter chegado.

> Testes: `test_models.py::test_pagamento_nao_guarda_dado_sensivel_do_cartao`,
> `test_payments_api.py::test_cartao_aprovado_devolve_so_bandeira_e_final`,
> `::test_pix_nao_aceita_dados_de_cartao`.

Mesmo simulado, o cuidado é o mesmo de um pagamento real: quem digita um cartão de
verdade no formulário de demonstração não deve deixá-lo gravado em lugar nenhum.

O paciente vê do plano recebido só o nome e o CRN de quem o assinou — nunca o e-mail
da nutricionista. A nutricionista vê do paciente só o que ela mesma digitou e se ele
aceitou ou recusou.

## Exclusão sob demanda

`DELETE /auth/me` apaga a conta e devolve um comprovante do que foi removido.

**Vai embora:** a linha em `users`, com e-mail e hash da senha; os planos
alimentares e seus itens; a despensa; as listas de compras, seus itens e os
pagamentos simulados delas. Tudo por cascata declarada no modelo, não por código que
pode esquecer uma tabela.

**Da nutricionista, vão também** os planos que ela montou, com refeições e itens. Plano
enviado e ainda sem resposta deixa de aparecer para o paciente. O plano que um paciente
**já aceitou fica com ele**: é uma cópia na conta dele, e é dado dele. A recíproca vale:
o paciente excluir a conta não apaga o documento da nutricionista, que é registro
profissional dela.

**Fica:** os registros de preço que a pessoa contribuiu, com `user_id` nulo.
Preço coletado de nota fiscal é informação sobre o mercado, não sobre quem
passou no caixa; sem o vínculo, deixa de ser dado pessoal e continua servindo a
média da região, que é o bem coletivo do aplicativo.

**Não fica nada além disso.** Não há soft delete: a conta não é marcada como
excluída, ela some. Guardar o e-mail de quem pediu para ser esquecido seria o
contrário do que a lei pede.

O token de quem foi excluído para de funcionar na requisição seguinte, porque
`get_current_user` busca o usuário no banco e não o encontra mais.

> Testes: `test_auth.py::test_a_exclusao_leva_embora_os_dados_pessoais`,
> `::test_o_preco_sobrevive_anonimizado`,
> `::test_o_token_para_de_funcionar_depois_da_exclusao`,
> `::test_a_exclusao_nao_atinge_outras_pessoas`,
> `test_prescriptions.py::test_excluir_a_conta_leva_os_planos_dela`,
> `test_prescription_delivery.py::test_o_plano_aceito_sobrevive_a_nutricionista_sair`,
> `::test_plano_pendente_some_quando_a_nutricionista_sai`,
> `::test_paciente_sair_nao_apaga_o_documento_da_nutricionista`,
> `test_models.py::test_excluir_a_lista_apaga_os_pagamentos`,
> `test_payment_model.py::test_excluir_a_lista_apaga_os_pagamentos`.

## Não confirmar o que não precisa ser confirmado

Estas respostas da API são deliberadamente iguais entre si:

- **Senha errada e e-mail inexistente** devolvem o mesmo 401 e o mesmo corpo.
  Diferenciar entregaria a lista de quem tem conta — e ter conta aqui significa
  ter um plano alimentar guardado.
- **Token ausente, expirado, adulterado ou de conta excluída** devolvem o mesmo
  401. O último caso é o que mais importa: confirmar que uma conta existiu
  contraria o próprio pedido de exclusão.
- **Recurso de outra pessoa** devolve 404, não 403. Responder "existe, mas não é
  seu" já revelaria que aquela pessoa tem um plano alimentar. Vale também entre
  nutricionistas: o plano de outra é 404.
- **Conta do outro papel na porta de login errada** devolve o mesmo 401 da senha
  errada. Dizer "essa conta é de paciente" confirmaria que a pessoa tem um plano
  guardado. A rota do outro papel responde 404, como recurso que não existe.
- **Enviar o plano a um e-mail com conta e a um sem conta** dá a mesma resposta. Se
  desse diferente, o envio viraria um jeito de descobrir quem usa o app.

> Testes: `test_auth.py::test_senha_errada_e_email_inexistente_respondem_igual`,
> `test_api.py::test_plano_de_outra_pessoa_devolve_404`,
> `test_nutritionist_auth.py::test_paciente_na_porta_da_nutricionista_parece_senha_errada`,
> `::test_nutricionista_nao_enxerga_rotas_do_paciente`,
> `test_prescription_delivery.py::test_envio_nao_revela_se_o_email_tem_conta`,
> `test_prescriptions.py::test_plano_de_outra_nutricionista_responde_404`.

## O que falta para valer em produção

Este é um projeto acadêmico e o MVP não cobre:

- política de rotação da `SECRET_KEY` — fora de desenvolvimento a API já se recusa a
  subir com a chave padrão, e o servidor publicado só responde por HTTPS (Render), mas
  trocar a chave derruba todas as sessões e não há procedimento para isso;
- um ambiente de produção de verdade: o servidor publicado ([`publicacao.md`](publicacao.md))
  é de **demonstração**, com catálogo fictício e apenas contas de teste — ninguém deve
  colocar ali o próprio plano alimentar;
- portabilidade (art. 18, V): exportar os dados num formato legível por máquina;
- registro de operações de tratamento e prazo de retenção definido;
- revogação de token antes de expirar, que exigiria sessões no banco;
- consentimento granular por finalidade — hoje é um aceite único;
- contrato com o operador da foto da despensa: a Anthropic recebe a imagem como
  operadora, e em produção isso pede acordo de tratamento de dados e a conferência da
  política de retenção da API — o app descarta a foto, mas não controla o que o
  operador faz com ela;
- verificação do CRN junto ao conselho — hoje ele é só declarado;
- prazo de retenção do plano que a nutricionista guarda depois de o paciente excluir a
  conta: hoje o documento dela, com nome e e-mail do paciente, fica até ela o apagar.
