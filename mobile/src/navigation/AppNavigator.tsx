/**
 * Navegação do aplicativo.
 *
 * Quatro abas, como no protótipo. A aba Dieta guarda a jornada desta fatia:
 * enviar o PDF, confirmar os produtos e, daí, gerar a lista.
 */

import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import MarketScreen from '../screens/MarketScreen';
import PantryScreen from '../screens/PantryScreen';
import UploadScreen from '../screens/UploadScreen';
import { useAuth } from '../services/auth';
import { colors, spacing, typography } from '../theme/tokens';

const Tab = createBottomTabNavigator();

/** Onde a jornada da aba Dieta está. */
type Etapa = 'upload' | 'confirmacao';

export default function AppNavigator() {
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [planId, setPlanId] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { ...typography.headlineSm, color: colors.primary },
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant },
          tabBarActiveTintColor: colors.primaryContainer,
          tabBarInactiveTintColor: colors.onSurfaceVariant,
          tabBarLabelStyle: typography.labelSm,
        }}
      >
        <Tab.Screen name="Dieta" options={{ title: 'Dieta' }}>
          {() =>
            etapa === 'upload' || planId === null ? (
              <UploadScreen
                onImported={(resultado) => {
                  setPlanId(resultado.meal_plan.id);
                  setEtapa('confirmacao');
                }}
              />
            ) : (
              <ConfirmationScreen
                planId={planId}
                onReady={() => setEtapa('upload')}
              />
            )
          }
        </Tab.Screen>

        <Tab.Screen name="Mercado" options={{ title: 'Mercado' }}>
          {() => (
            <MarketScreen planId={planId} listId={listId} onGenerated={setListId} />
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Despensa"
          component={PantryScreen}
          options={{ title: 'Despensa' }}
        />

        <Tab.Screen name="Economia" options={{ title: 'Economia' }}>
          {() => <ContaScreen />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

/**
 * Aba Economia, por enquanto com a conta.
 *
 * Sair fica aqui porque nenhuma das quatro telas do protótipo previu onde
 * colocar isso — e um app com dado de saúde precisa ter como sair.
 */
function ContaScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.conta}>
      <Text style={styles.contaTitulo}>Economia</Text>
      <Text style={styles.contaTexto}>
        O acompanhamento de gastos entra numa próxima etapa. O cálculo por região já
        existe no backend.
      </Text>
      <Button label="Sair da conta" variant="ghost" onPress={signOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  conta: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.margin,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  contaTitulo: { ...typography.headlineLg, color: colors.primary },
  contaTexto: { ...typography.bodyMd, color: colors.onSurfaceVariant },
});
