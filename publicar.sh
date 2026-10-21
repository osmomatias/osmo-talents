#!/bin/bash
# Envia a versão atual desta pasta para a VPS e atualiza o site.
# Uso, no terminal do VS Code / Antigravity:  bash publicar.sh
set -e
cd "$(dirname "$0")"
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
ZIP="$(mktemp -t osmo).zip"
rm -f "$ZIP"
zip -qr "$ZIP" . -x "data/*" ".env" "node_modules/*" ".git/*" "*.DS_Store"
echo ""
echo "Publicando em $DOMAIN ($IP)."
echo ""
LC_ALL=C.UTF-8 LANG=C.UTF-8 ssh -o StrictHostKeyChecking=accept-new -o SendEnv=- "root@$IP" "export LC_ALL=C.UTF-8 LANG=C.UTF-8; rm -rf /root/osmo-talents && mkdir -p /root/osmo-talents && cat > /root/osmo-talents.zip && cd /root/osmo-talents && (command -v unzip >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq unzip >/dev/null)) && unzip -oq /root/osmo-talents.zip && bash instalar.sh '$DOMAIN'" < "$ZIP"
rm -f "$ZIP"
echo ""
echo "Pronto. A versão nova está no ar."
