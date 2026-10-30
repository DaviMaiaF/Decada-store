/**
 * Entrada no aplicativo: login e cadastro na mesma tela, para os dois papéis.
 *
 * Paciente e nutricionista entram por portas diferentes da API. A escolha fica
 * no topo da tela, e não depois do login, porque o servidor só aceita a conta
 * na porta do papel dela — e responde igual a senha errada quando não aceita.
 */

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Body, Button, Checkbox, ErrorNotice, Field } from '../components';
import { Logo } from '../components/Logo';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { UserRole } from '../types/api';
import { SENHA_MINIMA, useLoginViewModel } from '../viewmodels/useLoginViewModel';

const PAPEIS: { valor: UserRole; rotulo: string }[] = [
  { valor: 'paciente', rotulo: 'Sou paciente' },
  { valor: 'nutricionista', rotulo: 'Sou nutricionista' },
];

export default function LoginScreen() {
  const vm = useLoginViewModel();
  const { cadastrando, nutricionista } = vm;

  return (
    <KeyboardAvoidingView
      style={styles.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.cabecalho}>
          <Logo tamanho={40} />
          <Text style={styles.titulo}>
            {cadastrando ? 'Criar sua conta' : 'Bem-vinda de volta'}
          </Text>
          <Body muted>
            {nutricionista
              ? 'Escreva receitas com produtos do catálogo. Elas aparecem para os ' +
                'pacientes da DÉCADA, assinadas com seu nome e CRN.'
              : 'A DÉCADA organiza o plano da sua nutricionista e mostra quanto custa ' +
                'a compra. Não prescrevemos dieta.'}
          </Body>
        </View>

        <View style={styles.papeis} accessibilityRole="radiogroup">
          {PAPEIS.map(({ valor, rotulo }) => {
            const ativo = valor === vm.papel;
            return (
              <Pressable
                key={valor}
                accessibilityRole="radio"
                accessibilityState={{ checked: ativo }}
                onPress={() => vm.escolherPapel(valor)}
                style={[styles.papel, ativo && styles.papelAtivo]}
              >
                <Text style={[styles.papelTexto, ativo && styles.papelTextoAtivo]}>
                  {rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.formulario}>
          {cadastrando && nutricionista ? (
            <>
              <Field
                label="Nome completo"
                value={vm.nome}
                onChangeText={vm.setNome}
                autoComplete="name"
                placeholder="como aparece nas receitas"
              />
              <Field
                label="CRN"
                value={vm.crn}
                onChangeText={vm.setCrn}
                autoCapitalize="characters"
                placeholder="CRN-3 12345"
              />
            </>
          ) : null}
          <Field
            label="E-mail"
            value={vm.email}
            onChangeText={vm.setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="voce@exemplo.com"
          />
          <Field
            label="Senha"
            value={vm.senha}
            onChangeText={vm.setSenha}
            secureTextEntry
            autoCapitalize="none"
            placeholder={cadastrando ? `pelo menos ${SENHA_MINIMA} caracteres` : ''}
            error={vm.senhaCurta ? `pelo menos ${SENHA_MINIMA} caracteres` : null}
          />

          <View style={styles.lembrar}>
            <Checkbox label="Lembrar de mim" checked={vm.lembrar} onPress={vm.alternarLembrar} />
            {/* O texto também marca a caixa: o alvo de 20 px sozinho é pequeno. */}
            <Text style={styles.lembrarTexto} onPress={vm.alternarLembrar}>
              Lembrar de mim
            </Text>
          </View>

          {vm.mensagem ? <ErrorNotice message={vm.mensagem} /> : null}

          <Button
            label={cadastrando ? 'Criar conta' : 'Entrar'}
            onPress={vm.enviar}
            loading={vm.enviando}
          />
          <Button
            label={cadastrando ? 'Já tenho conta' : 'Criar uma conta'}
            variant="ghost"
            onPress={vm.alternarCadastro}
          />
        </View>

        <Text style={styles.aviso}>
          {nutricionista
            ? 'O CRN é declarado por você e aparece em cada receita publicada. ' +
              'Ao excluir a conta, suas receitas saem junto.'
            : 'Seu plano alimentar é dado sensível de saúde. Guardamos só o ' +
              'necessário, e você pode apagar tudo quando quiser.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.surface },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.margin,
    gap: spacing.xl,
  },
  cabecalho: { gap: spacing.xs },
  titulo: { ...typography.headlineLg, color: colors.primary },
  papeis: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
  },
  papel: {
    flex: 1,
    minHeight: MIN_TOUCH_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  papelAtivo: { backgroundColor: colors.surfaceContainerLowest },
  papelTexto: { ...typography.labelLg, color: colors.onSurfaceVariant },
  papelTextoAtivo: { color: colors.primary },
  formulario: { gap: spacing.md },
  lembrar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_HEIGHT,
  },
  lembrarTexto: { ...typography.bodyMd, color: colors.onSurface },
  aviso: { ...typography.bodySm, color: colors.onSurfaceVariant, textAlign: 'center' },
});
