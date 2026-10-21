/**
 * Testes da despensa por foto.
 *
 * O que mais importa provar: a foto não sai sem aceite, e nada entra na
 * despensa sem o toque da pessoa — nem o alimento identificado.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { DespensaPorFoto } from '../DespensaPorFoto';
import * as api from '../../services/api';
import type { PhotoProposal, Product } from '../../types/api';

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
const reconhecer = api.recognizePantryPhoto as jest.Mock;
const adicionar = api.addPantryItem as jest.Mock;
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
  candidates: [
    { product: produto('Banana prata'), score: '0.867' },
    { product: produto('Banana nanica'), score: '0.850' },
  ],
};

const KIWI: PhotoProposal = {
  name: 'kiwi',
  identified: false,
  candidates: [{ product: produto('Uva itália'), score: '0.286' }],
};

const FOTO = { canceled: false, assets: [{ uri: 'file:///foto.jpg', mimeType: 'image/jpeg' }] };

let cliente: QueryClient;
let aoAdicionar: jest.Mock;

async function montar() {
  await render(
    <QueryClientProvider client={cliente}>
      <DespensaPorFoto onAdicionado={aoAdicionar} />
    </QueryClientProvider>,
  );
}

/** Abre o painel, aceita o termo e escolhe a foto da galeria. */
async function enviarFoto() {
  await fireEvent.press(await screen.findByText('📷 Encher por foto'));
  await fireEvent.press(screen.getByLabelText('Aceito enviar a foto para reconhecimento'));
  await fireEvent.press(screen.getByText('Escolher da galeria'));
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  aoAdicionar = jest.fn();
  permissaoDaCamera.mockResolvedValue({ granted: true });
  abrirCamera.mockResolvedValue(FOTO);
  abrirGaleria.mockResolvedValue(FOTO);
  reconhecer.mockResolvedValue({ items: [BANANA, KIWI] });
  adicionar.mockResolvedValue({ id: 'item-1' });
  buscarProdutos.mockResolvedValue([
    { product: produto('Manga palmer'), score: '0.850' },
    { product: produto('Manga tommy'), score: '0.840' },
  ]);
});

/** Abre o campo de correção de um alimento e digita o nome certo. */
async function corrigir(de: string, para: string) {
  await fireEvent.press(await screen.findByLabelText(`Editar ${de}`));
  await fireEvent.changeText(screen.getByLabelText(`Corrigir o nome de ${de}`), para);
}

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

describe('despensa por foto', () => {
  it('não deixa enviar a foto sem o aceite', async () => {
    await montar();
    await fireEvent.press(await screen.findByText('📷 Encher por foto'));

    await fireEvent.press(screen.getByText('Escolher da galeria'));
    await fireEvent.press(screen.getByText('Tirar foto'));

    expect(abrirGaleria).not.toHaveBeenCalled();
    expect(abrirCamera).not.toHaveBeenCalled();
    expect(reconhecer).not.toHaveBeenCalled();
  });

  it('envia a foto com o aceite e mostra o que reconheceu', async () => {
    await montar();
    await enviarFoto();

    expect(await screen.findByText('banana')).toBeTruthy();
    expect(screen.getByText('Produto: Banana prata')).toBeTruthy();
    expect(screen.getByText('Não identificados')).toBeTruthy();
    expect(screen.getByText('kiwi')).toBeTruthy();
    expect(reconhecer).toHaveBeenCalledWith(
      { uri: 'file:///foto.jpg', mimeType: 'image/jpeg' },
      true,
    );
  });

  it('nada entra na despensa sem confirmar', async () => {
    await montar();
    await enviarFoto();
    await screen.findByText('banana');

    await fireEvent.press(screen.getByText('Concluir'));

    expect(adicionar).not.toHaveBeenCalled();
  });

  it('confirmar guarda o alimento com o produto proposto e sem quantidade', async () => {
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Confirmar banana'));

    await waitFor(() =>
      expect(adicionar).toHaveBeenCalledWith({
        raw_description: 'banana',
        product_id: 'produto-Banana prata',
      }),
    );
    expect(await screen.findByText('✓ banana')).toBeTruthy();
    expect(aoAdicionar).toHaveBeenCalled();
  });

  it('o ✓ aparece no toque, sem esperar o servidor', async () => {
    // Uma gravação que ainda não respondeu.
    adicionar.mockReturnValue(new Promise(() => {}));
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Confirmar banana'));

    expect(screen.getByText('✓ banana')).toBeTruthy();
    expect(aoAdicionar).not.toHaveBeenCalled();
  });

  it('entrega à tela o item que o servidor gravou', async () => {
    const gravado = { id: 'item-9', raw_description: 'banana', product: null, quantity: null, unit: null };
    adicionar.mockResolvedValue(gravado);
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Confirmar banana'));

    await waitFor(() => expect(aoAdicionar).toHaveBeenCalledWith(gravado));
  });

  it('se a gravação falhar, a linha volta a ficar pendente com o motivo', async () => {
    adicionar.mockRejectedValue(new api.ApiError(422, 'produto não encontrado'));
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Confirmar banana'));

    expect(await screen.findByText('produto não encontrado')).toBeTruthy();
    expect(screen.getByLabelText('Confirmar banana')).toBeTruthy();
    expect(screen.queryByText('✓ banana')).toBeNull();
    expect(aoAdicionar).not.toHaveBeenCalled();
  });

  it('a falha de um item não apaga o ✓ do outro', async () => {
    adicionar.mockImplementation(({ raw_description }: { raw_description: string }) =>
      raw_description === 'kiwi'
        ? Promise.reject(new api.ApiError(0, 'sem rede'))
        : Promise.resolve({ id: 'item-1' }),
    );
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Confirmar banana'));
    await fireEvent.press(screen.getByLabelText('Confirmar kiwi'));

    expect(await screen.findByText('sem rede')).toBeTruthy();
    expect(screen.getByText('✓ banana')).toBeTruthy();
  });

  it('trocar o produto muda o que vai junto ao confirmar', async () => {
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Trocar o produto de banana'));
    await fireEvent.press(screen.getByLabelText('Usar Banana nanica para banana'));
    await fireEvent.press(screen.getByLabelText('Confirmar banana'));

    await waitFor(() =>
      expect(adicionar).toHaveBeenCalledWith({
        raw_description: 'banana',
        product_id: 'produto-Banana nanica',
      }),
    );
  });

  it('não identificado começa sem produto e pode ser guardado só como texto', async () => {
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Confirmar kiwi'));

    await waitFor(() =>
      expect(adicionar).toHaveBeenCalledWith({ raw_description: 'kiwi', product_id: null }),
    );
  });

  it('descartar tira o alimento da revisão sem gravar nada', async () => {
    await montar();
    await enviarFoto();

    await fireEvent.press(await screen.findByLabelText('Descartar banana'));

    expect(screen.queryByText('banana')).toBeNull();
    expect(adicionar).not.toHaveBeenCalled();
  });

  it('foto sem alimento avisa em vez de mostrar lista vazia', async () => {
    reconhecer.mockResolvedValue({ items: [] });
    await montar();
    await enviarFoto();

    expect(await screen.findByText(/Não reconheci nenhum alimento/)).toBeTruthy();
  });

  it('mostra o erro do servidor', async () => {
    reconhecer.mockRejectedValue(
      new api.ApiError(503, 'o reconhecimento da foto não respondeu; tente de novo'),
    );
    await montar();
    await enviarFoto();

    expect(
      await screen.findByText('o reconhecimento da foto não respondeu; tente de novo'),
    ).toBeTruthy();
  });

  it('sem permissão da câmera não abre nada e explica', async () => {
    permissaoDaCamera.mockResolvedValue({ granted: false });
    await montar();
    await fireEvent.press(await screen.findByText('📷 Encher por foto'));
    await fireEvent.press(screen.getByLabelText('Aceito enviar a foto para reconhecimento'));

    await fireEvent.press(screen.getByText('Tirar foto'));

    expect(await screen.findByText(/Sem acesso à câmera/)).toBeTruthy();
    expect(abrirCamera).not.toHaveBeenCalled();
  });

  it('cancelar a câmera não envia nada', async () => {
    abrirCamera.mockResolvedValue({ canceled: true, assets: null });
    await montar();
    await fireEvent.press(await screen.findByText('📷 Encher por foto'));
    await fireEvent.press(screen.getByLabelText('Aceito enviar a foto para reconhecimento'));

    await fireEvent.press(screen.getByText('Tirar foto'));

    await waitFor(() => expect(abrirCamera).toHaveBeenCalled());
    expect(reconhecer).not.toHaveBeenCalled();
  });

  describe('corrigir o nome', () => {
    it('busca o nome corrigido e troca o produto proposto', async () => {
      await montar();
      await enviarFoto();
      await corrigir('banana', 'manga');

      await fireEvent.press(screen.getByLabelText('Buscar o nome corrigido de banana'));

      expect(buscarProdutos).toHaveBeenCalledWith('manga');
      expect(await screen.findByText('manga')).toBeTruthy();
      expect(screen.getByText('Produto: Manga palmer')).toBeTruthy();
      expect(screen.queryByText('banana')).toBeNull();
    });

    it('confirmar depois de corrigir guarda o nome e o produto novos', async () => {
      await montar();
      await enviarFoto();
      await corrigir('banana', 'manga');
      await fireEvent.press(screen.getByLabelText('Buscar o nome corrigido de banana'));

      await fireEvent.press(await screen.findByLabelText('Confirmar manga'));

      await waitFor(() =>
        expect(adicionar).toHaveBeenCalledWith({
          raw_description: 'manga',
          product_id: 'produto-Manga palmer',
        }),
      );
    });

    it('corrigir não grava nada sozinho', async () => {
      await montar();
      await enviarFoto();
      await corrigir('banana', 'manga');
      await fireEvent.press(screen.getByLabelText('Buscar o nome corrigido de banana'));
      await screen.findByText('manga');

      expect(adicionar).not.toHaveBeenCalled();
    });

    it('nome sem produto parecido vai para os não identificados', async () => {
      buscarProdutos.mockResolvedValue([{ product: produto('Uva itália'), score: '0.300' }]);
      await montar();
      await enviarFoto();
      await corrigir('banana', 'pitomba');

      await fireEvent.press(screen.getByLabelText('Buscar o nome corrigido de banana'));

      expect(await screen.findByText('pitomba')).toBeTruthy();
      // Dois sem produto: o kiwi que já veio assim e a pitomba corrigida.
      expect(screen.getAllByText('Sem produto do catálogo')).toHaveLength(2);
      expect(screen.getByLabelText('Confirmar pitomba')).toBeTruthy();
    });

    it('não identificado pode ser corrigido e passar a ter produto', async () => {
      await montar();
      await enviarFoto();
      await corrigir('kiwi', 'manga');

      await fireEvent.press(screen.getByLabelText('Buscar o nome corrigido de kiwi'));

      expect(await screen.findByText('Produto: Manga palmer')).toBeTruthy();
      expect(screen.queryByText('Não identificados')).toBeNull();
    });

    it('cancelar mantém a proposta original', async () => {
      await montar();
      await enviarFoto();
      await corrigir('banana', 'manga');

      await fireEvent.press(screen.getByText('Cancelar'));

      expect(screen.getByText('banana')).toBeTruthy();
      expect(screen.getByText('Produto: Banana prata')).toBeTruthy();
      expect(buscarProdutos).not.toHaveBeenCalled();
    });

    it('nome curto demais não busca', async () => {
      await montar();
      await enviarFoto();
      await corrigir('banana', 'm');

      await fireEvent.press(screen.getByLabelText('Buscar o nome corrigido de banana'));

      expect(buscarProdutos).not.toHaveBeenCalled();
    });

    it('falha na busca mostra o erro e deixa o campo aberto', async () => {
      buscarProdutos.mockRejectedValue(new api.ApiError(0, 'não foi possível falar com o servidor'));
      await montar();
      await enviarFoto();
      await corrigir('banana', 'manga');

      await fireEvent.press(screen.getByLabelText('Buscar o nome corrigido de banana'));

      expect(await screen.findByText('não foi possível falar com o servidor')).toBeTruthy();
      expect(screen.getByLabelText('Corrigir o nome de banana')).toBeTruthy();
    });
  });
});
