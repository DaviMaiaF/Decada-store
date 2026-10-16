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

  it('na web usa o host da página, e não o IP do Expo', () => {
    // O HOST_IP do compose pode estar velho (trocou de rede); quem abriu
    // localhost:8081 alcança a API em localhost:8000 de qualquer jeito.
    expect(resolveApiUrl({ hostUri: '192.168.0.10:8081', os: 'web', pageHost: 'localhost' })).toBe(
      'http://localhost:8000',
    );
    expect(resolveApiUrl({ os: 'web', pageHost: '10.209.139.16' })).toBe(
      'http://10.209.139.16:8000',
    );
  });

  it('na web põe IPv6 entre colchetes', () => {
    expect(resolveApiUrl({ os: 'web', pageHost: '::1' })).toBe('http://[::1]:8000');
  });

  it('na web a variável explícita continua valendo', () => {
    expect(
      resolveApiUrl({ explicit: 'http://api.local:9000', os: 'web', pageHost: 'localhost' }),
    ).toBe('http://api.local:9000');
  });

  it('o host da página só vale na web', () => {
    expect(resolveApiUrl({ hostUri: '192.168.0.2:8081', os: 'ios', pageHost: 'localhost' })).toBe(
      'http://192.168.0.2:8000',
    );
  });
});
