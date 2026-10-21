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

## O que esta versão faz

- Cadastro e login como freelancer ou cliente (senhas com hash scrypt, sessão em cookie HttpOnly)
- Perfil com "Como eu trabalho melhor" e identificação opcional
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

- **Pagamentos reais.** Os valores são simulados. Para valer de verdade, é preciso integrar um meio de pagamento com custódia (por exemplo, Pix com split).
- Recuperar senha por e-mail
- Envio de arquivos e imagens de portfólio
- Avaliações depois do contrato
- Notificações por e-mail
