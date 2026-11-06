#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: o único administrador do site (matias@osmo.com.br) agora está
# fixado no código (server.js), então não dá mais para dar a "chave do painel do dono" pelo .env.
# Este script só faz a limpeza: apaga do .env do servidor as linhas antigas ADMIN_EMAILS/ADMIN_EMAIL
# (que não valem mais) e reinicia o app.
# Uso, no terminal do editor:  bash configurar-admin.sh
set -e
IP="${IP:-46.202.147.229}"
echo ""
echo "Painel do dono: limpando a lista antiga de administradores no servidor..."
ssh "root@$IP" "bash -s" <<'REMOTE'
set -e
ENV=/var/www/osmo-talents/.env
grep -vE '^ADMIN_EMAILS?=' $ENV > $ENV.tmp || true
mv $ENV.tmp $ENV && chmod 640 $ENV && chgrp osmo $ENV
systemctl restart osmo-talents
REMOTE
echo ""
echo "Pronto. Só matias@osmo.com.br é administrador."
