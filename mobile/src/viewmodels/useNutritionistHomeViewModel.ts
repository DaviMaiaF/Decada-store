/**
 * ViewModel do início da nutricionista: a conta dela e os planos que montou.
 */

import { useQuery } from '@tanstack/react-query';

import { readAccount, readPrescriptions } from '../services/api';
import { useAuth } from '../services/auth';
import type { PrescriptionSummary } from '../types/api';

export type PlanoNaLista = PrescriptionSummary & {
  /** Como o plano é chamado na lista. */
  titulo: string;
  /** Paciente, e-mail e número de refeições, na ordem em que aparecem. */
  detalhe: string;
};

export function useNutritionistHomeViewModel() {
  const { signOut } = useAuth();
  const conta = useQuery({ queryKey: ['account'], queryFn: readAccount });
  const planos = useQuery({ queryKey: ['prescriptions'], queryFn: readPrescriptions });

  return {
    /** "Nome · CRN", ou só o nome; nulo enquanto a conta não chega. */
    assinatura: conta.data
      ? `${conta.data.full_name}${conta.data.crn ? ` · ${conta.data.crn}` : ''}`
      : null,
    carregando: planos.isPending,
    falhou: planos.isError,
    planos: planos.data?.map(paraLista) ?? null,
    sair: signOut,
  };
}

export function tituloDoPlano(plano: PrescriptionSummary): string {
  return plano.title ?? (plano.patient_name ? `Plano de ${plano.patient_name}` : 'Plano sem título');
}

function paraLista(plano: PrescriptionSummary): PlanoNaLista {
  return {
    ...plano,
    titulo: tituloDoPlano(plano),
    detalhe: [
      plano.patient_name,
      plano.patient_email,
      `${plano.meal_count} ${plano.meal_count === 1 ? 'refeição' : 'refeições'}`,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}
