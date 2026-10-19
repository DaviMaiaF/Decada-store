/**
 * Navegação da nutricionista: a lista de receitas e o editor.
 *
 * Sem abas: Dieta, Mercado, Despensa e Economia são do paciente, e o servidor
 * responde 404 a essas rotas para a conta de nutricionista. Duas telas cabem
 * num estado só, como o início do paciente, sem pilha de navegação.
 */

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import NutritionistRecipesScreen from '../screens/NutritionistRecipesScreen';
import RecipeEditorScreen from '../screens/RecipeEditorScreen';
import { colors } from '../theme/tokens';
import type { Recipe } from '../types/api';

/** Fechado, receita nova ou uma receita salva sendo editada. */
type Editor = { aberto: false } | { aberto: true; recipe: Recipe | null };

export default function NutritionistNavigator() {
  const [editor, setEditor] = useState<Editor>({ aberto: false });

  return (
    <SafeAreaView edges={['top']} style={styles.tela}>
      <View style={styles.tela}>
        {editor.aberto ? (
          <RecipeEditorScreen
            // A chave remonta o editor ao trocar de receita, sem herdar o formulário.
            key={editor.recipe?.id ?? 'nova'}
            recipe={editor.recipe}
            onDone={() => setEditor({ aberto: false })}
          />
        ) : (
          <NutritionistRecipesScreen
            onNew={() => setEditor({ aberto: true, recipe: null })}
            onEdit={(recipe) => setEditor({ aberto: true, recipe })}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.surface },
});
