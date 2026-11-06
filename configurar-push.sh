#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script liga as NOTIFICAÇÕES PUSH no servidor.
# As notificações precisam de um par de chaves (VAPID): a pública vai para os navegadores e
# a privada assina cada notificação. As chaves são criadas LÁ no servidor e a privada nunca
# sai de lá. Depois o app reinicia e o item "Notificações" aparece em Ajustes.
# Liga as notificações push no servidor.
# Uso, no terminal do editor:  bash configurar-push.sh
# Rodar de novo não troca as chaves (trocar desliga as notificações de todo mundo).
# Para trocar mesmo assim:      TROCAR=1 bash configurar-push.sh
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "Notificações push"
echo "-----------------"
ssh "root@$IP" "TROCAR='${TROCAR:-}' DOMAIN='$DOMAIN' bash -s" <<'REMOTE'
set -e
APP=/var/www/osmo-talents
ENV=$APP/.env
if grep -q '^VAPID_PRIVATE_KEY=.' "$ENV" 2>/dev/null && [ "$TROCAR" != "1" ]; then
  echo "As chaves já existem. Nada foi trocado."
else
  # gera o par de chaves com o próprio src/push.js e grava no .env (tirando as linhas antigas)
  NEW=$(cd "$APP" && node -e 'const k = require("./src/push").generateKeys(); console.log("VAPID_PUBLIC_KEY=" + k.publicKey + "\nVAPID_PRIVATE_KEY=" + k.privateKey)')
  grep -vE '^(VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT)=' "$ENV" > "$ENV.tmp" || true
  printf '%s\nVAPID_SUBJECT=https://%s\n' "$NEW" "$DOMAIN" >> "$ENV.tmp"
  mv "$ENV.tmp" "$ENV" && chmod 640 "$ENV" && chgrp osmo "$ENV"
  echo "Chaves criadas."
fi
systemctl restart osmo-talents
REMOTE
echo ""
echo "Pronto. Entre em https://$DOMAIN, abra Ajustes e ligue \"Notificações neste aparelho\"."
echo "Depois toque em Testar. Se não chegar, veja os erros com:"
echo "   ssh root@$IP journalctl -u osmo-talents -n 50 | grep push"
