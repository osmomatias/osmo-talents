#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este é o "caminhão de mudança".
# Ele pega a pasta do projeto aqui do seu computador, empacota tudo num ZIP (menos o
# banco de dados, os segredos do .env e coisas que não precisam ir) e leva até o
# computador da internet onde o site mora (a VPS). Lá, desempacota e roda o instalar.sh,
# que coloca a versão nova no ar.
# O banco de dados e o .env de lá NUNCA são trocados: só o código muda.
# Envia a versão atual desta pasta para a VPS e atualiza o site.
# Uso, no terminal do VS Code / Antigravity:  bash publicar.sh
# set -e = "se qualquer passo der errado, pare tudo" (melhor parar do que publicar pela metade).
# IP e DOMAIN dizem para onde levar: dá para trocar passando outro valor antes do comando.
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
# ssh é um "túnel seguro" até o servidor. Mandamos o ZIP por ele e, do outro lado, uma
# sequência de comandos: apagar a pasta velha de entrega, receber o ZIP, desempacotar
# (instalando o unzip se faltar) e rodar o instalar.sh com o nome do site.
LC_ALL=C.UTF-8 LANG=C.UTF-8 ssh -o StrictHostKeyChecking=accept-new -o SendEnv=- "root@$IP" "export LC_ALL=C.UTF-8 LANG=C.UTF-8; rm -rf /root/osmo-talents && mkdir -p /root/osmo-talents && cat > /root/osmo-talents.zip && cd /root/osmo-talents && (command -v unzip >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq unzip >/dev/null)) && unzip -oq /root/osmo-talents.zip && bash instalar.sh '$DOMAIN'" < "$ZIP"
rm -f "$ZIP"
echo ""
echo "Pronto. A versão nova está no ar."
