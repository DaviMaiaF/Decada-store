/**
 * Navegação do aplicativo.
 *
 * Quatro abas, como no protótipo. A aba Dieta guarda a jornada desta fatia:
 * enviar o PDF, confirmar os produtos e, daí, gerar a lista.
 *
 * O plano e a lista são reencontrados no servidor a cada partida. Antes eles
 * viviam só no estado desta tela: recarregar a página mandava a pessoa de volta
 * para o upload de um plano que já estava no banco, e a lista do mercado sumia
 * junto. O que a pessoa faz nesta sessão tem precedência sobre o que veio do
 * servidor — importar um plano novo não pode ser desfeito pelo plano antigo.
 */

import { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  IconeDespensa,
  IconeDieta,
  IconeEconomia,
  IconeMercado,
} from '../components/TabIcons';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import EconomyScreen from '../screens/EconomyScreen';
import MarketScreen from '../screens/MarketScreen';
import PantryScreen from '../screens/PantryScreen';
import UploadScreen from '../screens/UploadScreen';
import { readMealPlans, readShoppingLists } from '../services/api';
import { colors, typography } from '../theme/tokens';

type Abas = {
  Dieta: undefined;
  Mercado: undefined;
  Despensa: undefined;
  Economia: undefined;
};

const Tab = createBottomTabNavigator<Abas>();
const navegacao = createNavigationContainerRef<Abas>();

/** Onde a jornada da aba Dieta está. */
type Etapa = 'upload' | 'confirmacao';

export default function AppNavigator() {
  // Nulo enquanto a pessoa não escolheu: aí a etapa vem do que existe no
  // servidor, e quem já tem plano não cai na tela de enviar outro.
  const [etapaEscolhida, setEtapa] = useState<Etapa | null>(null);
  const [planoDaSessao, setPlanoDaSessao] = useState<string | null>(null);
  const [listaDaSessao, setListaDaSessao] = useState<string | null>(null);

  const planos = useQuery({ queryKey: ['meal-plans'], queryFn: readMealPlans });
  const planId = planoDaSessao ?? planos.data?.[0]?.id ?? null;

  const listas = useQuery({
    queryKey: ['shopping-lists', planId],
    queryFn: () => readShoppingLists(planId!),
    enabled: planId !== null,
  });
  const listId = listaDaSessao ?? listas.data?.[0]?.id ?? null;

  const etapa: Etapa = etapaEscolhida ?? (planId === null ? 'upload' : 'confirmacao');

  // Esperar aqui evita a tela piscar no upload antes de saber que há plano.
  // Erro de rede não trava o app: segue como quem não tem plano, e a tela de
  // upload mostra o erro dela se o envio também falhar.
  if (planos.isPending) {
    return (
      <View style={styles.carregando}>
        <ActivityIndicator color={colors.primaryContainer} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navegacao}>
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
        <Tab.Screen
          name="Dieta"
          options={{
            title: 'Dieta',
            tabBarIcon: ({ color, size }) => <IconeDieta color={color} size={size} />,
          }}
        >
          {() =>
            etapa === 'upload' || planId === null ? (
              <UploadScreen
                onImported={(resultado) => {
                  setPlanoDaSessao(resultado.meal_plan.id);
                  // A lista da sessão era do plano anterior: mantê-la mostraria
                  // no Mercado a compra de um plano que não é mais o atual.
                  setListaDaSessao(null);
                  setEtapa('confirmacao');
                }}
              />
            ) : (
              <ConfirmationScreen
                planId={planId}
                onReady={() => {
                  // A lista é gerada na aba Mercado: o botão leva até lá em vez
                  // de devolver a pessoa para o envio de outro plano.
                  if (navegacao.isReady()) navegacao.navigate('Mercado');
                }}
                onNewPlan={() => setEtapa('upload')}
              />
            )
          }
        </Tab.Screen>

        <Tab.Screen
          name="Mercado"
          options={{
            title: 'Mercado',
            tabBarIcon: ({ color, size }) => <IconeMercado color={color} size={size} />,
          }}
        >
          {() => (
            <MarketScreen planId={planId} listId={listId} onGenerated={setListaDaSessao} />
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Despensa"
          component={PantryScreen}
          options={{
            title: 'Despensa',
            tabBarIcon: ({ color, size }) => <IconeDespensa color={color} size={size} />,
          }}
        />

        <Tab.Screen
          name="Economia"
          options={{
            title: 'Economia',
            tabBarIcon: ({ color, size }) => <IconeEconomia color={color} size={size} />,
          }}
        >
          {() => <EconomyScreen listId={listId} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
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
