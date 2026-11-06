#!/bin/bash
# Clique duas vezes para mandar um vídeo seu para o Osmo TV (fileira Osmo Originais).
cd "$(dirname "$0")" || exit 1
bash enviar-video.sh
echo ""
read -r -p "Pode fechar esta janela (aperte Enter)." _
