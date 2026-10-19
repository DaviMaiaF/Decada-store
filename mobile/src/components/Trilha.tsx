/**
 * Trilha da jornada: enviar o plano, confirmar os produtos, escolher a região e
 * comprar.
 *
 * As quatro abas continuam livres — quem quiser pular a ordem, pula. O que
 * faltava era dizer que existe uma ordem: quem abria o Mercado antes de
 * confirmar via uma tela vazia sem entender que o problema era a etapa anterior.
 *
 * Não é clicável de propósito. A barra de abas, logo abaixo, já navega; dois
 * lugares diferentes para a mesma navegação confundiriam em vez de guiar.
 */

import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';

export type EtapaDaTrilha = {
  rotulo: string;
  cumprida: boolean;
  /** Progresso parcial, como "6/15". Só aparece na etapa em andamento. */
  detalhe?: string;
};

/**
 * Etapa ultrapassada: cumprida, ou com alguma etapa seguinte já cumprida.
 *
 * Quem gerou a lista com 9 de 16 itens confirmados já passou da confirmação —
 * deixar o círculo apagado dizia que a pessoa ainda estava lá. O "9/16" some
 * junto: ele só aparece na etapa em andamento.
 */
export function etapasUltrapassadas(etapas: EtapaDaTrilha[]): boolean[] {
  return etapas.map((_, indice) => etapas.slice(indice).some((etapa) => etapa.cumprida));
}

export function Trilha({ etapas }: { etapas: EtapaDaTrilha[] }) {
  const ultrapassadas = etapasUltrapassadas(etapas);
  // A etapa atual é a primeira que ainda não foi ultrapassada. Marcar várias
  // como "atual" tiraria da trilha justamente o que ela serve para dizer: onde parei.
  const atual = ultrapassadas.findIndex((ultrapassada) => !ultrapassada);
  const numeroDaAtual = atual === -1 ? etapas.length : atual + 1;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={
        atual === -1
          ? 'Jornada concluída'
          : `Etapa ${numeroDaAtual} de ${etapas.length}: ${etapas[atual].rotulo}`
      }
      style={styles.trilha}
    >
      {etapas.map((etapa, indice) => {
        const eAtual = indice === atual;
        const feita = ultrapassadas[indice];

        return (
          <View key={etapa.rotulo} style={styles.etapa}>
            <View
              style={[
                styles.marca,
                feita && styles.marcaCumprida,
                eAtual && styles.marcaAtual,
              ]}
            >
              <Text
                style={[
                  styles.numero,
                  feita && styles.numeroCumprido,
                  eAtual && styles.numeroAtual,
                ]}
              >
                {feita ? '✓' : indice + 1}
              </Text>
            </View>

            <Text
              numberOfLines={1}
              style={[styles.rotulo, (feita || eAtual) && styles.rotuloAtivo]}
            >
              {etapa.rotulo}
            </Text>

            {eAtual && etapa.detalhe ? (
              <Text style={styles.detalhe}>{etapa.detalhe}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const TAMANHO_MARCA = 24;

const styles = StyleSheet.create({
  trilha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  etapa: { flex: 1, alignItems: 'center', gap: 2 },

  marca: {
    width: TAMANHO_MARCA,
    height: TAMANHO_MARCA,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  // Mesmo verde do chip de sucesso: o primaryContainer é tão escuro que, num
  // círculo de 24 px, a etapa cumprida parecia preta.
  marcaCumprida: { backgroundColor: colors.primaryFixed, borderColor: colors.primaryFixedDim },
  marcaAtual: { borderColor: colors.primary, borderWidth: 2 },

  numero: { ...typography.labelSm, color: colors.onSurfaceVariant },
  numeroCumprido: { color: colors.onPrimaryFixedVariant },
  numeroAtual: { color: colors.primary },

  rotulo: { ...typography.labelSm, color: colors.onSurfaceVariant },
  rotuloAtivo: { color: colors.primary },
  detalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },
});
