/**
 * Testes da confirmação do casamento item–produto.
 *
 * A regra que estes testes protegem é a decisão 4: o servidor sugere, quem
 * confirma é a pessoa. O candidato aparecer já visível encurta o caminho sem
 * mudar quem decide — nada é gravado até alguém tocar em "Confirmar".
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ConfirmationScreen from '../ConfirmationScreen';
import * as api from '../../services/api';
import type { Candidate, MealPlan, PlanItem } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readMealPlan: jest.fn(),
  readCandidates: jest.fn(),
  confirmItem: jest.fn(),
}));

const lerPlano = api.readMealPlan as jest.Mock;
const lerCandidatos = api.readCandidates as jest.Mock;
const confirmar = api.confirmItem as jest.Mock;

function item(over: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    position: 1,
    raw_description: '50 g de aveia em flocos',
    quantity: '50.000',
    unit: 'g',
    status: 'pendente',
    product_id: null,
    product: null,
    match_score: null,
    ...over,
  };
}

function plano(itens: PlanItem[]): MealPlan {
  return {
    id: 'plano-1',
    title: null,
    nutritionist_name: null,
    nutritionist_crn: null,
    consent_at: '2026-09-27T10:00:00Z',
    consent_version: 'v1',
    prescribed_meals: null,
    created_at: '2026-09-27T10:00:00Z',
    items: itens,
  };
}

function candidato(nome: string, score: string, over: Partial<Candidate> = {}): Candidate {
  return {
    product: {
      id: `produto-${nome}`,
      name: nome,
      brand: 'Manhã Boa',
      category: 'mercearia',
      base_unit: 'kg',
      package_size: null,
      package_unit: null,
      is_fictitious: false,
    },
    score,
    unit_compatible: true,
    quantity_in_base: '0.050',
    packages_needed: 1,
    ...over,
  };
}

let cliente: QueryClient;

async function montar(onReady = jest.fn(), onNewPlan = jest.fn()) {
  await render(
    <QueryClientProvider client={cliente}>
      <ConfirmationScreen planId="plano-1" onReady={onReady} onNewPlan={onNewPlan} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  lerPlano.mockResolvedValue(plano([item({ id: 'item-1' })]));
  lerCandidatos.mockResolvedValue([
    candidato('Aveia em flocos', '0.940'),
    candidato('Granola tradicional', '0.610'),
  ]);
  confirmar.mockResolvedValue(item({ id: 'item-1', status: 'confirmado' }));
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('mostra o candidato mais provável sem precisar abrir', async () => {
  await montar();

  // Antes era preciso abrir item por item: três toques para cada um dos 15.
  expect(await screen.findByText('Aveia em flocos')).toBeTruthy();
  expect(screen.getByText(/94% de semelhança/)).toBeTruthy();
});

it('não grava nada só por mostrar o candidato', async () => {
  await montar();

  await screen.findByText('Aveia em flocos');
  // Decisão 4: o casamento nunca é automático.
  expect(confirmar).not.toHaveBeenCalled();
});

it('confirma o candidato sugerido em um toque', async () => {
  await montar();

  await fireEvent.press(await screen.findByText('Confirmar'));

  await waitFor(() =>
    expect(confirmar).toHaveBeenCalledWith(
      'plano-1',
      'item-1',
      'produto-Aveia em flocos',
      '0.940',
    ),
  );
});

it('confirmar faz a lista já gerada ser lida de novo', async () => {
  // Sem isto, trocar o produto aqui deixava o Mercado com o antigo e sem o
  // aviso de lista desatualizada até alguém reabrir o app.
  const invalidar = jest.spyOn(cliente, 'invalidateQueries');
  await montar();

  await fireEvent.press(await screen.findByText('Confirmar'));

  await waitFor(() =>
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['shopping-list'] }),
  );
});

it('abre as outras opções para quem discorda da sugestão', async () => {
  await montar();

  await fireEvent.press(await screen.findByText('Ver outras opções'));

  expect(await screen.findByText('Granola tradicional')).toBeTruthy();
});

it('item já confirmado não procura candidato', async () => {
  lerPlano.mockResolvedValue(plano([item({ id: 'item-1', status: 'confirmado' })]));

  await montar();

  await screen.findByText('confirmado');
  expect(lerCandidatos).not.toHaveBeenCalled();
});

it('avisa quando o catálogo não tem nada parecido', async () => {
  lerCandidatos.mockResolvedValue([]);

  await montar();

  expect(
    await screen.findByText('Nenhum produto do catálogo se parece com este item.'),
  ).toBeTruthy();
});

it('o rodapé leva ao mercado, e não promete gerar a lista', async () => {
  const onReady = jest.fn();
  lerPlano.mockResolvedValue(plano([item({ id: 'item-1', status: 'confirmado' })]));

  await montar(onReady);

  // Havia dois botões "Gerar lista de compras" em telas diferentes; só o do
  // Mercado gera de fato.
  await fireEvent.press(await screen.findByText('Ir para o mercado'));
  expect(onReady).toHaveBeenCalledWith('plano-1');
});

describe('confirmação em lote', () => {
  beforeEach(() => {
    lerPlano.mockResolvedValue(
      plano([
        item({ id: 'item-1', raw_description: '50 g de aveia em flocos' }),
        item({ id: 'item-2', raw_description: '200 ml de leite' }),
        item({ id: 'item-3', raw_description: '1 banana' }),
      ]),
    );
    lerCandidatos.mockImplementation(async (_plano: string, itemId: string) => {
      if (itemId === 'item-1') return [candidato('Aveia em flocos', '0.940')];
      if (itemId === 'item-2') return [candidato('Leite integral', '0.880')];
      // Unidade diferente: fica fora do lote.
      return [candidato('Banana prata', '0.900', { unit_compatible: false })];
    });
  });

  it('selecionar sugeridos deixa de fora o item com unidade diferente', async () => {
    await montar();

    expect(await screen.findByText('Selecionar sugeridos (2 de 3)')).toBeTruthy();
    expect(screen.getByLabelText('Selecionar 50 g de aveia em flocos')).toBeTruthy();
    expect(screen.queryByLabelText('Selecionar 1 banana')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Selecionar sugeridos'));
    await fireEvent.press(screen.getByText('Confirmar selecionados (2)'));

    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(2));
    expect(confirmar).toHaveBeenCalledWith('plano-1', 'item-1', 'produto-Aveia em flocos', '0.940');
    expect(confirmar).toHaveBeenCalledWith('plano-1', 'item-2', 'produto-Leite integral', '0.880');
  });

  it('item não encontrado fica fora do lote, mesmo com candidato', async () => {
    // O import marca "não encontrado" quando o melhor candidato fica abaixo do
    // score mínimo. Ele ainda aparece como sugestão, mas não pode ir no lote.
    lerPlano.mockResolvedValue(
      plano([
        item({ id: 'item-1', raw_description: '50 g de aveia em flocos' }),
        item({ id: 'item-2', raw_description: 'Tapioca', status: 'nao_identificado' }),
      ]),
    );
    lerCandidatos.mockImplementation(async (_plano: string, itemId: string) =>
      itemId === 'item-1'
        ? [candidato('Aveia em flocos', '0.940')]
        : [candidato('Filé de tilápia', '0.460')],
    );

    await montar();

    expect(await screen.findByText('Selecionar sugeridos (1 de 2)')).toBeTruthy();
    expect(screen.queryByLabelText('Selecionar Tapioca')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Selecionar sugeridos'));
    await fireEvent.press(screen.getByText('Confirmar selecionados (1)'));

    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
    expect(confirmar).toHaveBeenCalledWith('plano-1', 'item-1', 'produto-Aveia em flocos', '0.940');
  });

  it('confirma só os itens marcados', async () => {
    await montar();

    await fireEvent.press(await screen.findByLabelText('Selecionar 200 ml de leite'));
    await fireEvent.press(screen.getByText('Confirmar selecionados (1)'));

    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
    expect(confirmar).toHaveBeenCalledWith('plano-1', 'item-2', 'produto-Leite integral', '0.880');
  });

  it('não grava nada sem a pessoa marcar', async () => {
    await montar();

    await screen.findByText('Selecionar sugeridos (2 de 3)');
    // Decisão 4: o lote é um ato da pessoa, não uma confirmação automática.
    expect(screen.getByText('Confirmar selecionados (0)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirmar selecionados (0)'));
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('a falha de um item não derruba os outros', async () => {
    confirmar.mockImplementation(async (_plano: string, itemId: string) => {
      if (itemId === 'item-1') throw new Error('falhou');
      return item({ id: itemId, status: 'confirmado' });
    });

    await montar();

    await fireEvent.press(await screen.findByLabelText('Selecionar sugeridos'));
    await fireEvent.press(screen.getByText('Confirmar selecionados (2)'));

    expect(await screen.findByText('não foi possível confirmar este produto')).toBeTruthy();
    expect(confirmar).toHaveBeenCalledTimes(2);
    // O que falhou continua marcado, pronto para tentar de novo.
    expect(screen.getByText('Confirmar selecionados (1)')).toBeTruthy();
  });
});

describe('edição de item confirmado', () => {
  beforeEach(() => {
    lerPlano.mockResolvedValue(
      plano([
        item({
          id: 'item-1',
          status: 'confirmado',
          product_id: 'produto-Aveia em flocos',
          product: candidato('Aveia em flocos', '0.940').product,
        }),
      ]),
    );
  });

  it('mostra qual produto foi escolhido', async () => {
    await montar();

    expect(await screen.findByText('→ Aveia em flocos · Manhã Boa')).toBeTruthy();
  });

  it('depois de editar, o card mostra o produto novo', async () => {
    // O servidor passa a devolver o item com o produto trocado, como faz de
    // verdade depois da confirmação.
    const granola = candidato('Granola tradicional', '0.610').product;
    confirmar.mockImplementation(async () => {
      lerPlano.mockResolvedValue(
        plano([
          item({ id: 'item-1', status: 'confirmado', product_id: granola.id, product: granola }),
        ]),
      );
      return item({ id: 'item-1', status: 'confirmado', product_id: granola.id, product: granola });
    });
    await montar();

    await fireEvent.press(await screen.findByText('Editar'));
    await fireEvent.press(await screen.findByText('Granola tradicional'));

    expect(await screen.findByText('→ Granola tradicional · Manhã Boa')).toBeTruthy();
    expect(screen.queryByText('→ Aveia em flocos · Manhã Boa')).toBeNull();
  });

  it('troca o produto de um item já confirmado', async () => {
    await montar();

    await fireEvent.press(await screen.findByText('Editar'));

    expect(await screen.findByText('atual')).toBeTruthy();
    await fireEvent.press(screen.getByText('Granola tradicional'));

    await waitFor(() =>
      expect(confirmar).toHaveBeenCalledWith(
        'plano-1',
        'item-1',
        'produto-Granola tradicional',
        '0.610',
      ),
    );
  });

  it('item confirmado não entra no lote', async () => {
    await montar();

    await screen.findByText('Editar');
    expect(screen.queryByText(/Selecionar sugeridos/)).toBeNull();
  });
});
