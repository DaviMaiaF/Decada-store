/**
 * Testes do editor de plano alimentar da nutricionista.
 *
 * O caminho principal: montar uma refeição com substituição e salvar. E as duas
 * formas de entregar, que salvam antes — enviar o plano que está na tela, e não
 * a versão anterior, é a diferença entre o paciente receber o certo ou não.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import PrescriptionEditorScreen from '../PrescriptionEditorScreen';
import * as api from '../../services/api';
import { savePdf } from '../../services/download';
import type { Prescription } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  createPrescription: jest.fn(),
  updatePrescription: jest.fn(),
  deletePrescription: jest.fn(),
  sendPrescription: jest.fn(),
  downloadPrescriptionPdf: jest.fn(),
}));

jest.mock('../../services/download', () => ({ savePdf: jest.fn() }));

const criar = api.createPrescription as jest.Mock;
const atualizar = api.updatePrescription as jest.Mock;
const excluir = api.deletePrescription as jest.Mock;
const enviar = api.sendPrescription as jest.Mock;
const baixar = api.downloadPrescriptionPdf as jest.Mock;
const salvarPdf = savePdf as jest.Mock;

function salvo(over: Partial<Prescription> = {}): Prescription {
  return {
    id: 'plano-1',
    title: 'Plano de outubro',
    patient_name: null,
    patient_email: null,
    notes: null,
    status: 'rascunho',
    sent_at: null,
    responded_at: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    meals: [
      {
        name: 'Almoço',
        time: '12:30:00',
        notes: null,
        items: [{ food: 'Arroz', household_measure: null, quantity: '150.000', unit: 'g' }],
        substitutions: [],
      },
    ],
    ...over,
  };
}

let cliente: QueryClient;
const onDone = jest.fn();

async function montar(prescription: Prescription | null = null) {
  await render(
    <QueryClientProvider client={cliente}>
      <PrescriptionEditorScreen prescription={prescription} onDone={onDone} />
    </QueryClientProvider>,
  );
}

const digitar = (rotulo: string, texto: string) =>
  fireEvent.changeText(screen.getByLabelText(rotulo), texto);

async function preencherCafe() {
  await digitar('Nome da refeição 1', 'Café da manhã');
  await digitar('Horário de Café da manhã', '8:30');
  await digitar('Alimento: Café da manhã, alimento 1', 'Pão francês');
  await digitar('Quantidade: Café da manhã, alimento 1', '50');
  await digitar('Medida caseira: Café da manhã, alimento 1', '1 unidade média');
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('salva um plano novo com refeição e substituição', async () => {
  criar.mockResolvedValue(salvo());
  await montar();

  await preencherCafe();
  await fireEvent.press(screen.getByText('Adicionar substituição'));
  await digitar('Alimento: Café da manhã, substituição 1, alimento 1', 'Tapioca');
  await digitar('Quantidade: Café da manhã, substituição 1, alimento 1', '35');
  await fireEvent.press(screen.getByText('Salvar plano'));

  await waitFor(() =>
    expect(criar).toHaveBeenCalledWith({
      title: null,
      patient_name: null,
      notes: null,
      meals: [
        {
          name: 'Café da manhã',
          time: '08:30',
          notes: null,
          items: [
            { food: 'Pão francês', household_measure: '1 unidade média', quantity: '50', unit: 'g' },
          ],
          substitutions: [
            [{ food: 'Tapioca', household_measure: null, quantity: '35', unit: 'g' }],
          ],
        },
      ],
    }),
  );
  expect(await screen.findByText('Plano salvo.')).toBeTruthy();
});

it('a unidade escolhida vai para o corpo', async () => {
  criar.mockResolvedValue(salvo());
  await montar();

  await preencherCafe();
  await fireEvent.press(screen.getByLabelText('Unidade unidade: Café da manhã, alimento 1'));
  await fireEvent.press(screen.getByText('Salvar plano'));

  await waitFor(() => expect(criar).toHaveBeenCalled());
  expect(criar.mock.calls[0][0].meals[0].items[0].unit).toBe('unidade');
});

it('plano inválido não vai à rede e diz onde está o problema', async () => {
  await montar();

  await digitar('Nome da refeição 1', 'Café da manhã');
  await fireEvent.press(screen.getByText('Salvar plano'));

  expect(await screen.findByText('Café da manhã: informe o horário, como 08:30')).toBeTruthy();
  expect(criar).not.toHaveBeenCalled();
});

it('enviar salva antes e envia a versão da tela', async () => {
  atualizar.mockResolvedValue(salvo({ title: 'Revisto' }));
  enviar.mockResolvedValue(salvo({ status: 'enviada', patient_email: 'paciente@example.com' }));
  await montar(salvo());

  await digitar('Título', 'Revisto');
  await digitar('E-mail do paciente', 'paciente@example.com');
  await fireEvent.press(screen.getByText('Enviar pelo e-mail'));

  await waitFor(() => expect(enviar).toHaveBeenCalledWith('plano-1', 'paciente@example.com'));
  expect(atualizar.mock.calls[0][1].title).toBe('Revisto');
  expect(atualizar.mock.invocationCallOrder[0]).toBeLessThan(enviar.mock.invocationCallOrder[0]);
  expect(await screen.findByText(/Enviado para paciente@example.com/)).toBeTruthy();
});

it('enviar sem e-mail avisa e não chama a API', async () => {
  await montar(salvo());

  await fireEvent.press(screen.getByText('Enviar pelo e-mail'));

  expect(await screen.findByText('informe o e-mail do paciente')).toBeTruthy();
  expect(enviar).not.toHaveBeenCalled();
});

it('baixar o PDF salva antes e entrega o arquivo', async () => {
  const bytes = new ArrayBuffer(4);
  criar.mockResolvedValue(salvo());
  baixar.mockResolvedValue(bytes);
  await montar();

  await preencherCafe();
  await fireEvent.press(screen.getByText('Baixar PDF'));

  await waitFor(() => expect(salvarPdf).toHaveBeenCalledWith(bytes, 'plano-alimentar.pdf'));
  expect(baixar).toHaveBeenCalledWith('plano-1');
});

it('mostra a recusa do servidor', async () => {
  atualizar.mockRejectedValue(new api.ApiError(409, 'o paciente já aceitou este plano'));
  await montar(salvo());

  await fireEvent.press(screen.getByText('Salvar plano'));

  expect(await screen.findByText('o paciente já aceitou este plano')).toBeTruthy();
});

it('plano aceito é só leitura, mas ainda dá para baixar o PDF', async () => {
  baixar.mockResolvedValue(new ArrayBuffer(1));
  await montar(salvo({ status: 'aceita', patient_email: 'paciente@example.com' }));

  expect(screen.getByText('aceito pelo paciente')).toBeTruthy();
  expect(screen.getByText('12:30 · Almoço')).toBeTruthy();
  expect(screen.queryByText('Salvar plano')).toBeNull();
  expect(screen.queryByText('Enviar pelo e-mail')).toBeNull();

  await fireEvent.press(screen.getByText('Baixar PDF'));

  await waitFor(() => expect(salvarPdf).toHaveBeenCalled());
  expect(atualizar).not.toHaveBeenCalled();
});

it('remover refeição e alimento', async () => {
  await montar(salvo());

  await fireEvent.press(screen.getByText('Adicionar refeição'));
  await fireEvent.press(screen.getByLabelText('Remover Refeição 2'));
  await fireEvent.press(screen.getByText('Adicionar alimento'));
  await fireEvent.press(screen.getByLabelText('Remover Almoço, alimento 2'));

  expect(screen.queryByLabelText('Nome da refeição 2')).toBeNull();
  expect(screen.queryByLabelText('Alimento: Almoço, alimento 2')).toBeNull();
});

it('excluir pede confirmação', async () => {
  excluir.mockResolvedValue(undefined);
  await montar(salvo());

  await fireEvent.press(screen.getByText('Excluir plano'));
  expect(excluir).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Confirmar exclusão'));

  await waitFor(() => expect(excluir).toHaveBeenCalledWith('plano-1'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

it('plano novo não tem botão de excluir', async () => {
  await montar();

  expect(screen.queryByText('Excluir plano')).toBeNull();
});
