#!/usr/bin/env bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este é o "montador" que arruma tudo no servidor.
# Ele faz 7 passos, e pode rodar quantas vezes quiser (se algo já está pronto, ele pula):
#   1. instala as ferramentas (nginx, curl...);
#   2. instala o Node.js 22 (o programa que roda o server.js);
#   3. copia o app para /var/www/osmo-talents, sem mexer no banco e no .env;
#   4. cria um "serviço" que liga o app sozinho e o religa se ele cair;
#   5. configura o nginx, o "porteiro da frente" que recebe as visitas e repassa ao app;
#   6. ativa o HTTPS (o cadeadinho): com o certificado de origem da Cloudflare, se ele foi
#      enviado, ou com o Let's Encrypt, se o domínio aponta direto para cá;
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
# APP_HOST: onde o app mora (padrão app.DOMÍNIO). MAIN_MODE=redirect manda o domínio principal
# para o app; MAIN_MODE=app faz o domínio principal mostrar o app também, sem redirecionar.
APP_HOST_IN="${APP_HOST:-}"
MAIN_MODE="${MAIN_MODE:-redirect}"
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
APP_HOST="${APP_HOST_IN:-app.$DOMAIN}"

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
mkdir -p "$APP_DIR/data" "$APP_DIR/data/videos" # data/videos: os vídeos dos Osmo Originais (app de TV)
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
say "5/7 Configurando o nginx para $APP_HOST e $DOMAIN"
# O app mora em app.osmo.com.br (APP_HOST). O osmo.com.br fica para o site da agência:
# por enquanto ele só redireciona para o app, levando junto o caminho (osmo.com.br/vagas/12
# vira app.osmo.com.br/vagas/12). Três coisas continuam respondendo no endereço antigo, sem
# redirecionar: /api/ (os avisos do Asaas chegam ali, e aviso não segue redirecionamento),
# /auth/ (retornos de login social já cadastrados) e /sw.js (o ajudante dos celulares que já
# instalaram o app precisa conseguir se atualizar).
# Segurança: só redireciona se o app. já existe no DNS e se o certificado cobre esse nome.
# Senão, o app continua respondendo nos dois endereços e aparece um aviso.
# Se o certificado de origem da Cloudflare já foi enviado (configurar-https-cloudflare.sh),
# o nginx também atende na porta 443 com ele. A porta 80 continua funcionando: enquanto a
# Cloudflare estiver no modo "Flexible" ela ainda chega por ali, e mandar para o https
# criaria um vaivém sem fim.
CF_CERT="/etc/ssl/cloudflare/$DOMAIN.pem"
CF_KEY="/etc/ssl/cloudflare/$DOMAIN.key"
HAS_CF=0; [ -f "$CF_CERT" ] && [ -f "$CF_KEY" ] && HAS_CF=1
APP_DNS="$(dig +short A "$APP_HOST" @1.1.1.1 | grep -E '^[0-9.]+$' | tail -n1 || true)"
APP_SPLIT=0
if [ "$MAIN_MODE" = "redirect" ] && [ "$APP_HOST" != "$DOMAIN" ]; then
  if [ -z "$APP_DNS" ]; then
    warn "$APP_HOST ainda não existe no DNS. Por enquanto o app segue em $DOMAIN."
    warn "Crie o registro na Cloudflare (DNS → Add record → A, nome: ${APP_HOST%%.$DOMAIN}, IP deste servidor, nuvem laranja) e publique de novo."
  elif [ "$HAS_CF" -eq 1 ] && ! openssl x509 -noout -checkhost "$APP_HOST" -in "$CF_CERT" 2>/dev/null | grep -q "does match"; then
    warn "O certificado de origem não cobre $APP_HOST. Gere outro com osmo.com.br e *.osmo.com.br (veja o LEIA-ME)."
  else
    APP_SPLIT=1
  fi
fi
LISTEN6="    listen [::]:80;"; LISTEN6_SSL="    listen [::]:443 ssl http2;"
[ -f /proc/net/if_inet6 ] || { LISTEN6="    # IPv6 desativado neste servidor"; LISTEN6_SSL="$LISTEN6"; }
TO="\$scheme"; [ "$HAS_CF" -eq 1 ] && TO="https"
PASS="        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;"
if [ "$APP_SPLIT" -eq 1 ]; then
  BODIES=("    server_name $APP_HOST;
    client_max_body_size 12m;

    location / {
$PASS
    }" "    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 12m;

    location ~ ^/(api|auth)/ {
$PASS
    }
    location = /sw.js {
$PASS
    }
    location / {
        # atrás da Cloudflare sem certificado de origem, o pedido chega aqui em http:
        # o X-Forwarded-Proto diz se a pessoa usou https, para não redirecionar em dois saltos
        set \$to $TO;
        if (\$http_x_forwarded_proto = \"https\") { set \$to https; }
        return 301 \$to://$APP_HOST\$request_uri;
    }")
else
  NAMES="$DOMAIN www.$DOMAIN"; [ -n "$APP_DNS" ] && [ "$APP_HOST" != "$DOMAIN" ] && NAMES="$APP_HOST $NAMES"
  BODIES=("    server_name $NAMES;
    client_max_body_size 12m;

    location / {
$PASS
    }")
fi
: > /etc/nginx/sites-available/osmo-talents
if [ "$HAS_CF" -eq 1 ] && command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow 443/tcp >/dev/null; fi
for B in "${BODIES[@]}"; do
  cat >> /etc/nginx/sites-available/osmo-talents <<EOF
server {
    listen 80;
$LISTEN6
$B
}

EOF
  if [ "$HAS_CF" -eq 1 ]; then
    cat >> /etc/nginx/sites-available/osmo-talents <<EOF
server {
    listen 443 ssl http2;
$LISTEN6_SSL
    ssl_certificate $CF_CERT;
    ssl_certificate_key $CF_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
$B
}

EOF
  fi
done
if [ "$APP_SPLIT" -eq 1 ]; then ok "app em $APP_HOST; $DOMAIN redireciona para lá"; fi
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
# Quando o site passa pela Cloudflare, o DNS mostra o endereço dela e não o daqui, e o
# Let's Encrypt não funciona. Nesse caso o HTTPS vem do certificado de origem da Cloudflare,
# enviado pelo configurar-https-cloudflare.sh (e este passo só confirma que ele está lá).
say "6/7 Conferindo o DNS e ativando o HTTPS"
SERVER_IP="$(curl -fsS -4 https://api.ipify.org || true)"
# pergunta o endereço ao DNS público (1.1.1.1): o /etc/hosts do servidor costuma dizer que o
# próprio nome dele aponta para 127.0.1.1, o que fazia a conferência dar alarme falso
DNS_IP="$(dig +short A "$DOMAIN" @1.1.1.1 | grep -E '^[0-9.]+$' | tail -n1 || true)"
WWW_IP="$(dig +short A "www.$DOMAIN" @1.1.1.1 | grep -E '^[0-9.]+$' | tail -n1 || true)"
# o site passa pela Cloudflare? (ela responde com "server: cloudflare" no endereço público)
CF_FRONT=0
if [ -n "$DNS_IP" ] && curl -sI -m 10 --resolve "$DOMAIN:443:$DNS_IP" "https://$DOMAIN/" 2>/dev/null | grep -qi '^server: *cloudflare'; then CF_FRONT=1; fi
HTTPS=0
if [ -f "$CF_CERT" ] && [ -f "$CF_KEY" ]; then
  # com a Cloudflare na frente, o certificado de origem (passo 5) já é o HTTPS daqui:
  # não precisa do DNS apontar para cá nem do Let's Encrypt
  if grep -q '^COOKIE_SECURE=' "$APP_DIR/.env"; then sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$APP_DIR/.env"; else echo "COOKIE_SECURE=true" >> "$APP_DIR/.env"; fi
  systemctl restart osmo-talents
  HTTPS=1; ok "HTTPS ativo com o certificado de origem da Cloudflare"
  ok "no painel da Cloudflare, o modo SSL/TLS precisa estar em Full (strict)"
elif [ "$CF_FRONT" -eq 1 ]; then
  # a Cloudflare está na frente e já entrega o cadeado para quem visita: nada a fazer aqui
  HTTPS=1; ok "o site passa pela Cloudflare: o cadeado (HTTPS) fica com ela"
elif [ -n "$SERVER_IP" ] && [ "$DNS_IP" = "$SERVER_IP" ]; then
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  DOMS=(-d "$DOMAIN"); [ "$WWW_IP" = "$SERVER_IP" ] && DOMS+=(-d "www.$DOMAIN")
  [ "$APP_DNS" = "$SERVER_IP" ] && [ "$APP_HOST" != "$DOMAIN" ] && DOMS+=(-d "$APP_HOST")
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
  warn "Usa a Cloudflare? Então rode no seu computador: bash configurar-https-cloudflare.sh"
fi

# PUBLIC_URL é o endereço usado nos e-mails (recuperar senha, avisos) e nos retornos do
# login social. Com o app no subdomínio, ele passa a ser https://app.osmo.com.br.
if [ "$HTTPS" -eq 1 ]; then
  WANT="https://$DOMAIN"; [ "$APP_SPLIT" -eq 1 ] && WANT="https://$APP_HOST"
  if [ "$(grep -E '^PUBLIC_URL=' "$APP_DIR/.env" | cut -d= -f2-)" != "$WANT" ]; then
    if grep -q '^PUBLIC_URL=' "$APP_DIR/.env"; then sed -i "s#^PUBLIC_URL=.*#PUBLIC_URL=$WANT#" "$APP_DIR/.env"; else echo "PUBLIC_URL=$WANT" >> "$APP_DIR/.env"; fi
    systemctl restart osmo-talents
    ok "PUBLIC_URL agora é $WANT"
    for K in GOOGLE LINKEDIN ADOBE GITHUB; do
      if grep -qE "^${K}_CLIENT_ID=.+" "$APP_DIR/.env"; then
        k="$(echo "$K" | tr 'A-Z' 'a-z')"
        warn "Login com $K: cadastre também este endereço de retorno no painel do $K: $WANT/auth/$k/callback"
      fi
    done
  fi
fi

say "7/7 Pronto"
if [ "$HTTPS" -eq 1 ] && [ "$APP_SPLIT" -eq 1 ]; then echo "    Abra: https://$APP_HOST  (https://$DOMAIN redireciona para lá)"; elif [ "$HTTPS" -eq 1 ]; then echo "    Abra: https://$DOMAIN"; else echo "    Por enquanto, teste pelo IP: http://${SERVER_IP:-SEU-IP}"; fi
echo
echo "    Dados de demonstração (opcional):  cd $APP_DIR && sudo -u $APP_USER npm run seed"
echo "    Ver se está rodando:               systemctl status osmo-talents"
echo "    Ver erros:                         journalctl -u osmo-talents -n 50"
echo
