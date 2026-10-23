#!/usr/bin/env bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este é o "montador" que arruma tudo no servidor.
# Ele faz 7 passos, e pode rodar quantas vezes quiser (se algo já está pronto, ele pula):
#   1. instala as ferramentas (nginx, curl...);
#   2. instala o Node.js 22 (o programa que roda o server.js);
#   3. copia o app para /var/www/osmo-talents, sem mexer no banco e no .env;
#   4. cria um "serviço" que liga o app sozinho e o religa se ele cair;
#   5. configura o nginx, o "porteiro da frente" que recebe as visitas e repassa ao app;
#   6. confere o DNS e, se o domínio já aponta para cá, ativa o HTTPS (o cadeadinho);
#   7. mostra como testar.
# Instalador do Osmo Talents para VPS Ubuntu/Debian limpa.
# Uso (como root, dentro da pasta descompactada):
#   bash instalar.sh osmo.com.br [seu@email.com]
# Pode rodar de novo quantas vezes quiser: serve para atualizar e para ativar o HTTPS depois do DNS.
set -euo pipefail
export LC_ALL=C.UTF-8 LANG=C.UTF-8 LANGUAGE= LC_CTYPE=C.UTF-8

# As configurações: o domínio e o e-mail vêm dos parâmetros do comando; o app mora em
# APP_DIR e roda com um usuário próprio e sem poderes ("osmo"), por segurança.
# say/ok/warn só escrevem mensagens coloridas na tela.
DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/var/www/osmo-talents"
APP_USER="osmo"
PORT="${PORT:-3000}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say()  { printf "\n\033[1;35m==> %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m    ok:\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m    atenção:\033[0m %s\n" "$*"; }

# Conferências antes de começar: rodando como administrador (root)? informou o domínio?
# está dentro da pasta certa? Depois limpa o domínio (tira http://, https://, barras e www).
if [ "$(id -u)" -ne 0 ]; then echo "Rode como root (no terminal do navegador da Hostinger você já é root)."; exit 1; fi
if [ -z "$DOMAIN" ]; then echo "Informe o domínio. Exemplo: bash instalar.sh osmo.com.br"; exit 1; fi
if [ ! -f "$SRC_DIR/server.js" ]; then echo "Rode este script de dentro da pasta do Osmo Talents (onde está o server.js)."; exit 1; fi
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN#www.}"

say "1/7 Atualizando o sistema e instalando ferramentas"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates rsync nginx dnsutils >/dev/null
ok "curl, rsync e nginx instalados"

say "2/7 Instalando Node.js 22"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  V="$(node -p 'process.versions.node')"; MAJ="${V%%.*}"; MIN="$(echo "$V" | cut -d. -f2)"
  if [ "$MAJ" -gt 22 ] || { [ "$MAJ" -eq 22 ] && [ "$MIN" -ge 13 ]; }; then NEED_NODE=0; ok "Node.js $V já instalado"; fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  ok "Node.js $(node -p 'process.versions.node') instalado"
fi
NODE_BIN="$(command -v node)"

# Copia os arquivos com rsync (só o que mudou) e acerta as permissões: o código fica só
# para leitura do app, e só a pasta data (o banco) pode ser escrita por ele. O .env, com
# os segredos, só pode ser lido pelo administrador e pelo app.
say "3/7 Copiando o app para $APP_DIR"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/data"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  rsync -a --delete --exclude data --exclude .env --exclude node_modules "$SRC_DIR"/ "$APP_DIR"/
fi
if [ ! -f "$APP_DIR/.env" ]; then
  printf "PORT=%s\nHOST=127.0.0.1\nCOOKIE_SECURE=false\n" "$PORT" > "$APP_DIR/.env"
fi
PORT="$(grep -E '^PORT=' "$APP_DIR/.env" | cut -d= -f2 || echo 3000)"
chown -R root:root "$APP_DIR"
# arquivos vindos do Mac podem chegar só com permissão do dono; o app precisa conseguir ler
find "$APP_DIR" -path "$APP_DIR/data" -prune -o -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"
chmod 640 "$APP_DIR/.env"; chgrp "$APP_USER" "$APP_DIR/.env"
ok "arquivos no lugar (banco e configuração preservados)"

# O "serviço" (systemd) é como um despertador que liga o app quando o servidor liga e o
# religa em 3 segundos se ele cair. As linhas Protect... prendem o app numa caixinha: ele
# não consegue mexer no resto do sistema, só na pasta data.
say "4/7 Configurando o serviço que mantém o app ligado"
cat > /etc/systemd/system/osmo-talents.service <<EOF
[Unit]
Description=Osmo Talents
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN --disable-warning=ExperimentalWarning --env-file-if-exists=.env server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$APP_DIR/data

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable osmo-talents >/dev/null 2>&1
systemctl restart osmo-talents
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/me" >/dev/null; then ok "app respondendo na porta $PORT"; else
  warn "o app não respondeu. Veja o erro com: journalctl -u osmo-talents -n 50"; exit 1; fi

# NGINX, o porteiro da frente: recebe as visitas na porta 80 e repassa para o app na porta
# 3000, contando o IP de verdade de quem visitou (X-Forwarded-For). Se outro programa (como
# o Apache) estiver ocupando a porta 80, desliga ou avisa.
say "5/7 Configurando o nginx para $DOMAIN"
LISTEN6="    listen [::]:80;"
[ -f /proc/net/if_inet6 ] || LISTEN6="    # IPv6 desativado neste servidor"
cat > /etc/nginx/sites-available/osmo-talents <<EOF
server {
    listen 80;
$LISTEN6
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/osmo-talents /etc/nginx/sites-enabled/osmo-talents
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || { nginx -t; exit 1; }
# outro programa usando a porta 80?
OCC="$(ss -ltnpH 'sport = :80' 2>/dev/null | grep -v nginx || true)"
if [ -n "$OCC" ]; then
  if echo "$OCC" | grep -q apache2; then
    systemctl stop apache2 >/dev/null 2>&1 || true
    systemctl disable apache2 >/dev/null 2>&1 || true
    ok "Apache desligado (ocupava a porta 80 que o site precisa)"
  else
    warn "A porta 80 está ocupada por outro programa:"
    echo "$OCC"
    warn "Copie as linhas acima e mande para o Claude."
    exit 1
  fi
fi
systemctl enable nginx >/dev/null 2>&1
if ! systemctl restart nginx; then
  warn "o nginx não ligou. Detalhes:"
  journalctl -u nginx -n 15 --no-pager || true
  warn "Copie as linhas acima e mande para o Claude."
  exit 1
fi
ok "nginx pronto"

# HTTPS: só dá para tirar o certificado (o cadeadinho) se o domínio apontar para este
# servidor. O certbot pede o certificado grátis ao Let's Encrypt e, se der certo, os
# crachás de login passam a só viajar por conexão segura (COOKIE_SECURE=true).
# Obs.: quando o site passa pela Cloudflare, o DNS mostra o endereço dela e não o daqui;
# por isso este passo avisa que "não aponta", mesmo com o site funcionando.
say "6/7 Conferindo o DNS e ativando o HTTPS"
SERVER_IP="$(curl -fsS -4 https://api.ipify.org || true)"
DNS_IP="$(dig +short A "$DOMAIN" | tail -n1 || true)"
WWW_IP="$(dig +short A "www.$DOMAIN" | tail -n1 || true)"
HTTPS=0
if [ -n "$SERVER_IP" ] && [ "$DNS_IP" = "$SERVER_IP" ]; then
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  DOMS=(-d "$DOMAIN"); [ "$WWW_IP" = "$SERVER_IP" ] && DOMS+=(-d "www.$DOMAIN")
  if [ -n "$EMAIL" ]; then MAIL=(-m "$EMAIL"); else MAIL=(--register-unsafely-without-email); fi
  if certbot --nginx "${DOMS[@]}" "${MAIL[@]}" --agree-tos --non-interactive --redirect >/dev/null 2>&1; then
    sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$APP_DIR/.env"
    systemctl restart osmo-talents
    HTTPS=1; ok "HTTPS ativo"
  else
    warn "o certificado não foi emitido. Rode de novo em alguns minutos."
  fi
elif [ -d "/etc/letsencrypt/live/$DOMAIN" ] && command -v certbot >/dev/null 2>&1; then
  # o certificado já existe: só reaplica no nginx (a configuração foi reescrita no passo 5)
  if certbot install --nginx --cert-name "$DOMAIN" --redirect --non-interactive >/dev/null 2>&1; then HTTPS=1; ok "HTTPS mantido"; fi
else
  warn "$DOMAIN ainda não aponta para este servidor (DNS: ${DNS_IP:-nenhum}, servidor: ${SERVER_IP:-?})."
  warn "Aponte o DNS e rode este script de novo para ativar o HTTPS."
fi

say "7/7 Pronto"
if [ "$HTTPS" -eq 1 ]; then echo "    Abra: https://$DOMAIN"; else echo "    Por enquanto, teste pelo IP: http://${SERVER_IP:-SEU-IP}"; fi
echo
echo "    Dados de demonstração (opcional):  cd $APP_DIR && sudo -u $APP_USER npm run seed"
echo "    Ver se está rodando:               systemctl status osmo-talents"
echo "    Ver erros:                         journalctl -u osmo-talents -n 50"
echo
