/**
 * Entrada no aplicativo: login e cadastro na mesma tela, para os dois papéis.
 *
 * Paciente e nutricionista entram por portas diferentes da API. A escolha fica
 * no topo da tela, e não depois do login, porque o servidor só aceita a conta
 * na porta do papel dela — e responde igual a senha errada quando não aceita.
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Body, Button, ErrorNotice, Field } from '../components';
import { ApiError } from '../services/api';
import { useAuth } from '../services/auth';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { UserRole } from '../types/api';

const SENHA_MINIMA = 8;

const PAPEIS: { valor: UserRole; rotulo: string }[] = [
  { valor: 'paciente', rotulo: 'Sou paciente' },
  { valor: 'nutricionista', rotulo: 'Sou nutricionista' },
];

export default function LoginScreen() {
  const { signIn, signUp, signUpNutritionist, notice } = useAuth();
  const [papel, setPapel] = useState<UserRole>('paciente');
  const [cadastrando, setCadastrando] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [crn, setCrn] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const nutricionista = papel === 'nutricionista';
  const senhaCurta = cadastrando && senha.length > 0 && senha.length < SENHA_MINIMA;

  async function enviar() {
    setErro(null);

    if (!email.trim() || !senha) {
      setErro('preencha e-mail e senha');
      return;
    }
    if (cadastrando && senha.length < SENHA_MINIMA) {
      setErro(`a senha precisa de pelo menos ${SENHA_MINIMA} caracteres`);
      return;
    }
    // Nome e CRN assinam a receita que o paciente vai ler.
    if (cadastrando && nutricionista && (!nome.trim() || !crn.trim())) {
      setErro('preencha nome e CRN');
      return;
    }

    setEnviando(true);
    try {
      if (!cadastrando) {
        await signIn(email.trim(), senha, papel);
      } else if (nutricionista) {
        await signUpNutritionist(email.trim(), senha, nome.trim(), crn.trim());
      } else {
        await signUp(email.trim(), senha);
      }
    } catch (problema) {
      setErro(
        problema instanceof ApiError ? problema.message : 'não foi possível entrar agora',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.tela}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.cabecalho}>
          <Text style={styles.marca}>DÉCADA</Text>
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
            const ativo = valor === papel;
            return (
              <Pressable
                key={valor}
                accessibilityRole="radio"
                accessibilityState={{ checked: ativo }}
                onPress={() => {
                  setPapel(valor);
                  setErro(null);
                }}
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
                value={nome}
                onChangeText={setNome}
                autoComplete="name"
                placeholder="como aparece nas receitas"
              />
              <Field
                label="CRN"
                value={crn}
                onChangeText={setCrn}
                autoCapitalize="characters"
                placeholder="CRN-3 12345"
              />
            </>
          ) : null}
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="voce@exemplo.com"
          />
          <Field
            label="Senha"
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            autoCapitalize="none"
            placeholder={cadastrando ? `pelo menos ${SENHA_MINIMA} caracteres` : ''}
            error={senhaCurta ? `pelo menos ${SENHA_MINIMA} caracteres` : null}
          />

          {erro || notice ? <ErrorNotice message={erro ?? notice ?? ''} /> : null}

          <Button
            label={cadastrando ? 'Criar conta' : 'Entrar'}
            onPress={enviar}
            loading={enviando}
          />
          <Button
            label={cadastrando ? 'Já tenho conta' : 'Criar uma conta'}
            variant="ghost"
            onPress={() => {
              setCadastrando((estava) => !estava);
              setErro(null);
            }}
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
  marca: { ...typography.labelSm, color: colors.secondary, letterSpacing: 2 },
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
  aviso: { ...typography.bodySm, color: colors.onSurfaceVariant, textAlign: 'center' },
});
