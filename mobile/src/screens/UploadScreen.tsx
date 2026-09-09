/**
 * Envio da prescrição em PDF.
 *
 * A tela existe para três coisas: pegar o arquivo, colher o consentimento antes
 * de mandar qualquer coisa, e mostrar honestamente o que o servidor entendeu —
 * inclusive as linhas que ele não entendeu.
 */

import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';

import { Body, Button, Card, Chip, ErrorNotice, SectionTitle } from '../components';
import { ApiError, importMealPlan } from '../services/api';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { ImportResult } from '../types/api';

type Arquivo = { uri: string; name: string; mimeType?: string };

export default function UploadScreen({
  onImported,
}: {
  onImported: (resultado: ImportResult) => void;
}) {
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [aceitou, setAceitou] = useState(false);
  const [resultado, setResultado] = useState<ImportResult | null>(null);

  const envio = useMutation({
    mutationFn: () => importMealPlan(arquivo!, aceitou),
    onSuccess: (dados) => setResultado(dados),
  });

  async function escolher() {
    const escolha = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (escolha.canceled) return;

    const selecionado = escolha.assets[0];
    setArquivo({
      uri: selecionado.uri,
      name: selecionado.name,
      mimeType: selecionado.mimeType,
    });
    setResultado(null);
    envio.reset();
  }

  const erro = envio.error;

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <View style={styles.cabecalho}>
        <Chip label="LEITURA INTELIGENTE" tone="success" />
        <Text style={styles.titulo}>Adicionar dieta da sua nutricionista</Text>
        <Body muted>
          Envie o PDF do plano alimentar. A DÉCADA lê, organiza as porções e monta sua
          lista de compras.
        </Body>
      </View>

      <Card style={styles.avisoEtico}>
        <Text style={styles.avisoTitulo}>Cuidado ético e respeito profissional</Text>
        <Body muted>
          A DÉCADA não prescreve dietas nem substitui seu nutricionista. Nós apenas
          facilitamos a execução do seu plano na vida real.
        </Body>
      </Card>

      <Card style={styles.cartaoEnvio}>
        <SectionTitle>Importe sua prescrição</SectionTitle>
        <Body muted>
          Precisa ser um PDF com texto selecionável. Foto de papel exigiria OCR, que
          ainda não faz parte desta versão.
        </Body>

        <Button label={arquivo ? 'Trocar arquivo' : 'Escolher PDF'} onPress={escolher} />

        {arquivo ? (
          <View style={styles.arquivo}>
            <Text style={styles.arquivoNome} numberOfLines={1}>
              {arquivo.name}
            </Text>
          </View>
        ) : null}
      </Card>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: aceitou }}
        accessibilityLabel="Aceito o tratamento do meu plano alimentar"
        onPress={() => setAceitou((estava) => !estava)}
        style={styles.consentimento}
      >
        <View style={[styles.caixa, aceitou && styles.caixaMarcada]}>
          {aceitou ? <Text style={styles.caixaMarca}>✓</Text> : null}
        </View>
        <Text style={styles.consentimentoTexto}>
          Autorizo a DÉCADA a tratar meu plano alimentar, que é dado sensível de saúde,
          para montar minha lista de compras. Posso apagar tudo quando quiser.
        </Text>
      </Pressable>

      {erro ? (
        <ErrorNotice
          message={erro instanceof ApiError ? erro.message : 'não foi possível enviar o PDF'}
        />
      ) : null}

      <Button
        label="Enviar prescrição"
        onPress={() => envio.mutate()}
        disabled={!arquivo || !aceitou}
        loading={envio.isPending}
      />

      {resultado ? <Resumo resultado={resultado} onContinuar={onImported} /> : null}
    </ScrollView>
  );
}

function Resumo({
  resultado,
  onContinuar,
}: {
  resultado: ImportResult;
  onContinuar: (resultado: ImportResult) => void;
}) {
  const tudoIdentificado = resultado.items_unidentified === 0;

  return (
    <Card style={styles.resumo}>
      <SectionTitle>Dados reconhecidos</SectionTitle>

      <View style={styles.numeros}>
        <View style={styles.numero}>
          <Text style={styles.numeroValor}>{resultado.items_created}</Text>
          <Text style={styles.numeroRotulo}>itens lidos do plano</Text>
        </View>
        <View style={styles.numero}>
          <Text style={styles.numeroValor}>{resultado.items_matched}</Text>
          <Text style={styles.numeroRotulo}>encontrados no mercado</Text>
        </View>
      </View>

      <Chip
        label={
          tudoIdentificado
            ? 'todos os itens foram reconhecidos'
            : `${resultado.items_unidentified} item(ns) sem correspondência`
        }
        tone={tudoIdentificado ? 'success' : 'warning'}
      />

      {resultado.discarded.length > 0 ? (
        <View style={styles.descartes}>
          <Text style={styles.descartesTitulo}>
            {resultado.discarded.length} linha(s) não viraram item
          </Text>
          <Body muted>
            Confira: se alguma delas era comida, o plano ficou incompleto e vale
            adicionar o item à mão.
          </Body>
          {resultado.discarded.map((linha) => (
            <View key={linha.text} style={styles.descarte}>
              <Text style={styles.descarteTexto} numberOfLines={1}>
                {linha.text}
              </Text>
              <Text style={styles.descarteMotivo}>{linha.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Button label="Confirmar os produtos" onPress={() => onContinuar(resultado)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl3 },
  cabecalho: { gap: spacing.xs },
  titulo: { ...typography.headlineLg, color: colors.primary },

  avisoEtico: { backgroundColor: colors.secondaryFixed, gap: spacing.xs2 },
  avisoTitulo: { ...typography.labelMd, color: colors.onSecondaryFixed },

  cartaoEnvio: { gap: spacing.sm },
  arquivo: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  arquivoNome: { ...typography.labelLg, color: colors.onSurface },

  consentimento: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  caixa: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixaMarcada: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  caixaMarca: { color: colors.onPrimary, ...typography.labelMd },
  consentimentoTexto: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    flex: 1,
  },

  resumo: { gap: spacing.sm },
  numeros: { flexDirection: 'row', gap: spacing.sm },
  numero: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  numeroValor: { ...typography.displaySm, color: colors.primary },
  numeroRotulo: { ...typography.labelSm, color: colors.onSurfaceVariant },

  descartes: { gap: spacing.xs2 },
  descartesTitulo: { ...typography.labelLg, color: colors.onSurface },
  descarte: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  descarteTexto: { ...typography.bodySm, color: colors.onSurface },
  descarteMotivo: { ...typography.labelSm, color: colors.onSurfaceVariant },
});
