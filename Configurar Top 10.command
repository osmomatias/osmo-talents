#!/bin/bash
# Clique duas vezes para ligar o Top 10 de filmes e séries (pede a chave do TMDB).
cd "$(dirname "$0")" || exit 1
bash configurar-top10.sh
echo ""
read -r -p "Pode fechar esta janela (aperte Enter)." _
