/**
 * Navegação do aplicativo.
 *
 * Quatro abas, como no protótipo. A aba Dieta guarda a jornada desta fatia:
 * enviar o PDF, confirmar os produtos e, daí, gerar a lista.
 */

import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

import ConfirmationScreen from '../screens/ConfirmationScreen';
import EconomyScreen from '../screens/EconomyScreen';
import MarketScreen from '../screens/MarketScreen';
import PantryScreen from '../screens/PantryScreen';
import UploadScreen from '../screens/UploadScreen';
import { colors, typography } from '../theme/tokens';

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
          {() => <EconomyScreen listId={listId} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

