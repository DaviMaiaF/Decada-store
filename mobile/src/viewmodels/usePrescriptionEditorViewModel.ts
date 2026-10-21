/**
 * ViewModel do editor do plano alimentar da nutricionista.
 *
 * Guarda o formulário e o plano como está no servidor. Entregar tem dois
 * caminhos, e os dois salvam antes: pelo e-mail do paciente ou pelo PDF.
 * Plano aceito não muda mais (decisão 12): salvar devolve o que já está gravado.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  createPrescription,
  deletePrescription,
  downloadPrescriptionPdf,
  sendPrescription,
  updatePrescription,
} from '../services/api';
import { savePdf } from '../services/download';
import {
  buildPrescriptionInput,
  emptyForm,
  emptyMeal,
  formFromPrescription,
  type MealForm,
  type PrescriptionForm,
} from '../services/prescriptionForm';
import type { Prescription } from '../types/api';

export type AcaoDoEditor = 'salvar' | 'enviar' | 'pdf';

function mensagem(problema: unknown, padrao: string): string {
  return problema instanceof ApiError ? problema.message : padrao;
}

export function usePrescriptionEditorViewModel(
  prescription: Prescription | null,
  onExcluido: () => void,
) {
  const cliente = useQueryClient();
  // O plano como está no servidor. Começa nulo no plano novo e passa a existir
  // no primeiro salvamento, sem fechar o editor: é dali que se envia.
  const [salvo, setSalvo] = useState<Prescription | null>(prescription);
  const [form, setForm] = useState<PrescriptionForm>(() =>
    prescription ? formFromPrescription(prescription) : emptyForm(),
  );
  const [email, setEmail] = useState(prescription?.patient_email ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<AcaoDoEditor | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const aceito = salvo?.status === 'aceita';

  /** A lista e o plano aberto mudam juntos a cada gravação. */
  const atualizarCache = () => {
    cliente.invalidateQueries({ queryKey: ['prescriptions'] });
    cliente.invalidateQueries({ queryKey: ['prescription'] });
  };

  const exclusao = useMutation({
    mutationFn: () => deletePrescription(salvo!.id),
    onSuccess: () => {
      atualizarCache();
      onExcluido();
    },
    onError: (problema) => setErro(mensagem(problema, 'não foi possível excluir agora')),
  });

  /** Valida e grava. Devolve o plano salvo, ou nulo se não deu. */
  async function gravar(): Promise<Prescription | null> {
    if (aceito) return salvo;
    const resultado = buildPrescriptionInput(form);
    if (resultado.error !== null) {
      setErro(resultado.error);
      return null;
    }
    const gravado = salvo
      ? await updatePrescription(salvo.id, resultado.input)
      : await createPrescription(resultado.input);
    setSalvo(gravado);
    atualizarCache();
    return gravado;
  }

  async function executar(
    acao: AcaoDoEditor,
    passo: (plano: Prescription) => Promise<string | null>,
  ) {
    setErro(null);
    setAviso(null);
    setOcupado(acao);
    try {
      const plano = await gravar();
      if (plano) setAviso(await passo(plano));
    } catch (problema) {
      setErro(mensagem(problema, 'não foi possível concluir agora'));
    } finally {
      setOcupado(null);
    }
  }

  const salvar = () => executar('salvar', async () => 'Plano salvo.');

  const enviar = async () => {
    if (!email.trim()) {
      setErro('informe o e-mail do paciente');
      return;
    }
    await executar('enviar', async (plano) => {
      const enviado = await sendPrescription(plano.id, email.trim());
      setSalvo(enviado);
      atualizarCache();
      // A mesma frase exista ou não conta com o e-mail: o servidor não diz, e a
      // tela não teria como saber.
      return (
        `Enviado para ${enviado.patient_email}. O plano aparece na aba Dieta quando ` +
        'a pessoa entrar com esse e-mail — agora ou depois de criar a conta.'
      );
    });
  };

  const baixarPdf = () =>
    executar('pdf', async (plano) => {
      await savePdf(await downloadPrescriptionPdf(plano.id), 'plano-alimentar.pdf');
      return 'PDF gerado. O paciente importa esse arquivo na aba Dieta.';
    });

  return {
    salvo,
    aceito,
    form,
    email,
    erro,
    aviso,
    ocupado,
    confirmandoExclusao,
    excluindo: exclusao.isPending,

    setEmail,
    mudarTitulo: (title: string) => setForm((f) => ({ ...f, title })),
    mudarPaciente: (patientName: string) => setForm((f) => ({ ...f, patientName })),
    mudarOrientacoes: (notes: string) => setForm((f) => ({ ...f, notes })),
    mudarRefeicao: (indice: number, mudanca: Partial<MealForm>) =>
      setForm((atual) => ({
        ...atual,
        meals: atual.meals.map((meal, i) => (i === indice ? { ...meal, ...mudanca } : meal)),
      })),
    adicionarRefeicao: () => setForm((f) => ({ ...f, meals: [...f.meals, emptyMeal()] })),
    /** O plano precisa de ao menos uma refeição. */
    podeRemoverRefeicao: form.meals.length > 1,
    removerRefeicao: (indice: number) =>
      setForm((f) => ({ ...f, meals: f.meals.filter((_, i) => i !== indice) })),

    salvar,
    enviar,
    baixarPdf,
    pedirExclusao: () => setConfirmandoExclusao(true),
    cancelarExclusao: () => setConfirmandoExclusao(false),
    excluir: () => exclusao.mutate(),
  };
}
