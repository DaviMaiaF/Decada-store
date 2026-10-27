/** Testes das regras puras do formulário de pagamento simulado. */

import {
  FORMULARIO_VAZIO,
  formatarNumeroCartao,
  formatarValidade,
  lerValidade,
  montarCartao,
} from '../payment';

describe('formatarNumeroCartao', () => {
  it('agrupa de quatro em quatro e ignora o que não é dígito', () => {
    expect(formatarNumeroCartao('4235647728025682')).toBe('4235 6477 2802 5682');
    expect(formatarNumeroCartao('4235-6477 28')).toBe('4235 6477 28');
  });

  it('não passa de 19 dígitos nem deixa espaço sobrando no fim', () => {
    expect(formatarNumeroCartao('1234')).toBe('1234');
    expect(formatarNumeroCartao('1'.repeat(25)).replace(/ /g, '')).toHaveLength(19);
  });
});

describe('validade', () => {
  it('põe a barra depois do mês', () => {
    expect(formatarValidade('1')).toBe('1');
    expect(formatarValidade('113')).toBe('11/3');
    expect(formatarValidade('11/30')).toBe('11/30');
    expect(formatarValidade('113099')).toBe('11/30');
  });

  it('lê mês e ano de quatro dígitos', () => {
    expect(lerValidade('11/30')).toEqual({ mes: 11, ano: 2030 });
  });

  it('validade incompleta é nula', () => {
    expect(lerValidade('11/3')).toBeNull();
    expect(lerValidade('')).toBeNull();
  });
});

describe('montarCartao', () => {
  const preenchido = {
    numero: '4235 6477 2802 5682',
    titular: '  APRO ',
    validade: '11/30',
    cvv: '123',
  };

  it('monta o corpo da API com o número só de dígitos', () => {
    expect(montarCartao(preenchido)).toEqual({
      number: '4235647728025682',
      holder_name: 'APRO',
      expiration_month: 11,
      expiration_year: 2030,
      security_code: '123',
    });
  });

  it('é nulo enquanto falta algo', () => {
    expect(montarCartao(FORMULARIO_VAZIO)).toBeNull();
    expect(montarCartao({ ...preenchido, titular: '  ' })).toBeNull();
    expect(montarCartao({ ...preenchido, validade: '11/' })).toBeNull();
    expect(montarCartao({ ...preenchido, cvv: '' })).toBeNull();
  });
});
