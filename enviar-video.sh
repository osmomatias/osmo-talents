#!/bin/bash
# EXPLICANDO COMO PARA UMA CRIANÇA: este script leva um vídeo seu para a fileira "Osmo Originais" do app de TV.
# Você arrasta o arquivo .mp4 para a janela, escreve o título (e, se quiser, ano e sinopse),
# e ele manda o vídeo para a pasta de vídeos do servidor (data/videos). Pronto: aparece na TV.
# Se existir uma imagem com o mesmo nome do vídeo (ex.: meu-curta.jpg) na mesma pasta do Mac, ela vai junto como capa.
# Também vão juntos, se existirem: meu-curta-fundo.jpg (imagem larga do fundo) e meu-curta.vtt (legenda).
# Uso:  bash enviar-video.sh   (ou: bash enviar-video.sh /caminho/do/video.mp4)
set -e
cd "$(dirname "$0")"
IP="${IP:-46.202.147.229}"
DIR=/var/www/osmo-talents/data/videos
echo ""
echo "Enviar vídeo para o Osmo TV (Osmo Originais)"
echo "--------------------------------------------"
echo "Lembrete: só vídeos seus ou com autorização de quem fez."
SRC="$1"
if [ -z "$SRC" ]; then
  echo "Arraste o arquivo do vídeo (.mp4) para esta janela e aperte Enter:"
  read -r SRC
fi
SRC="${SRC%\"}"; SRC="${SRC#\"}"; SRC="${SRC%\'}"; SRC="${SRC#\'}"; SRC="$(printf '%s' "$SRC" | sed 's/\\ / /g; s/[[:space:]]*$//')"
[ -f "$SRC" ] || { echo "Não achei esse arquivo. Nada foi enviado."; exit 1; }
EXT="$(printf '%s' "${SRC##*.}" | tr '[:upper:]' '[:lower:]')"
case "$EXT" in mp4|m4v|webm) ;; *) echo "O vídeo precisa ser .mp4 (ou .m4v/.webm). Nada foi enviado."; exit 1;; esac

read -r -p "Título (Enter = usar o nome do arquivo): " TITLE
read -r -p "Ano (opcional): " YEAR
read -r -p "Sinopse curta (opcional): " OVERVIEW

# nome seguro no servidor: sem acentos nem espaços (ex.: "Meu Curta.mp4" -> "meu-curta.mp4")
BASE="$(basename "$SRC")"; STEM="${BASE%.*}"
SLUG="$(node -e 'process.stdout.write(process.argv[1].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80))' "$STEM")"
[ -n "$SLUG" ] || SLUG="video-$(date +%s)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp "$SRC" "$TMP/$SLUG.$EXT"
SDIR="$(dirname "$SRC")"
for X in jpg jpeg png webp; do
  [ -f "$SDIR/$STEM.$X" ] && cp "$SDIR/$STEM.$X" "$TMP/$SLUG.$X"
  [ -f "$SDIR/$STEM-fundo.$X" ] && cp "$SDIR/$STEM-fundo.$X" "$TMP/$SLUG-fundo.$X"
done
[ -f "$SDIR/$STEM.vtt" ] && cp "$SDIR/$STEM.vtt" "$TMP/$SLUG.vtt"
if [ -n "$TITLE$YEAR$OVERVIEW" ]; then
  node -e 'const [t,y,o]=process.argv.slice(1); const d={}; if(t)d.title=t; if(y)d.year=y; if(o)d.overview=o; console.log(JSON.stringify(d))' "$TITLE" "$YEAR" "$OVERVIEW" > "$TMP/$SLUG.json"
fi

echo ""
echo "Enviando $(du -h "$SRC" | cut -f1) para o servidor (vídeo grande demora um pouco)..."
ssh "root@$IP" "mkdir -p $DIR"
scp -q "$TMP"/* "root@$IP:$DIR/"
ssh "root@$IP" "chown -R osmo:osmo $DIR && chmod 755 $DIR && chmod 644 $DIR/*"
echo ""
echo "Pronto! Abra https://app.osmo.com.br/tv/ (ou o app Osmo TV): o vídeo está em 'Osmo Originais'."
