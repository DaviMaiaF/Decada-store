/**
 * Entrega de um PDF baixado da API: salvar no navegador, compartilhar no celular.
 *
 * O arquivo vem pela instância do axios, com o token no cabeçalho como qualquer
 * outra chamada. Não é um link para abrir no navegador porque o token teria de
 * ir na URL, e aí ficaria no histórico e nos logs de quem estiver no caminho.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function savePdf(bytes: ArrayBuffer, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  // No cache, e não em documentos: o sistema pode limpar, e a cópia que vale é
  // a que a nutricionista escolher guardar ou enviar pela folha de compartilhar.
  const arquivo = new File(Paths.cache, fileName);
  if (arquivo.exists) arquivo.delete();
  arquivo.create();
  arquivo.write(new Uint8Array(bytes));
  await Sharing.shareAsync(arquivo.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
