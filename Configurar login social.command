#!/bin/bash
# Clique duas vezes para configurar os botões de login (Google, LinkedIn, Adobe, GitHub).
cd "$(dirname "$0")" || exit 1
bash configurar-login-social.sh
echo ""
read -r -p "Pode fechar esta janela (aperte Enter)." _
