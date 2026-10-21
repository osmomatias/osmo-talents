#!/bin/bash
# Liga os pagamentos do Asaas no servidor. Uso, no terminal do editor:  bash configurar-pagamentos.sh
# A chave do Asaas é digitada aqui no seu Mac e vai direto para o servidor, sem passar por mais ninguém.
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "Ligar pagamentos (Asaas)"
echo "------------------------"
read -r -p "Ambiente: 1 = testes (sandbox), 2 = real (produção) [1]: " AMB
if [ "${AMB:-1}" = "2" ]; then BASE="https://api.asaas.com/v3"; else BASE="https://api-sandbox.asaas.com/v3"; fi
read -r -s -p "Cole a chave de API do Asaas (ela não aparece na tela) e aperte Enter: " KEY; echo ""
if [ -z "$KEY" ]; then echo "Nenhuma chave informada. Nada foi alterado."; exit 1; fi
read -r -p "Seu e-mail (o Asaas avisa por ele se algo falhar): " MAIL
TOKEN="$(openssl rand -hex 24)"
NEWSECRET="$(openssl rand -hex 24)"
echo ""
echo "Enviando para o servidor..."
LC_ALL=C.UTF-8 ssh -o SendEnv=- "root@$IP" "bash -s" <<EOF
set -e
ENV=/var/www/osmo-talents/.env
SECRET="\$(grep -E '^APP_SECRET=' \$ENV | cut -d= -f2- || true)"
[ -n "\$SECRET" ] || SECRET="$NEWSECRET"
grep -vE '^(ASAAS_[A-Z_]+|APP_SECRET|PUBLIC_URL)=' \$ENV > \$ENV.tmp || true
cat >> \$ENV.tmp <<'VARS'
ASAAS_BASE_URL=$BASE
ASAAS_API_KEY='$KEY'
ASAAS_WEBHOOK_TOKEN=$TOKEN
ASAAS_WEBHOOK_EMAIL=$MAIL
PUBLIC_URL=https://$DOMAIN
VARS
echo "APP_SECRET=\$SECRET" >> \$ENV.tmp
mv \$ENV.tmp \$ENV && chmod 640 \$ENV && chgrp osmo \$ENV
systemctl restart osmo-talents
sleep 2
cd /var/www/osmo-talents && sudo -u osmo node --disable-warning=ExperimentalWarning --env-file=.env scripts/asaas-setup.js
EOF
echo ""
echo "Pronto. Abra https://$DOMAIN: o rodapé deve dizer 'Pagamento protegido pelo Asaas'."
