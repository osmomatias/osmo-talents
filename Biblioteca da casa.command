#!/bin/bash
# Clique duas vezes para ligar a Biblioteca da casa: os filmes, séries e clipes do Mac
# tocando na TV e no celular pelo Wi-Fi (protótipo do Osmo TV). Feche a janela para desligar.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Falta o Node.js neste Mac (nodejs.org)."; read -r -p "Aperte Enter para fechar." _; exit 1; }
mkdir -p "$HOME/Movies/Osmo TV/Filmes" "$HOME/Movies/Osmo TV/Séries" "$HOME/Movies/Osmo TV/Clipes"
open "$HOME/Movies/Osmo TV" 2>/dev/null
( sleep 2; open "http://localhost:8765" ) &
node biblioteca/server.mjs
echo ""
read -r -p "A biblioteca foi desligada. Aperte Enter para fechar." _
