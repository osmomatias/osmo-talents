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

## Avisos por e-mail

Usam o mesmo e-mail configurado acima. Sem ele, nada é enviado.

- Tudo que acontece numa conversa (convite, proposta, contrato, etapas, pagamentos e mensagens) vira um aviso para a outra pessoa.
- O app espera 2 minutos sem novidades e junta tudo num e-mail só. Quem já viu a conversa no site não recebe.
- No máximo um e-mail por conversa a cada 15 minutos.
- Cada pessoa escolhe em **Meu perfil**: Tudo, Só o importante (sem mensagens de conversa) ou Nenhum. Todo e-mail tem um link para mudar isso sem entrar na conta.

## Selo de verificado (laudo médico com ICP-Brasil)

Freelancers podem, se quiserem, enviar um laudo em PDF **assinado digitalmente por médico** com certificado ICP-Brasil. Se passar, aparece um selo verde ao lado do nome.

O que o site confere (`src/icp.js`, sem bibliotecas externas):

- a assinatura digital é válida e cobre o PDF inteiro (nada mudou depois de assinar);
- o certificado encadeia até uma raiz oficial da ICP-Brasil (`certs/icp-brasil`) e estava válido na data da assinatura;
- o certificado é de um médico: traz o registro no CRM (OID 2.16.76.1.4.2.2, atribuído pelo ITI ao CFM) **ou** foi emitido pela Autoridade de Registro do CFM/CRM ("AR CFM" no certificado, caso comum no programa de certificados do CFM, que nem sempre grava o número do CRM). Um e-CPF comum é recusado;
- o certificado não está na lista de revogados da AC (quando a lista pode ser baixada);
- o mesmo laudo não vale para duas contas, e quem assinou não pode ser a própria pessoa.

O que **não** dá para conferir: o conteúdo do laudo (diagnóstico e nome do paciente). Isso fica como declaração da pessoa, que marca uma confirmação antes de enviar.

O PDF é conferido na memória e descartado. O banco guarda só a data, o CRM de quem assinou e o hash do arquivo.

- Testar um PDF no seu computador, sem enviar: `node scripts/conferir-laudo.js laudo.pdf`
- Atualizar as ACs da ICP-Brasil (quando o ITI publicar novas): `bash scripts/atualizar-icp.sh` e depois publicar.
- Antes de divulgar o selo, vale passar o texto de consentimento por um advogado de proteção de dados (laudo é dado sensível na LGPD).

## Mapa do projeto (explicado de um jeito simples)

Cada arquivo de código tem comentários no começo e em cada parte explicando o que acontece, como se fosse para uma criança de 10 anos. Este mapa mostra onde fica cada coisa. Pense num restaurante: o site no navegador é o garçom, o servidor é a cozinha e o banco de dados é a despensa.

**O servidor (a cozinha)**
- `server.js`: recebe todos os pedidos do site (cadastro, vagas, propostas, contratos, pagamentos, mensagens) e decide o que fazer com cada um.
- `src/db.js`: o banco de dados, um "caderno" com páginas para pessoas, vagas, propostas, contratos, etapas e mensagens.
- `src/asaas.js`: conversa com o Asaas, que cobra o cliente e repassa o dinheiro ao freelancer.
- `src/mail.js`: o carteiro que manda e-mails.
- `src/oauth.js`: o "Entrar com Google/GitHub/LinkedIn/Adobe".
- `src/icp.js`: o detetive que confere a assinatura digital dos laudos do selo de verificado.

**O site (o garçom, roda no navegador)**
- `public/index.html`: o esqueleto da página (cabeçalho, espaço do meio, rodapé).
- `public/app.js`: desenha cada tela, escuta cliques e digitação e leva os pedidos ao servidor.
- `public/theme.js`: liga o tema escuro e as preferências de Conforto antes de a página aparecer, para não piscar.
- `public/styles.css`: as roupas do site (cores, letras, tamanhos, celular, tablet e telas grandes).
- `public/fonts.css`: onde entra a fonte oficial DIN Pro, quando os arquivos dela forem colocados no projeto.
- `public/termos.html` e `public/privacidade.html`: as páginas de regras, já prontas com o texto.
- `public/taxonomia.json`: a lista de áreas, especialidades e habilidades (baseada no Upwork). Arquivos JSON não aceitam comentários, então a explicação fica aqui: cada área tem um `id`, um `nome`, um `resumo` e as `especialidades`, cada uma com as `habilidades` mais comuns e o link de onde veio.
- `public/favicon.svg`: o ícone que aparece na aba do navegador.

**Scripts e configuração**
- `package.json`: a "ficha" do projeto. Diz o nome, a versão mínima do Node.js (22.13) e os atalhos: `npm run dev` (liga no computador e religa a cada mudança), `npm start`, `npm run seed` (dados de exemplo), `npm run publicar` e `npm run asaas:setup`. Também é JSON, então não leva comentários.
- `publicar.sh`: empacota a pasta e leva para o servidor.
- `instalar.sh`: monta tudo no servidor em 7 passos (Node.js, serviço, nginx, HTTPS).
- `configurar-email.sh`, `configurar-login-social.sh` e `configurar-pagamentos.sh`: gravam no servidor as senhas e chaves de cada recurso, sem elas passarem por mais ninguém.
- `configurar-admin.sh`: diz quais e-mails podem abrir o painel do dono em `/#panorama` (números gerais, evolução por semana, funil, dinheiro e o que está parado). A página não aparece em nenhum menu e, para as outras pessoas, responde como se não existisse.
- `scripts/seed.js`: cria pessoas e vagas de exemplo.
- `scripts/asaas-setup.js`: pede ao Asaas para avisar o site quando um pagamento mudar.
- `scripts/conferir-laudo.js`: testa um laudo no computador, sem enviar ao site.
- `scripts/atualizar-icp.sh`: baixa a lista oficial de autoridades da ICP-Brasil.
- `certs/icp-brasil/`: os certificados oficiais das autoridades (raízes e intermediárias). São arquivos de "carimbo" em texto codificado, que não devem ser editados à mão.
- `.env.example`: o molde do arquivo de segredos `.env` (que nunca vai para o GitHub).
- `ecosystem.config.cjs`: configuração do PM2, para quem preferir usá-lo no lugar do systemd.
- `data/`: onde fica o banco de dados de verdade. Não vai para o GitHub nem é trocado na publicação.

## O que esta versão faz

- Cadastro e login como freelancer ou cliente (senhas com hash scrypt, sessão em cookie HttpOnly)
- Recuperar senha por e-mail
- Avisos por e-mail, com escolha de quanto receber
- Portfólio com até 12 projetos, cada um com imagem e link opcionais (imagens reduzidas no navegador e guardadas no próprio banco)
- Arquivos no briefing da vaga: até 6 por vaga, 10 MB cada (PDF, imagens, PSD, AI, Office e texto), só para quem tem conta
- Selo verde de verificado para quem envia laudo médico assinado com ICP-Brasil (opcional)
- Avaliações depois do contrato (nota de 1 a 5, destaques e comentário), públicas só quando os dois lados avaliam ou após 14 dias
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

- Arquivos nas propostas, mensagens e entregas das etapas (hoje só o briefing da vaga aceita arquivos)
