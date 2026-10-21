/**
 * Encher a despensa por foto.
 *
 * A pessoa fotografa o que tem em casa e o app diz o que viu. Nada entra
 * sozinho (decisão 11): cada alimento reconhecido aparece com o produto do
 * catálogo que parece ser ele, e só vira item da despensa quando a pessoa
 * confirma — podendo trocar o produto ou descartar o alimento. O que o
 * reconhecimento não ligou a nenhum produto fica à parte, como não identificado.
 *
 * A foto sai do aparelho para um serviço de terceiros, então o aceite vem antes
 * do primeiro envio. Ela não é guardada em lugar nenhum: nem aqui, nem no
 * servidor.
 *
 * O reconhecimento erra: vê pêssego onde há manga. Cada alimento pode ter o
 * nome corrigido, e a correção busca de novo no catálogo, pela mesma busca do
 * cadastro manual. Corrigir continua sendo proposta — só o toque em confirmar
 * põe o item na despensa.
 *
 * O item entra sem quantidade, como no cadastro manual sem medida — foto não
 * pesa arroz. Conta para as receitas na hora; para descontar da compra, a
 * pessoa toca no item depois e diz quanto tem.
 */

import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Checkbox, ErrorNotice } from './index';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { PantryItem, Product } from '../types/api';
import {
  type Revisao,
  usePantryPhotoViewModel,
  usePhotoRowViewModel,
} from '../viewmodels/usePantryPhotoViewModel';

export function DespensaPorFoto({
  onAdicionado,
}: {
  /** Recebe o item que o servidor gravou, para a tela pôr na despensa sem recarregar. */
  onAdicionado: (item: PantryItem) => void;
}) {
  const vm = usePantryPhotoViewModel(onAdicionado);
  const { revisoes } = vm;

  /** As linhas dos dois grupos recebem as mesmas ações. */
  function linha(revisao: Revisao) {
    return (
      <LinhaDaFoto
        key={revisao.id}
        revisao={revisao}
        buscando={vm.buscando(revisao.id)}
        onConfirmar={() => vm.confirmar(revisao)}
        onEscolher={(produto) => vm.escolher(revisao.id, produto)}
        onDescartar={() => vm.descartar(revisao.id)}
        onRenomear={(nome) => vm.renomear(revisao.id, nome)}
      />
    );
  }

  if (!vm.aberto) {
    return <Button label="📷 Encher por foto" variant="secondary" onPress={vm.abrir} />;
  }

  return (
    <View style={styles.painel}>
      <Text style={styles.titulo}>Encher a despensa por foto</Text>

      {revisoes === null ? (
        <>
          <Body muted>
            Fotografe a prateleira, a geladeira ou as compras em cima da mesa. O app diz o que
            viu e você confirma o que entra.
          </Body>

          <View style={styles.consentimento}>
            <Checkbox
              label="Aceito enviar a foto para reconhecimento"
              checked={vm.aceitou}
              onPress={vm.alternarAceite}
            />
            {/* O texto também marca a caixa: o alvo de 20 px sozinho é pequeno. */}
            <Text
              style={styles.consentimentoTexto}
              onPress={vm.alternarAceite}
            >
              Autorizo enviar a foto a um serviço de reconhecimento de imagem de terceiros
              (Anthropic). A foto não é guardada: o app só extrai os nomes dos alimentos.
            </Text>
          </View>

          <View style={styles.acoes}>
            <Button
              label="Tirar foto"
              onPress={() => vm.escolherFoto('camera')}
              disabled={!vm.aceitou}
              loading={vm.reconhecendo}
            />
            <Button
              label="Escolher da galeria"
              variant="secondary"
              onPress={() => vm.escolherFoto('galeria')}
              disabled={!vm.aceitou || vm.reconhecendo}
            />
          </View>

          {vm.reconhecendo ? <Body muted>Olhando a foto…</Body> : null}
        </>
      ) : (
        <>
          {revisoes.length === 0 ? (
            <Body muted>Não reconheci nenhum alimento nesta foto. Tente outra, mais de perto.</Body>
          ) : (
            <Body muted>
              Confirme o que você tem — nada entra na despensa sem o seu toque. Os itens entram
              sem quantidade: já contam para as receitas, e para descontar da compra é só tocar
              no item depois e dizer quanto tem.
            </Body>
          )}

          {vm.identificados.map(linha)}

          {vm.naoIdentificados.length > 0 ? (
            <>
              <Text style={styles.subtitulo}>Não identificados</Text>
              <Body muted>
                Estes não batem com nenhum produto do catálogo. Corrija o nome, escolha qual é,
                guarde só como texto ou descarte.
              </Body>
              {vm.naoIdentificados.map(linha)}
            </>
          ) : null}

          {vm.erroDaCorrecao ? <ErrorNotice message={vm.erroDaCorrecao} /> : null}

        </>
      )}

      {vm.aviso ? <ErrorNotice message={vm.aviso} /> : null}
      {vm.erroDoReconhecimento ? <ErrorNotice message={vm.erroDoReconhecimento} /> : null}

      <View style={styles.acoes}>
        {revisoes !== null ? (
          <Pressable
            accessibilityRole="button"
            onPress={vm.outraFoto}
            style={styles.acaoSecundaria}
          >
            <Text style={styles.acaoSecundariaTexto}>Outra foto</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={vm.fechar} style={styles.acaoSecundaria}>
          <Text style={styles.acaoSecundariaTexto}>{revisoes === null ? 'Cancelar' : 'Concluir'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Um alimento da foto: o produto proposto e o que a pessoa decide fazer. */
function LinhaDaFoto({
  revisao,
  buscando,
  onConfirmar,
  onEscolher,
  onDescartar,
  onRenomear,
}: {
  revisao: Revisao;
  buscando: boolean;
  onConfirmar: () => void;
  onEscolher: (produto: Product | null) => void;
  onDescartar: () => void;
  /** Busca o nome corrigido no catálogo; falha deixa o campo aberto. */
  onRenomear: (nome: string) => Promise<unknown>;
}) {
  const linha = usePhotoRowViewModel(onRenomear);
  const { trocando, editando } = linha;
  const { proposta, escolhido, situacao } = revisao;

  if (situacao === 'adicionado') {
    return (
      <View style={styles.linha}>
        <Text style={styles.nome}>✓ {proposta.name}</Text>
        <Text style={styles.detalhe}>
          {escolhido ? `na despensa como ${escolhido.name}` : 'na despensa, só como texto'}
        </Text>
      </View>
    );
  }

  if (editando !== null) {
    return (
      <View style={styles.linha}>
        <Text style={styles.detalhe}>A foto mostrou "{proposta.name}". O que é na verdade?</Text>
        <TextInput
          accessibilityLabel={`Corrigir o nome de ${proposta.name}`}
          placeholder="Ex: manga, leite integral…"
          placeholderTextColor={colors.outline}
          style={styles.campo}
          value={editando}
          onChangeText={linha.mudarNome}
          onSubmitEditing={linha.buscarNomeNovo}
          returnKeyType="search"
          autoFocus
        />
        <View style={styles.acoes}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Buscar o nome corrigido de ${proposta.name}`}
            disabled={!linha.nomeValido || buscando}
            onPress={linha.buscarNomeNovo}
            style={[styles.acaoSecundaria, (!linha.nomeValido || buscando) && styles.inativo]}
          >
            <Text style={styles.acaoPrincipalTexto}>{buscando ? 'Buscando…' : 'Buscar'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={linha.cancelarEdicao}
            style={styles.acaoSecundaria}
          >
            <Text style={styles.acaoSecundariaTexto}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.linha}>
      <Text style={styles.nome}>{proposta.name}</Text>
      <Text style={styles.detalhe}>
        {escolhido ? `Produto: ${escolhido.name}` : 'Sem produto do catálogo'}
      </Text>
      {revisao.erro ? <ErrorNotice message={revisao.erro} /> : null}

      {trocando ? (
        <>
          {proposta.candidates.map((sugestao) => (
            <Pressable
              key={sugestao.product.id}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${sugestao.product.name} para ${proposta.name}`}
              onPress={() => {
                onEscolher(sugestao.product);
                linha.fecharTroca();
              }}
              style={styles.candidato}
            >
              <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
              <Text style={styles.detalhe}>
                {Math.round(Number(sugestao.score) * 100)}% de semelhança
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Guardar ${proposta.name} sem produto`}
            onPress={() => {
              onEscolher(null);
              linha.fecharTroca();
            }}
            style={styles.candidato}
          >
            <Text style={styles.candidatoNome}>Nenhum destes (guardar só como texto)</Text>
          </Pressable>
        </>
      ) : null}

      <View style={styles.acoes}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Confirmar ${proposta.name}`}
          onPress={onConfirmar}
          style={styles.acaoSecundaria}
        >
          <Text style={styles.acaoPrincipalTexto}>
            {escolhido ? 'Confirmar' : 'Guardar só como texto'}
          </Text>
        </Pressable>
        {proposta.candidates.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Trocar o produto de ${proposta.name}`}
            onPress={linha.alternarTroca}
            style={styles.acaoSecundaria}
          >
            <Text style={styles.acaoSecundariaTexto}>
              {escolhido ? 'Trocar produto' : 'Escolher produto'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Editar ${proposta.name}`}
          onPress={() => linha.abrirEdicao(proposta.name)}
          style={styles.acaoSecundaria}
        >
          <Text style={styles.acaoSecundariaTexto}>Editar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Descartar ${proposta.name}`}
          onPress={onDescartar}
          style={styles.acaoSecundaria}
        >
          <Text style={styles.acaoSecundariaTexto}>Descartar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  painel: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  titulo: { ...typography.labelLg, color: colors.onSurface },
  subtitulo: { ...typography.labelLg, color: colors.onSurface, marginTop: spacing.xs },
  consentimento: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  consentimentoTexto: { ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1 },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  linha: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  nome: { ...typography.labelLg, color: colors.onSurface },
  detalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },
  campo: {
    minHeight: MIN_TOUCH_HEIGHT,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.onSurface,
  },
  candidato: {
    minHeight: MIN_TOUCH_HEIGHT,
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  candidatoNome: { ...typography.labelLg, color: colors.onSurface },
  acaoSecundaria: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: 'center' },
  acaoSecundariaTexto: { ...typography.labelLg, color: colors.primary },
  acaoPrincipalTexto: { ...typography.labelLg, color: colors.primary, fontWeight: '700' },
  inativo: { opacity: 0.4 },
});
