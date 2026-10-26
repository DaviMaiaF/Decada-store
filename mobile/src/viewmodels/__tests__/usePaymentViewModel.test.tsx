/**
 * Testes do ViewModel do pagamento simulado.
 *
 * Pix espera o recebimento simulado; cartão responde na hora. Recusado é uma
 * tentativa, não um erro; erro é o que o servidor não aceitou.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as Clipboard from 'expo-clipboard';

import * as api from '../../services/api';
import { ApiError } from '../../services/api';
import type { Payment, ShoppingList } from '../../types/api';
import { usePaymentViewModel } from '../usePaymentViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  payShoppingList: jest.fn(),
  readPayments: jest.fn(),
  confirmPayment: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const pagar = api.payShoppingList as jest.Mock;
const lerPagamentos = api.readPayments as jest.Mock;
const confirmar = api.confirmPayment as jest.Mock;

const LISTA: ShoppingList = {
  id: 'lista-1',
  meal_plan_id: 'plano-1',
  state_code: 'DF',
  city: 'Brasília',
  estimated_total: '87.40',
  calculated_at: '2026-10-26T10:00:00Z',
  items: [],
  outdated_items: [],
};

function pagamento(over: Partial<Payment> = {}): Payment {
  return {
    id: 'pagamento-1',
    shopping_list_id: 'lista-1',
    method: 'pix',
    status: 'pendente',
    status_detail: 'aguardando pagamento',
    amount: '87.40',
    card_brand: null,
    card_last_four: null,
    pix_code: '000201SIMULADO',
    paid_at: null,
    created_at: '2026-10-26T10:00:00Z',
    simulated: true,
    ...over,
  };
}

const CARTAO_APROVADO = pagamento({
  method: 'cartao_credito',
  status: 'aprovado',
  status_detail: 'pagamento aprovado',
  card_brand: 'visa',
  card_last_four: '5682',
  pix_code: null,
  paid_at: '2026-10-26T10:00:00Z',
});

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  lerPagamentos.mockResolvedValue([]);
  cliente = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

async function montar(onAprovado?: (p: Payment) => void) {
  const hook = await renderHook(() => usePaymentViewModel(LISTA, { onAprovado }), {
    wrapper: Provedor,
  });
  await waitFor(() => expect(hook.result.current.carregando).toBe(false));
  return hook;
}

async function preencherCartao(
  result: { current: ReturnType<typeof usePaymentViewModel> },
  titular = 'APRO',
) {
  await act(async () => {
    result.current.escolherMetodo('cartao_credito');
  });
  await act(async () => {
    result.current.alterarCampo('numero', '4235647728025682');
    result.current.alterarCampo('titular', titular);
    result.current.alterarCampo('validade', '1130');
    result.current.alterarCampo('cvv', '123');
  });
}

it('começa no Pix, pronto para pagar', async () => {
  const { result } = await montar();

  expect(result.current.metodo).toBe('pix');
  expect(result.current.pago).toBe(false);
  expect(result.current.podePagar).toBe(true);
  expect(result.current.total).toBe('87.40');
});

it('lista paga numa visita anterior já abre como paga', async () => {
  lerPagamentos.mockResolvedValue([pagamento({ status: 'recusado' }), CARTAO_APROVADO]);
  const { result } = await montar();

  await waitFor(() => expect(result.current.pago).toBe(true));
  expect(result.current.podePagar).toBe(false);
});

it('Pix fica pendente com o código e aprova no recebimento simulado', async () => {
  const onAprovado = jest.fn();
  pagar.mockResolvedValue(pagamento());
  confirmar.mockResolvedValue(pagamento({ status: 'aprovado', paid_at: '2026-10-26T10:01:00Z' }));
  const { result } = await montar(onAprovado);

  await act(async () => result.current.pagar());
  await waitFor(() => expect(result.current.pixPendente).not.toBeNull());

  expect(pagar).toHaveBeenCalledWith('lista-1', 'pix', undefined);
  expect(result.current.pixPendente?.pix_code).toBe('000201SIMULADO');
  expect(result.current.podePagar).toBe(false);
  expect(onAprovado).not.toHaveBeenCalled();

  await act(async () => result.current.simularRecebimento());
  await waitFor(() => expect(result.current.pago).toBe(true));

  expect(confirmar).toHaveBeenCalledWith('lista-1', 'pagamento-1');
  expect(result.current.pixPendente).toBeNull();
  expect(onAprovado).toHaveBeenCalledTimes(1);
});

it('máscara do formulário: número em grupos, validade com barra, CVV só dígitos', async () => {
  const { result } = await montar();

  await act(async () => {
    result.current.alterarCampo('numero', '4235647728025682');
    result.current.alterarCampo('validade', '1130');
    result.current.alterarCampo('cvv', '12a3');
  });

  expect(result.current.formulario.numero).toBe('4235 6477 2802 5682');
  expect(result.current.formulario.validade).toBe('11/30');
  expect(result.current.formulario.cvv).toBe('123');
});

it('cartão incompleto não deixa pagar', async () => {
  const { result } = await montar();

  await act(async () => {
    result.current.escolherMetodo('cartao_credito');
  });
  await act(async () => {
    result.current.alterarCampo('numero', '4235647728025682');
  });

  expect(result.current.podePagar).toBe(false);
});

it('cartão aprovado vai direto e avisa quem usa o hook', async () => {
  const onAprovado = jest.fn();
  pagar.mockResolvedValue(CARTAO_APROVADO);
  const { result } = await montar(onAprovado);

  await preencherCartao(result);
  await act(async () => result.current.pagar());
  await waitFor(() => expect(result.current.pago).toBe(true));

  expect(pagar).toHaveBeenCalledWith('lista-1', 'cartao_credito', {
    number: '4235647728025682',
    holder_name: 'APRO',
    expiration_month: 11,
    expiration_year: 2030,
    security_code: '123',
  });
  expect(onAprovado).toHaveBeenCalledWith(CARTAO_APROVADO);
});

it('cartão recusado mostra o motivo e deixa tentar de novo', async () => {
  pagar.mockResolvedValue(
    pagamento({
      method: 'cartao_credito',
      status: 'recusado',
      status_detail: 'recusado por saldo insuficiente',
      pix_code: null,
    }),
  );
  const { result } = await montar();

  await preencherCartao(result, 'FUND');
  await act(async () => result.current.pagar());
  await waitFor(() => expect(result.current.recusa).not.toBeNull());

  expect(result.current.recusa).toBe('recusado por saldo insuficiente');
  expect(result.current.erro).toBeNull();
  expect(result.current.pago).toBe(false);
  expect(result.current.podePagar).toBe(true);
});

it('cartão em análise espera o recebimento simulado', async () => {
  pagar.mockResolvedValue(
    pagamento({ method: 'cartao_credito', status_detail: 'pagamento em análise', pix_code: null }),
  );
  const { result } = await montar();

  await preencherCartao(result, 'CONT');
  await act(async () => result.current.pagar());
  await waitFor(() => expect(result.current.cartaoEmAnalise).not.toBeNull());

  expect(result.current.pixPendente).toBeNull();
  expect(result.current.podePagar).toBe(false);
});

it('erro do servidor aparece com a mensagem dele', async () => {
  pagar.mockRejectedValue(new ApiError(422, 'número do cartão inválido'));
  const { result } = await montar();

  await preencherCartao(result);
  await act(async () => result.current.pagar());
  await waitFor(() => expect(result.current.erro).not.toBeNull());

  expect(result.current.erro).toBe('número do cartão inválido');
  expect(result.current.pago).toBe(false);
});

it('trocar de meio descarta o Pix pendente e o erro', async () => {
  pagar.mockResolvedValue(pagamento());
  const { result } = await montar();

  await act(async () => result.current.pagar());
  await waitFor(() => expect(result.current.pixPendente).not.toBeNull());

  await act(async () => {
    result.current.escolherMetodo('cartao_credito');
  });

  expect(result.current.metodo).toBe('cartao_credito');
  expect(result.current.pixPendente).toBeNull();
  expect(result.current.erro).toBeNull();
});

it('copia o código do Pix pendente', async () => {
  pagar.mockResolvedValue(pagamento());
  const { result } = await montar();

  await act(async () => result.current.pagar());
  await waitFor(() => expect(result.current.pixPendente).not.toBeNull());
  await act(async () => result.current.copiarPix());

  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('000201SIMULADO');
  expect(result.current.copiado).toBe(true);
});
