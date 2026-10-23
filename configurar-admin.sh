#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script entrega a "chave do painel do dono".
# Ele grava no .env do servidor quais e-mails podem abrir o panorama da plataforma
# (https://osmo.com.br/#panorama) e reinicia o app. Quem entrar no site com um desses
# e-mails vê o painel; para todas as outras pessoas, a página não existe.
# Uso, no terminal do editor:  bash configurar-admin.sh
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "Painel do dono"
echo "--------------"
EMAILS="$ADMIN_EMAILS"
[ -n "$EMAILS" ] || read -r -p "E-mail(s) com acesso, separados por vírgula: " EMAILS
EMAILS="$(echo "$EMAILS" | tr -d ' ')"
[ -n "$EMAILS" ] || { echo "Nenhum e-mail informado. Nada foi alterado."; exit 1; }
echo "Gravando no servidor..."
ssh "root@$IP" "bash -s" <<REMOTE
set -e
ENV=/var/www/osmo-talents/.env
grep -vE '^ADMIN_EMAILS=' \$ENV > \$ENV.tmp || true
echo "ADMIN_EMAILS=$EMAILS" >> \$ENV.tmp
mv \$ENV.tmp \$ENV && chmod 640 \$ENV && chgrp osmo \$ENV
systemctl restart osmo-talents
REMOTE
echo ""
echo "Pronto. Entre em https://$DOMAIN com um desses e-mails e abra https://$DOMAIN/#panorama"
