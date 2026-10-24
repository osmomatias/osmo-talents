#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script coloca o "cadeado" também entre a Cloudflare
# e o servidor. Sem ele, o visitante fala com a Cloudflare por conexão segura, mas a Cloudflare
# fala com o servidor por conexão aberta (modo "Flexible"), e senhas passam abertas nesse trecho.
# Ele pega os dois arquivos que a Cloudflare gera (o certificado de origem e a chave privada),
# confere se os dois combinam, envia para o servidor (em /etc/ssl/cloudflare, fora da pasta
# do app, para sobreviver às publicações) e roda o publicar.sh, que liga o nginx na porta 443.
# Depois disso, mude o modo SSL/TLS da Cloudflare para "Full (strict)".
# Uso, no terminal do editor:  bash configurar-https-cloudflare.sh
#   (ou CERT=~/Downloads/osmo.pem KEY=~/Downloads/osmo.key bash configurar-https-cloudflare.sh)
set -e
cd "$(dirname "$0")"
IP="${IP:-46.202.147.229}"
DOMAIN="${DOMAIN:-osmo.com.br}"
echo ""
echo "HTTPS entre a Cloudflare e o servidor"
echo "-------------------------------------"
# caminhos arrastados para o terminal chegam com aspas ou barras antes dos espaços: limpamos
clean() { local p="$1"; p="${p%\"}"; p="${p#\"}"; p="${p%\'}"; p="${p#\'}"; p="${p//\\ / }"; p="${p%% }"; echo "${p/#\~/$HOME}"; }
[ -n "$CERT" ] || read -r -p "Arquivo do certificado de origem (.pem): " CERT
[ -n "$KEY" ] || read -r -p "Arquivo da chave privada (.key): " KEY
CERT="$(clean "$CERT")"; KEY="$(clean "$KEY")"
[ -f "$CERT" ] || { echo "Não achei o arquivo $CERT. Nada foi alterado."; exit 1; }
[ -f "$KEY" ] || { echo "Não achei o arquivo $KEY. Nada foi alterado."; exit 1; }
grep -q "BEGIN CERTIFICATE" "$CERT" || { echo "O primeiro arquivo não parece um certificado (falta BEGIN CERTIFICATE). Nada foi alterado."; exit 1; }
grep -q "PRIVATE KEY" "$KEY" || { echo "O segundo arquivo não parece uma chave privada (falta PRIVATE KEY). Nada foi alterado."; exit 1; }
# os dois combinam? a "parte pública" da chave tem que ser igual à do certificado
A="$(openssl x509 -noout -pubkey -in "$CERT" 2>/dev/null | openssl md5)"
B="$(openssl pkey -pubout -in "$KEY" 2>/dev/null | openssl md5)"
[ -n "$A" ] && [ "$A" = "$B" ] || { echo "O certificado e a chave não são um par (talvez sejam de gerações diferentes). Nada foi alterado."; exit 1; }
echo "Enviando para o servidor..."
ssh "root@$IP" "umask 077 && mkdir -p /etc/ssl/cloudflare && cat > /etc/ssl/cloudflare/$DOMAIN.pem" < "$CERT"
ssh "root@$IP" "umask 077 && cat > /etc/ssl/cloudflare/$DOMAIN.key" < "$KEY"
echo "Atualizando o site..."
bash publicar.sh
echo ""
echo "Agora, no painel da Cloudflare: SSL/TLS → Overview → modo \"Full (strict)\"."
echo "Depois, apague a chave do seu computador:  rm \"$KEY\""
