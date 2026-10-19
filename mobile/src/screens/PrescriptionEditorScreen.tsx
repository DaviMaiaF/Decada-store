/**
 * Editor do plano alimentar da nutricionista: montar, salvar e entregar.
 *
 * A forma é a do plano do Dietbox: refeições com horário, alimentos com a
 * quantidade de compra e a medida caseira, e opções de substituição para a
 * refeição inteira. Nenhum protótipo desenhou esta tela; ela segue os cartões
 * e campos do sistema de design.
 *
 * Entregar tem dois caminhos, e os dois salvam antes: pelo e-mail do paciente,
 * que vê o plano na aba Dieta e aceita com consentimento; ou pelo PDF, que ela
 * manda por onde quiser e o paciente importa como qualquer plano.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Chip, ErrorNotice, Field, SectionTitle } from '../components';
import { PlanoPrescrito } from '../components/PlanoPrescrito';
import {
  ApiError,
  createPrescription,
  deletePrescription,
  downloadPrescriptionPdf,
  sendPrescription,
  updatePrescription,
} from '../services/api';
import { savePdf } from '../services/download';
import {
  UNITS,
  buildPrescriptionInput,
  emptyForm,
  emptyItem,
  emptyMeal,
  formFromPrescription,
  type ItemRow,
  type MealForm,
  type PrescriptionForm,
} from '../services/prescriptionForm';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { MeasurementUnit, Prescription } from '../types/api';

export default function PrescriptionEditorScreen({
  prescription,
  onDone,
}: {
  /** Nulo para plano novo. */
  prescription: Prescription | null;
  onDone: () => void;
}) {
  const cliente = useQueryClient();
  // O plano como está no servidor. Começa nulo no plano novo e passa a existir
  // no primeiro salvamento, sem fechar o editor: é dali que se envia.
  const [salvo, setSalvo] = useState<Prescription | null>(prescription);
  const [form, setForm] = useState<PrescriptionForm>(() =>
    prescription ? formFromPrescription(prescription) : emptyForm(),
  );
  const [email, setEmail] = useState(prescription?.patient_email ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'salvar' | 'enviar' | 'pdf' | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const aceito = salvo?.status === 'aceita';

  /** A lista e o plano aberto mudam juntos a cada gravação. */
  const atualizarCache = () => {
    cliente.invalidateQueries({ queryKey: ['prescriptions'] });
    cliente.invalidateQueries({ queryKey: ['prescription'] });
  };

  const excluir = useMutation({
    mutationFn: () => deletePrescription(salvo!.id),
    onSuccess: () => {
      atualizarCache();
      onDone();
    },
    onError: (problema) => setErro(mensagem(problema, 'não foi possível excluir agora')),
  });

  /** Valida e grava. Devolve o plano salvo, ou nulo se não deu. */
  async function salvar(): Promise<Prescription | null> {
    if (aceito) return salvo;
    const resultado = buildPrescriptionInput(form);
    if (resultado.error !== null) {
      setErro(resultado.error);
      return null;
    }
    const gravado = salvo
      ? await updatePrescription(salvo.id, resultado.input)
      : await createPrescription(resultado.input);
    setSalvo(gravado);
    atualizarCache();
    return gravado;
  }

  async function executar(
    acao: 'salvar' | 'enviar' | 'pdf',
    passo: (plano: Prescription) => Promise<string | null>,
  ) {
    setErro(null);
    setAviso(null);
    setOcupado(acao);
    try {
      const plano = await salvar();
      if (plano) setAviso(await passo(plano));
    } catch (problema) {
      setErro(mensagem(problema, 'não foi possível concluir agora'));
    } finally {
      setOcupado(null);
    }
  }

  const aoSalvar = () => executar('salvar', async () => 'Plano salvo.');

  const aoEnviar = () => {
    if (!email.trim()) {
      setErro('informe o e-mail do paciente');
      return;
    }
    return executar('enviar', async (plano) => {
      const enviado = await sendPrescription(plano.id, email.trim());
      setSalvo(enviado);
      atualizarCache();
      // A mesma frase exista ou não conta com o e-mail: o servidor não diz, e a
      // tela não teria como saber.
      return (
        `Enviado para ${enviado.patient_email}. O plano aparece na aba Dieta quando ` +
        'a pessoa entrar com esse e-mail — agora ou depois de criar a conta.'
      );
    });
  };

  const aoBaixar = () =>
    executar('pdf', async (plano) => {
      await savePdf(await downloadPrescriptionPdf(plano.id), 'plano-alimentar.pdf');
      return 'PDF gerado. O paciente importa esse arquivo na aba Dieta.';
    });

  function mudarRefeicao(indice: number, mudanca: Partial<MealForm>) {
    setForm((atual) => ({
      ...atual,
      meals: atual.meals.map((meal, i) => (i === indice ? { ...meal, ...mudanca } : meal)),
    }));
  }

  return (
    <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={onDone} style={styles.voltar}>
        <Text style={styles.voltarTexto}>‹ Seus planos</Text>
      </Pressable>

      <Text style={styles.titulo}>{salvo ? 'Plano alimentar' : 'Novo plano alimentar'}</Text>

      {aceito && salvo ? (
        <>
          <Card style={styles.bloco}>
            <Chip label="aceito pelo paciente" tone="success" />
            <Body muted>
              O paciente já tem este plano. Ele não muda mais: para ajustar, crie um
              plano novo e envie de novo.
            </Body>
          </Card>
          <Card>
            <PlanoPrescrito meals={salvo.meals} notes={salvo.notes} />
          </Card>
        </>
      ) : (
        <>
          <Field
            label="Título"
            value={form.title}
            onChangeText={(valor) => setForm((f) => ({ ...f, title: valor }))}
            placeholder="Plano de outubro"
          />
          <Field
            label="Nome do paciente"
            value={form.patientName}
            onChangeText={(valor) => setForm((f) => ({ ...f, patientName: valor }))}
            placeholder="como sai no cabeçalho do PDF"
          />

          {form.meals.map((meal, indice) => (
            <EditorDeRefeicao
              key={indice}
              indice={indice}
              meal={meal}
              onChange={(mudanca) => mudarRefeicao(indice, mudanca)}
              onRemove={
                form.meals.length > 1
                  ? () =>
                      setForm((f) => ({ ...f, meals: f.meals.filter((_, i) => i !== indice) }))
                  : undefined
              }
            />
          ))}

          <Button
            label="Adicionar refeição"
            variant="secondary"
            onPress={() => setForm((f) => ({ ...f, meals: [...f.meals, emptyMeal()] }))}
          />

          <Field
            label="Orientações gerais"
            value={form.notes}
            onChangeText={(valor) => setForm((f) => ({ ...f, notes: valor }))}
            multiline
            textAlignVertical="top"
            style={styles.textoLongo}
            placeholder="hidratação, horários, o que vale para o dia todo"
          />

          <Button label="Salvar plano" onPress={aoSalvar} loading={ocupado === 'salvar'} />
        </>
      )}

      {erro ? <ErrorNotice message={erro} /> : null}
      {aviso ? (
        <Card style={styles.bloco}>
          <Body>{aviso}</Body>
        </Card>
      ) : null}

      <Card style={styles.bloco}>
        <SectionTitle>Entregar ao paciente</SectionTitle>
        {!aceito ? (
          <>
            <Body muted>
              Pelo e-mail, o paciente vê o plano no app e aceita com consentimento. Os
              itens principais de cada refeição vão para a lista de compras dele; as
              substituições ele lê.
            </Body>
            <Field
              label="E-mail do paciente"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="paciente@exemplo.com"
            />
            {salvo?.status === 'recusada' ? (
              <Chip label="o paciente recusou — você pode ajustar e reenviar" tone="danger" />
            ) : null}
            {salvo?.status === 'enviada' ? (
              <Chip label={`enviado para ${salvo.patient_email}`} tone="warning" />
            ) : null}
            <Button
              label={salvo?.status === 'enviada' ? 'Reenviar pelo e-mail' : 'Enviar pelo e-mail'}
              onPress={aoEnviar}
              loading={ocupado === 'enviar'}
            />
          </>
        ) : null}
        <Button
          label="Baixar PDF"
          variant="secondary"
          onPress={aoBaixar}
          loading={ocupado === 'pdf'}
        />
      </Card>

      {salvo ? (
        confirmandoExclusao ? (
          <View style={styles.bloco}>
            <Body>
              {aceito
                ? 'Some da sua lista. O paciente continua com a cópia que aceitou.'
                : 'O plano some da sua lista e, se foi enviado, deixa de aparecer para o paciente.'}
            </Body>
            <Button
              label="Confirmar exclusão"
              variant="secondary"
              onPress={() => excluir.mutate()}
              loading={excluir.isPending}
            />
            <Button
              label="Manter plano"
              variant="ghost"
              onPress={() => setConfirmandoExclusao(false)}
            />
          </View>
        ) : (
          <Button
            label="Excluir plano"
            variant="ghost"
            onPress={() => setConfirmandoExclusao(true)}
          />
        )
      ) : null}
    </ScrollView>
  );
}

function mensagem(problema: unknown, padrao: string): string {
  return problema instanceof ApiError ? problema.message : padrao;
}

function EditorDeRefeicao({
  indice,
  meal,
  onChange,
  onRemove,
}: {
  indice: number;
  meal: MealForm;
  onChange: (mudanca: Partial<MealForm>) => void;
  onRemove?: () => void;
}) {
  const rotulo = meal.name.trim() || `Refeição ${indice + 1}`;

  const mudarOpcao = (n: number, linhas: ItemRow[]) =>
    onChange({ substitutions: meal.substitutions.map((o, i) => (i === n ? linhas : o)) });

  return (
    <Card style={styles.bloco}>
      <View style={styles.linhaTopo}>
        <Text style={styles.refeicaoTitulo}>{rotulo}</Text>
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remover ${rotulo}`}
            onPress={onRemove}
            hitSlop={spacing.xs}
          >
            <Text style={styles.remover}>Remover</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.dupla}>
        <View style={styles.horario}>
          <Field
            label="Horário"
            accessibilityLabel={`Horário de ${rotulo}`}
            value={meal.time}
            onChangeText={(valor) => onChange({ time: valor })}
            placeholder="08:30"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.nome}>
          <Field
            label="Refeição"
            accessibilityLabel={`Nome da refeição ${indice + 1}`}
            value={meal.name}
            onChangeText={(valor) => onChange({ name: valor })}
            placeholder="Café da manhã"
          />
        </View>
      </View>

      <ListaDeAlimentos
        rotulo={rotulo}
        linhas={meal.items}
        onChange={(linhas) => onChange({ items: linhas })}
      />

      <Field
        label="Orientação da refeição"
        accessibilityLabel={`Orientação de ${rotulo}`}
        value={meal.notes}
        onChangeText={(valor) => onChange({ notes: valor })}
        multiline
        textAlignVertical="top"
        placeholder="opcional"
      />

      {meal.substitutions.map((opcao, n) => (
        <View key={n} style={styles.substituicao}>
          <View style={styles.linhaTopo}>
            <Text style={styles.substituicaoTitulo}>Substituição {n + 1}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover substituição ${n + 1} de ${rotulo}`}
              onPress={() =>
                onChange({ substitutions: meal.substitutions.filter((_, i) => i !== n) })
              }
              hitSlop={spacing.xs}
            >
              <Text style={styles.remover}>Remover</Text>
            </Pressable>
          </View>
          <ListaDeAlimentos
            rotulo={`${rotulo}, substituição ${n + 1}`}
            linhas={opcao}
            onChange={(linhas) => mudarOpcao(n, linhas)}
          />
        </View>
      ))}

      <Button
        label="Adicionar substituição"
        variant="ghost"
        onPress={() => onChange({ substitutions: [...meal.substitutions, [emptyItem()]] })}
      />
    </Card>
  );
}

function ListaDeAlimentos({
  rotulo,
  linhas,
  onChange,
}: {
  rotulo: string;
  linhas: ItemRow[];
  onChange: (linhas: ItemRow[]) => void;
}) {
  const mudar = (i: number, mudanca: Partial<ItemRow>) =>
    onChange(linhas.map((linha, j) => (j === i ? { ...linha, ...mudanca } : linha)));

  return (
    <View style={styles.alimentos}>
      {linhas.map((linha, i) => {
        const nome = `${rotulo}, alimento ${i + 1}`;
        return (
          <View key={i} style={styles.alimento}>
            <View style={styles.linhaTopo}>
              <View style={styles.nome}>
                <Field
                  label="Alimento"
                  accessibilityLabel={`Alimento: ${nome}`}
                  value={linha.food}
                  onChangeText={(valor) => mudar(i, { food: valor })}
                  placeholder="Arroz branco cozido"
                />
              </View>
              {linhas.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${nome}`}
                  onPress={() => onChange(linhas.filter((_, j) => j !== i))}
                  hitSlop={spacing.xs}
                  style={styles.removerAlimento}
                >
                  <Text style={styles.remover}>×</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.dupla}>
              <View style={styles.horario}>
                <Field
                  label="Quantidade"
                  accessibilityLabel={`Quantidade: ${nome}`}
                  value={linha.quantity}
                  onChangeText={(valor) => mudar(i, { quantity: valor })}
                  keyboardType="decimal-pad"
                  placeholder="150"
                />
              </View>
              <SeletorDeUnidadeLivre
                nome={nome}
                escolhida={linha.unit}
                onEscolher={(unit) => mudar(i, { unit })}
              />
            </View>
            <Field
              label="Medida caseira"
              accessibilityLabel={`Medida caseira: ${nome}`}
              value={linha.householdMeasure}
              onChangeText={(valor) => mudar(i, { householdMeasure: valor })}
              placeholder="6 colheres de sopa"
            />
          </View>
        );
      })}
      <Button
        label="Adicionar alimento"
        variant="ghost"
        onPress={() => onChange([...linhas, emptyItem()])}
      />
    </View>
  );
}

/**
 * Todas as unidades, sem filtro pelo produto: aqui ainda não há produto. O
 * casamento com o catálogo acontece do lado do paciente, depois do aceite.
 */
function SeletorDeUnidadeLivre({
  nome,
  escolhida,
  onEscolher,
}: {
  nome: string;
  escolhida: MeasurementUnit;
  onEscolher: (unidade: MeasurementUnit) => void;
}) {
  return (
    <View style={styles.unidades}>
      {UNITS.map((unidade) => {
        const ativa = unidade === escolhida;
        return (
          <Pressable
            key={unidade}
            accessibilityRole="button"
            accessibilityLabel={`Unidade ${unidade}: ${nome}`}
            accessibilityState={{ selected: ativa }}
            onPress={() => onEscolher(unidade)}
            style={[styles.unidade, ativa && styles.unidadeAtiva]}
          >
            <Text style={[styles.unidadeTexto, ativa && styles.unidadeTextoAtivo]}>
              {unidade === 'unidade' ? 'un' : unidade}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  bloco: { gap: spacing.sm },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  refeicaoTitulo: { ...typography.headlineSm, color: colors.primary, flex: 1 },
  remover: { ...typography.labelMd, color: colors.error },
  removerAlimento: { paddingTop: spacing.md },
  dupla: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  horario: { width: 96 },
  nome: { flex: 1 },
  alimentos: { gap: spacing.sm },
  alimento: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  substituicao: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
  },
  substituicaoTitulo: { ...typography.labelLg, color: colors.onSurfaceVariant, flex: 1 },
  textoLongo: { minHeight: 96, paddingTop: spacing.sm },
  unidades: { flexDirection: 'row', gap: spacing.xs2, flexWrap: 'wrap' },
  unidade: {
    minHeight: MIN_TOUCH_HEIGHT,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLowest,
  },
  unidadeAtiva: { backgroundColor: colors.primaryContainer },
  unidadeTexto: { ...typography.labelLg, color: colors.onSurfaceVariant },
  unidadeTextoAtivo: { color: colors.onPrimary },
});
