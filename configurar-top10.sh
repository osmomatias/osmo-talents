#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script liga o Top 10 de filmes e séries (/top10 e o app de TV em /tv/).
# Ele pede a chave do TMDB (o "API Read Access Token", que começa com eyJ), confere com o TMDB se ela
# funciona, grava no .env do servidor e no .env deste computador, e reinicia o app.
# A chave não aparece na tela enquanto você cola, e nunca vai para o GitHub (.env fica fora do git).
# Uso, no terminal do editor:  bash configurar-top10.sh
set -e
cd "$(dirname "$0")"
IP="${IP:-46.202.147.229}"
echo ""
echo "Top 10 de filmes e séries (TMDB)"
echo "--------------------------------"
# 1º tenta pegar o token direto do que está copiado (Cmd+C), sem precisar colar.
TOKEN="$(pbpaste 2>/dev/null | tr -d '[:space:]' | grep -oE 'eyJ[A-Za-z0-9._-]{40,}' | head -n1 || true)"
if [ -n "$TOKEN" ]; then
  echo "Achei o token do TMDB que você copiou. Usando ele."
else
  echo "Cole o 'API Read Access Token' do TMDB (o longo, que começa com eyJ) e aperte Enter."
  echo "Ele não aparece enquanto você cola; é assim mesmo."
  read -rs RAW; echo ""
  TOKEN="$(printf '%s' "$RAW" | tr -d '[:space:]' | grep -oE 'eyJ[A-Za-z0-9._-]{40,}' | head -n1 || true)"
  [ -n "$TOKEN" ] || TOKEN="$(printf '%s' "$RAW" | tr -d '[:space:]')"
  unset RAW
fi
[ -n "$TOKEN" ] || { echo "Nada foi colado. Nada foi alterado."; exit 1; }
[[ "$TOKEN" == eyJ* ]] || { echo "Esse não começa com eyJ: deve ser a 'API Key' curta. Copie o 'API Read Access Token'. Nada foi alterado."; exit 1; }

echo "Conferindo a chave com o TMDB..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "https://api.themoviedb.org/3/authentication")
[ "$CODE" = "200" ] || { echo "O TMDB recusou a chave (código $CODE). Confira se copiou o token inteiro. Nada foi alterado."; exit 1; }
echo "Chave aceita."

echo "Gravando neste computador..."
touch .env && chmod 600 .env
grep -vE '^TMDB_TOKEN=' .env > .env.tmp || true
echo "TMDB_TOKEN=$TOKEN" >> .env.tmp && mv .env.tmp .env && chmod 600 .env

echo "Gravando no servidor e reiniciando o app..."
ssh "root@$IP" "bash -s" <<REMOTE
set -e
ENV=/var/www/osmo-talents/.env
grep -vE '^TMDB_TOKEN=' \$ENV > \$ENV.tmp || true
echo "TMDB_TOKEN=$TOKEN" >> \$ENV.tmp
mv \$ENV.tmp \$ENV && chmod 640 \$ENV && chgrp osmo \$ENV
systemctl restart osmo-talents
REMOTE
unset TOKEN
sleep 3
echo ""
if curl -sf "https://app.osmo.com.br/api/top10" >/dev/null; then
  echo "Pronto! O Top 10 está ligado: https://app.osmo.com.br/tv/ (e na TV, no app Osmo TV)."
else
  echo "Gravado, mas o site ainda não respondeu com o Top 10. Espere uns segundos e abra https://app.osmo.com.br/tv/."
fi
