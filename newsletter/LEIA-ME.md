# Radar Osmo: newsletter diária

Todo dia às 7h (horário de Brasília), o n8n:

1. lê o RSS de 30 fontes confiáveis, separadas em 7 editorias;
2. escolhe **um artigo por área**, publicado nas últimas 36 horas, dando preferência aos que trazem o texto completo no RSS e sem repetir artigos de dias anteriores;
3. pede ao Claude (`claude-opus-5-5`) que **traduza para o português** os artigos em outras línguas (inglês, espanhol, francês…) e escreva todos em linguagem acessível: título, 3 a 4 parágrafos curtos e "por que importa";
4. monta o e-mail com o template de e-mail marketing da Osmo (o mesmo visual de `src/mail.ts`) e envia pelo SMTP da Hostinger.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `src/1-config.js` | **Edite este:** destinatários, editorias, fontes e quantidade de artigos por área |
| `src/2-coletar.js` | Leitura dos RSS/Atom e escolha das notícias |
| `src/3-claude.js` | Instruções de tradução para o português e linguagem acessível |
| `src/4-email.js` | Template HTML do e-mail |
| `radar-osmo.n8n.json` | Workflow pronto para importar no n8n (gerado) |

Depois de editar qualquer arquivo em `src/`, gere o workflow de novo:

```bash
node newsletter/build.mjs
```

Para ver uma prévia com as notícias de hoje, use o comando abaixo. Ele grava `newsletter/preview.html` com textos de exemplo. Com `--claude` e a `ANTHROPIC_API_KEY` definida, ele chama a API de verdade.

```bash
node newsletter/preview.mjs
```

## Instalar no n8n da Hostinger

1. No n8n, abra **Workflows → Import from File** e escolha `newsletter/radar-osmo.n8n.json`.
2. Crie a credencial da Anthropic. Em **Credentials → New → Header Auth**, use o nome `Anthropic API`, o campo **Name** `x-api-key` e, em **Value**, a sua chave de API (console.anthropic.com).
3. Crie a credencial de e-mail. Em **Credentials → New → SMTP**, use o nome `SMTP Osmo (Hostinger)`, o host `smtp.hostinger.com`, a porta `465` com SSL/TLS ligado, e o usuário e a senha da caixa que vai enviar.
4. Abra os nós **Claude: traduzir e resumir** e **Enviar e-mail** e selecione as credenciais que você criou.
5. Confira em `src/1-config.js` se o `REMETENTE` é uma caixa que existe na Hostinger. Se não for, o envio é recusado.
6. Clique em **Test workflow** para receber um e-mail de teste. Depois ligue o botão **Active**.

O fuso horário já vem configurado no workflow (`America/Sao_Paulo`).

## Fontes

| Editoria | Fontes |
|---|---|
| IA e automação | MIT Technology Review, BBC News, The Verge, Google AI, Hugging Face |
| Desenvolvimento e TI | Tecnoblog, Canaltech, InfoQ, GitHub Blog, Stack Overflow Blog, Ars Technica |
| Design e criação | Nielsen Norman Group, Smashing Magazine, Creative Bloq, Figma Blog |
| Marketing | Meio & Mensagem, Marketing Dive, HubSpot Blog |
| Dados e análise | Our World in Data, KDnuggets, FlowingData, Towards Data Science |
| Escrita e conteúdo | Agência Lupa, Nieman Lab (Harvard), Poynter, Press Gazette |
| Engenharia e arquitetura | ArchDaily Brasil, CAU/BR, IEEE Spectrum, Dezeen |

Todas foram testadas em 12/11/2026. Se uma fonte sair do ar, a newsletter continua com as outras.

## Limites desta versão

- A tradução é uma versão condensada do artigo (cerca de 200 palavras) com link para o original. Republicar a tradução integral de artigos de outros veículos exigiria autorização deles.
- Para incluir uma fonte em outra língua, adicione-a em `src/1-config.js` com o código do idioma (`es`, `fr`, `it`, `de`).
- Os destinatários ficam fixos em `src/1-config.js`. Ainda não existe inscrição pelo site.
- O descadastro é um link de e-mail (`mailto:`), e a pessoa precisa ser tirada da lista à mão.
- O n8n só guarda as notícias já enviadas em execuções automáticas. No **Test workflow**, a mesma notícia pode aparecer de novo.
