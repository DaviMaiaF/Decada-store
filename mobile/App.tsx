/**
 * Raiz do aplicativo: provedores, fontes e a escolha entre login e app.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { AuthProvider, useAuth } from './src/services/auth';
import { useAppFonts } from './src/theme/fonts';
import { colors } from './src/theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Rede de celular falha; uma tentativa a mais evita erro por oscilação.
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Raiz() {
  const { signedIn } = useAuth();
  const fontesCarregadas = useAppFonts();

  // `signedIn` é nulo enquanto o token guardado ainda está sendo lido: mostrar
  // o login antes disso faria a tela piscar para quem já estava logado.
  if (!fontesCarregadas || signedIn === null) {
    return (
      <View style={styles.carregando}>
        <ActivityIndicator color={colors.primaryContainer} size="large" />
      </View>
    );
  }

  return signedIn ? <AppNavigator /> : <LoginScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Raiz />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  carregando: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
