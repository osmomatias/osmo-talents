#!/bin/bash
# Clique duas vezes neste arquivo (no Finder) para salvar a versão no GitHub e publicar no site.
cd "$(dirname "$0")" || exit 1
echo "Salvando a versão..."
git add -A
git commit -m "${1:-Atualização do site}" || echo "(nada novo para salvar no git)"
git push || echo "(não consegui enviar ao GitHub; seguindo com a publicação)"
bash publicar.sh
echo ""
read -r -p "Pode fechar esta janela (aperte Enter)." _
