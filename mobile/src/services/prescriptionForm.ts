/**
 * Do editor de plano alimentar para o corpo que a API aceita.
 *
 * As regras são as do servidor (`backend/app/schemas/prescription.py`), checadas
 * antes de enviar para o erro aparecer na hora, dizendo onde está. Elas existem
 * para o PDF gerado voltar inteiro pelo import: nome de alimento sem " - ",
 * começando por letra e curto o bastante para a linha não virar parágrafo.
 *
 * Linha de alimento toda em branco é ignorada, e não erro: o editor oferece uma
 * linha vazia para digitar, e quem não usou não deveria ter de apagá-la.
 */

import { amountToField, parseDecimal } from './units';
import type {
  MeasurementUnit,
  Prescription,
  PrescriptionInput,
  PrescriptionItem,
} from '../types/api';

export const FOOD_MAX = 45;
export const MEASURE_MAX = 25;
export const MEAL_NAME_MAX = 40;

export const UNITS: MeasurementUnit[] = ['g', 'kg', 'ml', 'l', 'unidade'];

export interface ItemRow {
  food: string;
  householdMeasure: string;
  /** Como a pessoa digitou: "1,5". */
  quantity: string;
  unit: MeasurementUnit;
}

export interface MealForm {
  name: string;
  /** "08:30". */
  time: string;
  notes: string;
  items: ItemRow[];
  substitutions: ItemRow[][];
}

export interface PrescriptionForm {
  title: string;
  patientName: string;
  notes: string;
  meals: MealForm[];
}

export const emptyItem = (): ItemRow => ({
  food: '',
  householdMeasure: '',
  quantity: '',
  unit: 'g',
});

export const emptyMeal = (): MealForm => ({
  name: '',
  time: '',
  notes: '',
  items: [emptyItem()],
  substitutions: [],
});

export const emptyForm = (): PrescriptionForm => ({
  title: '',
  patientName: '',
  notes: '',
  meals: [emptyMeal()],
});

function rowFromItem(item: PrescriptionItem): ItemRow {
  return {
    food: item.food,
    householdMeasure: item.household_measure ?? '',
    quantity: amountToField(item.quantity),
    unit: item.unit,
  };
}

/** "08:30:00" -> "08:30". */
export const shortTime = (time: string) => time.slice(0, 5);

export function formFromPrescription(plan: Prescription): PrescriptionForm {
  return {
    title: plan.title ?? '',
    patientName: plan.patient_name ?? '',
    notes: plan.notes ?? '',
    meals: plan.meals.map((meal) => ({
      name: meal.name,
      time: shortTime(meal.time),
      notes: meal.notes ?? '',
      items: meal.items.map(rowFromItem),
      substitutions: meal.substitutions.map((opcao) => opcao.map(rowFromItem)),
    })),
  };
}

const SEPARADOR = /\s[-–—]\s/;
const COMECA_COM_LETRA = /^\p{L}/u;
const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

const emBranco = (row: ItemRow) =>
  !row.food.trim() && !row.householdMeasure.trim() && !row.quantity.trim();

/** "8:30" ou "0830" viram "08:30"; o resto fica como veio, para a validação acusar. */
export function normalizeTime(text: string): string {
  const limpo = text.trim().replace('h', ':');
  const partes = /^(\d{1,2}):?(\d{2})$/.exec(limpo);
  return partes ? `${partes[1].padStart(2, '0')}:${partes[2]}` : limpo;
}

type Resultado<T> = { value: T; error: null } | { value: null; error: string };

function item(row: ItemRow, onde: string): Resultado<PrescriptionItem> {
  const falha = (error: string) => ({ value: null, error: `${onde}: ${error}` });
  const food = row.food.trim();
  const medida = row.householdMeasure.trim();

  if (!food) return falha('falta o nome do alimento');
  if (!COMECA_COM_LETRA.test(food)) return falha('o nome do alimento começa com letra');
  if (food.length > FOOD_MAX) return falha(`o nome passa de ${FOOD_MAX} caracteres`);
  if (SEPARADOR.test(food) || SEPARADOR.test(medida)) {
    return falha('não use " - ": é o separador de medidas do plano');
  }
  if (medida.length > MEASURE_MAX) {
    return falha(`a medida caseira passa de ${MEASURE_MAX} caracteres`);
  }
  const quantity = parseDecimal(row.quantity);
  if (quantity === null) return falha(`informe a quantidade de ${food}`);

  return {
    value: { food, household_measure: medida || null, quantity, unit: row.unit },
    error: null,
  };
}

function items(rows: ItemRow[], onde: string): Resultado<PrescriptionItem[]> {
  const preenchidas = rows.filter((row) => !emBranco(row));
  const saida: PrescriptionItem[] = [];
  for (const row of preenchidas) {
    const r = item(row, onde);
    if (r.error !== null) return { value: null, error: r.error };
    saida.push(r.value);
  }
  return { value: saida, error: null };
}

export type BuildResult =
  | { input: PrescriptionInput; error: null }
  | { input: null; error: string };

export function buildPrescriptionInput(form: PrescriptionForm): BuildResult {
  const falha = (error: string): BuildResult => ({ input: null, error });

  if (form.meals.length === 0) return falha('adicione pelo menos uma refeição');

  const meals: PrescriptionInput['meals'] = [];
  for (const [indice, meal] of form.meals.entries()) {
    const nome = meal.name.trim();
    const onde = nome || `Refeição ${indice + 1}`;

    if (!nome) return falha(`${onde}: dê um nome à refeição`);
    if (!COMECA_COM_LETRA.test(nome)) return falha(`${onde}: o nome começa com letra`);
    if (nome.length > MEAL_NAME_MAX) {
      return falha(`${onde}: o nome passa de ${MEAL_NAME_MAX} caracteres`);
    }
    const time = normalizeTime(meal.time);
    if (!HORARIO.test(time)) return falha(`${onde}: informe o horário, como 08:30`);

    const principais = items(meal.items, onde);
    if (principais.error !== null) return falha(principais.error);
    if (principais.value.length === 0) return falha(`${onde}: adicione pelo menos um alimento`);

    const substitutions: PrescriptionItem[][] = [];
    for (const [n, opcao] of meal.substitutions.entries()) {
      const r = items(opcao, `${onde}, substituição ${n + 1}`);
      if (r.error !== null) return falha(r.error);
      // Substituição sem nada preenchido é ignorada, como a linha em branco.
      if (r.value.length > 0) substitutions.push(r.value);
    }

    meals.push({
      name: nome,
      time,
      notes: meal.notes.trim() || null,
      items: principais.value,
      substitutions,
    });
  }

  return {
    input: {
      title: form.title.trim() || null,
      patient_name: form.patientName.trim() || null,
      notes: form.notes.trim() || null,
      meals,
    },
    error: null,
  };
}
