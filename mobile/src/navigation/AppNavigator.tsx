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
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  IconeDespensa,
  IconeDieta,
  IconeEconomia,
  IconeInicio,
  IconeMercado,
} from '../components/TabIcons';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import EconomyScreen from '../screens/EconomyScreen';
import HomeScreen, { type AbaDeDestino } from '../screens/HomeScreen';
import MarketScreen from '../screens/MarketScreen';
import PantryScreen from '../screens/PantryScreen';
import UploadScreen from '../screens/UploadScreen';
import { Trilha } from '../components/Trilha';
import {
  readMealPlan,
  readMealPlans,
  readPantry,
  readShoppingList,
  readShoppingLists,
} from '../services/api';
import { MIN_TOUCH_HEIGHT, colors, spacing, typography } from '../theme/tokens';

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
  // O app abre no início, e a compra concluída volta para ele. Sair do início
  // monta as abas já na aba escolhida.
  const [noInicio, setNoInicio] = useState(true);
  const [abaInicial, setAbaInicial] = useState<AbaDeDestino>('Dieta');

  const planos = useQuery({ queryKey: ['meal-plans'], queryFn: readMealPlans });
  const planId = planoDaSessao ?? planos.data?.[0]?.id ?? null;

  const listas = useQuery({
    queryKey: ['shopping-lists', planId],
    queryFn: () => readShoppingLists(planId!),
    enabled: planId !== null,
  });
  const listId = listaDaSessao ?? listas.data?.[0]?.id ?? null;

  // As duas consultas abaixo compartilham a chave com as telas que já as fazem,
  // então o React Query serve as duas do mesmo cache: a trilha não custa
  // requisição extra, e acompanha cada confirmação e cada item marcado.
  const plano = useQuery({
    queryKey: ['meal-plan', planId],
    queryFn: () => readMealPlan(planId!),
    enabled: planId !== null,
  });

  const lista = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => readShoppingList(listId!),
    enabled: listId !== null,
  });

  // Mesma chave da aba Despensa: o cache é um só. A despensa entra no desconto
  // quando a lista é gerada, então dizer o que há em casa vem antes da região.
  const despensa = useQuery({ queryKey: ['pantry'], queryFn: readPantry });

  const itensDoPlano = plano.data?.items ?? [];
  const confirmados = itensDoPlano.filter((item) => item.status === 'confirmado').length;

  // Item que a despensa dispensou não faz parte do trajeto pelo mercado.
  const aComprar = (lista.data?.items ?? []).filter((item) => !item.dispensed_by_pantry);
  const comprados = aComprar.filter((item) => item.purchased).length;

  const etapas = [
    { rotulo: 'Enviar', cumprida: planId !== null },
    {
      rotulo: 'Confirmar',
      cumprida: itensDoPlano.length > 0 && confirmados === itensDoPlano.length,
      detalhe: itensDoPlano.length > 0 ? `${confirmados}/${itensDoPlano.length}` : undefined,
    },
    { rotulo: 'Despensa', cumprida: (despensa.data?.length ?? 0) > 0 },
    { rotulo: 'Região', cumprida: listId !== null },
    {
      rotulo: 'Comprar',
      cumprida: aComprar.length > 0 && comprados === aComprar.length,
      detalhe: aComprar.length > 0 ? `${comprados}/${aComprar.length}` : undefined,
    },
  ];

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

  // Nas abas, o topo ganha o caminho de volta ao início; no próprio início ele
  // não teria para onde levar.
  const topo = (comInicio: boolean) => (
    <SafeAreaView edges={['top']} style={[styles.topo, styles.topoLinha]}>
      {comInicio ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar ao início"
          onPress={() => setNoInicio(true)}
          style={({ pressed }) => [styles.botaoInicio, pressed && styles.botaoInicioPressionado]}
        >
          <IconeInicio color={colors.primary} size={20} />
          <Text style={styles.botaoInicioTexto}>Início</Text>
        </Pressable>
      ) : null}
      <View style={styles.trilha}>
        <Trilha etapas={etapas} />
      </View>
    </SafeAreaView>
  );

  if (noInicio) {
    return (
      <View style={styles.inicio}>
        {topo(false)}
        <HomeScreen
          etapas={etapas}
          onIr={(aba) => {
            setAbaInicial(aba);
            setNoInicio(false);
          }}
        />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navegacao}>
      {/* A trilha fica no lugar do cabeçalho, que só repetia o nome da aba —
          cada tela já abre com o próprio título. */}
      {topo(true)}

      <Tab.Navigator
        initialRouteName={abaInicial}
        screenOptions={{
          headerShown: false,
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
            <MarketScreen
              planId={planId}
              listId={listId}
              onGenerated={setListaDaSessao}
              onCompraConcluida={() => setNoInicio(true)}
            />
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Despensa"
          options={{
            title: 'Despensa',
            tabBarIcon: ({ color, size }) => <IconeDespensa color={color} size={size} />,
          }}
        >
          {/* A despensa precisa da lista corrente por dois motivos: a receita
              conta o que será comprado, e o ingrediente que falta vai para lá. */}
          {() => <PantryScreen listId={listId} />}
        </Tab.Screen>

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
  topo: { backgroundColor: colors.surface },
  topoLinha: { flexDirection: 'row', alignItems: 'center' },
  trilha: { flex: 1 },
  botaoInicio: {
    minWidth: MIN_TOUCH_HEIGHT,
    minHeight: MIN_TOUCH_HEIGHT,
    paddingLeft: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoInicioPressionado: { opacity: 0.6 },
  botaoInicioTexto: { ...typography.labelSm, color: colors.primary },
  inicio: { flex: 1, backgroundColor: colors.surface },
  carregando: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
