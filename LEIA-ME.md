# Osmo Talents: como colocar no ar

App em Node.js puro com banco SQLite embutido. Não precisa instalar pacotes (`npm install` não é necessário).
Requisito: **Node.js 22.13 ou mais novo** (no CloudPanel, escolha a versão 22 ou 24).

---

## Antes de começar

**Atenção:** hoje o domínio `osmo.com.br` mostra o site da agência. Colocar o Osmo Talents em `osmo.com.br` **substitui** esse site.
Se quiser manter os dois, use um subdomínio, por exemplo `talents.osmo.com.br`. Os passos são os mesmos: só troque o domínio.

Faça um backup do site atual antes do passo 1.

---

## Passo 1. Criar o site Node.js no CloudPanel

1. Entre no CloudPanel.
2. Se `osmo.com.br` já existir como site, faça o backup e apague esse site (Sites → osmo.com.br → Delete).
3. Clique em **Add Site** → **Create a Node.js Site**.
4. Preencha:
   - Domain Name: `osmo.com.br`
   - Node.js Version: **22** (ou 24)
   - App Port: `3000`
5. Clique em **Create**. Anote o **Site User** e a senha que o CloudPanel mostrar.

## Passo 2. Enviar os arquivos

1. No site, abra **File Manager**.
2. Entre na pasta `htdocs/osmo.com.br`.
3. Envie o arquivo `osmo-talents.zip` e use **Extract** para descompactar ali.
4. Confira que `server.js`, `package.json` e a pasta `public` ficaram direto dentro de `htdocs/osmo.com.br`.

## Passo 3. Criar o arquivo de configuração

1. Ainda no File Manager, duplique `.env.example` com o nome `.env`.
   (Se arquivos com ponto não aparecerem, ative "mostrar arquivos ocultos".)
2. Não precisa mudar nada dentro dele.

## Passo 4. Ativar o HTTPS

1. No site, vá em **SSL/TLS** → **Actions** → **New Let's Encrypt Certificate**.
2. Clique em **Create and Install**.

## Passo 5. Ligar o app

1. Abra um terminal SSH entrando com o **Site User** do passo 1 (não com o root).
2. Rode, um de cada vez:

```bash
cd ~/htdocs/osmo.com.br
node --version
```

   O resultado precisa ser `v22.13` ou maior.

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

3. Abra `https://osmo.com.br`. O site já deve aparecer.

## Passo 6. Fazer o app voltar sozinho depois de reiniciar o servidor

1. Ainda como Site User, rode `pm2 startup`.
2. Ele mostra um comando começando com `sudo env PATH=...`. Copie esse comando.
3. Entre como **root** e cole o comando.

## Passo 7 (opcional). Dados de demonstração

Para mostrar a plataforma com vagas e perfis de exemplo:

```bash
cd ~/htdocs/osmo.com.br
npm run seed
```

O terminal mostra os e-mails das contas de exemplo e uma senha gerada na hora. Guarde essa senha.
Antes de abrir a plataforma para pessoas reais, apague o banco (`data/osmo_talents.sqlite`) e reinicie com `pm2 restart osmo-talents`.

---

## Atualizar para uma versão nova

1. Envie os arquivos novos por cima dos antigos (a pasta `data` e o `.env` ficam como estão).
2. Rode `pm2 restart osmo-talents`.

## Backup

Tudo fica em um arquivo só: `data/osmo_talents.sqlite`. Copie esse arquivo (e os que terminam em `-wal` e `-shm`) para fazer backup.

## Comandos úteis

| Para | Comando |
| --- | --- |
| Ver se está rodando | `pm2 status` |
| Ver erros | `pm2 logs osmo-talents` |
| Reiniciar | `pm2 restart osmo-talents` |

---

---

## Pagamentos com Asaas

Sem configuração, os pagamentos ficam simulados. Para ligar:

1. Crie uma conta no Asaas. Para testar, use o ambiente sandbox (sandbox.asaas.com).
2. No Asaas: **Integrações → Chave de API → Gerar nova chave**. Copie a chave.
3. No terminal do editor, dentro da pasta do projeto: `bash configurar-pagamentos.sh`
4. Escolha o ambiente, cole a chave e informe seu e-mail. O script grava tudo no servidor, reinicia o app e registra o webhook no Asaas.

Como funciona:

- O freelancer ativa "Receber pagamentos" em **Meu perfil**. O app cria uma subconta Asaas com Conta Escrow (garantia).
- O cliente informa CPF ou CNPJ em **Meu perfil** e paga cada etapa pelo **Painel** (Pix, boleto ou cartão).
- A cobrança sai com split: o freelancer recebe 90% do valor líquido e a Osmo fica com 10% (`FEE_PCT`).
- O freelancer só começa a etapa depois do pagamento confirmado.
- Ao aprovar, o app libera a garantia. Sem resposta do cliente em 7 dias após a entrega, a liberação é automática (`AUTO_RELEASE_DAYS`).
- Para trocar de testes para produção, rode `bash configurar-pagamentos.sh` de novo e escolha 2.

Pontos a confirmar com o Asaas antes de ir para produção: se valores de split entram na Conta Escrow e as taxas atuais.

---

## Login com Google, LinkedIn, Adobe e GitHub

Cada botão só aparece no site depois que o provedor é configurado. Para cada um:

1. Crie o aplicativo no painel do provedor (links abaixo).
2. Cadastre o endereço de retorno: `https://osmo.com.br/auth/<provedor>/callback` (troque `<provedor>` por google, linkedin, adobe ou github).
3. No terminal do editor: `bash configurar-login-social.sh`, escolha o provedor e cole as chaves.

| Provedor | Onde criar | O que você recebe |
| --- | --- | --- |
| Google | console.cloud.google.com → APIs e serviços → Credenciais → ID do cliente OAuth (Aplicativo da Web) | Client ID e Client Secret |
| LinkedIn | linkedin.com/developers → Create app → produto "Sign In with LinkedIn using OpenID Connect" | Client ID e Client Secret |
| GitHub | github.com → Settings → Developer settings → OAuth Apps → New OAuth App (em "Authorization callback URL" use o endereço de retorno) | Client ID e Client Secret |
| Adobe | developer.adobe.com/console → projeto → OAuth Web App | Client ID e Client Secret |

Como funciona:

- Se a pessoa já tem conta com o mesmo e-mail (confirmado pelo provedor), o login é vinculado à conta existente.
- Conta nova pela tela **Criar conta** usa o perfil escolhido ali. Pela tela **Entrar**, o app pergunta se a pessoa quer trabalhar ou contratar.
- O app não recebe nem guarda a senha da pessoa no provedor.

## Recuperar senha por e-mail

O link "Esqueci minha senha" só aparece depois que o envio de e-mail é configurado.

1. Pegue os dados de SMTP do seu provedor de e-mail (servidor, porta, usuário e senha). Vale criar uma caixa só para isso, por exemplo `nao-responda@osmo.com.br`.
2. No terminal do editor: `bash configurar-email.sh` e responda as perguntas.
3. Teste pedindo um link para o seu próprio e-mail.

Como funciona:

- A pessoa informa o e-mail e recebe um link que vale por 1 hora e funciona uma vez só.
- A resposta na tela é sempre a mesma, exista ou não uma conta com aquele e-mail.
- Limite de 3 e-mails por conta a cada hora.
- Ao salvar a senha nova, a conta sai de todos os outros aparelhos.
- Quem entrou só com Google, LinkedIn, Adobe ou GitHub também pode usar o link para criar uma senha.

Para não cair no spam, configure SPF e DKIM do domínio no seu provedor de e-mail.

## O que esta versão faz

- Cadastro e login como freelancer ou cliente (senhas com hash scrypt, sessão em cookie HttpOnly)
- Recuperar senha por e-mail
- Perfil com "Como eu trabalho melhor" e identificação opcional
- Foto de perfil ou logo da empresa (opcional), recortada e reduzida no navegador e guardada no próprio banco
- Publicar vaga com nota de clareza (mínimo de 50% para publicar)
- Busca de vagas com filtros: briefing claro, assíncrono, prazo flexível
- Proposta guiada em 4 passos, com rascunho salvo e divisão em etapas
- Limite de propostas abertas pela capacidade (horas por semana e energia)
- Aceitar ou recusar propostas, que gera contrato com etapas
- Etapas: começar → entregar → aprovar ou pedir ajustes
- Mensagens com resumo fixo do combinado, respostas rápidas e convites
- Painel com valores recebidos e protegidos
- Ajustes de conforto, menu de celular e modo escuro

## Ainda não faz (próximas versões)

- Envio de arquivos e imagens de portfólio
- Avaliações depois do contrato
- Notificações por e-mail
