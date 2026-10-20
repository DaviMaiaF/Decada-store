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
 * O item entra sem quantidade, como no cadastro manual sem medida — foto não
 * pesa arroz. Conta para as receitas na hora; para descontar da compra, a
 * pessoa toca no item depois e diz quanto tem.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';

import { Body, Button, Checkbox, ErrorNotice } from './index';
import { ApiError, addPantryItem, recognizePantryPhoto } from '../services/api';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { PhotoProposal, Product } from '../types/api';

type Situacao = 'pendente' | 'adicionado' | 'descartado';

interface Revisao {
  proposta: PhotoProposal;
  /** Produto que vai junto ao confirmar. Nulo guarda só como texto. */
  escolhido: Product | null;
  situacao: Situacao;
}

// Qualidade 0,7 deixa a foto de celular bem menor sem perder o rótulo da
// embalagem; o servidor ainda reduz de novo antes de enviar ao reconhecimento.
const OPCOES_DA_FOTO: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  exif: false,
};

function revisoesDe(propostas: PhotoProposal[]): Revisao[] {
  return propostas.map((proposta) => ({
    proposta,
    // Identificado já vem com o produto mais parecido escolhido; o não
    // identificado espera a pessoa dizer qual é.
    escolhido: proposta.identified ? (proposta.candidates[0]?.product ?? null) : null,
    situacao: 'pendente',
  }));
}

export function DespensaPorFoto({ onAdicionado }: { onAdicionado: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [aceitou, setAceitou] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [revisoes, setRevisoes] = useState<Revisao[] | null>(null);

  const reconhecer = useMutation({
    mutationFn: (foto: ImagePicker.ImagePickerAsset) =>
      recognizePantryPhoto({ uri: foto.uri, mimeType: foto.mimeType }, aceitou),
    onSuccess: (resultado) => setRevisoes(revisoesDe(resultado.items)),
  });

  const confirmar = useMutation({
    mutationFn: (revisao: Revisao) =>
      addPantryItem({
        raw_description: revisao.proposta.name,
        product_id: revisao.escolhido?.id ?? null,
      }),
    onSuccess: (_, revisao) => {
      mudar(revisao.proposta, { situacao: 'adicionado' });
      onAdicionado();
    },
  });

  function mudar(proposta: PhotoProposal, mudanca: Partial<Revisao>) {
    setRevisoes((atuais) =>
      (atuais ?? []).map((revisao) =>
        revisao.proposta === proposta ? { ...revisao, ...mudanca } : revisao,
      ),
    );
  }

  async function escolherFoto(origem: 'camera' | 'galeria') {
    setAviso(null);
    setRevisoes(null);
    reconhecer.reset();

    if (origem === 'camera') {
      const permissao = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissao.granted) {
        setAviso('Sem acesso à câmera. Libere nas configurações ou escolha uma foto da galeria.');
        return;
      }
    }

    const resultado =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync(OPCOES_DA_FOTO)
        : await ImagePicker.launchImageLibraryAsync(OPCOES_DA_FOTO);

    if (resultado.canceled || resultado.assets.length === 0) return;
    reconhecer.mutate(resultado.assets[0]);
  }

  function fechar() {
    setAberto(false);
    setRevisoes(null);
    setAviso(null);
    reconhecer.reset();
    confirmar.reset();
  }

  if (!aberto) {
    return (
      <Button label="📷 Encher por foto" variant="secondary" onPress={() => setAberto(true)} />
    );
  }

  const pendentes = (revisoes ?? []).filter((revisao) => revisao.situacao !== 'descartado');
  const identificados = pendentes.filter((revisao) => revisao.proposta.identified);
  const naoIdentificados = pendentes.filter((revisao) => !revisao.proposta.identified);

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
              checked={aceitou}
              onPress={() => setAceitou((estava) => !estava)}
            />
            {/* O texto também marca a caixa: o alvo de 20 px sozinho é pequeno. */}
            <Text
              style={styles.consentimentoTexto}
              onPress={() => setAceitou((estava) => !estava)}
            >
              Autorizo enviar a foto a um serviço de reconhecimento de imagem de terceiros
              (Anthropic). A foto não é guardada: o app só extrai os nomes dos alimentos.
            </Text>
          </View>

          <View style={styles.acoes}>
            <Button
              label="Tirar foto"
              onPress={() => escolherFoto('camera')}
              disabled={!aceitou}
              loading={reconhecer.isPending}
            />
            <Button
              label="Escolher da galeria"
              variant="secondary"
              onPress={() => escolherFoto('galeria')}
              disabled={!aceitou || reconhecer.isPending}
            />
          </View>

          {reconhecer.isPending ? <Body muted>Olhando a foto…</Body> : null}
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

          {identificados.map((revisao) => (
            <LinhaDaFoto
              key={revisao.proposta.name}
              revisao={revisao}
              salvando={confirmar.isPending && confirmar.variables?.proposta === revisao.proposta}
              onConfirmar={() => confirmar.mutate(revisao)}
              onEscolher={(produto) => mudar(revisao.proposta, { escolhido: produto })}
              onDescartar={() => mudar(revisao.proposta, { situacao: 'descartado' })}
            />
          ))}

          {naoIdentificados.length > 0 ? (
            <>
              <Text style={styles.subtitulo}>Não identificados</Text>
              <Body muted>
                Estes não batem com nenhum produto do catálogo. Escolha qual é, guarde só como
                texto ou descarte.
              </Body>
              {naoIdentificados.map((revisao) => (
                <LinhaDaFoto
                  key={revisao.proposta.name}
                  revisao={revisao}
                  salvando={
                    confirmar.isPending && confirmar.variables?.proposta === revisao.proposta
                  }
                  onConfirmar={() => confirmar.mutate(revisao)}
                  onEscolher={(produto) => mudar(revisao.proposta, { escolhido: produto })}
                  onDescartar={() => mudar(revisao.proposta, { situacao: 'descartado' })}
                />
              ))}
            </>
          ) : null}

          {confirmar.isError ? (
            <ErrorNotice
              message={
                confirmar.error instanceof ApiError
                  ? confirmar.error.message
                  : 'não foi possível guardar o item'
              }
            />
          ) : null}
        </>
      )}

      {aviso ? <ErrorNotice message={aviso} /> : null}
      {reconhecer.isError ? (
        <ErrorNotice
          message={
            reconhecer.error instanceof ApiError
              ? reconhecer.error.message
              : 'não foi possível reconhecer a foto'
          }
        />
      ) : null}

      <View style={styles.acoes}>
        {revisoes !== null ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setRevisoes(null);
              reconhecer.reset();
            }}
            style={styles.acaoSecundaria}
          >
            <Text style={styles.acaoSecundariaTexto}>Outra foto</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={fechar} style={styles.acaoSecundaria}>
          <Text style={styles.acaoSecundariaTexto}>{revisoes === null ? 'Cancelar' : 'Concluir'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Um alimento da foto: o produto proposto e o que a pessoa decide fazer. */
function LinhaDaFoto({
  revisao,
  salvando,
  onConfirmar,
  onEscolher,
  onDescartar,
}: {
  revisao: Revisao;
  salvando: boolean;
  onConfirmar: () => void;
  onEscolher: (produto: Product | null) => void;
  onDescartar: () => void;
}) {
  const [trocando, setTrocando] = useState(false);
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

  return (
    <View style={styles.linha}>
      <Text style={styles.nome}>{proposta.name}</Text>
      <Text style={styles.detalhe}>
        {escolhido ? `Produto: ${escolhido.name}` : 'Sem produto do catálogo'}
      </Text>

      {trocando ? (
        <>
          {proposta.candidates.map((sugestao) => (
            <Pressable
              key={sugestao.product.id}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${sugestao.product.name} para ${proposta.name}`}
              onPress={() => {
                onEscolher(sugestao.product);
                setTrocando(false);
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
              setTrocando(false);
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
          disabled={salvando}
          onPress={onConfirmar}
          style={[styles.acaoSecundaria, salvando && styles.inativo]}
        >
          <Text style={styles.acaoPrincipalTexto}>
            {escolhido ? 'Confirmar' : 'Guardar só como texto'}
          </Text>
        </Pressable>
        {proposta.candidates.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Trocar o produto de ${proposta.name}`}
            onPress={() => setTrocando((estava) => !estava)}
            style={styles.acaoSecundaria}
          >
            <Text style={styles.acaoSecundariaTexto}>
              {escolhido ? 'Trocar produto' : 'Escolher produto'}
            </Text>
          </Pressable>
        ) : null}
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
