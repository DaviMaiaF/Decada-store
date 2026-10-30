# Abrir a DÉCADA no celular, de qualquer lugar

Roteiro para quem do grupo (ou da banca) quer usar o app **sem o notebook de ninguém
ligado** e sem estar na mesma rede. O app fala com a API publicada em
`https://decada-api.onrender.com`; como isso funciona por dentro está em
[`publicacao.md`](publicacao.md).

> **É um ambiente de demonstração.** Preços, mercados e receitas são fictícios. Crie
> uma conta de teste e use um plano inventado (como o
> [`plano-exemplo.pdf`](demo/plano-exemplo.pdf)) — **nunca o seu plano alimentar de
> verdade**: é dado de saúde, e este servidor não é produção.

## Qual caminho seguir

| Seu celular | Caminho | Precisa de conta Expo? |
|---|---|---|
| Android | **A. Instalar o APK** (mais simples) | Não |
| Android ou iPhone | **B. Expo Go** | Sim, e ser convidado para a organização |

---

## A. Android: instalar o APK

1. No celular, abra o link do build mais recente:
   **https://expo.dev/accounts/davi-maias-team/projects/decada/builds/3504caad-2841-43cd-9156-1d3250a826af**
   (se o link não abrir, peça ao Davi o do build atual).
2. Toque em **Install** e baixe o arquivo `.apk`.
3. Abra o arquivo baixado. O Android vai avisar que o app vem de "fonte desconhecida":
   toque em **Configurações**, permita a instalação **para o navegador** que baixou o
   arquivo, volte e toque em **Instalar**.
   - Se aparecer o aviso do **Play Protect**, toque em **Mais detalhes → Instalar
     mesmo assim**. O app não está na Play Store, por isso o aviso.
4. Abra a **DÉCADA**. Pronto.

O app se atualiza sozinho: quando sair uma versão nova, ela é baixada ao abrir e
aplicada **na próxima vez** que você abrir o app. Para forçar, feche o app (tirando dos
recentes) e abra de novo, duas vezes.

---

## B. Expo Go (Android ou iPhone)

Desde maio de 2026 o Expo Go só abre o app para quem é **membro da organização** dona
do projeto. Por isso há um passo de convite.

**Você:**

1. Crie uma conta gratuita em **expo.dev** (*Sign up*) e mande o seu **nome de usuário**
   da Expo para o Davi.
2. Aceite o convite que chega no seu e-mail (organização `davi-maias-team`).
3. Instale o **Expo Go** pela Play Store ou App Store. Precisa ser uma versão compatível
   com o **SDK 58** (a mais recente da loja).
4. Abra o Expo Go e entre (**Log in**) com a **mesma conta** que recebeu o convite.
5. Escaneie o QR abaixo — no Android, pelo botão **Scan QR code** do Expo Go; no
   iPhone, pela câmera do próprio celular:

   <img src="https://qr.expo.dev/eas-update?slug=exp&projectId=ad872add-88c9-476b-8168-b0cc5d25c71f&runtimeVersion=1.0.0&channel=demo" alt="QR do app no Expo Go" width="200">

   Sem como escanear (você está vendo isto no próprio celular)? Toque no link:
   `exp://u.expo.dev/ad872add-88c9-476b-8168-b0cc5d25c71f?runtime-version=1.0.0&channel-name=demo`

Depois da primeira vez, o app aparece na lista de **recentes** do Expo Go.

**O Davi (dono da organização):** expo.dev → organização **davi-maias-team** →
**Members** → **Invite** → nome de usuário ou e-mail da pessoa. O papel **Viewer**
(só leitura) basta para abrir no Expo Go; ninguém precisa de permissão para publicar.

---

## Primeiro uso

1. **Paciência no primeiro acesso:** se ninguém usou o app nos últimos ~15 minutos, o
   servidor está dormindo e a primeira tela leva **até 1 minuto** para responder. Depois
   disso fica rápido. Quem vai apresentar pode acordá-lo antes abrindo
   https://decada-api.onrender.com/health no navegador.
2. **Crie a sua conta** na tela de entrada. Não existe conta pronta neste ambiente.
   - Para testar o lado da **nutricionista**, toque em **Sou nutricionista** e crie uma
     segunda conta, com outro e-mail (o CRN é só declarado).
3. **Siga o [roteiro de demonstração](demo/roteiro.md)** a partir do passo 2 (enviar o
   plano): use o [`plano-exemplo.pdf`](demo/plano-exemplo.pdf) (baixe no celular antes).
   Os números devem bater com os de lá, porque o catálogo é o mesmo. A conta
   `beta@example.com` citada no roteiro **não existe** aqui; use a sua.
4. O app ainda não tem botão de excluir conta (a API tem, em `DELETE /auth/me`). Se
   quiser a sua apagada do servidor, avise o Davi.

## Deu problema?

| Sintoma | O que fazer |
|---|---|
| Tela de carregamento eterna no primeiro acesso | Espere 1 minuto (servidor acordando) e tente de novo |
| Expo Go diz que você não tem acesso ao projeto | Confirme que aceitou o convite e que está logado no Expo Go com **a mesma conta** |
| Expo Go diz que o SDK não é suportado | Atualize o Expo Go na loja; se ainda não houver versão para o SDK 58, use o APK (Android) |
| Android não deixa instalar o APK | Permita "instalar apps desconhecidos" para o **navegador** que baixou o arquivo |
| A mudança que alguém publicou não apareceu | Feche e abra o app duas vezes: o update é baixado numa abertura e aplicado na seguinte |
| Foto da despensa responde que está indisponível | Esperado se o servidor estiver sem a chave da API do Claude; o resto do app funciona |
