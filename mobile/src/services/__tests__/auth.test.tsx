import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '../auth';
import * as session from '../session';

jest.mock('../session');
const mockConfig = { reset: false };
jest.mock('../config', () => ({
  API_URL: 'http://localhost:8000',
  get RESET_SESSION() {
    return mockConfig.reset;
  },
}));

const mocked = session as jest.Mocked<typeof session>;

function Estado() {
  const { signedIn } = useAuth();
  return <Text>{String(signedIn)}</Text>;
}

describe('AuthProvider na abertura', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.reset = false;
    mocked.readToken.mockResolvedValue('token-guardado');
  });

  it('mantém a sessão guardada por padrão', async () => {
    await render(<AuthProvider><Estado /></AuthProvider>);
    await waitFor(() => screen.getByText('true'));
    expect(mocked.clearToken).not.toHaveBeenCalled();
  });

  it('apaga o token ao abrir quando RESET_SESSION está ligado', async () => {
    mockConfig.reset = true;
    mocked.clearToken.mockImplementation(async () => {
      mocked.readToken.mockResolvedValue(null);
    });
    await render(<AuthProvider><Estado /></AuthProvider>);
    await waitFor(() => screen.getByText('false'));
    expect(mocked.clearToken).toHaveBeenCalled();
  });
});
