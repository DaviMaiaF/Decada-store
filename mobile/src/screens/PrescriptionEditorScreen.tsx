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

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Chip, ErrorNotice, Field, SectionTitle } from '../components';
import { PlanoPrescrito } from '../components/PlanoPrescrito';
import { UNITS, emptyItem, type ItemRow, type MealForm } from '../services/prescriptionForm';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { MeasurementUnit, Prescription } from '../types/api';
import { usePrescriptionEditorViewModel } from '../viewmodels/usePrescriptionEditorViewModel';

export default function PrescriptionEditorScreen({
  prescription,
  onDone,
}: {
  /** Nulo para plano novo. */
  prescription: Prescription | null;
  onDone: () => void;
}) {
  const vm = usePrescriptionEditorViewModel(prescription, onDone);
  const { salvo, aceito, form, ocupado } = vm;

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
            onChangeText={vm.mudarTitulo}
            placeholder="Plano de outubro"
          />
          <Field
            label="Nome do paciente"
            value={form.patientName}
            onChangeText={vm.mudarPaciente}
            placeholder="como sai no cabeçalho do PDF"
          />

          {form.meals.map((meal, indice) => (
            <EditorDeRefeicao
              key={indice}
              indice={indice}
              meal={meal}
              onChange={(mudanca) => vm.mudarRefeicao(indice, mudanca)}
              onRemove={vm.podeRemoverRefeicao ? () => vm.removerRefeicao(indice) : undefined}
            />
          ))}

          <Button
            label="Adicionar refeição"
            variant="secondary"
            onPress={vm.adicionarRefeicao}
          />

          <Field
            label="Orientações gerais"
            value={form.notes}
            onChangeText={vm.mudarOrientacoes}
            multiline
            textAlignVertical="top"
            style={styles.textoLongo}
            placeholder="hidratação, horários, o que vale para o dia todo"
          />

          <Button label="Salvar plano" onPress={vm.salvar} loading={ocupado === 'salvar'} />
        </>
      )}

      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
      {vm.aviso ? (
        <Card style={styles.bloco}>
          <Body>{vm.aviso}</Body>
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
              value={vm.email}
              onChangeText={vm.setEmail}
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
              onPress={vm.enviar}
              loading={ocupado === 'enviar'}
            />
          </>
        ) : null}
        <Button
          label="Baixar PDF"
          variant="secondary"
          onPress={vm.baixarPdf}
          loading={ocupado === 'pdf'}
        />
      </Card>

      {salvo ? (
        vm.confirmandoExclusao ? (
          <View style={styles.bloco}>
            <Body>
              {aceito
                ? 'Some da sua lista. O paciente continua com a cópia que aceitou.'
                : 'O plano some da sua lista e, se foi enviado, deixa de aparecer para o paciente.'}
            </Body>
            <Button
              label="Confirmar exclusão"
              variant="secondary"
              onPress={vm.excluir}
              loading={vm.excluindo}
            />
            <Button
              label="Manter plano"
              variant="ghost"
              onPress={vm.cancelarExclusao}
            />
          </View>
        ) : (
          <Button
            label="Excluir plano"
            variant="ghost"
            onPress={vm.pedirExclusao}
          />
        )
      ) : null}
    </ScrollView>
  );
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
