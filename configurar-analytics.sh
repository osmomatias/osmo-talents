#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script liga o "contador de visitas" (Google Analytics).
# Ele grava no .env do servidor o código de medição do GA4 (começa com G-) e reinicia o app.
# Mesmo ligado, o Analytics só conta quem aceitar o aviso de estatísticas que aparece no site (LGPD).
# Uso, no terminal do editor:  bash configurar-analytics.sh   (ou GA_MEASUREMENT_ID=G-XXXX bash configurar-analytics.sh)
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "Google Analytics"
echo "----------------"
ID="$GA_MEASUREMENT_ID"
[ -n "$ID" ] || read -r -p "Código de medição do GA4 (ex.: G-ABC123XYZ): " ID
ID="$(echo "$ID" | tr -d ' ' | tr '[:lower:]' '[:upper:]')"
[[ "$ID" =~ ^G-[A-Z0-9]{4,20}$ ]] || { echo "Esse código não parece um código do GA4 (começa com G-). Nada foi alterado."; exit 1; }
echo "Gravando no servidor..."
ssh "root@$IP" "bash -s" <<REMOTE
set -e
ENV=/var/www/osmo-talents/.env
grep -vE '^GA_MEASUREMENT_ID=' \$ENV > \$ENV.tmp || true
echo "GA_MEASUREMENT_ID=$ID" >> \$ENV.tmp
mv \$ENV.tmp \$ENV && chmod 640 \$ENV && chgrp osmo \$ENV
systemctl restart osmo-talents
REMOTE
echo ""
echo "Pronto. Abra https://$DOMAIN: o aviso de estatísticas deve aparecer embaixo da tela."
