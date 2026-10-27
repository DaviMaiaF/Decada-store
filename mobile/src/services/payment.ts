/**
 * Regras puras do formulário de pagamento simulado.
 *
 * Só formatação e leitura do que a pessoa digitou. Quem decide se o cartão é
 * válido é o servidor, que devolve o motivo em português: duplicar o Luhn e a
 * tabela de bandeiras aqui seria ter duas fontes da mesma regra.
 */

import type { CardInput } from '../types/api';

/** Número em grupos de quatro, como vem impresso: "4235 6477 2802 5682". */
export function formatarNumeroCartao(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 19);
  return digitos.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Validade no formato "MM/AA", com a barra entrando sozinha. */
export function formatarValidade(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 4);
  return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
}

/** "11/30" vira mês 11 e ano 2030. Nulo se não estiver completa. */
export function lerValidade(texto: string): { mes: number; ano: number } | null {
  const casamento = /^(\d{2})\/(\d{2})$/.exec(texto.trim());
  if (!casamento) return null;
  return { mes: Number(casamento[1]), ano: 2000 + Number(casamento[2]) };
}

export interface FormularioCartao {
  numero: string;
  titular: string;
  validade: string;
  cvv: string;
}

export const FORMULARIO_VAZIO: FormularioCartao = { numero: '', titular: '', validade: '', cvv: '' };

/**
 * O formulário no formato da API, ou nulo enquanto faltar algo.
 *
 * "Falta algo" é só campo vazio ou validade incompleta: é o que deixa o botão
 * de pagar apagado. O resto o servidor responde.
 */
export function montarCartao(formulario: FormularioCartao): CardInput | null {
  const validade = lerValidade(formulario.validade);
  const numero = formulario.numero.replace(/\D/g, '');
  if (!numero || !formulario.titular.trim() || !formulario.cvv || !validade) return null;

  return {
    number: numero,
    holder_name: formulario.titular.trim(),
    expiration_month: validade.mes,
    expiration_year: validade.ano,
    security_code: formulario.cvv,
  };
}
