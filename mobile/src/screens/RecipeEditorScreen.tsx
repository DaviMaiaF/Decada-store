/**
 * Editor de receita da nutricionista: criar uma nova ou editar uma já publicada.
 *
 * Todo ingrediente é um produto do catálogo, escolhido pela busca. Texto livre
 * não entra: é o produto que permite à DÉCADA dizer ao paciente que a receita
 * está 100% disponível com a despensa e a lista dele. A unidade segue a
 * grandeza em que o produto é vendido, pelo mesmo seletor da despensa.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Checkbox, ErrorNotice, Field, SectionTitle } from '../components';
import { SeletorDeUnidade } from '../components/SeletorDeUnidade';
import { ApiError, createRecipe, deleteRecipe, searchProducts, updateRecipe } from '../services/api';
import {
  EMPTY_FORM,
  buildRecipeInput,
  formFromRecipe,
  newIngredient,
  type IngredientRow,
  type RecipeForm,
} from '../services/recipeForm';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { Product, Recipe } from '../types/api';

const BUSCA_MINIMA = 2;

export default function RecipeEditorScreen({
  recipe,
  onDone,
}: {
  /** Nula para receita nova. */
  recipe: Recipe | null;
  onDone: () => void;
}) {
  const cliente = useQueryClient();
  const [form, setForm] = useState<RecipeForm>(() =>
    recipe ? formFromRecipe(recipe) : EMPTY_FORM,
  );
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const termo = busca.trim();
  const candidatos = useQuery({
    queryKey: ['product-search', termo],
    queryFn: () => searchProducts(termo, 8),
    enabled: termo.length >= BUSCA_MINIMA,
  });
  const jaNaReceita = new Set(form.ingredients.map((linha) => linha.product.id));
  const sugestoes = (candidatos.data ?? []).filter(({ product }) => !jaNaReceita.has(product.id));

  function concluir() {
    cliente.invalidateQueries({ queryKey: ['own-recipes'] });
    // A receita também muda as sugestões do paciente, se o mesmo cache servir.
    cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
    onDone();
  }

  const mostrarErro = (problema: unknown) =>
    setErro(problema instanceof ApiError ? problema.message : 'não foi possível salvar agora');

  const salvar = useMutation({
    mutationFn: (input: Parameters<typeof createRecipe>[0]) =>
      recipe ? updateRecipe(recipe.id, input) : createRecipe(input),
    onSuccess: concluir,
    onError: mostrarErro,
  });

  const excluir = useMutation({
    mutationFn: () => deleteRecipe(recipe!.id),
    onSuccess: concluir,
    onError: mostrarErro,
  });

  function campo<K extends keyof RecipeForm>(chave: K, valor: RecipeForm[K]) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  function mudarLinha(indice: number, mudanca: Partial<IngredientRow>) {
    setForm((atual) => ({
      ...atual,
      ingredients: atual.ingredients.map((linha, i) =>
        i === indice ? { ...linha, ...mudanca } : linha,
      ),
    }));
  }

  function adicionar(produto: Product) {
    setForm((atual) => ({ ...atual, ingredients: [...atual.ingredients, newIngredient(produto)] }));
    setBusca('');
  }

  function remover(indice: number) {
    setForm((atual) => ({
      ...atual,
      ingredients: atual.ingredients.filter((_, i) => i !== indice),
    }));
  }

  function enviar() {
    setErro(null);
    const resultado = buildRecipeInput(form);
    if (resultado.error !== null) {
      setErro(resultado.error);
      return;
    }
    salvar.mutate(resultado.input);
  }

  return (
    <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={onDone} style={styles.voltar}>
        <Text style={styles.voltarTexto}>‹ Suas receitas</Text>
      </Pressable>

      <Text style={styles.titulo}>{recipe ? 'Editar receita' : 'Nova receita'}</Text>

      <Field
        label="Nome da receita"
        value={form.name}
        onChangeText={(valor) => campo('name', valor)}
        placeholder="Omelete de espinafre"
      />
      <View style={styles.dupla}>
        <View style={styles.metade}>
          <Field
            label="Rende (porções)"
            value={form.servings}
            onChangeText={(valor) => campo('servings', valor)}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.metade}>
          <Field
            label="Preparo (minutos)"
            value={form.prepMinutes}
            onChangeText={(valor) => campo('prepMinutes', valor)}
            keyboardType="number-pad"
          />
        </View>
      </View>
      <Field
        label="Modo de preparo"
        value={form.instructions}
        onChangeText={(valor) => campo('instructions', valor)}
        multiline
        textAlignVertical="top"
        style={styles.preparo}
      />

      <SectionTitle>Ingredientes</SectionTitle>
      {form.ingredients.length === 0 ? (
        <Body muted>Busque um produto do catálogo para adicionar o primeiro.</Body>
      ) : null}

      {form.ingredients.map((linha, indice) => (
        <Card key={linha.product.id} style={styles.ingrediente}>
          <View style={styles.ingredienteTopo}>
            <Text style={styles.ingredienteNome}>{linha.product.name}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover ${linha.product.name}`}
              onPress={() => remover(indice)}
              hitSlop={spacing.xs}
            >
              <Text style={styles.remover}>Remover</Text>
            </Pressable>
          </View>
          <View style={styles.medida}>
            <View style={styles.quantidade}>
              <Field
                label="Quantidade"
                // Numa lista de ingredientes, "Quantidade" sozinha não diz de qual.
                accessibilityLabel={`Quantidade de ${linha.product.name}`}
                value={linha.quantity}
                onChangeText={(valor) => mudarLinha(indice, { quantity: valor })}
                keyboardType="decimal-pad"
              />
            </View>
            <SeletorDeUnidade
              produto={linha.product}
              escolhida={linha.unit}
              onEscolher={(unidade) => mudarLinha(indice, { unit: unidade })}
            />
          </View>
          <View style={styles.opcional}>
            <Checkbox
              label={`${linha.product.name} é opcional`}
              checked={linha.optional}
              onPress={() => mudarLinha(indice, { optional: !linha.optional })}
            />
            <Text style={styles.opcionalTexto}>Opcional</Text>
          </View>
        </Card>
      ))}

      <Field
        label="Buscar produto"
        value={busca}
        onChangeText={setBusca}
        placeholder="ovo, aveia, frango…"
        autoCorrect={false}
      />
      {termo.length >= BUSCA_MINIMA && candidatos.isPending ? <Body muted>Buscando…</Body> : null}
      {termo.length >= BUSCA_MINIMA && candidatos.data && sugestoes.length === 0 ? (
        <Body muted>Nenhum produto novo com esse nome no catálogo.</Body>
      ) : null}
      {sugestoes.map(({ product }) => (
        <Pressable
          key={product.id}
          accessibilityRole="button"
          accessibilityLabel={`Adicionar ${product.name}`}
          onPress={() => adicionar(product)}
          style={styles.sugestao}
        >
          <Text style={styles.sugestaoNome}>{product.name}</Text>
          {product.brand ? <Text style={styles.sugestaoMarca}>{product.brand}</Text> : null}
        </Pressable>
      ))}

      {erro ? <ErrorNotice message={erro} /> : null}

      <Button
        label={recipe ? 'Salvar alterações' : 'Publicar receita'}
        onPress={enviar}
        loading={salvar.isPending}
      />

      {recipe ? (
        confirmandoExclusao ? (
          <View style={styles.exclusao}>
            <Body>A receita sai das sugestões de todos os pacientes. Não dá para desfazer.</Body>
            <Button
              label="Confirmar exclusão"
              variant="secondary"
              onPress={() => excluir.mutate()}
              loading={excluir.isPending}
            />
            <Button
              label="Manter receita"
              variant="ghost"
              onPress={() => setConfirmandoExclusao(false)}
            />
          </View>
        ) : (
          <Button
            label="Excluir receita"
            variant="ghost"
            onPress={() => setConfirmandoExclusao(true)}
          />
        )
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  conteudo: {
    padding: spacing.margin,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    flexGrow: 1,
  },
  voltar: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: 'center', alignSelf: 'flex-start' },
  voltarTexto: { ...typography.labelLg, color: colors.primary },
  titulo: { ...typography.headlineLg, color: colors.primary },
  dupla: { flexDirection: 'row', gap: spacing.sm },
  metade: { flex: 1 },
  preparo: { minHeight: 120, paddingTop: spacing.sm },
  ingrediente: { gap: spacing.xs },
  ingredienteTopo: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  ingredienteNome: { ...typography.labelLg, color: colors.onSurface, flex: 1 },
  remover: { ...typography.labelMd, color: colors.error },
  medida: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  quantidade: { flex: 1 },
  opcional: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  opcionalTexto: { ...typography.bodySm, color: colors.onSurfaceVariant },
  sugestao: {
    minHeight: MIN_TOUCH_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLowest,
  },
  sugestaoNome: { ...typography.bodyMd, color: colors.onSurface },
  sugestaoMarca: { ...typography.labelSm, color: colors.onSurfaceVariant },
  exclusao: { gap: spacing.xs },
});
