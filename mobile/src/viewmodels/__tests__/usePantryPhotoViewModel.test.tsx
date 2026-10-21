/**
 * Testes do ViewModel da despensa por foto.
 *
 * Decisão 11: nada entra sozinho. A foto só sai com aceite, o alimento
 * identificado ainda espera o toque, e uma gravação que falha volta a pendente
 * com o motivo.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import * as api from '../../services/api';
import type { PhotoProposal, Product } from '../../types/api';
import {
  revisoesDe,
  usePantryPhotoViewModel,
  usePhotoRowViewModel,
} from '../usePantryPhotoViewModel';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  recognizePantryPhoto: jest.fn(),
  addPantryItem: jest.fn(),
  searchProducts: jest.fn(),
}));

const permissaoDaCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const abrirCamera = ImagePicker.launchCameraAsync as jest.Mock;
const abrirGaleria = ImagePicker.launchImageLibraryAsync as jest.Mock;
const reconhecerApi = api.recognizePantryPhoto as jest.Mock;
const adicionarApi = api.addPantryItem as jest.Mock;
const buscarProdutos = api.searchProducts as jest.Mock;

function produto(nome: string): Product {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: 'hortifruti',
    base_unit: 'kg',
    package_size: null,
    package_unit: null,
    is_fictitious: false,
  };
}

const BANANA: PhotoProposal = {
  name: 'banana',
  identified: true,
  candidates: [{ product: produto('Banana prata'), score: '0.867' }],
};

const KIWI: PhotoProposal = {
  name: 'kiwi',
  identified: false,
  candidates: [{ product: produto('Uva itália'), score: '0.286' }],
};

const FOTO = { canceled: false, assets: [{ uri: 'file:///foto.jpg', mimeType: 'image/jpeg' }] };

let cliente: QueryClient;
let aoAdicionar: jest.Mock;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

async function montar() {
  return renderHook(() => usePantryPhotoViewModel(aoAdicionar), { wrapper: Provedor });
}

/** Aceita o termo, escolhe a foto da galeria e espera a revisão. */
async function reconhecerFoto(result: { current: ReturnType<typeof usePantryPhotoViewModel> }) {
  await act(async () => result.current.alternarAceite());
  await act(() => result.current.escolherFoto('galeria'));
  await waitFor(() => expect(result.current.revisoes).not.toBeNull());
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: 0 } },
  });
  aoAdicionar = jest.fn();
  permissaoDaCamera.mockResolvedValue({ granted: true });
  abrirCamera.mockResolvedValue(FOTO);
  abrirGaleria.mockResolvedValue(FOTO);
  reconhecerApi.mockResolvedValue({ items: [BANANA, KIWI] });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('revisoesDe: identificado já vem com o produto; não identificado espera', () => {
  const [banana, kiwi] = revisoesDe([BANANA, KIWI]);

  expect(banana.escolhido?.name).toBe('Banana prata');
  expect(kiwi.escolhido).toBeNull();
  expect([banana.situacao, kiwi.situacao]).toEqual(['pendente', 'pendente']);
});

it('reconhece com o aceite e separa os dois grupos, sem gravar nada', async () => {
  const { result } = await montar();

  await reconhecerFoto(result);

  expect(reconhecerApi).toHaveBeenCalledWith(
    { uri: 'file:///foto.jpg', mimeType: 'image/jpeg' },
    true,
  );
  expect(result.current.identificados.map((r) => r.proposta.name)).toEqual(['banana']);
  expect(result.current.naoIdentificados.map((r) => r.proposta.name)).toEqual(['kiwi']);
  expect(adicionarApi).not.toHaveBeenCalled();
});

it('câmera sem permissão avisa e não abre nada', async () => {
  permissaoDaCamera.mockResolvedValue({ granted: false });
  const { result } = await montar();

  await act(() => result.current.escolherFoto('camera'));

  expect(result.current.aviso).toMatch(/Sem acesso à câmera/);
  expect(abrirCamera).not.toHaveBeenCalled();
  expect(reconhecerApi).not.toHaveBeenCalled();
});

it('confirmar marca na hora e entrega o item gravado à tela', async () => {
  const gravado = { id: 'item-1' };
  adicionarApi.mockResolvedValue(gravado);
  const { result } = await montar();
  await reconhecerFoto(result);

  await act(async () => result.current.confirmar(result.current.identificados[0]));

  await waitFor(() => expect(aoAdicionar).toHaveBeenCalledWith(gravado));
  expect(adicionarApi).toHaveBeenCalledWith({
    raw_description: 'banana',
    product_id: 'produto-Banana prata',
  });
  expect(result.current.identificados[0].situacao).toBe('adicionado');
});

it('gravação que falha volta a pendente com o motivo', async () => {
  adicionarApi.mockRejectedValue(new api.ApiError(422, 'item repetido'));
  const { result } = await montar();
  await reconhecerFoto(result);

  await act(async () => result.current.confirmar(result.current.identificados[0]));

  await waitFor(() => expect(result.current.identificados[0].erro).toBe('item repetido'));
  expect(result.current.identificados[0].situacao).toBe('pendente');
});

it('escolher, descartar e corrigir o nome mexem só na linha certa', async () => {
  buscarProdutos.mockResolvedValue([{ product: produto('Kiwi'), score: '0.95' }]);
  const { result } = await montar();
  await reconhecerFoto(result);

  await act(async () => result.current.escolher(1, produto('Uva itália')));
  expect(result.current.naoIdentificados[0].escolhido?.name).toBe('Uva itália');

  // Nome corrigido com produto parecido passa a identificado.
  await act(() => result.current.renomear(1, 'kiwi verde'));
  expect(result.current.identificados.map((r) => r.proposta.name)).toEqual([
    'banana',
    'kiwi verde',
  ]);

  await act(async () => result.current.descartar(0));
  expect(result.current.identificados.map((r) => r.proposta.name)).toEqual(['kiwi verde']);
});

it('nome corrigido sem produto parecido vai para os não identificados', async () => {
  buscarProdutos.mockResolvedValue([{ product: produto('Manga'), score: '0.40' }]);
  const { result } = await montar();
  await reconhecerFoto(result);

  await act(() => result.current.renomear(0, 'pitaya'));

  expect(result.current.naoIdentificados.map((r) => r.proposta.name)).toContain('pitaya');
  expect(result.current.naoIdentificados.find((r) => r.id === 0)?.escolhido).toBeNull();
});

it('fechar limpa a revisão', async () => {
  const { result } = await montar();
  await act(async () => result.current.abrir());
  await reconhecerFoto(result);

  await act(async () => result.current.fechar());

  expect(result.current.aberto).toBe(false);
  expect(result.current.revisoes).toBeNull();
});

describe('usePhotoRowViewModel', () => {
  it('nome curto não busca; nome válido busca e fecha o campo', async () => {
    const onRenomear = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() => usePhotoRowViewModel(onRenomear));

    await act(async () => result.current.abrirEdicao('pêssego'));
    await act(async () => result.current.mudarNome(' m '));
    expect(result.current.nomeValido).toBe(false);
    await act(() => result.current.buscarNomeNovo());
    expect(onRenomear).not.toHaveBeenCalled();

    await act(async () => result.current.mudarNome(' manga '));
    await act(() => result.current.buscarNomeNovo());

    expect(onRenomear).toHaveBeenCalledWith('manga');
    expect(result.current.editando).toBeNull();
  });

  it('se a busca falha, o campo fica aberto', async () => {
    const onRenomear = jest.fn().mockRejectedValue(new Error('fora do ar'));
    const { result } = await renderHook(() => usePhotoRowViewModel(onRenomear));

    await act(async () => result.current.abrirEdicao('manga'));
    await act(() => result.current.buscarNomeNovo());

    expect(result.current.editando).toBe('manga');
  });
});
