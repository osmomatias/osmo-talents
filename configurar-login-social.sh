#!/bin/bash
# Liga o login com Google, LinkedIn, Adobe ou GitHub no servidor.
# Uso, no terminal do editor:  bash configurar-login-social.sh
# As chaves são digitadas aqui no seu Mac e vão direto para o servidor.
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "Login social"
echo "------------"
echo "1) Google   2) LinkedIn   3) Adobe   4) GitHub"
read -r -p "Qual você quer ligar? " OP
case "$OP" in 1) P=google; N=GOOGLE;; 2) P=linkedin; N=LINKEDIN;; 3) P=adobe; N=ADOBE;; 4) P=github; N=GITHUB;; *) echo "Opção inválida."; exit 1;; esac
echo ""
echo "No painel do provedor, o endereço de retorno (redirect URI) deve ser:"
echo "   https://$DOMAIN/auth/$P/callback"
echo ""
LINES="PUBLIC_URL=https://$DOMAIN"
read -r -p "Client ID: " CID
read -r -s -p "Client Secret (não aparece na tela): " SEC; echo ""
[ -n "$CID" ] && [ -n "$SEC" ] || { echo "Faltou o Client ID ou o Secret. Nada foi alterado."; exit 1; }
LINES="$LINES
${N}_CLIENT_ID=$CID
${N}_CLIENT_SECRET='$SEC'"
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
