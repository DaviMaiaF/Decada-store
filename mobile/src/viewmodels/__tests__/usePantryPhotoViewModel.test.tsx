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
  MAXIMO_DE_FOTOS,
  juntarPropostas,
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

/** Aceita o termo, escolhe a foto da galeria, envia e espera a revisão. */
async function reconhecerFoto(result: { current: ReturnType<typeof usePantryPhotoViewModel> }) {
  await act(async () => result.current.alternarAceite());
  await act(() => result.current.escolherFoto('galeria'));
  await act(async () => result.current.enviar());
  await waitFor(() => expect(result.current.revisoes).not.toBeNull());
}

function fotos(...nomes: string[]) {
  return {
    canceled: false,
    assets: nomes.map((nome) => ({ uri: `file:///${nome}.jpg`, mimeType: 'image/jpeg' })),
  };
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

it('juntarPropostas: alimento repetido entre fotos vira um só, e o identificado ganha', () => {
  const kiwiIdentificado: PhotoProposal = { ...KIWI, name: 'Kiwi ', identified: true };
  const feijao: PhotoProposal = { name: 'feijão', identified: true, candidates: [] };
  const feijaoSemAcento: PhotoProposal = { name: 'Feijao', identified: true, candidates: [] };

  const juntas = juntarPropostas([[BANANA, KIWI, feijao], [kiwiIdentificado, BANANA, feijaoSemAcento]]);

  expect(juntas.map((p) => p.name)).toEqual(['banana', 'Kiwi ', 'feijão']);
  expect(juntas[1].identified).toBe(true);
});

it('escolher foto só junta na fila: nada sai antes de enviar', async () => {
  abrirGaleria.mockResolvedValue(fotos('a', 'b'));
  const { result } = await montar();
  await act(async () => result.current.alternarAceite());

  await act(() => result.current.escolherFoto('galeria'));
  await act(() => result.current.escolherFoto('camera'));

  expect(result.current.fotos.map((f) => f.uri)).toEqual([
    'file:///a.jpg',
    'file:///b.jpg',
    'file:///foto.jpg',
  ]);
  expect(reconhecerApi).not.toHaveBeenCalled();
  expect(abrirGaleria).toHaveBeenCalledWith(
    expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: MAXIMO_DE_FOTOS }),
  );
});

it('não junta mais que o máximo, mesmo se a galeria devolver mais', async () => {
  abrirGaleria.mockResolvedValue(fotos('1', '2', '3', '4', '5', '6', '7'));
  const { result } = await montar();
  await act(async () => result.current.alternarAceite());

  await act(() => result.current.escolherFoto('galeria'));

  expect(result.current.fotos).toHaveLength(MAXIMO_DE_FOTOS);
  expect(result.current.podeJuntarMais).toBe(false);
  await act(() => result.current.escolherFoto('camera'));
  expect(abrirCamera).not.toHaveBeenCalled();
});

it('tirar uma foto da fila', async () => {
  abrirGaleria.mockResolvedValue(fotos('a', 'b', 'c'));
  const { result } = await montar();
  await act(async () => result.current.alternarAceite());
  await act(() => result.current.escolherFoto('galeria'));

  await act(async () => result.current.removerFoto(1));

  expect(result.current.fotos.map((f) => f.uri)).toEqual(['file:///a.jpg', 'file:///c.jpg']);
});

it('envia cada foto e junta as propostas sem repetir', async () => {
  abrirGaleria.mockResolvedValue(fotos('geladeira', 'armario'));
  reconhecerApi
    .mockResolvedValueOnce({ items: [BANANA] })
    .mockResolvedValueOnce({ items: [BANANA, KIWI] });
  const { result } = await montar();

  await reconhecerFoto(result);

  expect(reconhecerApi).toHaveBeenCalledTimes(2);
  expect(reconhecerApi).toHaveBeenCalledWith(
    { uri: 'file:///armario.jpg', mimeType: 'image/jpeg' },
    true,
  );
  expect(result.current.identificados.map((r) => r.proposta.name)).toEqual(['banana']);
  expect(result.current.naoIdentificados.map((r) => r.proposta.name)).toEqual(['kiwi']);
  expect(result.current.fotos).toEqual([]);
  expect(result.current.fotosQueFalharam).toBe(0);
});

it('uma foto que falha não derruba as outras', async () => {
  abrirGaleria.mockResolvedValue(fotos('a', 'b'));
  reconhecerApi
    .mockRejectedValueOnce(new api.ApiError(503, 'fora do ar'))
    .mockResolvedValueOnce({ items: [BANANA] });
  const { result } = await montar();

  await reconhecerFoto(result);

  expect(result.current.identificados.map((r) => r.proposta.name)).toEqual(['banana']);
  expect(result.current.fotosQueFalharam).toBe(1);
  expect(result.current.fotosEnviadas).toBe(2);
  expect(result.current.erroDoReconhecimento).toBeNull();
});

it('se todas falham, é erro e as fotos ficam na fila para tentar de novo', async () => {
  abrirGaleria.mockResolvedValue(fotos('a', 'b'));
  reconhecerApi.mockRejectedValue(new api.ApiError(503, 'fora do ar'));
  const { result } = await montar();
  await act(async () => result.current.alternarAceite());
  await act(() => result.current.escolherFoto('galeria'));

  await act(async () => result.current.enviar());

  await waitFor(() => expect(result.current.erroDoReconhecimento).toBe('fora do ar'));
  expect(result.current.revisoes).toBeNull();
  expect(result.current.fotos).toHaveLength(2);
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
