#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script "faz o carimbo" das notificações.
# Para mandar avisos ao celular e ao computador (Web Push), a Osmo precisa de um par de chaves
# (VAPID): a pública vai para o navegador de cada pessoa; a secreta fica só no servidor e serve
# para carimbar cada aviso, provando que ele veio mesmo da Osmo.
# O script gera as chaves aqui no seu Mac (com o Node.js), grava no .env do servidor e reinicia o app.
# Uso, no terminal do editor:  bash configurar-push.sh
# Só para testar no seu computador (mostra as linhas para colar no .env local, sem mexer no servidor):
#   bash configurar-push.sh --local
# ATENÇÃO: trocar as chaves depois faz todos os aparelhos inscritos pararem de receber, até cada
# pessoa ativar de novo em Meu perfil. Por isso o script pergunta antes de trocar chaves que já existem.
set -e
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
command -v node >/dev/null || { echo "Precisa do Node.js instalado neste computador (https://nodejs.org)."; exit 1; }
echo ""
echo "Notificações no aparelho (Web Push)"
echo "-----------------------------------"
# Gera o par de chaves P-256: a pública em 65 bytes (formato "não comprimido") e a secreta em 32,
# as duas escritas em base64url, que é o formato que os navegadores esperam.
KEYS=$(node -e '
const { generateKeyPairSync } = require("node:crypto");
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const j = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]).toString("base64url");
console.log(pub + " " + j.d);')
PUB="${KEYS% *}"; PRIV="${KEYS#* }"
# Contato que os correios de avisos (Google, Apple, Mozilla) usam se precisarem falar com a Osmo
SUBJ="${VAPID_SUBJECT:-mailto:contato@$DOMAIN}"
LINES="VAPID_PUBLIC_KEY=$PUB
VAPID_PRIVATE_KEY=$PRIV
VAPID_SUBJECT=$SUBJ"

if [ "$1" = "--local" ]; then
  echo "Cole estas linhas no .env do seu computador e religue o app:"
  echo ""
  echo "$LINES"
  echo ""
  exit 0
fi

# Já tem chaves no servidor? Trocar desliga as inscrições de todo mundo, então perguntamos.
if ssh "root@$IP" "grep -q '^VAPID_PUBLIC_KEY=' /var/www/osmo-talents/.env"; then
  echo "O servidor JÁ tem chaves de push. Trocar faz todos os aparelhos pararem de receber"
  echo "até cada pessoa ativar de novo."
  read -r -p "Trocar mesmo assim? Digite TROCAR para confirmar: " OK
  [ "$OK" = "TROCAR" ] || { echo "Nada foi alterado."; exit 0; }
fi
echo "Gravando no servidor..."
# Lá no servidor: tira do .env as linhas antigas com os mesmos nomes, acrescenta as novas,
# protege o arquivo e reinicia o app (mesmo jeito do configurar-email.sh).
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
echo "Pronto. Em https://$DOMAIN/perfil, na parte Avisos, deve aparecer \"Notificações neste aparelho\"."
echo "Ative e toque em \"Enviar um teste\". Se não chegar, veja os erros com:"
echo "   ssh root@$IP journalctl -u osmo-talents -n 50 | grep push"
