/** Entrada no aplicativo: login e cadastro na mesma tela. */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Body, Button, ErrorNotice, Field } from '../components';
import { ApiError } from '../services/api';
import { useAuth } from '../services/auth';
import { colors, spacing, typography } from '../theme/tokens';

const SENHA_MINIMA = 8;

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [cadastrando, setCadastrando] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

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

    setEnviando(true);
    try {
      if (cadastrando) {
        await signUp(email.trim(), senha);
      } else {
        await signIn(email.trim(), senha);
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
            A DÉCADA organiza o plano da sua nutricionista e mostra quanto custa a
            compra. Não prescrevemos dieta.
          </Body>
        </View>

        <View style={styles.formulario}>
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

          {erro ? <ErrorNotice message={erro} /> : null}

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
          Seu plano alimentar é dado sensível de saúde. Guardamos só o necessário, e
          você pode apagar tudo quando quiser.
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
  formulario: { gap: spacing.md },
  aviso: { ...typography.bodySm, color: colors.onSurfaceVariant, textAlign: 'center' },
});
