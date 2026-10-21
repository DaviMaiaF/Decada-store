/**
 * ViewModel do envio da prescrição em PDF.
 *
 * Escolhe o arquivo, segura o envio até o consentimento e guarda o que o
 * servidor entendeu do PDF.
 */

import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation } from '@tanstack/react-query';

import { ApiError, importMealPlan } from '../services/api';
import type { ImportResult } from '../types/api';

type Arquivo = { uri: string; name: string; mimeType?: string };

export function useUploadViewModel() {
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [nutricionista, setNutricionista] = useState('');
  const [crn, setCrn] = useState('');
  const [aceitou, setAceitou] = useState(false);
  const [resultado, setResultado] = useState<ImportResult | null>(null);

  const envio = useMutation({
    mutationFn: () =>
      importMealPlan(arquivo!, aceitou, {
        nutritionistName: nutricionista.trim() || undefined,
        nutritionistCrn: crn.trim() || undefined,
      }),
    onSuccess: (dados) => setResultado(dados),
  });

  async function escolher() {
    const escolha = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (escolha.canceled) return;

    const selecionado = escolha.assets[0];
    setArquivo({
      uri: selecionado.uri,
      name: selecionado.name,
      mimeType: selecionado.mimeType,
    });
    setResultado(null);
    envio.reset();
  }

  const erro = envio.error;

  // Botão inerte sem explicação faz a pessoa tocar de novo achando que falhou.
  // Duas condições, e a frase diz qual das duas está faltando.
  const faltando =
    !arquivo && !aceitou
      ? 'Escolha o PDF e marque o aceite para enviar.'
      : !arquivo
        ? 'Escolha o PDF para enviar.'
        : !aceitou
          ? 'Marque o aceite para enviar.'
          : null;

  return {
    nomeDoArquivo: arquivo?.name ?? null,
    nutricionista,
    crn,
    aceitou,
    resultado,
    faltando,
    podeEnviar: arquivo !== null && aceitou,
    enviando: envio.isPending,
    erro: erro
      ? erro instanceof ApiError
        ? erro.message
        : 'não foi possível enviar o PDF'
      : null,
    setNutricionista,
    setCrn,
    alternarAceite: () => setAceitou((estava) => !estava),
    escolher,
    enviar: () => envio.mutate(),
  };
}
