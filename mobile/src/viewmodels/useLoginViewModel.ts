/**
 * ViewModel da entrada no aplicativo: login e cadastro, para os dois papéis.
 *
 * Valida o formulário antes de chamar a API e traduz a falha num texto que a
 * tela mostra como está.
 */

import { useState } from 'react';

import { ApiError } from '../services/api';
import { useAuth } from '../services/auth';
import type { UserRole } from '../types/api';

export const SENHA_MINIMA = 8;

export function useLoginViewModel() {
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

  return {
    papel,
    cadastrando,
    nutricionista,
    email,
    senha,
    nome,
    crn,
    senhaCurta,
    /** O erro do formulário, ou o aviso da sessão (por exemplo, sessão expirada). */
    mensagem: erro ?? notice ?? null,
    enviando,
    setEmail,
    setSenha,
    setNome,
    setCrn,
    escolherPapel: (valor: UserRole) => {
      setPapel(valor);
      setErro(null);
    },
    alternarCadastro: () => {
      setCadastrando((estava) => !estava);
      setErro(null);
    },
    enviar,
  };
}
