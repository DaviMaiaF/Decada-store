/**
 * Lista de compras, agrupada pelos corredores do mercado.
 *
 * O agrupamento acontece aqui, e não no servidor: a API devolve os itens em
 * lista plana com a categoria dentro do produto, e como exibir é decisão de
 * quem exibe.
 *
 * Todo preço aparece com data e origem. Preço com mais de 30 dias é mostrado
 * como estimativa — é a decisão nº 1 do projeto, e a tela é o último lugar
 * onde ela pode se perder.
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Body, Button, Card, Chip, ErrorNotice, ProgressBar, SectionTitle } from '../components';
import {
  ApiError,
  generateShoppingList,
  readShoppingList,
  setItemPurchased,
} from '../services/api';
import { describeConfidence, describeOrigin, formatMoney, formatQuantity } from '../services/format';
import { simulatedSavings, simulatedTotal } from '../services/simulation';
import { readRegion, saveRegion } from '../services/session';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { ShoppingList, ShoppingListItem } from '../types/api';

/** Rótulo de cada corredor. As chaves são as categorias do catálogo. */
const CORREDORES: Record<string, string> = {
  hortifruti: 'Hortifrúti',
  proteinas: 'Carnes & Ovos',
  laticinios: 'Laticínios',
  mercearia: 'Mercearia & Grãos',
};

export default function MarketScreen({
  planId,
  listId,
  onGenerated,
}: {
  planId: string | null;
  listId: string | null;
  onGenerated: (listId: string) => void;
}) {
  // Depois de gerada, a lista tomava a tela para sempre e a região virava
  // definitiva — inclusive para quem lia o aviso de região sem preço, que manda
  // justamente gerar em outra cidade. Conselho sem caminho não é conselho.
  const [trocandoRegiao, setTrocandoRegiao] = useState(false);

  const lista = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => readShoppingList(listId!),
    enabled: listId !== null,
  });

  if (listId === null || trocandoRegiao) {
    return (
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.titulo}>Lista de Mercado</Text>
        {planId === null ? (
          <Body muted>
            Envie o plano da sua nutricionista na aba Dieta para gerar sua lista.
          </Body>
        ) : (
          <FormularioRegiaoEGeracao
            planId={planId}
            onGenerated={(novaLista) => {
              setTrocandoRegiao(false);
              onGenerated(novaLista);
            }}
            onCancel={trocandoRegiao ? () => setTrocandoRegiao(false) : undefined}
          />
        )}
      </ScrollView>
    );
  }

  if (lista.isPending) return <Body muted>Carregando a lista…</Body>;

  if (lista.isError) {
    return (
      <View style={styles.conteudo}>
        <ErrorNotice message="não foi possível carregar a lista" />
      </View>
    );
  }

  return (
    <ListaCarregada lista={lista.data} onTrocarRegiao={() => setTrocandoRegiao(true)} />
  );
}

function FormularioRegiaoEGeracao({
  planId,
  onGenerated,
  onCancel,
}: {
  planId: string;
  onGenerated: (listId: string) => void;
  /** Só existe quando se está trocando a região de uma lista que já existe. */
  onCancel?: () => void;
}) {
  const [stateCode, setStateCode] = useState('DF');
  const [city, setCity] = useState('Brasília');

  useEffect(() => {
    let ativo = true;
    readRegion().then((regiao) => {
      if (ativo && regiao) {
        setStateCode(regiao.stateCode);
        setCity(regiao.city);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  const geracao = useMutation({
    mutationFn: async () => {
      const ufLimpa = stateCode.trim().toUpperCase() || 'DF';
      const cidadeLimpa = city.trim() || 'Brasília';
      await saveRegion({ stateCode: ufLimpa, city: cidadeLimpa });
      return generateShoppingList(planId, ufLimpa, cidadeLimpa);
    },
    onSuccess: (resultado) => onGenerated(resultado.shopping_list.id),
  });

  return (
    <>
      <Body muted>
        Gere a lista com os itens que você confirmou. O que já estiver na sua
        despensa é descontado automaticamente.
      </Body>

      <Card style={styles.cardRegiao}>
        <SectionTitle>Região dos preços</SectionTitle>
        <Body muted>
          A estimativa de preços do mercado é calculada com base na sua localização.
        </Body>

        <View style={styles.linhaCamposRegiao}>
          <View style={styles.campoUfContainer}>
            <Text style={styles.rotuloCampo}>UF</Text>
            <TextInput
              accessibilityLabel="Estado"
              placeholder="UF"
              placeholderTextColor={colors.outline}
              autoCapitalize="characters"
              maxLength={2}
              style={styles.campoTexto}
              value={stateCode}
              onChangeText={setStateCode}
            />
          </View>

          <View style={styles.campoCidadeContainer}>
            <Text style={styles.rotuloCampo}>Cidade</Text>
            <TextInput
              accessibilityLabel="Cidade"
              placeholder="Cidade"
              placeholderTextColor={colors.outline}
              style={styles.campoTexto}
              value={city}
              onChangeText={setCity}
            />
          </View>
        </View>
      </Card>

      {geracao.isError ? (
        <ErrorNotice
          message={
            geracao.error instanceof ApiError
              ? geracao.error.message
              : 'não foi possível gerar a lista'
          }
        />
      ) : null}
      <Button
        label="Gerar lista de compras"
        onPress={() => geracao.mutate()}
        loading={geracao.isPending}
      />
      {onCancel ? (
        <Button label="Manter a lista atual" variant="ghost" onPress={onCancel} />
      ) : null}
    </>
  );
}

function ListaCarregada({
  lista,
  onTrocarRegiao,
}: {
  lista: ShoppingList;
  onTrocarRegiao: () => void;
}) {
  const cliente = useQueryClient();
  const chave = ['shopping-list', lista.id];

  /**
   * Marcar item é otimista de propósito.
   *
   * Quem usa isto está de pé no corredor do mercado, com a rede do celular
   * oscilando. Esperar a resposta para riscar a linha faria o toque parecer
   * perdido. Se a chamada falhar, a lista volta ao que era e a mensagem de
   * erro aparece.
   */
  const marcacao = useMutation({
    mutationFn: ({ itemId, comprado }: { itemId: string; comprado: boolean }) =>
      setItemPurchased(lista.id, itemId, comprado),
    onMutate: async ({ itemId, comprado }) => {
      await cliente.cancelQueries({ queryKey: chave });
      const anterior = cliente.getQueryData<ShoppingList>(chave);

      cliente.setQueryData<ShoppingList>(chave, (atual) =>
        atual === undefined
          ? atual
          : {
              ...atual,
              items: atual.items.map((item) =>
                item.id === itemId ? { ...item, purchased: comprado } : item,
              ),
            },
      );

      return { anterior };
    },
    onError: (_erro, _variaveis, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(chave, contexto.anterior);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: chave }),
  });

  const porCorredor = useMemo(() => {
    const grupos = new Map<string, ShoppingListItem[]>();
    for (const item of lista.items) {
      const chave = item.product.category ?? 'outros';
      grupos.set(chave, [...(grupos.get(chave) ?? []), item]);
    }
    return [...grupos.entries()];
  }, [lista.items]);

  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const dispensados = lista.items.filter((item) => item.dispensed_by_pantry);
  // Só conta entre o que há para comprar: item que a despensa dispensou aceita
  // marcação no servidor, mas não faz parte do trajeto pelo mercado.
  const comprados = aComprar.filter((item) => item.purchased).length;
  const progresso = aComprar.length === 0 ? 0 : (comprados / aComprar.length) * 100;
  // Nenhum item com preço quase sempre quer dizer região sem coleta — e aí o
  // total é R$ 0,00 por falta de dado, não por a compra ser de graça. Dizer
  // "sem preço" item por item não explica isso; a causa é a região.
  const semPrecoNaRegiao =
    aComprar.length > 0 && aComprar.every((item) => item.estimated_cost === null);

  // Simulação: "e se eu não levar isto?". Vive só na tela — nada é enviado, a
  // lista salva não muda e a prescrição menos ainda (decisão 8). Por isso é um
  // estado local, e não uma mutação.
  const [foraDaSimulacao, setForaDaSimulacao] = useState<string[]>([]);
  const excluidos = new Set(foraDaSimulacao);
  const simulando = foraDaSimulacao.length > 0;
  const totalSimulado = simulatedTotal(aComprar, excluidos);
  const economiaSimulada = simulatedSavings(aComprar, excluidos);

  function alternarSimulacao(itemId: string) {
    setForaDaSimulacao((fora) =>
      fora.includes(itemId) ? fora.filter((id) => id !== itemId) : [...fora, itemId],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <Text style={styles.titulo}>Lista de Mercado</Text>

      <Card style={styles.resumo}>
        <Text style={styles.resumoRotulo}>ESTIMATIVA DA COMPRA</Text>
        <Text style={styles.total}>{formatMoney(lista.estimated_total)}</Text>
        <Text style={styles.resumoRegiao}>
          {lista.city} · {lista.state_code}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gerar em outra região"
          onPress={onTrocarRegiao}
          style={styles.trocarRegiao}
        >
          <Text style={styles.trocarRegiaoTexto}>Gerar em outra região</Text>
        </Pressable>
        <View style={styles.progresso}>
          <ProgressBar percent={progresso} />
          <Text style={styles.progressoTexto}>
            {comprados} de {aComprar.length} itens comprados
          </Text>
        </View>
      </Card>

      {simulando ? (
        <Card style={styles.simulacao}>
          <SectionTitle>Simulando a compra</SectionTitle>
          <Text style={styles.totalSimulado}>{formatMoney(totalSimulado)}</Text>
          <Body muted>
            {foraDaSimulacao.length === 1
              ? `1 item fora da simulação · ${formatMoney(economiaSimulada)} a menos`
              : `${foraDaSimulacao.length} itens fora da simulação · ${formatMoney(economiaSimulada)} a menos`}
          </Body>
          <Body muted>
            É só uma conta nesta tela. Sua lista continua inteira, e o plano da sua
            nutricionista não muda.
          </Body>
          <Button
            label="Limpar simulação"
            variant="ghost"
            onPress={() => setForaDaSimulacao([])}
          />
        </Card>
      ) : null}

      {semPrecoNaRegiao ? (
        <Card style={styles.avisoRegiao}>
          <SectionTitle>Ainda não temos preços em {lista.city}</SectionTitle>
          <Body muted>
            A lista está certa, mas o total não: a média de preço é sempre da sua
            região, e ninguém ainda escaneou nota fiscal em {lista.city} · {lista.state_code}.
            Toque em "Gerar em outra região" no resumo acima, ou escaneie o QR Code das
            suas compras para começar a formar o preço daqui.
          </Body>
        </Card>
      ) : null}

      {marcacao.isError ? (
        <ErrorNotice message="não foi possível salvar o item marcado" />
      ) : null}

      {dispensados.length > 0 ? (
        <Card style={styles.sincronizacao}>
          <SectionTitle>Sincronização com a despensa</SectionTitle>
          <Body muted>
            {dispensados.length} item(ns) saíram da compra porque você já tem em casa.
          </Body>
        </Card>
      ) : null}

      {porCorredor.map(([categoria, itens]) => (
        <View key={categoria} style={styles.corredor}>
          <SectionTitle>{CORREDORES[categoria] ?? 'Outros'}</SectionTitle>
          {itens.map((item) => (
            <ItemDaLista
              key={item.id}
              item={item}
              foraDaSimulacao={excluidos.has(item.id)}
              onSimular={() => alternarSimulacao(item.id)}
              onToggle={() =>
                marcacao.mutate({ itemId: item.id, comprado: !item.purchased })
              }
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function ItemDaLista({
  item,
  foraDaSimulacao,
  onSimular,
  onToggle,
}: {
  item: ShoppingListItem;
  foraDaSimulacao: boolean;
  onSimular: () => void;
  onToggle: () => void;
}) {
  const dispensado = item.dispensed_by_pantry;
  const comprado = item.purchased;

  return (
    <Card
      style={[
        styles.item,
        comprado && styles.itemComprado,
        foraDaSimulacao && styles.itemForaDaSimulacao,
      ]}
    >
      <View style={styles.itemTopo}>
        <View style={styles.itemTexto}>
          <Text style={[styles.itemNome, comprado && styles.riscado]}>{item.product.name}</Text>
          <Text style={styles.itemQuantidade}>
            {dispensado
              ? `${formatQuantity(item.quantity_from_pantry, item.unit)} já em casa`
              : formatQuantity(item.quantity, item.unit)}
            {item.packages_needed ? ` · ${item.packages_needed} embalagem(ns)` : ''}
          </Text>
        </View>
        <Text style={styles.itemPreco}>{formatMoney(item.estimated_cost)}</Text>
      </View>

      {/* Preço nunca anda sozinho: data, origem e tamanho da amostra junto. */}
      <Text style={styles.procedencia}>
        {describeConfidence(item.price_confidence, item.price_reference_date)}
        {item.price_origin ? ` · ${describeOrigin(item.price_origin)}` : ''}
        {item.price_sample_size ? ` · ${item.price_sample_size} coleta(s)` : ''}
      </Text>

      {item.product.is_fictitious ? (
        <Chip label="dado fictício de desenvolvimento" tone="warning" />
      ) : null}

      {Number(item.quantity_from_pantry) > 0 && !dispensado ? (
        <Chip
          label={`${formatQuantity(item.quantity_from_pantry, item.unit)} vieram da despensa`}
          tone="success"
        />
      ) : null}

      {dispensado ? (
        <Chip label="não precisa comprar" tone="success" />
      ) : (
        <>
          <Button
            label={comprado ? 'Desmarcar' : 'Já comprei'}
            variant="ghost"
            onPress={onToggle}
          />
          {/* Tirar da simulação não é o mesmo que marcar como comprado: aquilo
              o servidor guarda, isto não sai desta tela. */}
          <Button
            label={foraDaSimulacao ? 'Devolver à simulação' : 'Simular sem este item'}
            variant="ghost"
            onPress={onSimular}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl3 },
  titulo: { ...typography.headlineLg, color: colors.primary },

  cardRegiao: { gap: spacing.xs },
  linhaCamposRegiao: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  campoUfContainer: { width: 72, gap: 4 },
  campoCidadeContainer: { flex: 1, gap: 4 },
  rotuloCampo: { ...typography.labelSm, color: colors.onSurfaceVariant },
  campoTexto: {
    minHeight: MIN_TOUCH_HEIGHT,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.onSurface,
  },

  avisoRegiao: { backgroundColor: colors.surfaceContainerLow, gap: spacing.xs2 },
  simulacao: { backgroundColor: colors.surfaceContainerLow, gap: spacing.xs2 },
  totalSimulado: { ...typography.currency, color: colors.primary },
  resumo: { backgroundColor: colors.primaryContainer, gap: spacing.xs2 },
  resumoRotulo: { ...typography.labelSm, color: colors.onPrimaryContainer },
  trocarRegiao: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: 'center' },
  trocarRegiaoTexto: { ...typography.labelLg, color: colors.onPrimary },
  total: { ...typography.currency, color: colors.onPrimary },
  resumoRegiao: { ...typography.bodySm, color: colors.onPrimaryContainer },
  progresso: { gap: spacing.xs2, marginTop: spacing.xs },
  progressoTexto: { ...typography.labelSm, color: colors.onPrimaryContainer },

  sincronizacao: { backgroundColor: colors.surfaceContainerLow, gap: spacing.xs2 },

  corredor: { gap: spacing.xs },
  item: { gap: spacing.xs2 },
  // Quem está fora da simulação continua na lista, só desbotado: sumir daria a
  // impressão de que o item saiu da compra de verdade.
  itemForaDaSimulacao: { opacity: 0.55 },
  itemComprado: { opacity: 0.5 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  itemTexto: { flex: 1 },
  itemNome: { ...typography.labelLg, color: colors.onSurface },
  riscado: { textDecorationLine: 'line-through' },
  itemQuantidade: { ...typography.labelSm, color: colors.onSurfaceVariant },
  itemPreco: { ...typography.labelLg, color: colors.primary },
  procedencia: { ...typography.labelSm, color: colors.onSurfaceVariant },
});
