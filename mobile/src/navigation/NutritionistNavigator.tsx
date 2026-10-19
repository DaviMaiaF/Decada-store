/**
 * Navegação da nutricionista.
 *
 * Sem abas: Dieta, Mercado, Despensa e Economia são do paciente, e o servidor
 * responde 404 a essas rotas para a conta de nutricionista.
 */

import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button } from '../components';
import { readAccount } from '../services/api';
import { useAuth } from '../services/auth';
import { colors, spacing, typography } from '../theme/tokens';

export default function NutritionistNavigator() {
  const { signOut } = useAuth();
  const conta = useQuery({ queryKey: ['account'], queryFn: readAccount });

  return (
    <SafeAreaView edges={['top']} style={styles.tela}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        <View style={styles.cabecalho}>
          <Text style={styles.marca}>DÉCADA · NUTRICIONISTA</Text>
          {conta.data ? (
            <Body muted>
              {conta.data.full_name}
              {conta.data.crn ? ` · ${conta.data.crn}` : ''}
            </Body>
          ) : null}
        </View>
        <Button label="Sair da conta" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.surface },
  conteudo: { padding: spacing.margin, gap: spacing.sm, flexGrow: 1 },
  cabecalho: { gap: spacing.xs },
  marca: { ...typography.labelSm, color: colors.secondary, letterSpacing: 2 },
});
