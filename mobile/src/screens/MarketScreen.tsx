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
 *
 * A lista aceita item avulso: o que a receita pede e o que acabou em casa. Ele
 * muda a compra, nunca a prescrição — e por isso só ele tem botão de sair.
 * Item que veio do plano fica: para vê-lo fora da conta existe a simulação.
 */

import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Card, Chip, ErrorNotice, ProgressBar, SectionTitle } from '../components';
import { Entrada, useCascata } from '../components/Entrada';
import { SeletorDeUnidade } from '../components/SeletorDeUnidade';
import { ListaDesatualizada } from '../components/ListaDesatualizada';
import CheckoutScreen from './CheckoutScreen';
import { describeConfidence, describeOrigin, formatMoney, formatQuantity } from '../services/format';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { ProductSuggestion, ShoppingList, ShoppingListItem, SimulatedItem } from '../types/api';
import {
  useAddExtraItemViewModel,
  useMarketViewModel,
  usePantryQuestionViewModel,
  useRegionFormViewModel,
  useShoppingListViewModel,
  useSimulatedQuantityField,
} from '../viewmodels/useMarketViewModel';

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
  onCompraConcluida,
  onIrADespensa,
}: {
  planId: string | null;
  listId: string | null;
  onGenerated: (listId: string) => void;
  /** Depois da compra concluída, leva ao início. */
  onCompraConcluida: () => void;
  /** Leva à aba Despensa, para dizer o que há em casa antes de gerar. */
  onIrADespensa: () => void;
}) {
  const vm = useMarketViewModel(listId);

  if (vm.mostrarRegiao) {
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
            onIrADespensa={onIrADespensa}
            onGenerated={(novaLista) => {
              vm.manterRegiao();
              onGenerated(novaLista);
            }}
            onCancel={vm.trocandoRegiao ? vm.manterRegiao : undefined}
          />
        )}
      </ScrollView>
    );
  }

  if (vm.carregando) return <Body muted>Carregando a lista…</Body>;

  if (vm.falhou || vm.lista === null) {
    return (
      <View style={styles.conteudo}>
        <ErrorNotice message="não foi possível carregar a lista" />
      </View>
    );
  }

  if (vm.finalizando) {
    return (
      <CheckoutScreen
        lista={vm.lista}
        onVoltar={vm.voltarALista}
        onGenerated={onGenerated}
        onIrAoInicio={onCompraConcluida}
      />
    );
  }

  return (
    <ListaCarregada
      lista={vm.lista}
      onTrocarRegiao={vm.trocarRegiao}
      onFinalizar={vm.finalizar}
      onGenerated={onGenerated}
    />
  );
}

function FormularioRegiaoEGeracao({
  planId,
  onIrADespensa,
  onGenerated,
  onCancel,
}: {
  planId: string;
  onIrADespensa: () => void;
  onGenerated: (listId: string) => void;
  /** Só existe quando se está trocando a região de uma lista que já existe. */
  onCancel?: () => void;
}) {
  const vm = useRegionFormViewModel(planId, onGenerated);
  const despensa = usePantryQuestionViewModel(planId);

  return (
    <>
      <Body muted>
        Gere a lista com os itens que você confirmou. O que já estiver na sua
        despensa é descontado automaticamente.
      </Body>

      {despensa.total > 0 ? (
        <Card style={styles.cardRegiao}>
          <SectionTitle>Sua despensa</SectionTitle>
          <Body muted>
            {despensa.total === 1
              ? '1 item em casa será descontado da lista.'
              : `${despensa.total} itens em casa serão descontados da lista.`}
          </Body>
          <Button label="Revisar a despensa" variant="ghost" onPress={onIrADespensa} />
        </Card>
      ) : null}

      {despensa.perguntar ? (
        <Card style={styles.cardRegiao}>
          <SectionTitle>O que você já tem em casa?</SectionTitle>
          <Body muted>
            A lista desconta o que está na despensa e depois não muda sozinha. Com a
            despensa vazia, ela vem com a compra inteira.
          </Body>
          <Button label="Cadastrar minha despensa" onPress={onIrADespensa} />
          <Button label="Não tenho nada em casa" variant="ghost" onPress={despensa.naoTenhoNada} />
        </Card>
      ) : null}

      {despensa.semDespensa ? (
        <Body muted>Sem despensa, a lista sai com a compra inteira.</Body>
      ) : null}

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
              value={vm.stateCode}
              onChangeText={vm.setStateCode}
            />
          </View>

          <View style={styles.campoCidadeContainer}>
            <Text style={styles.rotuloCampo}>Cidade</Text>
            <TextInput
              accessibilityLabel="Cidade"
              placeholder="Cidade"
              placeholderTextColor={colors.outline}
              style={styles.campoTexto}
              value={vm.city}
              onChangeText={vm.setCity}
            />
          </View>
        </View>
      </Card>

      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
      <Button
        label="Gerar lista de compras"
        onPress={vm.gerar}
        loading={vm.gerando}
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
  onFinalizar,
  onGenerated,
}: {
  lista: ShoppingList;
  onTrocarRegiao: () => void;
  /** Abre o checkout simulado. */
  onFinalizar: () => void;
  /** Lista nova, gerada pelo aviso de plano alterado. */
  onGenerated: (listId: string) => void;
}) {
  const vm = useShoppingListViewModel(lista);
  // Corredor que surge de um item acrescentado entra na hora.
  const cascata = useCascata(vm.porCorredor.length > 0);

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <Text style={styles.titulo}>Lista de Mercado</Text>

      <Card style={styles.resumo}>
        <Text style={styles.resumoRotulo}>
          {vm.simulando ? 'SIMULANDO A COMPRA' : 'ESTIMATIVA DA COMPRA'}
        </Text>
        {/* Na simulação o card de cima é quem muda: o total simulado ficava em
            outro card, abaixo da dobra, e parecia que nada tinha acontecido. */}
        <Text style={styles.total}>
          {formatMoney(vm.simulando ? vm.totalSimulado : lista.estimated_total)}
        </Text>
        {vm.simulando ? (
          <Text style={styles.resumoRegiao}>
            salva: <Text style={styles.totalSalvo}>{formatMoney(vm.totalOriginal)}</Text>
          </Text>
        ) : null}
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
          <ProgressBar percent={vm.progresso} />
          <Text style={styles.progressoTexto}>
            {vm.comprados} de {vm.aComprar} itens comprados
          </Text>
        </View>
      </Card>

      {/* Antes do botão de finalizar: quem trocou um produto na Dieta precisa
          saber disso antes de levar a lista ao mercado. */}
      <ListaDesatualizada lista={lista} onGenerated={onGenerated} />

      {/* Leva ao checkout, que é simulado: o MVP não faz pedido em mercado
          nenhum, e a tela seguinte diz isso antes de qualquer confirmação. */}
      <Button
        label="Finalizar compra (simulada)"
        onPress={onFinalizar}
        disabled={vm.aComprar === 0}
      />

      {vm.simulando ? (
        <Card style={styles.simulacao}>
          <SectionTitle>Simulando a compra</SectionTitle>
          <Body muted>{vm.resumoDaSimulacao}</Body>
          <Body muted>
            É só uma conta nesta tela. Sua lista continua inteira, e o plano da sua
            nutricionista não muda.
          </Body>
          <Button label="Limpar simulação" variant="ghost" onPress={vm.limparSimulacao} />
        </Card>
      ) : null}

      {vm.semPrecoNaRegiao ? (
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

      {vm.marcacaoFalhou ? (
        <ErrorNotice message="não foi possível salvar o item marcado" />
      ) : null}

      {vm.dispensados > 0 ? (
        <Card style={styles.sincronizacao}>
          <SectionTitle>Sincronização com a despensa</SectionTitle>
          <Body muted>
            {vm.dispensados} item(ns) saíram da compra porque você já tem em casa.
          </Body>
        </Card>
      ) : null}

      {vm.porCorredor.map(([categoria, itens], indice) => (
        <Entrada key={categoria} atraso={cascata(indice)} style={styles.corredor}>
          <SectionTitle>{CORREDORES[categoria] ?? 'Outros'}</SectionTitle>
          {itens.map((item) => (
            <ItemDaLista
              key={item.id}
              item={item}
              foraDaSimulacao={vm.foraDaSimulacao(item.id)}
              removendo={vm.removendo}
              onRemover={() => vm.remover(item.id)}
              simulado={vm.simulado(item.id)}
              calculando={vm.calculando}
              onSimular={() => vm.alternarSimulacao(item.id)}
              onSimularQuantidade={(quantidade) => vm.simularQuantidade(item.id, quantidade)}
              onToggle={() => vm.alternarComprado(item)}
            />
          ))}
        </Entrada>
      ))}

      {vm.erroDaRemocao ? <ErrorNotice message={vm.erroDaRemocao} /> : null}

      <AcrescentarItem listId={lista.id} />
    </ScrollView>
  );
}

/** Acrescentar à compra um produto que o plano não pediu. */
function AcrescentarItem({ listId }: { listId: string }) {
  const vm = useAddExtraItemViewModel(listId);
  const { produto } = vm;

  return (
    <Card style={styles.acrescentar}>
      <SectionTitle>Acrescentar à compra</SectionTitle>
      <Body muted>
        O que uma receita pede, ou o que acabou em casa. Isto muda a sua lista de
        compras — o plano da sua nutricionista continua o mesmo.
      </Body>

      {produto === null ? (
        <>
          <View style={styles.acrescentarLinha}>
            <TextInput
              accessibilityLabel="Acrescentar produto à compra"
              placeholder="Ex: chia, azeite, café…"
              placeholderTextColor={colors.outline}
              style={[styles.campoTexto, styles.acrescentarCampo]}
              value={vm.texto}
              onChangeText={vm.setTexto}
              onSubmitEditing={vm.buscar}
              returnKeyType="done"
            />
            <Button
              label="Buscar"
              variant="secondary"
              disabled={!vm.podeBuscar}
              onPress={vm.buscar}
            />
          </View>

          {vm.buscando ? (
            <Body muted>Buscando no catálogo…</Body>
          ) : null}
          {vm.buscaFalhou ? (
            <ErrorNotice message="não foi possível buscar no catálogo" />
          ) : null}

          {vm.candidatos?.map((sugestao: ProductSuggestion) => (
            <Pressable
              key={sugestao.product.id}
              accessibilityRole="button"
              accessibilityLabel={`Acrescentar ${sugestao.product.name}`}
              onPress={() => vm.escolherProduto(sugestao.product)}
              style={styles.candidato}
            >
              <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
              <Text style={styles.candidatoDetalhe}>
                {Math.round(Number(sugestao.score) * 100)}% de semelhança
              </Text>
            </Pressable>
          ))}

          {vm.escolhendo !== null && vm.candidatos?.length === 0 ? (
            <Body muted>Nenhum produto do catálogo se parece com isso.</Body>
          ) : null}
        </>
      ) : (
        <>
          <Body muted>Quanto de {produto.name} você quer levar?</Body>
          <View style={styles.acrescentarLinha}>
            <TextInput
              accessibilityLabel="Quantidade a acrescentar"
              placeholder="0"
              placeholderTextColor={colors.outline}
              keyboardType="decimal-pad"
              returnKeyType="done"
              style={[styles.campoTexto, styles.acrescentarCampo]}
              value={vm.quantidade}
              onChangeText={vm.setQuantidade}
            />
            <SeletorDeUnidade produto={produto} escolhida={vm.unidade} onEscolher={vm.setUnidade} />
          </View>
          <Button
            label="Acrescentar à lista"
            disabled={!vm.quantidadeValida}
            loading={vm.acrescentando}
            onPress={vm.acrescentar}
          />
          <Button label="Cancelar" variant="ghost" onPress={vm.cancelar} />
        </>
      )}

      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
    </Card>
  );
}

function ItemDaLista({
  item,
  foraDaSimulacao,
  simulado,
  calculando,
  removendo,
  onSimular,
  onSimularQuantidade,
  onToggle,
  onRemover,
}: {
  item: ShoppingListItem;
  foraDaSimulacao: boolean;
  simulado: SimulatedItem | null;
  calculando: boolean;
  removendo: boolean;
  onSimular: () => void;
  onSimularQuantidade: (quantidade: string) => void;
  onToggle: () => void;
  onRemover: () => void;
}) {
  const dispensado = item.dispensed_by_pantry;
  const comprado = item.purchased;
  const campo = useSimulatedQuantityField();
  const { numero } = campo;

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
        <View>
          <Text style={[styles.itemPreco, simulado !== null && styles.precoSubstituido]}>
            {formatMoney(item.estimated_cost)}
          </Text>
          {simulado !== null ? (
            <Text style={styles.itemPrecoSimulado}>
              {formatMoney(simulado.estimated_cost)}
            </Text>
          ) : null}
        </View>
      </View>

      {simulado !== null ? (
        <Chip
          label={
            simulado.packages_needed
              ? `simulando ${simulado.quantity} ${item.unit} · ${simulado.packages_needed} embalagem(ns)`
              : `simulando ${simulado.quantity} ${item.unit}`
          }
          tone="neutral"
        />
      ) : null}

      {/* Preço nunca anda sozinho: data, origem e tamanho da amostra junto. */}
      <Text style={styles.procedencia}>
        {describeConfidence(item.price_confidence, item.price_reference_date)}
        {item.price_origin ? ` · ${describeOrigin(item.price_origin)}` : ''}
        {item.price_sample_size ? ` · ${item.price_sample_size} coleta(s)` : ''}
      </Text>

      {/* Quem olha a lista no mercado precisa saber o que a nutricionista
          pediu e o que foi a própria pessoa que acrescentou. */}
      {item.is_extra ? <Chip label="fora da prescrição" tone="neutral" /> : null}

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

          {campo.aberto ? (
            <View style={styles.campoSimulacao}>
              <TextInput
                accessibilityLabel={`Quantidade simulada de ${item.product.name}`}
                placeholder={`Quantidade em ${item.unit}`}
                placeholderTextColor={colors.outline}
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={styles.campoTexto}
                value={campo.quantidade}
                onChangeText={campo.setQuantidade}
                onSubmitEditing={() => numero !== null && onSimularQuantidade(numero)}
              />
              <Button
                label={calculando ? 'Calculando…' : 'Ver quanto fica'}
                variant="ghost"
                disabled={numero === null || calculando}
                onPress={() => numero !== null && onSimularQuantidade(numero)}
              />
            </View>
          ) : (
            <Button
              label="Simular outra quantidade"
              variant="ghost"
              onPress={campo.abrir}
            />
          )}

          {/* Por último, e só no avulso: tirar daqui um alimento prescrito
              seria o app decidindo a dieta — para vê-lo fora da conta existe
              a simulação, logo acima. */}
          {item.is_extra ? (
            <Button
              label="Tirar da lista"
              variant="ghost"
              loading={removendo}
              onPress={onRemover}
            />
          ) : null}
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
  totalSalvo: { textDecorationLine: 'line-through' },
  resumo: { backgroundColor: colors.primaryContainer, gap: spacing.xs2 },
  resumoRotulo: { ...typography.labelSm, color: colors.onPrimaryContainer },
  trocarRegiao: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: 'center' },
  trocarRegiaoTexto: { ...typography.labelLg, color: colors.onPrimary },
  total: { ...typography.currency, color: colors.onPrimary },
  resumoRegiao: { ...typography.bodySm, color: colors.onPrimaryContainer },
  progresso: { gap: spacing.xs2, marginTop: spacing.xs },
  progressoTexto: { ...typography.labelSm, color: colors.onPrimaryContainer },

  sincronizacao: { backgroundColor: colors.surfaceContainerLow, gap: spacing.xs2 },

  acrescentar: { gap: spacing.xs2 },
  acrescentarLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  acrescentarCampo: { flex: 1 },
  candidato: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: 'center' },
  candidatoNome: { ...typography.labelLg, color: colors.onSurface },
  candidatoDetalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },

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
  // O preço real continua à vista, riscado: a simulação não o substitui.
  precoSubstituido: { textDecorationLine: 'line-through', color: colors.onSurfaceVariant },
  itemPrecoSimulado: { ...typography.labelLg, color: colors.primary },
  campoSimulacao: { gap: spacing.xs2 },
  procedencia: { ...typography.labelSm, color: colors.onSurfaceVariant },
});
