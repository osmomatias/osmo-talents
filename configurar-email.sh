#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script "dá o endereço do correio" ao servidor.
# Ele pergunta os dados do servidor de e-mail (endereço, porta, usuário e senha) aqui no
# seu computador e grava direto no .env do servidor, sem a senha passar por mais ninguém.
# Depois reinicia o app, que passa a conseguir mandar e-mails (recuperar senha, avisos).
# Liga o envio de e-mails (recuperar senha) no servidor.
# Uso, no terminal do editor:  bash configurar-email.sh
# A senha do e-mail é digitada aqui no seu Mac e vai direto para o servidor.
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "Envio de e-mails (SMTP)"
echo "-----------------------"
echo "Use os dados de SMTP do seu provedor de e-mail (Google Workspace, Hostinger, Zoho, Brevo, Resend...)."
echo ""
# Dá para pular perguntas passando os valores antes do comando, por exemplo:
#   SMTP_HOST=smtp.hostinger.com SMTP_USER=nao-responda@osmo.com.br bash configurar-email.sh
HOST="$SMTP_HOST"; PORT="$SMTP_PORT"; USER="$SMTP_USER"; FROM="$MAIL_FROM"
[ -n "$HOST" ] || read -r -p "Servidor SMTP (ex.: smtp.hostinger.com): " HOST
[ -n "$PORT" ] || { read -r -p "Porta [465]: " PORT; PORT="${PORT:-465}"; }
[ -n "$USER" ] || read -r -p "Usuário (geralmente o e-mail completo): " USER
[ -n "$FROM" ] || FROM="Osmo Talents <$USER>"
echo "Servidor: $HOST:$PORT   Usuário: $USER"
read -r -s -p "Cole a senha do e-mail (Cmd+V; ela não aparece na tela) e aperte Enter: " PASS; echo ""
[ -n "$HOST" ] && [ -n "$USER" ] && [ -n "$PASS" ] || { echo "Faltou o servidor, o usuário ou a senha. Nada foi alterado."; exit 1; }
LINES="PUBLIC_URL=https://$DOMAIN
SMTP_HOST=$HOST
SMTP_PORT=$PORT
SMTP_USER=$USER
SMTP_PASS='$PASS'
MAIL_FROM='$FROM'"
echo "Gravando no servidor..."
# Lá no servidor: tira do .env as linhas antigas com os mesmos nomes, acrescenta as novas,
# protege o arquivo e reinicia o app.
ssh "root@$IP" "bash -s" <<REMOTE
set -e
ENV=/var/www/osmo-talents/.env
cat > /tmp/osmo-new.env <<'VARS'
$LINES
VARS
KEYS=\$(cut -d= -f1 /tmp/osmo-new.env | paste -sd'|')
grep -vE "^(\$KEYS)=" \$ENV > \$ENV.tmp || true
cat /tmp/osmo-new.env >> \$ENV.tmp && rm -f /tmp/osmo-new.env
mv \$ENV.tmp \$ENV && chmod 640 \$ENV && chgrp osmo \$ENV
systemctl restart osmo-talents
REMOTE
echo ""
echo "Pronto. Em https://$DOMAIN/#entrar deve aparecer \"Esqueci minha senha\"."
echo "Teste pedindo um link para o seu próprio e-mail. Se não chegar, veja os erros com:"
echo "   ssh root@$IP journalctl -u osmo-talents -n 50 | grep mail"
