/**
 * Testes da lista de compras.
 *
 * O foco é o que a tela promete ao usuário: agrupar por corredor, mostrar o
 * desconto da despensa e nunca exibir preço sem data e origem.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import MarketScreen from '../MarketScreen';
import * as api from '../../services/api';
import * as session from '../../services/session';
import type { ShoppingList, ShoppingListItem } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readShoppingList: jest.fn(),
  generateShoppingList: jest.fn(),
  setItemPurchased: jest.fn(),
  simulateShoppingList: jest.fn(),
  addExtraItem: jest.fn(),
  removeShoppingListItem: jest.fn(),
  searchProducts: jest.fn(),
}));

jest.mock('../../services/session', () => ({
  ...jest.requireActual('../../services/session'),
  readRegion: jest.fn(),
  saveRegion: jest.fn(),
}));

const lerLista = api.readShoppingList as jest.Mock;
const gerarLista = api.generateShoppingList as jest.Mock;
const marcarItem = api.setItemPurchased as jest.Mock;
const simular = api.simulateShoppingList as jest.Mock;
const acrescentar = api.addExtraItem as jest.Mock;
const removerItem = api.removeShoppingListItem as jest.Mock;
const buscarProdutos = api.searchProducts as jest.Mock;
const lerRegiao = session.readRegion as jest.Mock;
const salvarRegiao = session.saveRegion as jest.Mock;

const HA_TRES_DIAS = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

function produto(nome: string, categoria: string) {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: categoria,
    base_unit: 'kg' as const,
    package_size: null,
    package_unit: null,
    is_fictitious: false,
  };
}

function item(over: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    product: produto('Peito de frango sem pele', 'proteinas'),
    quantity: '1.200',
    unit: 'kg',
    quantity_from_pantry: '0.000',
    dispensed_by_pantry: false,
    packages_needed: null,
    match_score: null,
    estimated_cost: '34.50',
    unit_price_snapshot: '28.75',
    price_reference_date: HA_TRES_DIAS,
    price_origin: 'seed',
    price_confidence: 'atual',
    price_sample_size: 6,
    purchased: false,
    purchased_at: null,
    pantry_savings: '0.00',
    is_extra: false,
    ...over,
  };
}

function lista(itens: ShoppingListItem[]): ShoppingList {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '174.20',
    calculated_at: HA_TRES_DIAS,
    items: itens,
  };
}

let cliente: QueryClient;

async function montar(dados: ShoppingList) {
  lerLista.mockResolvedValue(dados);

  await render(
    <QueryClientProvider client={cliente}>
      <MarketScreen planId="plano-1" listId="lista-1" onGenerated={jest.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // `gcTime` das mutações é 5 minutos por padrão, e cada mutação que roda deixa
  // esse temporizador de pé — o suficiente para o Jest não encerrar sozinho.
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  lerRegiao.mockResolvedValue({ stateCode: 'DF', city: 'Brasília' });
  salvarRegiao.mockResolvedValue(undefined);
});

// Sem isto o cache do React Query deixa temporizadores abertos e o Jest não
// encerra sozinho ao fim da suíte.
afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('mostra o total estimado e a região', async () => {
  await montar(lista([item({ id: 'a' })]));

  expect(await screen.findByText('R$ 174,20')).toBeTruthy();
  // Média de preço é sempre regional: a tela precisa dizer de onde ela é.
  expect(screen.getByText('Brasília · DF')).toBeTruthy();
});

it('agrupa os itens pelos corredores do mercado', async () => {
  await montar(
    lista([
      item({ id: 'a' }),
      item({ id: 'b', product: produto('Banana prata', 'hortifruti') }),
      item({ id: 'c', product: produto('Aveia em flocos', 'mercearia') }),
    ]),
  );

  expect(await screen.findByText('Carnes & Ovos')).toBeTruthy();
  expect(screen.getByText('Hortifrúti')).toBeTruthy();
  expect(screen.getByText('Mercearia & Grãos')).toBeTruthy();
});

it('nenhum preço aparece sem data, origem e amostra', async () => {
  await montar(lista([item({ id: 'a' })]));

  // Decisão 1 do projeto, no último lugar onde ela pode se perder.
  expect(
    await screen.findByText('coletado há 3 dias · dado fictício de desenvolvimento · 6 coleta(s)'),
  ).toBeTruthy();
});

it('avisa quando o preço é estimativa', async () => {
  const vencido = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  await montar(
    lista([item({ id: 'a', price_confidence: 'estimativa', price_reference_date: vencido })]),
  );

  expect(await screen.findByText(/estimativa — coletado há 45 dias/)).toBeTruthy();
});

it('avisa quando não há preço na região', async () => {
  await montar(
    lista([
      item({
        id: 'a',
        estimated_cost: null,
        price_confidence: null,
        price_reference_date: null,
        price_origin: null,
        price_sample_size: null,
      }),
    ]),
  );

  // Ausência de preço não pode virar R$ 0,00.
  expect(await screen.findByText('—')).toBeTruthy();
  expect(screen.getByText('sem preço coletado nesta região')).toBeTruthy();
});

it('explica a região quando nenhum item tem preço', async () => {
  const semPreco = {
    estimated_cost: null,
    price_confidence: null,
    price_reference_date: null,
    price_origin: null,
    price_sample_size: null,
  } as const;

  await montar(
    lista([item({ id: 'a', ...semPreco }), item({ id: 'b', ...semPreco })]),
  );

  // Item por item o app já diz "sem preço"; o que faltava era a causa: a região
  // escolhida não tem coleta, e é por isso que o total dá R$ 0,00.
  expect(await screen.findByText('Ainda não temos preços em Brasília')).toBeTruthy();
});

it('não explica a região quando algum item tem preço', async () => {
  await montar(
    lista([
      item({ id: 'a' }),
      item({
        id: 'b',
        estimated_cost: null,
        price_confidence: null,
        price_reference_date: null,
        price_origin: null,
        price_sample_size: null,
      }),
    ]),
  );

  await screen.findByText('R$ 174,20');
  expect(screen.queryByText(/Ainda não temos preços/)).toBeNull();
});

describe('simulação de cenário', () => {
  it('tirar um item da simulação recalcula o total na tela', async () => {
    // Três itens para o total simulado não coincidir com o preço de nenhum
    // deles: 5,32 + 0,10 = 5,42, que só pode ter vindo da soma.
    await montar(
      lista([
        item({ id: 'a', estimated_cost: '12.31' }),
        item({ id: 'b', estimated_cost: '5.32' }),
        item({ id: 'c', estimated_cost: '0.10' }),
      ]),
    );

    await fireEvent.press((await screen.findAllByText('Simular sem este item'))[0]);

    expect(await screen.findByText('R$ 5,42')).toBeTruthy();
    expect(screen.getByText('1 item fora da simulação · R$ 12,31 a menos')).toBeTruthy();
  });

  it('simular não mexe na lista salva nem manda nada ao servidor', async () => {
    await montar(lista([item({ id: 'a', estimated_cost: '12.31' })]));

    await fireEvent.press(await screen.findByText('Simular sem este item'));

    // Decisão 8: o app não altera a prescrição. A simulação é uma conta de tela.
    expect(marcarItem).not.toHaveBeenCalled();
    expect(screen.getByText('R$ 174,20')).toBeTruthy();
  });

  it('devolver o item desfaz a simulação', async () => {
    await montar(lista([item({ id: 'a', estimated_cost: '12.31' })]));

    await fireEvent.press(await screen.findByText('Simular sem este item'));
    await fireEvent.press(await screen.findByText('Devolver à simulação'));

    expect(screen.queryByText('Simulando a compra')).toBeNull();
  });

  it('limpar devolve todos de uma vez', async () => {
    await montar(
      lista([
        item({ id: 'a', estimated_cost: '12.31' }),
        item({ id: 'b', estimated_cost: '5.32' }),
      ]),
    );

    const botoes = await screen.findAllByText('Simular sem este item');
    await fireEvent.press(botoes[0]);
    await fireEvent.press((await screen.findAllByText('Simular sem este item'))[0]);

    expect(screen.getByText('2 itens fora da simulação · R$ 17,63 a menos')).toBeTruthy();

    await fireEvent.press(screen.getByText('Limpar simulação'));

    expect(screen.queryByText('Simulando a compra')).toBeNull();
  });

  it('mudar a quantidade pergunta ao servidor e mostra o novo custo', async () => {
    simular.mockResolvedValue([
      {
        item_id: 'a',
        quantity: '1.000',
        quantity_charged: '1.000',
        packages_needed: 2,
        estimated_cost: '31.60',
      },
    ]);
    // Dois itens para o total simulado (36,92) não coincidir com o custo
    // simulado do item (31,60) e a asserção saber do que está falando.
    await montar(
      lista([
        item({ id: 'a', estimated_cost: '15.80' }),
        item({ id: 'b', estimated_cost: '5.32' }),
      ]),
    );

    await fireEvent.press((await screen.findAllByText('Simular outra quantidade'))[0]);
    await fireEvent.changeText(
      screen.getAllByLabelText('Quantidade simulada de Peito de frango sem pele')[0],
      '1',
    );
    await fireEvent.press(screen.getByText('Ver quanto fica'));

    // A conta da embalagem é do servidor: a tela não multiplica preço por
    // quantidade, porque produto embalado sobe de pacote em pacote.
    await waitFor(() =>
      expect(simular).toHaveBeenCalledWith('lista-1', [{ item_id: 'a', quantity: '1' }]),
    );
    expect(await screen.findByText('R$ 31,60')).toBeTruthy();
    expect(screen.getByText('simulando 1.000 kg · 2 embalagem(ns)')).toBeTruthy();
  });

  it('o preço real continua à vista ao lado do simulado', async () => {
    simular.mockResolvedValue([
      {
        item_id: 'a',
        quantity: '1.000',
        quantity_charged: '1.000',
        packages_needed: 2,
        estimated_cost: '31.60',
      },
    ]);
    // Dois itens para o total simulado (36,92) não coincidir com o custo
    // simulado do item (31,60) e a asserção saber do que está falando.
    await montar(
      lista([
        item({ id: 'a', estimated_cost: '15.80' }),
        item({ id: 'b', estimated_cost: '5.32' }),
      ]),
    );

    await fireEvent.press((await screen.findAllByText('Simular outra quantidade'))[0]);
    await fireEvent.changeText(
      screen.getAllByLabelText('Quantidade simulada de Peito de frango sem pele')[0],
      '1',
    );
    await fireEvent.press(screen.getByText('Ver quanto fica'));

    await screen.findByText('R$ 31,60');
    // Substituir o número esconderia de que ponto a comparação parte.
    expect(screen.getByText('R$ 15,80')).toBeTruthy();
  });

  it('quantidade maior diz "a mais", e não economia', async () => {
    simular.mockResolvedValue([
      {
        item_id: 'a',
        quantity: '1.000',
        quantity_charged: '1.000',
        packages_needed: 2,
        estimated_cost: '31.60',
      },
    ]);
    await montar(
      lista([
        item({ id: 'a', estimated_cost: '15.80' }),
        item({ id: 'b', estimated_cost: '5.32' }),
      ]),
    );

    await fireEvent.press((await screen.findAllByText('Simular outra quantidade'))[0]);
    await fireEvent.changeText(
      screen.getAllByLabelText('Quantidade simulada de Peito de frango sem pele')[0],
      '1',
    );
    await fireEvent.press(screen.getByText('Ver quanto fica'));

    // 36,92 contra 21,12: a compra ficou mais cara, e chamar isso de economia
    // seria mentir para quem está decidindo o que levar.
    expect(
      await screen.findByText('Só mudando quantidades · R$ 15,80 a mais'),
    ).toBeTruthy();
  });

  it('quantidade que não é número não vai ao servidor', async () => {
    await montar(lista([item({ id: 'a' })]));

    await fireEvent.press(await screen.findByText('Simular outra quantidade'));
    await fireEvent.changeText(
      screen.getByLabelText('Quantidade simulada de Peito de frango sem pele'),
      'meio quilo',
    );
    await fireEvent.press(screen.getByText('Ver quanto fica'));

    expect(simular).not.toHaveBeenCalled();
  });

  it('item dispensado pela despensa não entra na simulação', async () => {
    await montar(
      lista([
        item({
          id: 'a',
          dispensed_by_pantry: true,
          quantity: '0.000',
          quantity_from_pantry: '1.200',
          estimated_cost: '0.00',
        }),
      ]),
    );

    // Ele não faz parte do trajeto pelo mercado; simular sem ele não diz nada.
    await screen.findByText('não precisa comprar');
    expect(screen.queryByText('Simular sem este item')).toBeNull();
  });
});

it('mostra quanto veio da despensa', async () => {
  await montar(lista([item({ id: 'a', quantity: '0.700', quantity_from_pantry: '0.500' })]));

  expect(await screen.findByText('700 g')).toBeTruthy();
  expect(screen.getByText('500 g vieram da despensa')).toBeTruthy();
});

it('mantém na lista o item que a despensa cobriu por inteiro', async () => {
  await montar(
    lista([
      item({
        id: 'a',
        quantity: '0.000',
        quantity_from_pantry: '1.200',
        dispensed_by_pantry: true,
        estimated_cost: '0.00',
      }),
    ]),
  );

  // Sumir da tela esconderia uma decisão que o app tomou pelo usuário.
  expect(await screen.findByText('Peito de frango sem pele')).toBeTruthy();
  expect(screen.getByText('não precisa comprar')).toBeTruthy();
  expect(screen.getByText('1,2 kg já em casa')).toBeTruthy();
  expect(screen.getByText('1 item(ns) saíram da compra porque você já tem em casa.')).toBeTruthy();
});

it('marca produto fictício do seed', async () => {
  await montar(
    lista([item({ id: 'a', product: { ...produto('Arroz', 'mercearia'), is_fictitious: true } })]),
  );

  expect(await screen.findByText('dado fictício de desenvolvimento')).toBeTruthy();
});

// --------------------------------------------------------------------------
// item comprado
// --------------------------------------------------------------------------

it('conta os comprados pelo que veio do servidor, não pelo toque', async () => {
  await montar(
    lista([
      item({ id: 'a', purchased: true, purchased_at: HA_TRES_DIAS }),
      item({ id: 'b' }),
    ]),
  );

  // Marcado numa sessão anterior: sair da tela e voltar não perde o progresso.
  expect(await screen.findByText('1 de 2 itens comprados')).toBeTruthy();
});

it('marcar o item avisa o servidor', async () => {
  marcarItem.mockResolvedValue(item({ id: 'a', purchased: true }));
  await montar(lista([item({ id: 'a' })]));

  await fireEvent.press(await screen.findByText('Já comprei'));

  await waitFor(() => expect(marcarItem).toHaveBeenCalledWith('lista-1', 'a', true));
});

it('desmarcar o item também avisa o servidor', async () => {
  marcarItem.mockResolvedValue(item({ id: 'a', purchased: false }));
  await montar(lista([item({ id: 'a', purchased: true, purchased_at: HA_TRES_DIAS })]));

  await fireEvent.press(await screen.findByText('Desmarcar'));

  await waitFor(() => expect(marcarItem).toHaveBeenCalledWith('lista-1', 'a', false));
});

it('risca o item na hora, sem esperar a resposta do servidor', async () => {
  // Quem usa isto está no corredor do mercado: o toque não pode parecer perdido.
  let responder: (valor: ShoppingListItem) => void = () => {};
  marcarItem.mockReturnValue(new Promise<ShoppingListItem>((ok) => (responder = ok)));
  await montar(lista([item({ id: 'a' })]));

  await fireEvent.press(await screen.findByText('Já comprei'));

  // O servidor ainda não respondeu e o item já conta como comprado.
  expect(await screen.findByText('1 de 1 itens comprados')).toBeTruthy();

  // Encerrar a promessa antes do fim do teste: mutação pendente no teardown
  // deixa o Jest com um handle aberto e a atualização cai fora do `act`.
  responder(item({ id: 'a', purchased: true }));
  await waitFor(() => expect(lerLista).toHaveBeenCalledTimes(2));
});

it('desfaz a marcação quando o servidor recusa', async () => {
  marcarItem.mockRejectedValue(new Error('sem rede'));
  await montar(lista([item({ id: 'a' })]));

  await fireEvent.press(await screen.findByText('Já comprei'));

  // Contar como comprado algo que não foi salvo faria a pessoa sair do
  // mercado sem o item.
  expect(await screen.findByText('não foi possível salvar o item marcado')).toBeTruthy();
  expect(screen.getByText('0 de 1 itens comprados')).toBeTruthy();
});

it('dá caminho para gerar a lista em outra região', async () => {
  await montar(lista([item({ id: 'a' })]));

  // O aviso de região sem preço manda gerar em outra cidade; sem este caminho,
  // uma lista gerada trancava a região para sempre.
  await fireEvent.press(await screen.findByLabelText('Gerar em outra região'));

  expect(await screen.findByLabelText('Estado')).toBeTruthy();
});

it('desistir da troca devolve a lista que já existia', async () => {
  await montar(lista([item({ id: 'a' })]));

  await fireEvent.press(await screen.findByLabelText('Gerar em outra região'));
  await fireEvent.press(await screen.findByText('Manter a lista atual'));

  expect(await screen.findByText('R$ 174,20')).toBeTruthy();
  expect(gerarLista).not.toHaveBeenCalled();
});

it('permite escolher a região e gera a lista com os dados informados', async () => {
  gerarLista.mockResolvedValue({
    shopping_list: lista([item({ id: 'a' })]),
  });

  const onGenerated = jest.fn();

  await render(
    <QueryClientProvider client={cliente}>
      <MarketScreen planId="plano-1" listId={null} onGenerated={onGenerated} />
    </QueryClientProvider>,
  );

  const inputUf = await screen.findByLabelText('Estado');
  const inputCidade = screen.getByLabelText('Cidade');

  // `await` em cada evento: sem isso as chamadas de act() se sobrepõem e o
  // React reclama no console, do mesmo jeito que no resto desta suíte.
  await fireEvent.changeText(inputUf, 'SP');
  await fireEvent.changeText(inputCidade, 'São Paulo');

  await fireEvent.press(screen.getByText('Gerar lista de compras'));

  await waitFor(() => {
    expect(salvarRegiao).toHaveBeenCalledWith({ stateCode: 'SP', city: 'São Paulo' });
    expect(gerarLista).toHaveBeenCalledWith('plano-1', 'SP', 'São Paulo');
    expect(onGenerated).toHaveBeenCalledWith('lista-1');
  });
});


describe('item avulso', () => {
  const chia = produto('Chia sementes', 'mercearia');

  it('se identifica como fora da prescrição', async () => {
    await montar(lista([item({ id: 'a' }), item({ id: 'b', product: chia, is_extra: true })]));

    expect(await screen.findByText('fora da prescrição')).toBeTruthy();
  });

  it('só o avulso pode sair da lista', async () => {
    // Tirar daqui um alimento prescrito seria o app decidindo a dieta.
    await montar(lista([item({ id: 'a' }), item({ id: 'b', product: chia, is_extra: true })]));

    await screen.findByText('Chia sementes');
    expect(screen.getAllByText('Tirar da lista')).toHaveLength(1);
  });

  it('tirar da lista avisa o servidor', async () => {
    removerItem.mockResolvedValue(undefined);
    await montar(lista([item({ id: 'b', product: chia, is_extra: true })]));

    await fireEvent.press(await screen.findByText('Tirar da lista'));

    await waitFor(() => expect(removerItem).toHaveBeenCalledWith('lista-1', 'b'));
  });

  it('a recusa de remover um item prescrito aparece na tela', async () => {
    // A tela não oferece o botão, mas se o servidor recusar por outro caminho
    // a pessoa precisa ver o motivo em vez de um item que não some.
    removerItem.mockRejectedValue(
      new api.ApiError(422, 'este item veio da prescrição e não pode sair da lista'),
    );
    await montar(lista([item({ id: 'b', product: chia, is_extra: true })]));

    await fireEvent.press(await screen.findByText('Tirar da lista'));

    expect(
      await screen.findByText('este item veio da prescrição e não pode sair da lista'),
    ).toBeTruthy();
  });
});

describe('acrescentar à compra', () => {
  const chia = produto('Chia sementes', 'mercearia');

  async function escolherChia() {
    buscarProdutos.mockResolvedValue([{ product: chia, score: '0.91' }]);
    await montar(lista([item({ id: 'a' })]));

    await fireEvent.changeText(
      await screen.findByLabelText('Acrescentar produto à compra'),
      'chia',
    );
    await fireEvent.press(screen.getByText('Buscar'));
    await fireEvent.press(await screen.findByLabelText('Acrescentar Chia sementes'));
  }

  it('escolhe o produto do catálogo e manda a quantidade', async () => {
    acrescentar.mockResolvedValue({});
    await escolherChia();

    await fireEvent.changeText(screen.getByLabelText('Quantidade a acrescentar'), '250');
    await fireEvent.press(screen.getByText('Acrescentar à lista'));

    // Produto vendido por quilo e sem embalagem declarada abre em grama, como
    // na despensa: a unidade oferecida é sempre da grandeza em que ele é vendido.
    await waitFor(() =>
      expect(acrescentar).toHaveBeenCalledWith('lista-1', {
        product_id: 'produto-Chia sementes',
        quantity: '250',
        unit: 'g',
      }),
    );
  });

  it('quantidade que não é número não vai ao servidor', async () => {
    await escolherChia();

    await fireEvent.changeText(screen.getByLabelText('Quantidade a acrescentar'), 'bastante');
    await fireEvent.press(screen.getByText('Acrescentar à lista'));

    expect(acrescentar).not.toHaveBeenCalled();
  });

  it('produto repetido devolve o motivo do servidor', async () => {
    acrescentar.mockRejectedValue(
      new api.ApiError(409, 'Chia sementes já está nesta lista de compras'),
    );
    await escolherChia();

    await fireEvent.changeText(screen.getByLabelText('Quantidade a acrescentar'), '250');
    await fireEvent.press(screen.getByText('Acrescentar à lista'));

    expect(
      await screen.findByText('Chia sementes já está nesta lista de compras'),
    ).toBeTruthy();
  });

  it('diz que a compra muda, e o plano não', async () => {
    await montar(lista([item({ id: 'a' })]));

    expect(
      await screen.findByText(
        'O que uma receita pede, ou o que acabou em casa. Isto muda a sua lista de compras — o plano da sua nutricionista continua o mesmo.',
      ),
    ).toBeTruthy();
  });
});
