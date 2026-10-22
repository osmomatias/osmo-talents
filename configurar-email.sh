#!/bin/bash
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
read -r -p "Servidor SMTP (ex.: smtp.hostinger.com): " HOST
read -r -p "Porta [465]: " PORT; PORT="${PORT:-465}"
read -r -p "Usuário (geralmente o e-mail completo): " USER
read -r -s -p "Senha (não aparece na tela): " PASS; echo ""
read -r -p "Remetente [Osmo Talents <$USER>]: " FROM; FROM="${FROM:-Osmo Talents <$USER>}"
[ -n "$HOST" ] && [ -n "$USER" ] && [ -n "$PASS" ] || { echo "Faltou o servidor, o usuário ou a senha. Nada foi alterado."; exit 1; }
LINES="PUBLIC_URL=https://$DOMAIN
SMTP_HOST=$HOST
SMTP_PORT=$PORT
SMTP_USER=$USER
SMTP_PASS='$PASS'
MAIL_FROM='$FROM'"
echo "Gravando no servidor..."
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
