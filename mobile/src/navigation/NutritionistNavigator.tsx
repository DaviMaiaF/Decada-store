/**
 * Navegação da nutricionista: a lista de planos e o editor.
 *
 * Sem abas: Dieta, Mercado, Despensa e Economia são do paciente, e o servidor
 * responde 404 a essas rotas para a conta de nutricionista. Duas telas cabem
 * num estado só, como o início do paciente, sem pilha de navegação.
 */

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNotice } from '../components';
import NutritionistHomeScreen from '../screens/NutritionistHomeScreen';
import PrescriptionEditorScreen from '../screens/PrescriptionEditorScreen';
import { readPrescription } from '../services/api';
import { colors, spacing } from '../theme/tokens';

/** Fechado, plano novo ou um plano salvo, pelo id. */
type Editor = { aberto: false } | { aberto: true; id: string | null };

export default function NutritionistNavigator() {
  const [editor, setEditor] = useState<Editor>({ aberto: false });
  const fechar = () => setEditor({ aberto: false });

  return (
    <SafeAreaView edges={['top']} style={styles.tela}>
      {!editor.aberto ? (
        <NutritionistHomeScreen
          onNew={() => setEditor({ aberto: true, id: null })}
          onOpen={(id) => setEditor({ aberto: true, id })}
        />
      ) : editor.id === null ? (
        <PrescriptionEditorScreen prescription={null} onDone={fechar} />
      ) : (
        <PlanoSalvo key={editor.id} id={editor.id} onDone={fechar} />
      )}
    </SafeAreaView>
  );
}

/** A listagem não traz as refeições; o editor precisa do plano inteiro. */
function PlanoSalvo({ id, onDone }: { id: string; onDone: () => void }) {
  const plano = useQuery({ queryKey: ['prescription', id], queryFn: () => readPrescription(id) });

  if (plano.isPending) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.primaryContainer} size="large" />
      </View>
    );
  }
  if (plano.isError) {
    return (
      <View style={styles.centro}>
        <ErrorNotice message="não foi possível abrir o plano" />
      </View>
    );
  }
  return <PrescriptionEditorScreen prescription={plano.data} onDone={onDone} />;
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.surface },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.margin },
});
