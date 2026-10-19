/**
 * Testes da passagem do editor de plano alimentar para o corpo da API.
 *
 * São as regras do servidor repetidas aqui, e o que importa é a mensagem dizer
 * onde está o problema: num plano de seis refeições, "nome inválido" sozinho
 * não ajuda ninguém.
 */

import {
  buildPrescriptionInput,
  emptyForm,
  emptyItem,
  emptyMeal,
  formFromPrescription,
  normalizeTime,
  type MealForm,
  type PrescriptionForm,
} from '../prescriptionForm';
import type { Prescription } from '../../types/api';

function refeicao(over: Partial<MealForm> = {}): MealForm {
  return {
    name: 'Café da manhã',
    time: '08:30',
    notes: '',
    items: [{ food: 'Pão francês', householdMeasure: '1 unidade', quantity: '50', unit: 'g' }],
    substitutions: [],
    ...over,
  };
}

function formulario(over: Partial<PrescriptionForm> = {}): PrescriptionForm {
  return { ...emptyForm(), meals: [refeicao()], ...over };
}

it('monta o corpo com quantidade e horário normalizados', () => {
  const { input, error } = buildPrescriptionInput(
    formulario({
      title: '  Plano de outubro ',
      meals: [
        refeicao({
          time: '8:30',
          notes: ' Sem açúcar. ',
          items: [
            { food: ' Pão francês ', householdMeasure: ' 1 unidade ', quantity: '1,5', unit: 'kg' },
          ],
          substitutions: [[{ food: 'Tapioca', householdMeasure: '', quantity: '35', unit: 'g' }]],
        }),
      ],
    }),
  );

  expect(error).toBeNull();
  expect(input).toEqual({
    title: 'Plano de outubro',
    patient_name: null,
    notes: null,
    meals: [
      {
        name: 'Café da manhã',
        time: '08:30',
        notes: 'Sem açúcar.',
        items: [{ food: 'Pão francês', household_measure: '1 unidade', quantity: '1.5', unit: 'kg' }],
        substitutions: [[{ food: 'Tapioca', household_measure: null, quantity: '35', unit: 'g' }]],
      },
    ],
  });
});

it('ignora linha e substituição deixadas em branco', () => {
  const { input } = buildPrescriptionInput(
    formulario({
      meals: [refeicao({ items: [...refeicao().items, emptyItem()], substitutions: [[emptyItem()]] })],
    }),
  );

  expect(input?.meals[0].items).toHaveLength(1);
  expect(input?.meals[0].substitutions).toEqual([]);
});

it('recusa plano sem refeição', () => {
  expect(buildPrescriptionInput(formulario({ meals: [] })).error).toBe(
    'adicione pelo menos uma refeição',
  );
});

it('recusa refeição sem alimento, dizendo qual', () => {
  const { error } = buildPrescriptionInput(formulario({ meals: [emptyMeal()] }));

  expect(error).toBe('Refeição 1: dê um nome à refeição');
  expect(
    buildPrescriptionInput(formulario({ meals: [refeicao({ items: [emptyItem()] })] })).error,
  ).toBe('Café da manhã: adicione pelo menos um alimento');
});

it.each(['', '25:00', 'manhã', '8'])('recusa horário %p', (horario) => {
  expect(buildPrescriptionInput(formulario({ meals: [refeicao({ time: horario })] })).error).toBe(
    'Café da manhã: informe o horário, como 08:30',
  );
});

it.each([
  [{ food: 'Pão - francês' }, 'não use " - ": é o separador de medidas do plano'],
  [{ householdMeasure: '1 - 2 fatias' }, 'não use " - ": é o separador de medidas do plano'],
  [{ food: '2 pães' }, 'o nome do alimento começa com letra'],
  [{ food: 'x'.repeat(46) }, 'o nome passa de 45 caracteres'],
  [{ householdMeasure: 'x'.repeat(26) }, 'a medida caseira passa de 25 caracteres'],
  [{ quantity: '0' }, 'informe a quantidade de Pão francês'],
  [{ quantity: '' }, 'informe a quantidade de Pão francês'],
])('recusa alimento %p', (mudanca, mensagem) => {
  const linha = { ...refeicao().items[0], ...mudanca };

  expect(buildPrescriptionInput(formulario({ meals: [refeicao({ items: [linha] })] })).error).toBe(
    `Café da manhã: ${mensagem}`,
  );
});

it('o erro na substituição diz qual opção', () => {
  const ruim = [{ food: 'Tapioca', householdMeasure: '', quantity: '', unit: 'g' as const }];

  expect(
    buildPrescriptionInput(formulario({ meals: [refeicao({ substitutions: [ruim] })] })).error,
  ).toBe('Café da manhã, substituição 1: informe a quantidade de Tapioca');
});

it.each([
  ['8:30', '08:30'],
  ['0830', '08:30'],
  ['12h30', '12:30'],
  ['abc', 'abc'],
])('normaliza o horário %p', (entrada, saida) => {
  expect(normalizeTime(entrada)).toBe(saida);
});

it('preenche o editor com o plano salvo', () => {
  const salvo: Prescription = {
    id: 'p1',
    title: null,
    patient_name: 'Paciente',
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
        substitutions: [[{ food: 'Macarrão', household_measure: '2 conchas', quantity: '200', unit: 'g' }]],
      },
    ],
  };

  expect(formFromPrescription(salvo)).toEqual({
    title: '',
    patientName: 'Paciente',
    notes: '',
    meals: [
      {
        name: 'Almoço',
        time: '12:30',
        notes: '',
        items: [{ food: 'Arroz', householdMeasure: '', quantity: '150', unit: 'g' }],
        substitutions: [[{ food: 'Macarrão', householdMeasure: '2 conchas', quantity: '200', unit: 'g' }]],
      },
    ],
  });
});
