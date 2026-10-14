import { resolveApiUrl } from '../config';

describe('resolveApiUrl', () => {
  it('usa a variável de ambiente quando definida, sem barra final', () => {
    expect(
      resolveApiUrl({ explicit: 'http://10.1.1.5:9000/', hostUri: '192.168.0.2:8081', os: 'ios' }),
    ).toBe('http://10.1.1.5:9000');
  });

  it('deduz o IP do computador a partir do host do Expo', () => {
    expect(resolveApiUrl({ hostUri: '192.168.0.2:8081', os: 'ios' })).toBe('http://192.168.0.2:8000');
    expect(resolveApiUrl({ hostUri: '192.168.0.2:8081', os: 'android' })).toBe(
      'http://192.168.0.2:8000',
    );
  });

  it('ignora a variável vazia', () => {
    expect(resolveApiUrl({ explicit: '  ', hostUri: '192.168.0.2:8081', os: 'ios' })).toBe(
      'http://192.168.0.2:8000',
    );
  });

  it('usa 10.0.2.2 no emulador Android quando o host é localhost', () => {
    expect(resolveApiUrl({ hostUri: 'localhost:8081', os: 'android' })).toBe('http://10.0.2.2:8000');
    expect(resolveApiUrl({ os: 'android' })).toBe('http://10.0.2.2:8000');
  });

  it('cai em localhost na web e no simulador iOS', () => {
    expect(resolveApiUrl({ os: 'web' })).toBe('http://localhost:8000');
    expect(resolveApiUrl({ hostUri: '127.0.0.1:8081', os: 'ios' })).toBe('http://localhost:8000');
  });
});
