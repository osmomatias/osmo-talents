#!/bin/bash
# Liga o login com Google, Apple, LinkedIn ou Adobe no servidor.
# Uso, no terminal do editor:  bash configurar-login-social.sh
# As chaves são digitadas aqui no seu Mac e vão direto para o servidor.
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "Login social"
echo "------------"
echo "1) Google   2) Apple   3) LinkedIn   4) Adobe"
read -r -p "Qual você quer ligar? " OP
case "$OP" in 1) P=google; N=GOOGLE;; 2) P=apple; N=APPLE;; 3) P=linkedin; N=LINKEDIN;; 4) P=adobe; N=ADOBE;; *) echo "Opção inválida."; exit 1;; esac
echo ""
echo "No painel do provedor, o endereço de retorno (redirect URI) deve ser:"
echo "   https://$DOMAIN/auth/$P/callback"
echo ""
LINES="PUBLIC_URL=https://$DOMAIN"
if [ "$P" = "apple" ]; then
  read -r -p "Services ID (ex.: br.com.osmo.login): " CID
  read -r -p "Team ID (10 caracteres): " TEAM
  read -r -p "Key ID da chave de Sign in with Apple: " KID
  read -r -p "Arraste aqui o arquivo .p8 da chave e aperte Enter: " P8
  P8="${P8%\'}"; P8="${P8#\'}"; P8="$(echo "$P8" | sed 's/\\ / /g' | xargs)"
  [ -f "$P8" ] || { echo "Não achei o arquivo .p8."; exit 1; }
  LINES="$LINES
APPLE_CLIENT_ID=$CID
APPLE_TEAM_ID=$TEAM
APPLE_KEY_ID=$KID
APPLE_PRIVATE_KEY_FILE=/etc/osmo-talents/apple.p8"
  echo "Enviando a chave da Apple..."
  ssh "root@$IP" "mkdir -p /etc/osmo-talents && cat > /etc/osmo-talents/apple.p8 && chgrp osmo /etc/osmo-talents/apple.p8 && chmod 640 /etc/osmo-talents/apple.p8" < "$P8"
else
  read -r -p "Client ID: " CID
  read -r -s -p "Client Secret (não aparece na tela): " SEC; echo ""
  [ -n "$CID" ] && [ -n "$SEC" ] || { echo "Faltou o Client ID ou o Secret. Nada foi alterado."; exit 1; }
  LINES="$LINES
${N}_CLIENT_ID=$CID
${N}_CLIENT_SECRET='$SEC'"
fi
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
echo "Pronto. Abra https://$DOMAIN/#entrar: o botão de $P deve aparecer."
