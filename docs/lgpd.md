# LGPD — como o projeto trata dado pessoal

Plano alimentar é **dado pessoal sensível de saúde** (LGPD, art. 5º, II). Isso não
é uma observação no README: é o que determina três decisões de código que este
documento reúne, cada uma com o teste que a sustenta.

## O que o aplicativo guarda

| Dado | Onde | Por que precisa existir |
|---|---|---|
| E-mail e nome | `users` | Identificar a conta |
| Hash da senha | `users.password_hash` | Autenticar. A senha em si nunca é guardada |
| Plano alimentar e seus itens | `meal_plans`, `plan_items` | É o serviço |
| Texto integral do PDF | `meal_plans.source_text` | Auditoria: permite conferir depois o que o parser leu errado |
| O que a pessoa tem em casa | `pantry_items` | Descontar da compra |
| Listas de compras | `shopping_lists` | Histórico de custo |
| Preços que a pessoa contribuiu | `price_records.user_id` | Creditar a coleta — e é o único campo que sobrevive à exclusão, anonimizado |

**O que não é guardado:** CPF, endereço, telefone, data de nascimento, peso,
altura, condição clínica, restrição alimentar em campo próprio. Nada disso é
necessário para traduzir uma prescrição em lista de compras.

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

> Testes: `test_import_plan.py::test_grava_consentimento_com_data_e_versao`,
> `::test_nao_da_para_importar_sem_informar_o_consentimento`,
> `test_api.py::test_sem_aceite_do_termo_nao_grava_plano`.

## Minimização

O casamento item–produto usa só a descrição textual do item. O cálculo de preço
usa produto, região e data. A sugestão de receitas usa a despensa e a lista. Em
nenhum ponto o sistema pede ou infere condição de saúde.

O aplicativo **não prescreve dieta** — ele operacionaliza uma prescrição que já
existe. Substituição de alimento só aparece se veio da nutricionista.

## Exclusão sob demanda

`DELETE /auth/me` apaga a conta e devolve um comprovante do que foi removido.

**Vai embora:** a linha em `users`, com e-mail e hash da senha; os planos
alimentares e seus itens; a despensa; as listas de compras e seus itens. Tudo
por cascata declarada no modelo, não por código que pode esquecer uma tabela.

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
> `::test_a_exclusao_nao_atinge_outras_pessoas`.

## Não confirmar o que não precisa ser confirmado

Três respostas da API são deliberadamente iguais entre si:

- **Senha errada e e-mail inexistente** devolvem o mesmo 401 e o mesmo corpo.
  Diferenciar entregaria a lista de quem tem conta — e ter conta aqui significa
  ter um plano alimentar guardado.
- **Token ausente, expirado, adulterado ou de conta excluída** devolvem o mesmo
  401. O último caso é o que mais importa: confirmar que uma conta existiu
  contraria o próprio pedido de exclusão.
- **Recurso de outra pessoa** devolve 404, não 403. Responder "existe, mas não é
  seu" já revelaria que aquela pessoa tem um plano alimentar.

> Testes: `test_auth.py::test_senha_errada_e_email_inexistente_respondem_igual`,
> `test_api.py::test_plano_de_outra_pessoa_devolve_404`.

## O que falta para valer em produção

Este é um projeto acadêmico e o MVP não cobre:

- HTTPS obrigatório e política de segredo para `SECRET_KEY` — hoje há um valor
  padrão que só serve para desenvolvimento;
- portabilidade (art. 18, V): exportar os dados num formato legível por máquina;
- registro de operações de tratamento e prazo de retenção definido;
- revogação de token antes de expirar, que exigiria sessões no banco;
- consentimento granular por finalidade — hoje é um aceite único.
