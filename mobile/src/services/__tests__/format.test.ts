/**
 * Testes da formatação.
 *
 * É onde os decimais que chegam como string viram texto de tela, e onde a
 * regra "preço com mais de 30 dias é estimativa" aparece para o usuário.
 */

import { describeConfidence, describeOrigin, formatMoney, formatQuantity } from '../format';

describe('formatMoney', () => {
  it('formata em real com duas casas', () => {
    expect(formatMoney('12.9')).toBe('R$ 12,90');
    expect(formatMoney('174.20')).toBe('R$ 174,20');
  });

  it('mostra um traço quando não há preço', () => {
    // Região sem coleta não vale zero: vale ausência de preço.
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });
});

describe('formatQuantity', () => {
  it('converte fração de quilo em grama', () => {
    expect(formatQuantity('0.700', 'kg')).toBe('700 g');
    expect(formatQuantity('0.300', 'kg')).toBe('300 g');
  });

  it('converte fração de litro em mililitro', () => {
    expect(formatQuantity('0.200', 'l')).toBe('200 ml');
  });

  it('mantém a unidade quando o valor é maior que um', () => {
    expect(formatQuantity('1.500', 'kg')).toBe('1,5 kg');
    expect(formatQuantity('2.000', 'kg')).toBe('2 kg');
  });

  it('concorda o plural de unidade', () => {
    expect(formatQuantity('1', 'unidade')).toBe('1 unidade');
    expect(formatQuantity('12', 'unidade')).toBe('12 unidades');
  });
});

describe('describeConfidence', () => {
  const diasAtras = (dias: number) =>
    new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  it('avisa quando não há preço na região', () => {
    expect(describeConfidence(null, null)).toBe('sem preço coletado nesta região');
  });

  it('diz a idade da coleta', () => {
    expect(describeConfidence('atual', diasAtras(0))).toBe('coletado hoje');
    expect(describeConfidence('atual', diasAtras(1))).toBe('coletado ontem');
    expect(describeConfidence('recente', diasAtras(12))).toBe('coletado há 12 dias');
  });

  it('marca como estimativa o preço vencido', () => {
    // Decisão 1 do projeto: acima de 30 dias, o número é estimativa.
    expect(describeConfidence('estimativa', diasAtras(45))).toBe(
      'estimativa — coletado há 45 dias',
    );
  });
});

describe('describeOrigin', () => {
  it('traduz a origem do preço', () => {
    expect(describeOrigin('nfce')).toBe('nota fiscal');
    expect(describeOrigin('seed')).toBe('dado fictício de desenvolvimento');
    expect(describeOrigin(null)).toBe('—');
  });
});
