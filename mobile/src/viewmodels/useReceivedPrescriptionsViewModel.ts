/**
 * ViewModel dos planos que a nutricionista enviou ao e-mail do paciente.
 *
 * Nada é gravado na conta antes do aceite com consentimento, o mesmo termo do
 * PDF (decisão 5). Recusar ou aceitar tira o plano da lista de pendentes.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  acceptPrescription,
  declinePrescription,
  readReceivedPrescriptions,
} from '../services/api';
import type { ImportResult, ReceivedPrescription } from '../types/api';

export const RECEIVED_KEY = ['received-prescriptions'];

/** A lista de planos recebidos; vazia enquanto carrega ou quando não há nenhum. */
export function useReceivedPrescriptionsViewModel() {
  const recebidos = useQuery({ queryKey: RECEIVED_KEY, queryFn: readReceivedPrescriptions });
  return { planos: recebidos.data ?? [] };
}

/** Um plano recebido: abrir para ler, marcar o aceite, aceitar ou recusar. */
export function useReceivedPrescriptionViewModel(
  plano: ReceivedPrescription,
  onAceito: (resultado: ImportResult) => void,
) {
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [aceitou, setAceitou] = useState(false);

  const depois = () => {
    cliente.invalidateQueries({ queryKey: RECEIVED_KEY });
    cliente.invalidateQueries({ queryKey: ['meal-plans'] });
  };

  const aceitar = useMutation({
    mutationFn: () => acceptPrescription(plano.id, aceitou),
    onSuccess: (resultado) => {
      depois();
      onAceito(resultado);
    },
  });
  const recusar = useMutation({ mutationFn: () => declinePrescription(plano.id), onSuccess: depois });

  const erro = aceitar.error ?? recusar.error;

  return {
    aberto,
    aceitou,
    /** "Nome · CRN" de quem assinou, ou vazio. */
    autora: [plano.author.full_name, plano.author.crn].filter(Boolean).join(' · '),
    erro: erro
      ? erro instanceof ApiError
        ? erro.message
        : 'não foi possível responder agora'
      : null,
    aceitando: aceitar.isPending,
    recusando: recusar.isPending,
    alternarLeitura: () => setAberto((a) => !a),
    alternarAceite: () => setAceitou((a) => !a),
    aceitar: () => aceitar.mutate(),
    recusar: () => recusar.mutate(),
  };
}
